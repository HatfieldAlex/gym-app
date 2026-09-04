import contextlib
import csv
import datetime
import io
import re
import tempfile
import zipfile
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.urls import resolve, reverse
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import ExerciseDefinition
from feedback.models import FeedbackNote
from observations.models import PerformedExercise, PerformedSet, TrainingSession
from protocols.models import ExercisePrescription
from settings.views import spa

from .export import CSV_FILES, build_archive, zip_filename

# Whole seconds, so the microsecond half of a stamp is exercised even when it
# happens to be zero.
MARCH = datetime.datetime(2026, 3, 1, 12, 0, tzinfo=datetime.timezone.utc)

PATHS = (
    'workouts.csv',
    'tables/exercise_definitions.csv',
    'tables/exercise_prescriptions.csv',
    'tables/feedback_notes.csv',
    'tables/performed_exercises.csv',
    'tables/performed_reps.csv',
    'tables/performed_sets.csv',
    'tables/training_sessions.csv',
    'tables/users.csv',
)

HEADERS = {
    'workouts.csv': [
        'username', 'session_date', 'session_started_at', 'session_ended_at',
        'session_type', 'exercise', 'exercise_number', 'set_number',
        'weight_kg', 'reps', 'distance_m', 'duration_s', 'rpe',
        'training_session_id', 'performed_exercise_id', 'performed_set_id',
    ],
    'tables/exercise_definitions.csv': ['id', 'name', 'created_by_id', 'created_at'],
    'tables/exercise_prescriptions.csv': ['id'],
    'tables/feedback_notes.csv': [
        'id', 'user_id', 'body', 'kind', 'page_path', 'created_at', 'resolved_at',
    ],
    'tables/performed_exercises.csv': [
        'id', 'training_session_id', 'exercise_definition_id',
        'exercise_prescription_id', 'created_at', 'ended_at',
    ],
    'tables/performed_reps.csv': ['id', 'performed_set_id', 'rep_index'],
    'tables/performed_sets.csv': [
        'id', 'performed_exercise_id', 'weight_kg', 'reps',
        'distance_m', 'duration_s', 'rpe', 'created_at',
    ],
    'tables/training_sessions.csv': [
        'id', 'user_id', 'type', 'created_at', 'started_at', 'ended_at',
    ],
    'tables/users.csv': [
        'id', 'username', 'email', 'first_name', 'last_name',
        'is_active', 'is_staff', 'is_superuser', 'date_joined', 'last_login',
    ],
}

STAMP = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$')


def read_rows(content, path):
    """One CSV out of the zip, parsed -- asserting on cells, not on the blob."""
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        text = archive.read(path).decode('utf-8')
    # newline='' so a quoted field holding a newline survives the round trip.
    return list(csv.reader(io.StringIO(text, newline='')))


def read_dicts(content, path):
    header, *rows = read_rows(content, path)
    return [dict(zip(header, row)) for row in rows]


def set_created_at(instance, when):
    """created_at is auto_now_add, so the only way to pin it is an UPDATE."""
    type(instance).objects.filter(pk=instance.pk).update(created_at=when)
    instance.created_at = when


