"""Everything the requester can see, as a zip of CSVs.

Two forms of the same rows, at once: one raw CSV per table under ``tables/``,
carrying UUIDs, foreign keys and full-precision timestamps so the database can
be rebuilt exactly, and a denormalised ``workouts.csv`` at the top level, one
row per set, that opens as a training log in any spreadsheet.

Passing no user exports every row; passing one exports what that user can see,
which for a superuser is also every row. The module is about rows and knows
nothing about HTTP or argv -- the endpoint and the management command are its
callers, and each is a handful of lines.
"""
import csv
import datetime
import io
import re
import zipfile
from collections import namedtuple

from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from django.utils import timezone

from catalog.models import ExerciseDefinition
from feedback.models import FeedbackNote
from observations.models import (
    PerformedExercise,
    PerformedRep,
    PerformedSet,
    TrainingSession,
)
from protocols.models import ExercisePrescription

# One entry per file in the zip: where it sits, its header row, and the callable
# that yields its rows for a user. Data rather than nine hard-coded calls, so
# build_archive and the tests both walk the same list and "every file is always
# present" is a property of the loop.
CsvFile = namedtuple('CsvFile', 'path header rows')

# Anything outside this becomes '-' in the zip's filename, which is what keeps
# Content-Disposition plain ASCII with no encoding to get wrong.
UNSAFE_IN_FILENAME = re.compile(r'[^A-Za-z0-9._-]')


def cell(value):
    """One field value as its CSV cell.

    Decimals go through ``str`` untouched, so 100.00 stays 100.00, and datetimes
    keep their microseconds: with no position column anywhere in this schema,
    created_at is the only record of the order a workout happened in, and
    truncating it destroys that.
    """
    if value is None:
        return ''
    if isinstance(value, datetime.datetime):
        return value.astimezone(datetime.timezone.utc).isoformat(timespec='microseconds')
    return str(value)


def scoped(queryset, user, path):
    """`queryset` narrowed to the requester, or left whole for the everything-scope.

    A superuser sees every row too, under their own name.
    """
    if user is None or user.is_superuser:
        return queryset
    return queryset.filter(**{path: user})


USERS_HEADER = (
    'id', 'username', 'email', 'first_name', 'last_name',
    'is_active', 'is_staff', 'is_superuser', 'date_joined', 'last_login',
)


def user_rows(user):
    """Every concrete field of auth.User except `password`, which is never exported."""
    queryset = get_user_model().objects.order_by('id')
    if user is not None and not user.is_superuser:
        queryset = queryset.filter(pk=user.pk)
    for row in queryset:
        yield [cell(value) for value in (
            row.id,
            row.username,
            row.email,
            row.first_name,
            row.last_name,
            row.is_active,
            row.is_staff,
            row.is_superuser,
            row.date_joined,
            row.last_login,
        )]


TRAINING_SESSIONS_HEADER = ('id', 'user_id', 'type', 'created_at', 'started_at', 'ended_at')


def training_session_rows(user):
    queryset = scoped(TrainingSession.objects, user, 'user').order_by('created_at', 'id')
    for row in queryset:
        yield [cell(value) for value in (
            row.id,
            row.user_id,
            row.type,
            row.created_at,
            row.started_at,
            row.ended_at,
        )]


PERFORMED_EXERCISES_HEADER = (
    'id', 'training_session_id', 'exercise_definition_id',
    'exercise_prescription_id', 'created_at',
)


def performed_exercise_rows(user):
    queryset = (
        scoped(PerformedExercise.objects, user, 'training_session__user')
        .order_by('created_at', 'id')
    )
    for row in queryset:
        yield [cell(value) for value in (
            row.id,
            row.training_session_id,
            row.exercise_definition_id,
            row.exercise_prescription_id,
            row.created_at,
        )]


PERFORMED_SETS_HEADER = (
    'id', 'performed_exercise_id', 'weight_kg', 'reps',
    'distance_m', 'duration_s', 'rpe', 'created_at',
)


def performed_set_rows(user):
    queryset = (
        scoped(PerformedSet.objects, user, 'performed_exercise__training_session__user')
        .order_by('created_at', 'id')
    )
    for row in queryset:
        yield [cell(value) for value in (
            row.id,
            row.performed_exercise_id,
            row.weight_kg,
            row.reps,
            row.distance_m,
            row.duration_s,
            row.rpe,
            row.created_at,
        )]


PERFORMED_REPS_HEADER = ('id', 'performed_set_id', 'rep_index')


def performed_rep_rows(user):
    queryset = (
        scoped(
            PerformedRep.objects,
            user,
            'performed_set__performed_exercise__training_session__user',
        )
        .order_by('performed_set_id', 'rep_index')
    )
    for row in queryset:
        yield [cell(value) for value in (row.id, row.performed_set_id, row.rep_index)]


EXERCISE_DEFINITIONS_HEADER = ('id', 'name', 'created_by_id', 'created_at')


def exercise_definition_rows(user):
    """The whole catalogue, for everyone: it is shared reference data, and it is
    what resolves the exercise_definition_id in the requester's own rows."""
    for row in ExerciseDefinition.objects.order_by('created_at', 'id'):
        yield [cell(value) for value in (row.id, row.name, row.created_by_id, row.created_at)]


EXERCISE_PRESCRIPTIONS_HEADER = ('id',)


