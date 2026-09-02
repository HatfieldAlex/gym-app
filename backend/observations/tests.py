import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import ExerciseDefinition

from .models import PerformedExercise, PerformedSet, TrainingSession


class TrainingSessionAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        # Finished sessions: an open one would block every create below.
        trained_at = timezone.now()
        cls.session = TrainingSession.objects.create(
            user=cls.user, type='legs', started_at=trained_at, ended_at=trained_at
        )
        cls.performed = PerformedExercise.objects.create(
            training_session=cls.session,
            exercise_definition=cls.squat,
        )
        cls.other_session = TrainingSession.objects.create(
            user=cls.other, type='push', started_at=trained_at, ended_at=trained_at
        )

    def test_anonymous_request_is_rejected(self):
        response = self.client.get(reverse('api:trainingsession-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_is_scoped_to_the_requester(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('api:trainingsession-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([s['id'] for s in response.data['results']], [str(self.session.pk)])

    def test_another_users_session_is_not_readable(self):
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('api:trainingsession-detail', args=[self.other_session.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_exercises_are_nested_with_their_catalogue_name(self):
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('api:trainingsession-detail', args=[self.session.pk])
        )
        self.assertEqual(
            [e['exercise_name'] for e in response.data['performed_exercises']],
            ['Squat'],
        )

    def test_detail_nests_the_sets_of_each_exercise(self):
        PerformedSet.objects.create(performed_exercise=self.performed, weight_kg=60, reps=8)
        PerformedSet.objects.create(performed_exercise=self.performed, weight_kg=70, reps=5)

        self.client.force_login(self.user)
        response = self.client.get(
            reverse('api:trainingsession-detail', args=[self.session.pk])
        )
        sets = response.data['performed_exercises'][0]['performed_sets']
        self.assertEqual([s['reps'] for s in sets], [8, 5])

    def test_list_leaves_the_sets_out(self):
        """The list view carries names only; sets are the detail view's job."""
        PerformedSet.objects.create(performed_exercise=self.performed, weight_kg=60, reps=8)

        self.client.force_login(self.user)
        response = self.client.get(reverse('api:trainingsession-list'))
        self.assertNotIn(
            'performed_sets', response.data['results'][0]['performed_exercises'][0]
        )

    def test_create_stamps_the_requester_as_owner(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('api:trainingsession-list'), {'type': 'pull'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TrainingSession.objects.get(pk=response.data['id']).user, self.user)

    def test_owner_cannot_be_set_by_the_client(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('api:trainingsession-list'),
            {'type': 'pull', 'user': self.other.pk},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TrainingSession.objects.get(pk=response.data['id']).user, self.user)


class TrainingSessionLifecycleTests(APITestCase):
    """Starting, finding and ending the one session that is in progress."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')

    def setUp(self):
        self.client.force_login(self.user)

    def start(self, **body):
        return self.client.post(
            reverse('api:trainingsession-list'), body, format='json'
        )

    def test_current_is_204_when_no_session_is_open(self):
        """Not being mid-workout is a normal state, not a missing resource."""
        response = self.client.get(reverse('api:trainingsession-current'))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.content, b'')

    def test_an_empty_post_starts_a_session(self):
        before = timezone.now()
        response = self.start()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['ended_at'])

        session = TrainingSession.objects.get(pk=response.data['id'])
        self.assertGreaterEqual(session.started_at, before)
        self.assertLessEqual(session.started_at, timezone.now())

    def test_only_one_session_may_be_open_at_a_time(self):
        first = self.start()
        response = self.start()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # The client can recover by loading the session it had lost track of.
        self.assertEqual(response.data['open_session'], first.data['id'])
        self.assertEqual(TrainingSession.objects.count(), 1)

    def test_current_returns_the_open_session_with_its_exercises(self):
        created = self.start()
        response = self.client.get(reverse('api:trainingsession-current'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], created.data['id'])
        self.assertEqual(response.data['performed_exercises'], [])

    def test_ending_a_session_closes_it_once(self):
        session_id = self.start().data['id']
        end_url = reverse('api:trainingsession-end', args=[session_id])

        response = self.client.post(end_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data['ended_at'])

        # A second call must not move the timestamp.
        ended_at = TrainingSession.objects.get(pk=session_id).ended_at
        response = self.client.post(end_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TrainingSession.objects.get(pk=session_id).ended_at, ended_at)

        response = self.client.get(reverse('api:trainingsession-current'))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_ending_a_session_that_has_not_started_is_400_not_500(self):
        """The check constraint would reject the save; say so rather than crash."""
        session = TrainingSession.objects.create(
            user=self.user, started_at=timezone.now() + timedelta(days=1)
        )
        response = self.client.post(reverse('api:trainingsession-end', args=[session.pk]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIsNone(TrainingSession.objects.get(pk=session.pk).ended_at)

    def test_a_session_typed_in_after_the_fact_is_not_open(self):
        """It is already finished, so a running session does not block it, and it
        lists by when it was trained rather than when it was typed."""
        last_week = timezone.now() - timedelta(days=7)
        older = TrainingSession.objects.create(
            user=self.user,
            started_at=last_week - timedelta(days=1),
            ended_at=last_week - timedelta(days=1) + timedelta(hours=1),
        )
        open_session = self.start()

        response = self.start(
            started_at=last_week.isoformat(),
            ended_at=(last_week + timedelta(hours=1)).isoformat(),
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        current = self.client.get(reverse('api:trainingsession-current'))
        self.assertEqual(current.data['id'], open_session.data['id'])

        listed = self.client.get(reverse('api:trainingsession-list'))
        self.assertEqual(
            [s['id'] for s in listed.data['results']],
            [open_session.data['id'], response.data['id'], str(older.pk)],
        )

    def test_a_session_cannot_end_before_it_started(self):
        started_at = timezone.now() - timedelta(days=7)
        response = self.start(
            started_at=started_at.isoformat(),
            ended_at=(started_at - timedelta(hours=1)).isoformat(),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ended_at', response.data)

    def test_patch_cannot_close_a_session(self):
        """Only end/ stamps a timestamp the client did not choose."""
        session_id = self.start().data['id']
        response = self.client.patch(
            reverse('api:trainingsession-detail', args=[session_id]),
            {'ended_at': timezone.now().isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(TrainingSession.objects.get(pk=session_id).ended_at)


class PerformedExerciseAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.session = TrainingSession.objects.create(user=cls.user, type='legs')
        cls.other_session = TrainingSession.objects.create(user=cls.other, type='push')

    def test_filtering_by_session(self):
        PerformedExercise.objects.create(
            training_session=self.session, exercise_definition=self.squat
        )
        self.client.force_login(self.user)
        response = self.client.get(
            reverse('api:performedexercise-list'), {'training_session': self.session.pk}
        )
        self.assertEqual(len(response.data['results']), 1)

    def test_cannot_attach_to_another_users_session(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('api:performedexercise-list'),
            {
                'training_session': str(self.other_session.pk),
                'exercise_definition': str(self.squat.pk),
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PerformedExercise.objects.filter(training_session=self.other_session).exists())


class PerformedSetAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.performed = PerformedExercise.objects.create(
            training_session=TrainingSession.objects.create(user=cls.user, type='legs'),
            exercise_definition=cls.squat,
        )
        cls.other_performed = PerformedExercise.objects.create(
            training_session=TrainingSession.objects.create(user=cls.other, type='push'),
            exercise_definition=cls.squat,
        )

    def test_create_and_list_own_sets(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('api:performedset-list'),
            {'performed_exercise': str(self.performed.pk), 'weight_kg': '100.00', 'reps': 5},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.get(reverse('api:performedset-list'))
        self.assertEqual([s['reps'] for s in response.data['results']], [5])

    def test_cannot_attach_to_another_users_exercise(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('api:performedset-list'),
            {'performed_exercise': str(self.other_performed.pk), 'reps': 5},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PerformedSet.objects.exists())

    def test_correcting_a_set_can_clear_its_weight(self):
        """A set logged with a weight can become a bodyweight one (A5)."""
        logged = PerformedSet.objects.create(
            performed_exercise=self.performed, weight_kg='100.00', reps=5
        )
        self.client.force_login(self.user)
        response = self.client.patch(
            reverse('api:performedset-detail', args=[logged.pk]),
            {'weight_kg': None, 'reps': 8},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['weight_kg'])
        logged.refresh_from_db()
        self.assertIsNone(logged.weight_kg)
        self.assertEqual(logged.reps, 8)

    def test_deleting_a_set_leaves_its_exercise_behind(self):
        """The user removed a set, not the movement: the block stays, empty."""
        logged = PerformedSet.objects.create(performed_exercise=self.performed, reps=5)
        self.client.force_login(self.user)
        response = self.client.delete(reverse('api:performedset-detail', args=[logged.pk]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PerformedSet.objects.exists())
        self.assertTrue(PerformedExercise.objects.filter(pk=self.performed.pk).exists())

    def test_another_users_set_cannot_be_edited_or_deleted(self):
        logged = PerformedSet.objects.create(performed_exercise=self.other_performed, reps=5)
        self.client.force_login(self.user)
        detail = reverse('api:performedset-detail', args=[logged.pk])
        self.assertEqual(
            self.client.patch(detail, {'reps': 1}, format='json').status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(self.client.delete(detail).status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(PerformedSet.objects.filter(pk=logged.pk).exists())



class PerformedExerciseHistoryTests(APITestCase):
    """`history/` — the last few times this user trained one movement."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.bench = ExerciseDefinition.objects.create(name='Bench press')

        cls.url = reverse('api:performedexercise-history')

    @staticmethod
    def train(user, exercise, days_ago):
        """One finished session on a given day, with the movement performed in it."""
        trained_at = timezone.now() - timedelta(days=days_ago)
        session = TrainingSession.objects.create(
            user=user,
            started_at=trained_at,
            ended_at=trained_at + timedelta(hours=1),
        )
        return PerformedExercise.objects.create(
            training_session=session, exercise_definition=exercise
        )

    def history(self, **params):
        params.setdefault('exercise_definition', str(self.squat.pk))
        return self.client.get(self.url, params)

    def test_anonymous_request_is_rejected(self):
        response = self.history()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_another_users_identical_training_is_invisible(self):
        """Same movement, same day, different lifter."""
        self.train(self.other, self.squat, days_ago=1)
        mine = self.train(self.user, self.squat, days_ago=1)

        self.client.force_login(self.user)
        response = self.history()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([e['id'] for e in response.data], [str(mine.pk)])

    def test_newest_first_by_when_it_was_trained(self):
        """A backdated session sorts by started_at, not by when it was typed."""
        # Written newest-trained first, so created_at runs the other way.
        newest = self.train(self.user, self.squat, days_ago=1)
        middle = self.train(self.user, self.squat, days_ago=8)
        oldest = self.train(self.user, self.squat, days_ago=30)
        self.assertLess(newest.created_at, oldest.created_at)

        self.client.force_login(self.user)
        response = self.history()
        self.assertEqual(
            [e['id'] for e in response.data],
            [str(newest.pk), str(middle.pk), str(oldest.pk)],
        )

    def test_only_the_asked_for_movement_comes_back(self):
        squatted = self.train(self.user, self.squat, days_ago=1)
        self.train(self.user, self.bench, days_ago=1)

        self.client.force_login(self.user)
        response = self.history()
        self.assertEqual([e['id'] for e in response.data], [str(squatted.pk)])

    def test_exclude_session_drops_that_session_only(self):
        running = self.train(self.user, self.squat, days_ago=0)
        earlier = self.train(self.user, self.squat, days_ago=7)

        self.client.force_login(self.user)
        response = self.history(exclude_session=str(running.training_session_id))
        self.assertEqual([e['id'] for e in response.data], [str(earlier.pk)])

    def test_three_sessions_by_default(self):
        for days_ago in (1, 8, 15, 22, 29):
            self.train(self.user, self.squat, days_ago=days_ago)

        self.client.force_login(self.user)
        self.assertEqual(len(self.history().data), 3)

    def test_limit_caps_the_count(self):
        for days_ago in (1, 8, 15, 22):
            self.train(self.user, self.squat, days_ago=days_ago)

        self.client.force_login(self.user)
        self.assertEqual(len(self.history(limit=1).data), 1)
        self.assertEqual(len(self.history(limit=4).data), 4)

    def test_a_limit_above_the_cap_is_clamped_not_refused(self):
        self.train(self.user, self.squat, days_ago=1)

        self.client.force_login(self.user)
        response = self.history(limit=500)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_a_nonsense_limit_is_rejected(self):
        self.client.force_login(self.user)
        for limit in ('lots', '0', '-3'):
            with self.subTest(limit=limit):
                response = self.history(limit=limit)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sets_come_back_nested_in_performed_order(self):
        performed = self.train(self.user, self.squat, days_ago=1)
        PerformedSet.objects.create(performed_exercise=performed, weight_kg='60.00', reps=8)
        PerformedSet.objects.create(performed_exercise=performed, weight_kg='70.00', reps=5)

        self.client.force_login(self.user)
        sets = self.history().data[0]['performed_sets']
        self.assertEqual(
            [(s['weight_kg'], s['reps']) for s in sets],
            [('60.00', 8), ('70.00', 5)],
        )

    def test_each_block_carries_the_date_it_was_trained(self):
        performed = self.train(self.user, self.squat, days_ago=1)

        self.client.force_login(self.user)
        row = self.history().data[0]
        self.assertEqual(
            parse_datetime(row['training_session_started_at']),
            performed.training_session.started_at,
        )

    def test_the_answer_is_a_bare_array_not_a_page(self):
        self.train(self.user, self.squat, days_ago=1)

        self.client.force_login(self.user)
        response = self.history()
        self.assertIsInstance(response.data, list)

    def test_a_never_trained_movement_is_an_empty_list(self):
        """Never having done it is an answer, not a missing resource."""
        self.client.force_login(self.user)
        response = self.history(exercise_definition=str(self.bench.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_an_unknown_exercise_id_is_an_empty_list(self):
        self.client.force_login(self.user)
        response = self.history(exercise_definition=str(uuid.uuid4()))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_the_movement_is_required(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_a_malformed_uuid_is_a_400_not_a_500(self):
        """Filtering a UUIDField on garbage would otherwise raise, and DRF 500s."""
        self.client.force_login(self.user)
        self.assertEqual(
            self.history(exercise_definition='not-a-uuid').status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.history(exclude_session='not-a-uuid').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_the_query_count_does_not_grow_with_the_rows(self):
        """select_related + a prefetch, so more history is not more queries."""
        for days_ago in (1, 8, 15):
            performed = self.train(self.user, self.squat, days_ago=days_ago)
            PerformedSet.objects.create(performed_exercise=performed, reps=5)

        self.client.force_login(self.user)
        with CaptureQueriesContext(connection) as one_row:
            self.assertEqual(len(self.history(limit=1).data), 1)
        with CaptureQueriesContext(connection) as three_rows:
            self.assertEqual(len(self.history().data), 3)
        self.assertEqual(len(three_rows), len(one_row))
