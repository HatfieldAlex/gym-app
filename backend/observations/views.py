import uuid

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import PerformedExercise, PerformedSet, TrainingSession
from .serializers import (
    PerformedExerciseHistorySerializer,
    PerformedExerciseRecentSerializer,
    PerformedExerciseSerializer,
    PerformedSetSerializer,
    TrainingSessionDetailSerializer,
    TrainingSessionSerializer,
    closed_reason,
)


CORRECTION_HEADER = 'X-Edit-Closed-Record'


def correcting(request):
    """True when this request explicitly asks to write to a finished record.

    It unlocks `PATCH`/`PUT` on a closed row, and that alone. It does **not**
    unlock `DELETE` -- `perform_destroy` never reads it -- and it does not
    unlock creating a row inside a closed one, because `_require_open` in
    `serializers.py` never reads it either. So a finished record can be
    corrected and can never be removed, nor grown a new set: that is the rule,
    enforced in the two functions that deliberately do not call this one.

    The server holds no memory of it between requests. There is no flag on the
    session, no setting on the user, no mode. The arming lives entirely in the
    browser, and every single write it permits carries the header itself --
    which is what makes each one deliberate, and what makes `grep -r
    X-Edit-Closed-Record` the complete list of places that can write to a
    finished record.

    It is not permission. An anonymous request is still 403 and another user's
    row is still 404, both answered before this is ever read: the requester
    owns the row, it is simply finished.

    Only the exact string `1` counts. Absent, empty, `'0'`, `'true'`, `'on'`
    are all "no", and the request is refused exactly as it is without them --
    one accepted value, so there is nothing to argue about later and nothing a
    proxy can normalise into a yes. `request.headers` is case-insensitive, so
    the client's casing does not matter and nothing here needs to know that
    WSGI spells it `HTTP_X_EDIT_CLOSED_RECORD`.
    """
    return request.headers.get(CORRECTION_HEADER) == '1'


