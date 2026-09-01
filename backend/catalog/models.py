import uuid

from django.db import models


class ExerciseDefinition(models.Model):
    """The exercise catalogue: one row per movement, referenced by PerformedExercise."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'exercise definition'
        verbose_name_plural = 'exercise definitions'
