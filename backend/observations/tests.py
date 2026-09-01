from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
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

