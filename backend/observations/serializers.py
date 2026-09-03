from django.utils import timezone
from rest_framework import serializers

from .models import PerformedExercise, PerformedSet, TrainingSession


EXERCISE_IS_CLOSED = 'That exercise has been logged and cannot be changed.'
SESSION_IS_CLOSED = 'That session has ended and cannot be changed.'


def closed_reason(performed_exercise=None, training_session=None):
    """Why this row may not be written to, or `None` when it may.

    The one definition of writable (E6): a row is writable only while its
    performed exercise is open **and** its session is open. Both halves are
    checked every time, from here, so there is one rule rather than four that
    drift. `views.py` imports it for the update and delete paths; the create
    paths call it below, beside the ownership re-check they already do.

    The session half is not redundant. Under E4 a live session cannot be closed
    over an open exercise, so nothing this app does can produce an open exercise
    in a closed session -- but rows written before this iteration, and anything
    done in the admin, can be in exactly that state, and a rule that has to be
    reasoned about before it can be trusted is not the rule.

    Two messages, because a closed exercise and a closed session are two
    different things for the reader to do something about.
    """
    if performed_exercise is not None:
        if performed_exercise.ended_at is not None:
            return EXERCISE_IS_CLOSED
        if training_session is None:
            training_session = performed_exercise.training_session
    if training_session is not None and training_session.ended_at is not None:
        return SESSION_IS_CLOSED
    return None


class OwnedRelationMixin:
    """Reject writes that point a row at another user's data.

    A viewset's queryset only scopes *reads*; the related-object fields below
    accept any primary key by default, so ownership has to be re-checked on the
    way in or one user could attach rows to another user's session.
    """

    def _require_own(self, value, owner_lookup):
        user = self.context['request'].user
        if type(value).objects.filter(pk=value.pk, **{owner_lookup: user}).exists():
            return value
        raise serializers.ValidationError('Not found.')

    def _require_open(self, **target):
        """Refuse a create that would write into something already closed (E6).

        A field error, the way an unowned target already is, and only ever
        reached once ownership has answered: another user's closed row is a
        404 or a `Not found.`, never a hint that it exists and is finished.
        """
        reason = closed_reason(**target)
        if reason is not None:
            raise serializers.ValidationError(reason)


class PerformedSetSerializer(OwnedRelationMixin, serializers.ModelSerializer):
    def validate_performed_exercise(self, value):
        value = self._require_own(value, 'training_session__user')
        self._require_open(performed_exercise=value)
        return value

    class Meta:
        model = PerformedSet
        fields = [
            'id',
            'performed_exercise',
            'weight_kg',
            'reps',
            'distance_m',
            'duration_s',
            'rpe',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class PerformedExerciseSerializer(OwnedRelationMixin, serializers.ModelSerializer):
    """A performed movement, carrying its catalogue name so listing a session
    does not force the client into a second request per exercise."""

    exercise_name = serializers.CharField(source='exercise_definition.name', read_only=True)

    def validate_training_session(self, value):
        value = self._require_own(value, 'user')
        self._require_open(training_session=value)
        return value

    class Meta:
        model = PerformedExercise
        fields = [
            'id',
            'training_session',
            'exercise_definition',
            'exercise_name',
            'exercise_prescription',
            'created_at',
            'ended_at',
        ]
        # `ended_at` is read-only throughout, unlike the session's: there is no
        # retrospective-entry path for an exercise, so end/ is the only thing
        # that stamps it.
        read_only_fields = ['id', 'created_at', 'ended_at']


class PerformedExerciseDetailSerializer(PerformedExerciseSerializer):
    """The same movement with every set it was worked through, in performed order.

    Kept apart from the plain serializer so listing sessions does not carry every
    set of every session; only the single-session view pays for them.
    """

    performed_sets = PerformedSetSerializer(many=True, read_only=True)

    class Meta(PerformedExerciseSerializer.Meta):
        fields = PerformedExerciseSerializer.Meta.fields + ['performed_sets']


class PerformedExerciseHistorySerializer(PerformedExerciseDetailSerializer):
    """One past performance of a movement, dated by when it was trained.

    The zone shows a block per past session and has only the performed exercise
    to label it with, so the session's `started_at` rides along. Nesting the
    whole session would carry fields this screen has no use for.
    """

    training_session_started_at = serializers.DateTimeField(
        source='training_session.started_at', read_only=True
    )

    class Meta(PerformedExerciseDetailSerializer.Meta):
        fields = PerformedExerciseDetailSerializer.Meta.fields + [
            'training_session_started_at'
        ]


class TrainingSessionSerializer(serializers.ModelSerializer):
    """A session with its exercises nested in performed order.

    `user` is deliberately absent: the viewset scopes every queryset to the
    requester and stamps the owner on create, so it is neither readable nor
    settable by a client.
    """

    performed_exercises = PerformedExerciseSerializer(many=True, read_only=True)

    class Meta:
        model = TrainingSession
        fields = [
            'id',
            'type',
            'created_at',
            'started_at',
            'ended_at',
            'performed_exercises',
        ]
        # `ended_at` is not listed here: it is writable on create, so that a
        # workout typed up after the fact can arrive already closed, and
        # read-only afterwards -- see get_fields.
        read_only_fields = ['id', 'created_at']

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            # Closing a live session goes through the end/ action, the only path
            # that stamps a timestamp the client did not choose.
            fields['ended_at'].read_only = True
        return fields

    def validate(self, attrs):
        """Answer 400 rather than letting the database's check constraint 500."""
        started_at = attrs.get('started_at', getattr(self.instance, 'started_at', None))
        if started_at is None:
            # Omitted on create: the model stamps timezone.now() on save.
            started_at = timezone.now()
        ended_at = attrs.get('ended_at', getattr(self.instance, 'ended_at', None))
        if ended_at is not None and ended_at < started_at:
            raise serializers.ValidationError(
                {'ended_at': 'A session cannot end before it started.'}
            )
        return attrs


class TrainingSessionDetailSerializer(TrainingSessionSerializer):
    """One session, all the way down: its exercises and each of their sets."""

    performed_exercises = PerformedExerciseDetailSerializer(many=True, read_only=True)
