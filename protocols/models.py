import uuid

from django.db import models


class ExercisePrescription(models.Model):
    """One prescription, referenced by many PerformedExercise rows.

    The DBML declares this table with an `id` column and nothing else, so this
    model is a bare primary key. Left as-is rather than inventing columns.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        verbose_name = 'exercise prescription'
        verbose_name_plural = 'exercise prescriptions'