class ExportArchiveTests(TestCase):
    AWKWARD = 'It broke, "hard",\nand then twice.'

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user(
            'lifter', password='pw', email='lifter@example.test',
        )
        cls.other = User.objects.create_user('stranger', password='pw')
        cls.admin = User.objects.create_superuser('boss', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.press = ExerciseDefinition.objects.create(name='Militärpress')
        cls.bench = ExerciseDefinition.objects.create(name='Bench press')
        # Nobody has ever performed this one; it is still shared catalogue (E1).
        cls.deadlift = ExerciseDefinition.objects.create(name='Deadlift')

        cls.prescription = ExercisePrescription.objects.create()
        cls.other_prescription = ExercisePrescription.objects.create()

        # A finished session: squat with two sets, a movement logged with no
        # sets at all, then bench with one.
        cls.session = TrainingSession.objects.create(
            user=cls.user,
            type='strength',
            started_at=MARCH,
            ended_at=MARCH + timedelta(hours=1),
        )
        set_created_at(cls.session, MARCH)

        cls.squat_performance = PerformedExercise.objects.create(
            training_session=cls.session,
            exercise_definition=cls.squat,
            exercise_prescription=cls.prescription,
        )
        set_created_at(cls.squat_performance, MARCH + timedelta(minutes=1))
        cls.heavy = PerformedSet.objects.create(
            performed_exercise=cls.squat_performance,
            weight_kg=Decimal('100.00'),
            reps=5,
            rpe=Decimal('7.5'),
        )
        set_created_at(cls.heavy, MARCH + timedelta(minutes=2))
        # Only reps: the other four numbers are null, which is normal.
        cls.light = PerformedSet.objects.create(
            performed_exercise=cls.squat_performance, reps=8,
        )
        set_created_at(cls.light, MARCH + timedelta(minutes=3))

        # Logged and then never actually performed, so it has no sets at all.
        cls.bench_performance = PerformedExercise.objects.create(
            training_session=cls.session, exercise_definition=cls.bench,
        )
        set_created_at(cls.bench_performance, MARCH + timedelta(minutes=4))

        cls.press_performance = PerformedExercise.objects.create(
            training_session=cls.session, exercise_definition=cls.press,
        )
        set_created_at(cls.press_performance, MARCH + timedelta(minutes=5))
        cls.press_set = PerformedSet.objects.create(
            performed_exercise=cls.press_performance, weight_kg=Decimal('60.00'), reps=10,
        )
        set_created_at(cls.press_set, MARCH + timedelta(minutes=6))

        # A session still in progress.
        cls.open_session = TrainingSession.objects.create(
            user=cls.user, started_at=MARCH + timedelta(days=1), ended_at=None,
        )
        set_created_at(cls.open_session, MARCH + timedelta(days=1))
        cls.open_performance = PerformedExercise.objects.create(
            training_session=cls.open_session, exercise_definition=cls.squat,
        )
        set_created_at(cls.open_performance, MARCH + timedelta(days=1, minutes=1))
        cls.open_set = PerformedSet.objects.create(
            performed_exercise=cls.open_performance, reps=3,
        )
        set_created_at(cls.open_set, MARCH + timedelta(days=1, minutes=2))

        # Somebody else's training, which must not appear anywhere.
        cls.other_session = TrainingSession.objects.create(
            user=cls.other, started_at=MARCH + timedelta(days=2),
        )
        cls.other_performance = PerformedExercise.objects.create(
            training_session=cls.other_session,
            exercise_definition=cls.squat,
            exercise_prescription=cls.other_prescription,
        )
        cls.other_set = PerformedSet.objects.create(
            performed_exercise=cls.other_performance, reps=1,
        )

        cls.note = FeedbackNote.objects.create(user=cls.user, body=cls.AWKWARD)
        cls.other_note = FeedbackNote.objects.create(user=cls.other, body='not yours')

    def setUp(self):
        self.name, self.content = build_archive(self.user)

    def test_the_zip_holds_the_nine_files_and_nothing_else(self):
        with zipfile.ZipFile(io.BytesIO(self.content)) as archive:
            self.assertEqual(sorted(archive.namelist()), sorted(PATHS))

    def test_every_file_carries_its_exact_header(self):
        for path in PATHS:
            with self.subTest(path=path):
                self.assertEqual(read_rows(self.content, path)[0], HEADERS[path])

    def test_a_table_nothing_writes_to_is_present_with_a_header_alone(self):
        rows = read_rows(self.content, 'tables/performed_reps.csv')
        self.assertEqual(rows, [HEADERS['tables/performed_reps.csv']])

    def test_another_users_rows_are_in_none_of_the_files(self):
        # auth.User.id is a small integer, so it is checked by column below
        # rather than swept for: '2' is also a plausible set_number.
        strangers = {
            str(self.other_session.pk),
            str(self.other_performance.pk),
            str(self.other_set.pk),
            str(self.other_prescription.pk),
            str(self.other_note.pk),
            'stranger',
            'not yours',
        }
        for path in PATHS:
            cells = {cell for row in read_rows(self.content, path) for cell in row}
            with self.subTest(path=path):
                self.assertEqual(cells & strangers, set())

        mine = str(self.user.pk)
        users = read_dicts(self.content, 'tables/users.csv')
        self.assertEqual([row['id'] for row in users], [mine])
        self.assertEqual([row['username'] for row in users], ['lifter'])
        for path in ('tables/training_sessions.csv', 'tables/feedback_notes.csv'):
            owners = {row['user_id'] for row in read_dicts(self.content, path)}
            with self.subTest(path=path):
                self.assertEqual(owners, {mine})

    def test_no_password_column_and_no_password_hash_anywhere(self):
        self.assertNotIn('password', HEADERS['tables/users.csv'])
        self.assertNotIn('password', read_rows(self.content, 'tables/users.csv')[0])

        hash_ = self.user.password.encode('utf-8')
        self.assertTrue(hash_)
        with zipfile.ZipFile(io.BytesIO(self.content)) as archive:
            for path in archive.namelist():
                with self.subTest(path=path):
                    self.assertNotIn(hash_, archive.read(path))

    def test_a_superuser_gets_everybody_and_matches_the_everything_scope(self):
        _, admin_content = build_archive(self.admin)
        _, all_content = build_archive()
        for path in PATHS:
            with self.subTest(path=path):
                self.assertEqual(
                    read_rows(admin_content, path), read_rows(all_content, path),
                )

        sessions = read_dicts(admin_content, 'tables/training_sessions.csv')
        self.assertIn(str(self.other_session.pk), [row['id'] for row in sessions])
        usernames = [row['username'] for row in read_dicts(admin_content, 'tables/users.csv')]
        self.assertEqual(sorted(usernames), ['boss', 'lifter', 'stranger'])

    def test_the_catalogue_is_shared_even_when_never_performed(self):
        names = [row['name'] for row in read_dicts(self.content, 'tables/exercise_definitions.csv')]
        self.assertEqual(sorted(names), ['Bench press', 'Deadlift', 'Militärpress', 'Squat'])

    def test_exercise_and_set_numbers_start_at_one_and_restart_per_parent(self):
        rows = read_dicts(self.content, 'workouts.csv')
        numbered = [
            (row['exercise'], row['exercise_number'], row['set_number']) for row in rows
        ]
        self.assertEqual(numbered, [
            ('Squat', '1', '1'),
            ('Squat', '1', '2'),
            # The setless bench press is position 2 in the session and yields no
            # row, so the press that follows it is 3.
            ('Militärpress', '3', '1'),
            ('Squat', '1', '1'),
        ])

    def test_a_performed_exercise_with_no_sets_is_in_the_table_and_not_the_log(self):
        ids = [row['id'] for row in read_dicts(self.content, 'tables/performed_exercises.csv')]
        self.assertIn(str(self.bench_performance.pk), ids)

        performed = [row['performed_exercise_id'] for row in read_dicts(self.content, 'workouts.csv')]
        self.assertNotIn(str(self.bench_performance.pk), performed)

    def test_nulls_are_empty_strings(self):
        light = next(
            row for row in read_dicts(self.content, 'tables/performed_sets.csv')
            if row['id'] == str(self.light.pk)
        )
        self.assertEqual(light['reps'], '8')
        for column in ('weight_kg', 'distance_m', 'duration_s', 'rpe'):
            with self.subTest(column=column):
                self.assertEqual(light[column], '')

        workout = next(
            row for row in read_dicts(self.content, 'workouts.csv')
            if row['performed_set_id'] == str(self.light.pk)
        )
        for column in ('weight_kg', 'distance_m', 'duration_s', 'rpe'):
            with self.subTest(column=column):
                self.assertEqual(workout[column], '')

    def test_an_open_session_has_no_end(self):
        session = next(
            row for row in read_dicts(self.content, 'tables/training_sessions.csv')
            if row['id'] == str(self.open_session.pk)
        )
        self.assertEqual(session['ended_at'], '')

        workout = next(
            row for row in read_dicts(self.content, 'workouts.csv')
            if row['training_session_id'] == str(self.open_session.pk)
        )
        self.assertEqual(workout['session_ended_at'], '')

    def test_decimals_are_written_exactly_as_stored(self):
        heavy = next(
            row for row in read_dicts(self.content, 'tables/performed_sets.csv')
            if row['id'] == str(self.heavy.pk)
        )
        self.assertEqual(heavy['weight_kg'], '100.00')
        self.assertEqual(heavy['rpe'], '7.5')

        workout = next(
            row for row in read_dicts(self.content, 'workouts.csv')
            if row['performed_set_id'] == str(self.heavy.pk)
        )
        self.assertEqual(workout['weight_kg'], '100.00')
        self.assertEqual(workout['rpe'], '7.5')

    def test_every_timestamp_is_utc_at_microsecond_precision(self):
        for row in read_dicts(self.content, 'tables/training_sessions.csv'):
            for column in ('created_at', 'started_at'):
                with self.subTest(column=column):
                    self.assertRegex(row[column], STAMP)

        # started_at here is a whole number of seconds, where a plain
        # isoformat() would silently drop the fractional part.
        workout = next(
            row for row in read_dicts(self.content, 'workouts.csv')
            if row['training_session_id'] == str(self.session.pk)
        )
        self.assertEqual(workout['session_started_at'], '2026-03-01T12:00:00.000000+00:00')
        self.assertEqual(workout['session_date'], '2026-03-01')

    def test_awkward_text_survives_the_csv(self):
        note = read_dicts(self.content, 'tables/feedback_notes.csv')[0]
        self.assertEqual(note['body'], self.AWKWARD)

        names = [row['name'] for row in read_dicts(self.content, 'tables/exercise_definitions.csv')]
        self.assertIn('Militärpress', names)
        exercises = [row['exercise'] for row in read_dicts(self.content, 'workouts.csv')]
        self.assertIn('Militärpress', exercises)

    def test_a_prescription_is_exported_only_to_whoever_performed_it(self):
        ids = [row['id'] for row in read_dicts(self.content, 'tables/exercise_prescriptions.csv')]
        self.assertEqual(ids, [str(self.prescription.pk)])

    def test_the_filename_names_the_requester_and_the_moment(self):
        name, _ = build_archive(self.user, at=MARCH)
        self.assertEqual(name, 'gym-app-export-lifter-20260301-120000Z.zip')


class ExportOrderingTests(TestCase):
    """There is no position column in this schema: created_at is the order."""

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        cls.squat = ExerciseDefinition.objects.create(name='Squat')

    def test_sessions_follow_started_at_not_created_at(self):
        # Written newest-trained-first, so created_at runs backwards against
        # started_at -- what happens when somebody types up a workout later.
        for index, days in enumerate((2, 1, 0)):
            session = TrainingSession.objects.create(
                user=self.user, started_at=MARCH + timedelta(days=days),
            )
            set_created_at(session, MARCH + timedelta(hours=index))
            performed = PerformedExercise.objects.create(
                training_session=session, exercise_definition=self.squat,
            )
            PerformedSet.objects.create(performed_exercise=performed, reps=days)

        _, content = build_archive(self.user)
        dates = [row['session_date'] for row in read_dicts(content, 'workouts.csv')]
        self.assertEqual(dates, ['2026-03-01', '2026-03-02', '2026-03-03'])

    def test_set_number_follows_created_at_not_the_order_rows_were_written(self):
        session = TrainingSession.objects.create(user=self.user, started_at=MARCH)
        performed = PerformedExercise.objects.create(
            training_session=session, exercise_definition=self.squat,
        )
        # Insertion order 1, 2, 3; created_at order 3, 1, 2.
        for reps, minutes in ((1, 20), (2, 30), (3, 10)):
            performed_set = PerformedSet.objects.create(
                performed_exercise=performed, reps=reps,
            )
            set_created_at(performed_set, MARCH + timedelta(minutes=minutes))

        _, content = build_archive(self.user)
        rows = read_dicts(content, 'workouts.csv')
        self.assertEqual([row['set_number'] for row in rows], ['1', '2', '3'])
        self.assertEqual([row['reps'] for row in rows], ['3', '1', '2'])


class ExportWithoutDataTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('rookie', password='pw')
        cls.squat = ExerciseDefinition.objects.create(name='Squat')

    def test_a_user_who_has_trained_nothing_still_gets_all_nine_files(self):
        _, content = build_archive(self.user)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            self.assertEqual(sorted(archive.namelist()), sorted(PATHS))

        for path in PATHS:
            rows = read_rows(content, path)
            with self.subTest(path=path):
                self.assertEqual(rows[0], HEADERS[path])
                if path == 'tables/users.csv':
                    self.assertEqual([row[1] for row in rows[1:]], ['rookie'])
                elif path == 'tables/exercise_definitions.csv':
                    self.assertEqual([row[1] for row in rows[1:]], ['Squat'])
                else:
                    # An empty table is an answer; the file is there to give it.
                    self.assertEqual(rows[1:], [])


class ExportQueryCountTests(TestCase):
    # Eight table queries plus three for workouts.csv (the sessions and the two
    # prefetches). Pinned so that adding a set cannot start adding a query.
    QUERIES = 11

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        cls.definitions = [
            ExerciseDefinition.objects.create(name='Movement %d' % index)
            for index in range(3)
        ]
        cls.seed(3)

    @classmethod
    def seed(cls, sessions):
        for day in range(sessions):
            session = TrainingSession.objects.create(
                user=cls.user, started_at=MARCH + timedelta(days=day),
            )
            for definition in cls.definitions:
                performed = PerformedExercise.objects.create(
                    training_session=session, exercise_definition=definition,
                )
                for reps in range(3):
                    PerformedSet.objects.create(performed_exercise=performed, reps=reps)

    def test_the_query_count_does_not_grow_with_the_rows(self):
        with self.assertNumQueries(self.QUERIES):
            build_archive(self.user)

        self.seed(3)
        with self.assertNumQueries(self.QUERIES):
            build_archive(self.user)


class ZipFilenameTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')

    def test_no_user_is_the_everything_scope(self):
        self.assertEqual(zip_filename(at=MARCH), 'gym-app-export-all-20260301-120000Z.zip')

    def test_the_username_is_reduced_to_plain_ascii(self):
        awkward = get_user_model().objects.create_user('a b/c@d', password='pw')
        self.assertEqual(
            zip_filename(awkward, at=MARCH), 'gym-app-export-a-b-c-d-20260301-120000Z.zip',
        )

    def test_a_username_with_nothing_safe_in_it_falls_back_to_the_pk(self):
        cyrillic = get_user_model().objects.create_user('лифтер', password='pw')
        self.assertEqual(
            zip_filename(cyrillic, at=MARCH),
            'gym-app-export-user-%s-20260301-120000Z.zip' % cyrillic.pk,
        )

    def test_the_stamp_is_utc(self):
        elsewhere = MARCH.astimezone(datetime.timezone(timedelta(hours=9)))
        self.assertEqual(
            zip_filename(self.user, at=elsewhere),
            'gym-app-export-lifter-20260301-120000Z.zip',
        )


class CsvFileSpecTests(TestCase):
    def test_the_specification_covers_the_nine_files_in_order(self):
        self.assertEqual([entry.path for entry in CSV_FILES], list(PATHS))
        for entry in CSV_FILES:
            with self.subTest(path=entry.path):
                self.assertEqual(list(entry.header), HEADERS[entry.path])


class DataExportEndpointTests(APITestCase):
    """The route, not the rows: chunk 01 tests what is in the zip."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')
        cls.admin = User.objects.create_superuser('boss', password='pw')
        cls.url = reverse('api:export')

        cls.session = TrainingSession.objects.create(user=cls.user, started_at=MARCH)
        cls.other_session = TrainingSession.objects.create(
            user=cls.other, started_at=MARCH + timedelta(days=1),
        )

    def test_anonymous_request_is_rejected(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_signed_in_user_gets_a_zip_named_after_them(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/zip')

        disposition = response['Content-Disposition']
        self.assertTrue(disposition.startswith('attachment;'), disposition)
        self.assertIn('gym-app-export-lifter-', disposition)
        self.assertTrue(disposition.endswith('Z.zip"'), disposition)

    def test_the_body_is_a_readable_zip_of_the_nine_files(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(sorted(archive.namelist()), sorted(PATHS))

    def test_another_users_rows_do_not_reach_the_wire(self):
        """Chunk 01 tests the module; this tests that the route did not widen it."""
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            for path in PATHS:
                with self.subTest(path=path):
                    self.assertNotIn(
                        str(self.other_session.id), archive.read(path).decode('utf-8'),
                    )

    def test_a_superuser_gets_everybodys_sessions(self):
        self.client.force_login(self.admin)
        response = self.client.get(self.url)
        sessions = read_dicts(response.content, 'tables/training_sessions.csv')
        ids = {row['id'] for row in sessions}
        self.assertIn(str(self.session.id), ids)
        self.assertIn(str(self.other_session.id), ids)

    def test_every_other_method_is_rejected(self):
        self.client.force_login(self.user)
        for method in (self.client.post, self.client.patch, self.client.put,
                       self.client.delete):
            with self.subTest(method=method.__name__):
                response = method(self.url)
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED,
                )

    def test_content_negotiation_is_pinned(self):
        """`Accept: application/zip` alone is a 406, and that is a decision (E3a).

        No renderer is registered for zip, because one that won negotiation for
        the success case would also win it for the 403 and 405 bodies and be
        handed a {'detail': ...} dict to turn into bytes.
        """
        self.client.force_login(self.user)
        for accept in ('application/zip, application/json', '*/*'):
            with self.subTest(accept=accept):
                response = self.client.get(self.url, HTTP_ACCEPT=accept)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response['Content-Type'], 'application/zip')

        response = self.client.get(self.url, HTTP_ACCEPT='application/zip')
        self.assertEqual(response.status_code, status.HTTP_406_NOT_ACCEPTABLE)

    def test_the_route_belongs_to_the_api_and_not_the_spa(self):
        """A path registered anywhere else is swallowed by the catch-all."""
        self.assertIsNot(resolve('/api/v1/export/').func, spa)


class ExportCommandTests(TestCase):
    """`manage.py export_data` — the module's second caller, reached over argv."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')
        cls.admin = User.objects.create_superuser('boss', password='pw')
        cls.squat = ExerciseDefinition.objects.create(name='Squat')

        cls.session = TrainingSession.objects.create(user=cls.user, started_at=MARCH)
        cls.other_session = TrainingSession.objects.create(
            user=cls.other, started_at=MARCH + timedelta(days=1),
        )

    def run_command(self, *arguments):
        """The command with both text streams captured; returns (stdout, stderr)."""
        out, err = io.StringIO(), io.StringIO()
        call_command('export_data', *arguments, stdout=out, stderr=err)
        return out.getvalue(), err.getvalue()

    def session_ids(self, content):
        return {row['id'] for row in read_dicts(content, 'tables/training_sessions.csv')}

    def test_output_writes_a_readable_zip_of_the_nine_files_at_that_path(self):
        with tempfile.TemporaryDirectory() as directory:
            # Under a directory that does not exist yet: the command makes it.
            path = Path(directory) / 'backups' / 'backup.zip'
            out, _ = self.run_command('--output', str(path))
            content = path.read_bytes()

        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(sorted(archive.namelist()), sorted(PATHS))
        self.assertIn(str(path), out)

    def test_without_output_the_stamped_file_lands_in_the_working_directory(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
            out, _ = self.run_command('--user', 'lifter')
            written = list(Path(directory).iterdir())
            self.assertEqual(len(written), 1, written)
            content = written[0].read_bytes()

        self.assertRegex(written[0].name, r'^gym-app-export-lifter-\d{8}-\d{6}Z\.zip$')
        self.assertIn(written[0].name, out)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            self.assertEqual(sorted(archive.namelist()), sorted(PATHS))

    def test_user_exports_exactly_what_build_archive_gives_that_user(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'lifter.zip'
            self.run_command('--user', 'lifter', '-o', str(path))
            content = path.read_bytes()

        _, expected = build_archive(self.user)
        for entry in PATHS:
            with self.subTest(path=entry):
                self.assertEqual(read_rows(content, entry), read_rows(expected, entry))

        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            for entry in PATHS:
                with self.subTest(path=entry):
                    self.assertNotIn(
                        str(self.other_session.pk), archive.read(entry).decode('utf-8'),
                    )

    def test_no_user_exports_everything(self):
        """A backup is the whole database; naming a user is the exception (E11)."""
        with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
            self.run_command()
            written, = Path(directory).iterdir()
            content = written.read_bytes()

        self.assertIn('-all-', written.name)
        self.assertEqual(
            self.session_ids(content),
            {str(self.session.pk), str(self.other_session.pk)},
        )

    def test_a_superuser_named_by_user_gets_everything_too(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'boss.zip'
            self.run_command('--user', 'boss', '-o', str(path))
            content = path.read_bytes()

        self.assertEqual(
            self.session_ids(content),
            {str(self.session.pk), str(self.other_session.pk)},
        )

    def test_an_unknown_username_is_an_error_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
            with self.assertRaises(CommandError):
                self.run_command('--user', 'nobody', '-o', str(Path(directory) / 'x.zip'))
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_output_dash_writes_zip_bytes_to_stdout_and_nothing_else(self):
        """`heroku run ... -o - > backup.zip`: one sentence on stdout corrupts it."""
        raw = io.BytesIO()
        stdout = io.TextIOWrapper(raw, encoding='utf-8', newline='')
        err = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            call_command('export_data', '--user', 'lifter', '-o', '-', stderr=err)
            stdout.flush()
            piped = raw.getvalue()

        self.assertEqual(piped[:2], b'PK')
        with zipfile.ZipFile(io.BytesIO(piped)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(sorted(archive.namelist()), sorted(PATHS))

        # The success line still happens -- it just goes the other way.
        self.assertIn('stdout', err.getvalue())
