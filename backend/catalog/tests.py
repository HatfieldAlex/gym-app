from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ExerciseDefinition


class ExerciseDefinitionAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.bench = ExerciseDefinition.objects.create(name='Bench press')

    def test_anonymous_request_is_rejected(self):
        response = self.client.get(reverse('api:exercise-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_is_ordered_by_name(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('api:exercise-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [exercise['name'] for exercise in response.data['results']],
            ['Bench press', 'Squat'],
        )

    def test_detail_returns_the_catalogue_entry(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('api:exercise-detail', args=[self.squat.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Squat')

    def test_catalogue_is_read_only(self):
        self.client.force_login(self.user)
        response = self.client.post(reverse('api:exercise-list'), {'name': 'Deadlift'})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class CataloguePageTests(APITestCase):
    """The pages are shells now: they must not carry catalogue data themselves."""

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        cls.squat = ExerciseDefinition.objects.create(name='Squat')

    def test_catalogue_page_renders_without_the_data(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('exercises_catelog'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotContains(response, 'Squat')

    def test_detail_page_passes_the_id_to_the_client(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('exercise_detail', args=[self.squat.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, f'data-exercise-id="{self.squat.pk}"')
