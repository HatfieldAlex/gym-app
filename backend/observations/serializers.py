from rest_framework import serializers

from .models import PerformedExercise, PerformedSet, TrainingSession


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


class PerformedSetSerializer(OwnedRelationMixin, serializers.ModelSerializer):
    def validate_performed_exercise(self, value):
        return self._require_own(value, 'training_session__user')

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
        return self._require_own(value, 'user')

    class Meta:
        model = PerformedExercise
        fields = [
            'id',
            'training_session',
            'exercise_definition',
            'exercise_name',
            'exercise_prescription',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class TrainingSessionSerializer(serializers.ModelSerializer):
    """A session with its exercises nested in performed order.

    `user` is deliberately absent: the viewset scopes every queryset to the
    requester and stamps the owner on create, so it is neither readable nor
    settable by a client.
    """

    performed_exercises = PerformedExerciseSerializer(many=True, read_only=True)

    class Meta:
        model = TrainingSession
        fields = ['id', 'type', 'created_at', 'performed_exercises']
        read_only_fields = ['id', 'created_at']
