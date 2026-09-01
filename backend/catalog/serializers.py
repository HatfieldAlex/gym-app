from rest_framework import serializers

from .models import ExerciseDefinition


class ExerciseDefinitionSerializer(serializers.ModelSerializer):
    """The catalogue entry as the API exposes it."""

    class Meta:
        model = ExerciseDefinition
        fields = ['id', 'name', 'created_at']
        read_only_fields = ['id', 'created_at']
