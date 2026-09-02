from unittest import mock

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ExerciseDefinition
from .serializers import ExerciseDefinitionSerializer


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

    def test_catalogue_rejects_edits_and_deletes(self):
        """Adding is the only write: renaming and removing stay admin work (N2)."""
        self.client.force_login(self.user)
        url = reverse('api:exercise-detail', args=[self.squat.pk])
        for request in (
            lambda: self.client.put(url, {'name': 'Back squat'}),
            lambda: self.client.patch(url, {'name': 'Back squat'}),
            lambda: self.client.delete(url),
        ):
            with self.subTest(request=request):
                self.assertEqual(
                    request().status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )
        self.squat.refresh_from_db()
        self.assertEqual(self.squat.name, 'Squat')


class ExerciseDefinitionCreateAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        cls.other = get_user_model().objects.create_user('spotter', password='pw')
        cls.bench = ExerciseDefinition.objects.create(name='Bench press')

    def setUp(self):
        self.url = reverse('api:exercise-list')

    def post(self, payload):
        self.client.force_login(self.user)
        return self.client.post(self.url, payload)

    def test_anonymous_create_is_rejected(self):
        response = self.client.post(self.url, {'name': 'Front squat'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ExerciseDefinition.objects.filter(name='Front squat').exists())

    def test_signed_in_create_returns_the_entry(self):
        response = self.post({'name': 'Front squat'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(response.data), {'id', 'name', 'created_at'})
        self.assertEqual(response.data['name'], 'Front squat')
        created = ExerciseDefinition.objects.get(name='Front squat')
        self.assertEqual(str(created.pk), str(response.data['id']))

    def test_create_stamps_the_sender(self):
        self.post({'name': 'Front squat'})
        created = ExerciseDefinition.objects.get(name='Front squat')
        self.assertEqual(created.created_by, self.user)

    def test_created_by_in_the_body_is_ignored(self):
        """The sender comes from the request, never from the body (N6)."""
        response = self.post({'name': 'Front squat', 'created_by': self.other.pk})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('created_by', response.data)
        created = ExerciseDefinition.objects.get(name='Front squat')
        self.assertEqual(created.created_by, self.user)

    def test_whitespace_is_collapsed(self):
        response = self.post({'name': '  Front   squat '})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Front squat')
        self.assertTrue(ExerciseDefinition.objects.filter(name='Front squat').exists())

    def test_a_blank_name_is_rejected(self):
        for name in ('', '   '):
            with self.subTest(name=name):
                response = self.post({'name': name})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('name', response.data)
        self.assertEqual(ExerciseDefinition.objects.count(), 1)

    def test_a_name_over_the_column_length_is_rejected(self):
        response = self.post({'name': 'x' * 121})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)
        self.assertEqual(ExerciseDefinition.objects.count(), 1)

    def test_an_exact_duplicate_is_answered_with_the_existing_entry(self):
        response = self.post({'name': 'Bench press'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(str(response.data['existing']['id']), str(self.bench.pk))
        self.assertEqual(response.data['existing']['name'], 'Bench press')
        self.assertEqual(set(response.data['existing']), {'id', 'name', 'created_at'})
        self.assertEqual(ExerciseDefinition.objects.filter(name__iexact='Bench press').count(), 1)

    def test_a_case_variant_duplicate_is_answered_the_same_way(self):
        response = self.post({'name': 'bench press'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(str(response.data['existing']['id']), str(self.bench.pk))
        self.bench.refresh_from_db()
        # The stored spelling is not restyled by someone else's typing (N9).
        self.assertEqual(self.bench.name, 'Bench press')
        self.assertEqual(ExerciseDefinition.objects.count(), 1)

    def test_a_whitespace_variant_duplicate_is_answered_the_same_way(self):
        response = self.post({'name': 'Bench  press'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(str(response.data['existing']['id']), str(self.bench.pk))
        self.assertEqual(ExerciseDefinition.objects.count(), 1)

    def test_the_duplicate_message_quotes_the_stored_spelling(self):
        response = self.post({'name': 'bench   PRESS'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # First key, first message: what ApiError.detail shows on screen.
        self.assertEqual(list(response.data)[0], 'name')
        self.assertEqual(
            str(response.data['name'][0]),
            '"Bench press" is already in the catalogue.',
        )

    def test_a_race_is_answered_as_an_ordinary_duplicate(self):
        """The other request won between validate() and the INSERT."""
        # Standing in for the interleaving: the serializer's duplicate lookup sees
        # nothing, so the create runs into exercisedef_name_ci_unique itself.
        with mock.patch.object(
            ExerciseDefinitionSerializer, 'validate', lambda self, attrs: attrs
        ):
            response = self.post({'name': 'bench press'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(str(response.data['existing']['id']), str(self.bench.pk))
        self.assertEqual(ExerciseDefinition.objects.count(), 1)

    def test_a_created_entry_appears_in_the_list(self):
        self.post({'name': 'Front squat'})
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [exercise['name'] for exercise in response.data['results']],
            ['Bench press', 'Front squat'],
        )
