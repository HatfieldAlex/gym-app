from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import PerformedExercise, PerformedSet, TrainingSession
from .serializers import (
    PerformedExerciseSerializer,
    PerformedSetSerializer,
    TrainingSessionDetailSerializer,
    TrainingSessionSerializer,
)


class TrainingSessionViewSet(viewsets.ModelViewSet):
    """`/api/training-sessions/` — the requester's own sessions, newest first."""

    serializer_class = TrainingSessionSerializer

    # Reading one session returns its sets too; listing them does not. `current`
    # is a single session as well, and the page it feeds wants the whole thing in
    # one request.
    DETAIL_ACTIONS = ('retrieve', 'current')

    def get_serializer_class(self):
        if self.action in self.DETAIL_ACTIONS:
            return TrainingSessionDetailSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        """Scoped to the requester: ownership is never a client-supplied filter."""
        # created_at is the order within the session, and within a performed exercise.
        performed_exercises = (
            PerformedExercise.objects
            .select_related('exercise_definition')
            .order_by('created_at')
        )
        # Only the detail views serialise sets, so only they pay to fetch them.
        if self.action in self.DETAIL_ACTIONS:
            performed_exercises = performed_exercises.prefetch_related(
                Prefetch(
                    'performed_sets',
                    queryset=PerformedSet.objects.order_by('created_at'),
                ),
            )

        return (
            TrainingSession.objects
            .filter(user=self.request.user)
            # By when it was trained, not when it was typed, so a backdated
            # session lands where it belongs in history.
            .order_by('-started_at')
            .prefetch_related(
                # One extra query for every session's exercises rather than one per
                # session, and select_related folds in the catalogue name too.
                Prefetch('performed_exercises', queryset=performed_exercises),
            )
        )

    def perform_create(self, serializer):
        # A session created with an ended_at is a finished workout typed in after
        # the fact, which is allowed even while another one is running. Only a new
        # *open* session collides with an open one.
        if serializer.validated_data.get('ended_at') is None:
            open_session = (
                TrainingSession.objects
                .filter(user=self.request.user, ended_at__isnull=True)
                .first()
            )
            if open_session is not None:
                raise ValidationError({
                    'detail': 'A session is already in progress.',
                    # So a client that has lost track of it can just load it.
                    'open_session': str(open_session.pk),
                })
        serializer.save(user=self.request.user)

    @action(detail=False)
    def current(self, request):
        """The requester's open session, or 204: having none is not an error."""
        session = self.get_queryset().filter(ended_at__isnull=True).first()
        if session is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """Close the session now. The only path that stamps `ended_at` itself."""
        session = self.get_object()
        if session.ended_at is not None:
            return Response(
                {'detail': 'This session has already ended.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        if session.started_at > now:
            # Saving would break the ended_after_started constraint; say why
            # rather than letting the database raise.
            return Response(
                {'detail': 'This session starts in the future, so it cannot be ended now.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session.ended_at = now
        session.save(update_fields=['ended_at'])
        return Response(self.get_serializer(session).data)


class PerformedExerciseViewSet(viewsets.ModelViewSet):
    """`/api/performed-exercises/`, optionally filtered by `?training_session=<uuid>`."""

    serializer_class = PerformedExerciseSerializer

    def get_queryset(self):
        # Reached through the session's owner, so another user's rows are simply
        # not in the queryset -- detail routes 404 rather than 403 on them.
        queryset = (
            PerformedExercise.objects
            .filter(training_session__user=self.request.user)
            .select_related('exercise_definition')
            .order_by('created_at')
        )
        training_session = self.request.query_params.get('training_session')
        if training_session:
            queryset = queryset.filter(training_session=training_session)
        return queryset


class PerformedSetViewSet(viewsets.ModelViewSet):
    """`/api/performed-sets/`, optionally filtered by `?performed_exercise=<uuid>`."""

    serializer_class = PerformedSetSerializer

    def get_queryset(self):
        queryset = (
            PerformedSet.objects
            .filter(performed_exercise__training_session__user=self.request.user)
            .order_by('created_at')
        )
        performed_exercise = self.request.query_params.get('performed_exercise')
        if performed_exercise:
            queryset = queryset.filter(performed_exercise=performed_exercise)
        return queryset
