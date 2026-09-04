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
    # How this movement is loaded, so the app can add up a weight from the one number
    # you actually think in: total = bar_kg + sides * per_side.
    #
    # NULL on either column means "nobody has said yet" — NOT zero. A row with
    # bar_kg=0, sides=1 is an answered movement (a stack, a sled, a pulldown) and
    # behaves completely differently from one that has never been asked about. The
    # both-or-neither constraint below is what keeps that to two states, not three.
    #
    # max_digits/decimal_places mirror PerformedSet.weight_kg: one convention for
    # every weight in the app, and the arithmetic that derives a per-side weight
    # depends on both sides of the sum carrying the same two decimals.
    bar_kg = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=(
            'weight of the bar, carriage or sled before any plates; '
            'null until this movement has been asked about'
        ),
    )
    sides = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text=(
            'how many sides the typed weight goes on: 2 for a barbell, '
            '1 for a stack or a sled'
        ),
    )
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
            models.CheckConstraint(
                # Both null (nobody has answered) or both set (somebody has). One
                # without the other passes nothing on: a bar with no side count
                # cannot be added up, and a side count with no bar cannot either.
                # Making that unrepresentable is what lets every reader test two
                # states instead of three.
                condition=(
                    models.Q(bar_kg__isnull=True, sides__isnull=True)
                    | models.Q(bar_kg__isnull=False, sides__isnull=False)
                ),
                name='exercisedef_loading_both_or_neither',
            ),
            models.CheckConstraint(
                # Unanswered (null), or 1 for a stack or sled and 2 for a barbell.
                # A third side is a different kind of machine, which is a different
                # catalogue entry — so 3 does not pass, and neither does 0.
                # Spelled as a range rather than `sides__in=(1, 2)`: on an integer
                # column the two say exactly the same thing, and a range is what
                # schemadocs can render into docs/schema.dbml.
                condition=(
                    models.Q(sides__isnull=True)
                    | models.Q(sides__gte=1, sides__lte=2)
                ),
                name='exercisedef_sides_1_or_2',
            ),
            models.CheckConstraint(
                # Unanswered (null) or zero-or-more. A bar that weighs less than
                # nothing is not a thing; a bar that weighs nothing is a cable stack.
                condition=models.Q(bar_kg__isnull=True) | models.Q(bar_kg__gte=0),
                name='exercisedef_bar_kg_not_negative',
            ),
        ]