class ClosedIsFinalMixin:
    """Update and delete only while the row is still writable (E6).

    The create half of the same rule lives in the serializers, beside the
    ownership re-check, so a create is refused as a field error the way an
    unowned target already is. Here it is a `detail`, and a 400 rather than a
    403: nothing about this is permission -- the requester owns the row, it is
    simply finished.

    Deliberately not in `get_object()`: `end/` is a POST to a detail route on an
    exercise that is about to become closed and needs `get_object()` to keep
    working, so guarding there would either break it or need an exception carved
    out of it.
    """

    def refuse_if_closed(self, instance):
        reason = closed_reason(**self.writable_target(instance))
        if reason is not None:
            raise ValidationError({'detail': reason})

    def perform_update(self, serializer):
        # The row as it stands, before the change is written into it.
        if not correcting(self.request):
            self.refuse_if_closed(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        # No override here on purpose: `correcting` unlocks a correction, never
        # a removal, so a finished row cannot be deleted by any request.
        self.refuse_if_closed(instance)
        instance.delete()


class TrainingSessionViewSet(ClosedIsFinalMixin, viewsets.ModelViewSet):
    """`/api/training-sessions/` — the requester's own sessions, newest first.

    Until now this viewset had no closed-guard at all, unlike its two siblings:
    an ended session could be `DELETE`d outright -- cascading every block and
    every set inside it -- and `PATCH`ed freely, with no gate and no warning.
    It has both halves now. `PATCH` on an ended session is refused unless the
    request carries the correction header; `DELETE` is refused full stop, with
    no override. Discarding a live workout is untouched, because an open
    session is not closed and `closed_reason` answers `None` for it.
    """

    serializer_class = TrainingSessionSerializer

    @staticmethod
    def writable_target(instance):
        return {'training_session': instance}

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
        open_exercise = session.performed_exercises.filter(ended_at__isnull=True).first()
        if open_exercise is not None:
            # Closing over an open block would leave a row that can never be
            # closed and never be corrected (E4), so it is refused rather than
            # repaired. First of the three guards because it is the only one a
            # user could plausibly hit, and worded as what to do about it.
            return Response(
                {
                    'detail': 'Finish the exercise you are recording before ending the session.',
                    # So a client that has lost track of it can just load it.
                    'open_exercise': str(open_exercise.pk),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
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


class PerformedExerciseViewSet(ClosedIsFinalMixin, viewsets.ModelViewSet):
    """`/api/performed-exercises/`, optionally filtered by `?training_session=<uuid>`."""

    serializer_class = PerformedExerciseSerializer

    @staticmethod
    def writable_target(instance):
        return {'performed_exercise': instance}

    # Three past sessions is the history the zone shows (Z7); the cap is there
    # so a hand-written URL cannot ask for the whole training log.
    HISTORY_DEFAULT_LIMIT = 3
    HISTORY_MAX_LIMIT = 20

    # What `recent/` answers with: a fixed thirty, with no parameter to ask for
    # more or fewer (AGREED, C5). The correction screen lists everything it is
    # given, so the cap is the whole of its paging story.
    RECENT_LIMIT = 30

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

    # The default list route has callers; only the history action swaps
    # serializer, the way TrainingSessionViewSet already picks one per action.
    def get_serializer_class(self):
        if self.action == 'history':
            return PerformedExerciseHistorySerializer
        if self.action == 'recent':
            return PerformedExerciseRecentSerializer
        return super().get_serializer_class()

    def perform_create(self, serializer):
        # The session's own "one at a time" a level down: supersets are out of
        # scope, so "the exercise I am on" has to be as unambiguous as "the
        # current session" already is (E3).
        open_exercise = (
            PerformedExercise.objects
            .filter(
                # Out of validated_data, so it has already been through
                # `validate_training_session` and is known to be the requester's.
                # Ownership stays the serializer's job.
                training_session=serializer.validated_data['training_session'],
                ended_at__isnull=True,
            )
            .first()
        )
        if open_exercise is not None:
            raise ValidationError({
                'detail': 'An exercise is already open in this session.',
                # So a client that has lost track of it can just load it.
                'open_exercise': str(open_exercise.pk),
            })
        serializer.save()

    @staticmethod
    def _uuid_param(params, name, required=False):
        """A UUID straight off the querystring, or a 400.

        Filtering a UUIDField on garbage raises Django's ValidationError, which
        DRF answers with a 500; parsing here keeps it a 400.
        """
        raw = params.get(name)
        if raw is None or raw == '':
            if required:
                raise ValidationError({'detail': f'{name} is required.'})
            return None
        try:
            return uuid.UUID(raw)
        except (ValueError, AttributeError, TypeError):
            raise ValidationError({'detail': f'{name} is not a valid id.'})

    @classmethod
    def _limit_param(cls, params):
        """How many past performances to answer with, or a 400."""
        raw = params.get('limit')
        if raw is None:
            return cls.HISTORY_DEFAULT_LIMIT
        try:
            limit = int(raw)
        except (TypeError, ValueError):
            raise ValidationError({'detail': 'limit must be a whole number above zero.'})
        if limit < 1:
            raise ValidationError({'detail': 'limit must be a whole number above zero.'})
        # Over the cap is not a mistake worth an error, just more than we give.
        return min(limit, cls.HISTORY_MAX_LIMIT)

    @action(detail=False)
    def history(self, request):
        """The last few times the requester trained one movement, newest first.

        A bare array, not a page: the client asks for at most a handful of rows
        (Z7) and having never done the movement is an answer, so `[]` with 200.
        """
        params = request.query_params
        exercise_definition = self._uuid_param(params, 'exercise_definition', required=True)
        exclude_session = self._uuid_param(params, 'exclude_session')

        limit = self._limit_param(params)

        # Scoped through the session's owner, like every queryset here, but
        # ordered on its own terms: history is by when the training happened.
        queryset = (
            PerformedExercise.objects
            .filter(
                training_session__user=self.request.user,
                exercise_definition=exercise_definition,
            )
            .select_related('exercise_definition', 'training_session')
            .prefetch_related(
                Prefetch(
                    'performed_sets',
                    queryset=PerformedSet.objects.order_by('created_at'),
                ),
            )
            .order_by('-training_session__started_at', '-created_at')
        )
        if exclude_session is not None:
            # The running workout's own sets are already on screen (Z5), and
            # showing them as "last time" would misdate them.
            queryset = queryset.exclude(training_session=exclude_session)

        return Response(self.get_serializer(queryset[:limit], many=True).data)

    @action(detail=False)
    def recent(self, request):
        """The requester's most recently logged blocks, newest first.

        What the correction screen lists: thirty blocks, each carrying its sets,
        its movement and its session's date and type, so opening one to correct
        it costs no second request.

        A bare array, not a page, and no parameters at all: thirty is the whole
        answer (C5), and having logged nothing is an answer too, so `[]` with
        200.

        Logged blocks only (C6). An open block is the one being recorded right
        now in the exercise zone, and a screen that can rewrite a block has no
        business rewriting that one from under it. `end/` is what puts a block
        in the log, and this lists what is in the log.

        A read, and only a read: no `perform_*`, no body, nothing written.
        """
        # Scoped through the session's owner, like every queryset here, and
        # ordered on history's terms rather than the list route's: by when the
        # training happened, and within a session by the order the blocks were
        # performed. Newest first, so today's mistake is the top row.
        queryset = (
            PerformedExercise.objects
            .filter(
                training_session__user=self.request.user,
                ended_at__isnull=False,
            )
            .select_related('exercise_definition', 'training_session')
            .prefetch_related(
                Prefetch(
                    'performed_sets',
                    queryset=PerformedSet.objects.order_by('created_at'),
                ),
            )
            .order_by('-training_session__started_at', '-created_at')
        )

        return Response(
            self.get_serializer(queryset[:self.RECENT_LIMIT], many=True).data
        )

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        """Close the exercise now. The only path that stamps `ended_at` itself.

        The twin of `training-sessions/{id}/end/`, with one extra outcome: an
        exercise nobody logged a set into is not a block, so closing it deletes
        the row (E5) and answers 204 -- the only delete this makes on the user's
        behalf, and it cascades to nothing because there is nothing under it.
        The two success shapes are different on purpose: 200 means "this block is
        now in your log", 204 means "there was nothing in it".
        """
        performed_exercise = self.get_object()
        if performed_exercise.ended_at is not None:
            return Response(
                {'detail': 'This exercise has already been logged.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not performed_exercise.performed_sets.exists():
            performed_exercise.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        performed_exercise.ended_at = timezone.now()
        performed_exercise.save(update_fields=['ended_at'])
        return Response(self.get_serializer(performed_exercise).data)


class PerformedSetViewSet(ClosedIsFinalMixin, viewsets.ModelViewSet):
    """`/api/performed-sets/`, optionally filtered by `?performed_exercise=<uuid>`."""

    serializer_class = PerformedSetSerializer

    @staticmethod
    def writable_target(instance):
        # The set itself has no state; the block it is in and that block's
        # session are what say whether it can still be corrected.
        return {'performed_exercise': instance.performed_exercise}

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