def exercise_prescription_rows(user):
    """The prescriptions the requester's own performed exercises point at."""
    queryset = ExercisePrescription.objects.order_by('id')
    if user is not None and not user.is_superuser:
        # distinct(): one prescription can be referenced by many performances.
        queryset = queryset.filter(
            performed_exercises__training_session__user=user,
        ).distinct()
    for row in queryset:
        yield [cell(row.id)]


FEEDBACK_NOTES_HEADER = (
    'id', 'user_id', 'body', 'kind', 'page_path', 'created_at', 'resolved_at',
)


def feedback_note_rows(user):
    queryset = scoped(FeedbackNote.objects, user, 'user').order_by('created_at', 'id')
    for row in queryset:
        yield [cell(value) for value in (
            row.id,
            row.user_id,
            row.body,
            row.kind,
            row.page_path,
            row.created_at,
            row.resolved_at,
        )]


WORKOUTS_HEADER = (
    'username', 'session_date', 'session_started_at', 'session_ended_at',
    'session_type', 'exercise', 'exercise_number', 'set_number',
    'weight_kg', 'reps', 'distance_m', 'duration_s', 'rpe',
    'training_session_id', 'performed_exercise_id', 'performed_set_id',
)


def workout_rows(user):
    """One row per set, with the movement named -- the readable half of the export.

    exercise_number and set_number are counted out of the created_at ordering
    rather than read off a column, because the schema has no position column;
    created_at is the order. A performed exercise with no sets logged yields
    nothing here, and stays visible in tables/performed_exercises.csv.
    """
    performed_sets = PerformedSet.objects.order_by('created_at', 'id')
    performed_exercises = (
        PerformedExercise.objects
        .select_related('exercise_definition')
        .order_by('created_at', 'id')
        .prefetch_related(Prefetch('performed_sets', queryset=performed_sets))
    )
    sessions = (
        scoped(TrainingSession.objects, user, 'user')
        .select_related('user')
        # By when the training happened, not when it was typed: a session
        # backdated into last month belongs in last month.
        .order_by('user__username', 'started_at', 'id')
        .prefetch_related(Prefetch('performed_exercises', queryset=performed_exercises))
    )

    for session in sessions:
        for exercise_number, performed_exercise in enumerate(
            session.performed_exercises.all(), start=1,
        ):
            for set_number, performed_set in enumerate(
                performed_exercise.performed_sets.all(), start=1,
            ):
                yield [cell(value) for value in (
                    session.user.username,
                    session.started_at.astimezone(datetime.timezone.utc).date(),
                    session.started_at,
                    session.ended_at,
                    session.type,
                    performed_exercise.exercise_definition.name,
                    exercise_number,
                    set_number,
                    performed_set.weight_kg,
                    performed_set.reps,
                    performed_set.distance_m,
                    performed_set.duration_s,
                    performed_set.rpe,
                    session.id,
                    performed_exercise.id,
                    performed_set.id,
                )]


# workouts.csv sits at the top level and the rebuild-fidelity files one below,
# so unzipping puts the file most people want in front of them.
CSV_FILES = (
    CsvFile('workouts.csv', WORKOUTS_HEADER, workout_rows),
    CsvFile('tables/exercise_definitions.csv', EXERCISE_DEFINITIONS_HEADER, exercise_definition_rows),
    CsvFile('tables/exercise_prescriptions.csv', EXERCISE_PRESCRIPTIONS_HEADER, exercise_prescription_rows),
    CsvFile('tables/feedback_notes.csv', FEEDBACK_NOTES_HEADER, feedback_note_rows),
    CsvFile('tables/performed_exercises.csv', PERFORMED_EXERCISES_HEADER, performed_exercise_rows),
    CsvFile('tables/performed_reps.csv', PERFORMED_REPS_HEADER, performed_rep_rows),
    CsvFile('tables/performed_sets.csv', PERFORMED_SETS_HEADER, performed_set_rows),
    CsvFile('tables/training_sessions.csv', TRAINING_SESSIONS_HEADER, training_session_rows),
    CsvFile('tables/users.csv', USERS_HEADER, user_rows),
)


def render_csv(header, rows):
    """One CSV as UTF-8 bytes, header row first even when there are no rows.

    No byte-order mark: it helps one spreadsheet and corrupts the first header
    cell for every naive parser.
    """
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    writer.writerows(rows)
    return out.getvalue().encode('utf-8')


def zip_filename(user=None, at=None):
    """`gym-app-export-<who>-<YYYYMMDD-HHMMSS>Z.zip`, stamped in UTC.

    <who> is `all` for the everything-scope, otherwise the username reduced to
    the characters that are safe in a filename -- which is what lets the
    endpoint put the name straight into Content-Disposition unencoded.
    """
    at = (at or timezone.now()).astimezone(datetime.timezone.utc)
    if user is None:
        who = 'all'
    else:
        who = UNSAFE_IN_FILENAME.sub('-', user.username)
        if not who.strip('-'):
            # Nothing of the username survived the reduction.
            who = 'user-%s' % user.pk
    return 'gym-app-export-%s-%sZ.zip' % (who, at.strftime('%Y%m%d-%H%M%S'))


def build_archive(user=None, at=None):
    """The whole export as (filename, zip bytes). No user means every row.

    Built in memory: one athlete's entire log is tens of kilobytes, and the
    nine CSVs are the only things in it.
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for csv_file in CSV_FILES:
            archive.writestr(csv_file.path, render_csv(csv_file.header, csv_file.rows(user)))
    return zip_filename(user, at), buffer.getvalue()
