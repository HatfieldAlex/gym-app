import uuid

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class ExerciseDefinition(models.Model):
    """The exercise catalogue: one row per movement, referenced by PerformedExercise."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # unique=True is kept alongside the case-insensitive constraint in Meta: it is what
    # makes DRF generate a field-level uniqueness validator and what the DBML records as
    # the column's own contract. The constraint below is the database's backstop for the
    # case variants unique=True cannot see. Neither one is redundant; keep both.
    name = models.CharField(max_length=120, unique=True)
    # SET_NULL rather than CASCADE: deleting a user must not delete a movement that
    # everybody's history points at (PerformedExercise.exercise_definition is PROTECTed,
    # so the cascade would fail anyway — loudly, halfway through deleting the user).
    # null=True because the rows already in the table have nobody to attribute, and the
    # admin will keep adding rows that have nobody either.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='exercise_definitions_added',
        help_text='who first added this movement; null for the seeded and admin-created rows',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'exercise definition'
        verbose_name_plural = 'exercise definitions'
        constraints = [
            # "bench press" and "Bench press" are the same movement in a flat dropdown
            # read at a glance mid-set. Lower() does not collapse internal whitespace —
            # that is normalised on the way in — but it stops the case variants, and any
            # duplicate that reaches the database another way, such as two racing requests.
            models.UniqueConstraint(
                Lower('name'),
                name='exercisedef_name_ci_unique',
            ),
        ]
