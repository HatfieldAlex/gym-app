from django.db.models import Prefetch
from rest_framework import viewsets

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

    def get_serializer_class(self):
        """Reading one session returns its sets too; listing them does not."""
        if self.action == 'retrieve':
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
        # Only the detail view serialises sets, so only it pays to fetch them.
        if self.action == 'retrieve':
            performed_exercises = performed_exercises.prefetch_related(
                Prefetch(
                    'performed_sets',
                    queryset=PerformedSet.objects.order_by('created_at'),
                ),
            )

        return (
            TrainingSession.objects
            .filter(user=self.request.user)
            .order_by('-created_at')
            .prefetch_related(
                # One extra query for every session's exercises rather than one per
                # session, and select_related folds in the catalogue name too.
                Prefetch('performed_exercises', queryset=performed_exercises),
            )
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


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
