from django.contrib.auth import get_user_model
from django.urls import reverse
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
        cls.session = TrainingSession.objects.create(user=cls.user, type='legs')
        cls.performed = PerformedExercise.objects.create(
            training_session=cls.session,
            exercise_definition=cls.squat,
        )
        cls.other_session = TrainingSession.objects.create(user=cls.other, type='push')

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

