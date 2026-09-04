import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class TrainingSession(models.Model):
    """One user has many training sessions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='training_sessions',
    )
    # Defaulted so a session can be started from a bare POST: beginning a workout
    # says nothing yet about what kind it will turn out to be.
    type = models.CharField(max_length=8, default='mixed')
    created_at = models.DateTimeField(auto_now_add=True)
    # The two timestamps below differ for a session typed up after the fact.
    started_at = models.DateTimeField(
        default=timezone.now,
        help_text=(
            'when the training actually happened; '
            'created_at is when the row was written'
        ),
    )
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='null while the session is in progress',
    )

    class Meta:
        verbose_name = 'training session'
        verbose_name_plural = 'training sessions'
        indexes = [
            # History is ordered by when the training happened, not when it was typed.
            models.Index(fields=['user', 'started_at'], name='trainsess_user_started_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                # An open session (null ended_at) passes; a closed one may not end
                # before it began.
                condition=(
                    models.Q(ended_at__isnull=True)
                    | models.Q(ended_at__gte=models.F('started_at'))
                ),
                name='trainsess_ended_after_started',
            ),
        ]


class PerformedExercise(models.Model):
    """One movement as actually performed in one session.

    Many per TrainingSession; many can reference the same ExerciseDefinition.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    training_session = models.ForeignKey(
        TrainingSession,
        on_delete=models.CASCADE,
        related_name='performed_exercises',
    )
    # PROTECT: a catalogue entry is shared reference data, and deleting one must not
    # silently erase the logged history that points at it. Retire the definition instead.
    exercise_definition = models.ForeignKey(
        'catalog.ExerciseDefinition',
        on_delete=models.PROTECT,
        related_name='performed_exercises',
    )
    # SET_NULL: the prescription is the plan, this row is the record of what happened.
    # Dropping the plan must not delete the performance; the FK is nullable already.
    exercise_prescription = models.ForeignKey(
        'protocols.ExercisePrescription',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='performed_exercises',
    )
    # Also the order within the session.
    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='null while the exercise is being recorded',
    )

    class Meta:
        verbose_name = 'performed exercise'
        verbose_name_plural = 'performed exercises'
        # The DBML's single-column (exercise_definition_id) index is not repeated here:
        # Django already creates an index on every ForeignKey column.
        indexes = [
            models.Index(
                fields=['training_session', 'created_at'],
                name='perfex_session_created_idx',
            ),
        ]
        constraints = [
            models.CheckConstraint(
                # The session's guard one level down: an open exercise (null
                # ended_at) passes; a closed one may not have finished before it
                # began.
                condition=(
                    models.Q(ended_at__isnull=True)
                    | models.Q(ended_at__gte=models.F('created_at'))
                ),
                name='perfex_ended_after_created',
            ),
        ]


class PerformedSet(models.Model):
    """One set of one PerformedExercise. Many sets per PerformedExercise."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    performed_exercise = models.ForeignKey(
        PerformedExercise,
        on_delete=models.CASCADE,
        related_name='performed_sets',
    )
    # Always stored metric; convert at display time.
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    reps = models.IntegerField(null=True, blank=True)
    # Always stored metric; convert at display time.
    distance_m = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    # For time-based work instead of reps.
    duration_s = models.IntegerField(null=True, blank=True)
    rpe = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    # Also the order within the performed exercise.
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'performed set'
        verbose_name_plural = 'performed sets'
        indexes = [
            models.Index(
                fields=['performed_exercise', 'created_at'],
                name='perfset_exercise_created_idx',
            ),
        ]


class PerformedRep(models.Model):
    """One rep of one PerformedSet. Many reps per PerformedSet."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    performed_set = models.ForeignKey(
        PerformedSet,
        on_delete=models.CASCADE,
        related_name='performed_reps',
    )
    # Ordinal within the performed set.
    rep_index = models.IntegerField()

    class Meta:
        verbose_name = 'performed rep'
        verbose_name_plural = 'performed reps'
        constraints = [
            models.UniqueConstraint(
                fields=['performed_set', 'rep_index'],
                name='perfrep_set_rep_index_uniq',
            ),
        ]
