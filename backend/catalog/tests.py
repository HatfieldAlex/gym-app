from decimal import Decimal
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
        cls.bench = ExerciseDefinition.objects.create(
            name='Bench press', bar_kg=Decimal('20.00'), sides=2
        )

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
        """Adding is the only write: renaming and removing stay admin work (N2).

        The loading is under the same roof (AGREED 2): a PUT or PATCH carrying
        `bar_kg` or `sides` is 405 like any other, and never reaches the serializer.
        `loading/` is the only door, and it opens once -- see the class below.
        """
        self.client.force_login(self.user)
        url = reverse('api:exercise-detail', args=[self.squat.pk])
        for request in (
            lambda: self.client.put(url, {'name': 'Back squat'}),
            lambda: self.client.patch(url, {'name': 'Back squat'}),
            lambda: self.client.patch(url, {'bar_kg': '25.00', 'sides': 2}),
            lambda: self.client.patch(url, {'bar_kg': '25.00'}),
            lambda: self.client.put(url, {'name': 'Squat', 'bar_kg': '25.00', 'sides': 2}),
            lambda: self.client.delete(url),
        ):
            with self.subTest(request=request):
                self.assertEqual(
                    request().status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )
        self.squat.refresh_from_db()
        self.assertEqual(self.squat.name, 'Squat')
        self.assertIsNone(self.squat.bar_kg)
        self.assertIsNone(self.squat.sides)

    def test_the_list_carries_the_loading_of_every_entry(self):
        """Set or unset, every row says which it is -- null is an answer (AGREED 5)."""
        self.client.force_login(self.user)
        response = self.client.get(reverse('api:exercise-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        loading = {
            exercise['name']: (exercise['bar_kg'], exercise['sides'])
            for exercise in response.data['results']
        }
        self.assertEqual(loading, {
            'Bench press': ('20.00', 2),
            'Squat': (None, None),
        })

    def test_the_detail_carries_the_loading(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('api:exercise-detail', args=[self.bench.pk]))
        self.assertEqual(response.data['bar_kg'], '20.00')
        self.assertEqual(response.data['sides'], 2)


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

    def post_json(self, payload):
        """For bodies carrying an explicit null, which multipart cannot encode."""
        self.client.force_login(self.user)
        return self.client.post(self.url, payload, format='json')

    def test_anonymous_create_is_rejected(self):
        response = self.client.post(self.url, {'name': 'Front squat'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ExerciseDefinition.objects.filter(name='Front squat').exists())

    def test_signed_in_create_returns_the_entry(self):
        response = self.post({'name': 'Front squat'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(response.data), {'id', 'name', 'bar_kg', 'sides', 'created_at'})
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
        self.assertEqual(
            set(response.data['existing']),
            {'id', 'name', 'bar_kg', 'sides', 'created_at'},
        )
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

    def test_a_create_may_carry_the_loading(self):
        response = self.post({'name': 'Deadlift', 'bar_kg': '20', 'sides': 2})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['bar_kg'], '20.00')
        self.assertEqual(response.data['sides'], 2)
        created = ExerciseDefinition.objects.get(name='Deadlift')
        self.assertEqual(created.bar_kg, Decimal('20.00'))
        self.assertEqual(created.sides, 2)

    def test_a_create_may_omit_the_loading(self):
        """An unset row is legal (W7): the API is not stricter than the column.

        The add form is what makes sure a new entry is answered (chunk 06); requiring
        it here would 400 the admin's own workflow and every client that predates it.
        """
        response = self.post({'name': 'Seated calf raise'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['bar_kg'])
        self.assertIsNone(response.data['sides'])
        created = ExerciseDefinition.objects.get(name='Seated calf raise')
        self.assertIsNone(created.bar_kg)
        self.assertIsNone(created.sides)

    def test_an_explicit_pair_of_nulls_is_the_same_as_omitting_them(self):
        response = self.post_json({'name': 'Walking lunge', 'bar_kg': None, 'sides': None})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = ExerciseDefinition.objects.get(name='Walking lunge')
        self.assertIsNone(created.bar_kg)
        self.assertIsNone(created.sides)

    def test_half_a_loading_is_rejected_and_names_the_missing_half(self):
        """Both or neither (W1): a 400 that says which number is missing."""
        for payload, missing in (
            ({'name': 'Deadlift', 'bar_kg': '20'}, 'sides'),
            ({'name': 'Deadlift', 'sides': 2}, 'bar_kg'),
            ({'name': 'Deadlift', 'bar_kg': '20', 'sides': None}, 'sides'),
            ({'name': 'Deadlift', 'bar_kg': None, 'sides': 2}, 'bar_kg'),
        ):
            with self.subTest(payload=payload):
                response = self.post_json(payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(missing, response.data)
                self.assertEqual(
                    str(response.data[missing][0]),
                    'Say both the bar weight and the side count, or neither.',
                )
        self.assertFalse(ExerciseDefinition.objects.filter(name='Deadlift').exists())

    def test_a_side_count_outside_one_or_two_is_rejected(self):
        """1 for a stack or a sled, 2 for a barbell, and nothing else (W5)."""
        for sides in (3, 0, -1, 'two', ''):
            with self.subTest(sides=sides):
                response = self.post({'name': 'Deadlift', 'bar_kg': '20', 'sides': sides})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('sides', response.data)
        self.assertFalse(ExerciseDefinition.objects.filter(name='Deadlift').exists())

    def test_a_negative_bar_is_rejected(self):
        response = self.post({'name': 'Deadlift', 'bar_kg': '-1', 'sides': 2})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('bar_kg', response.data)
        self.assertFalse(ExerciseDefinition.objects.filter(name='Deadlift').exists())

    def test_a_bar_of_zero_is_fine(self):
        """`0 x 1` is a cable stack, and `0 x 2` a pair of dumbbells (AGREED 10)."""
        response = self.post({'name': 'Lat pulldown', 'bar_kg': '0', 'sides': 1})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = ExerciseDefinition.objects.get(name='Lat pulldown')
        self.assertEqual(created.bar_kg, Decimal('0.00'))
        self.assertEqual(created.sides, 1)


class ExerciseLoadingActionTests(APITestCase):
    """`POST /exercises/<id>/loading/` — the one-way door (W6, AGREED 5).

    Unknown -> known is allowed exactly once. Known -> different is refused, forever,
    because every past set of the movement is read back through these two numbers.
    """

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        cls.unset = ExerciseDefinition.objects.create(name='Seated calf raise')
        cls.deadlift = ExerciseDefinition.objects.create(
            name='Deadlift', bar_kg=Decimal('20.00'), sides=2
        )

    @staticmethod
    def url(exercise):
        # Built the way the existing tests build theirs.
        return reverse('api:exercise-detail', args=[exercise.pk]) + 'loading/'

    def post(self, exercise, payload):
        self.client.force_login(self.user)
        return self.client.post(self.url(exercise), payload, format='json')

    def test_answering_an_unset_movement_sets_it(self):
        response = self.post(self.unset, {'bar_kg': '25.00', 'sides': 2})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # The same shape a create returns, so the client can drop it into the
        # catalogue list it is holding.
        self.assertEqual(
            set(response.data),
            {'id', 'name', 'bar_kg', 'sides', 'created_at'},
        )
        self.assertEqual(response.data['name'], 'Seated calf raise')
        self.assertEqual(response.data['bar_kg'], '25.00')
        self.assertEqual(response.data['sides'], 2)
        self.unset.refresh_from_db()
        self.assertEqual(self.unset.bar_kg, Decimal('25.00'))
        self.assertEqual(self.unset.sides, 2)

    def test_a_zero_bar_and_one_side_is_an_answer_not_an_absence(self):
        """`0 / 1` is a set movement; only null is unset."""
        response = self.post(self.unset, {'bar_kg': '0', 'sides': 1})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.unset.refresh_from_db()
        self.assertEqual(self.unset.bar_kg, Decimal('0.00'))
        self.assertEqual(self.unset.sides, 1)
        # And, being an answer, it closes the door behind it.
        again = self.post(self.unset, {'bar_kg': '20', 'sides': 2})
        self.assertEqual(again.status_code, status.HTTP_409_CONFLICT)

    def test_answering_a_movement_that_is_already_set_is_refused(self):
        response = self.post(self.deadlift, {'bar_kg': '25.00', 'sides': 2})
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # detail is first, so ApiError.detail shows a sentence and not a UUID.
        self.assertEqual(list(response.data)[0], 'detail')
        self.assertEqual(
            response.data['detail'],
            '"Deadlift" is already set to 20 + 2×, '
            'and how a movement is loaded is never changed.',
        )
        # And the entry rides along so the client can carry on with the answer that
        # already exists rather than asking the user again.
        self.assertEqual(str(response.data['exercise']['id']), str(self.deadlift.pk))
        self.assertEqual(response.data['exercise']['bar_kg'], '20.00')
        self.assertEqual(response.data['exercise']['sides'], 2)
        # Nothing written. This is the whole point of the action.
        self.deadlift.refresh_from_db()
        self.assertEqual(self.deadlift.bar_kg, Decimal('20.00'))
        self.assertEqual(self.deadlift.sides, 2)

    def test_the_same_answer_twice_is_still_refused(self):
        """Idempotence is not the contract here; the door is shut, not agreeable."""
        response = self.post(self.deadlift, {'bar_kg': '20.00', 'sides': 2})
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_half_a_body_is_rejected(self):
        """This route exists to answer the question, so half an answer is a 400."""
        for payload in ({'bar_kg': '25.00'}, {'sides': 2}, {}):
            with self.subTest(payload=payload):
                response = self.post(self.unset, payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.unset.refresh_from_db()
        self.assertIsNone(self.unset.bar_kg)
        self.assertIsNone(self.unset.sides)

    def test_a_nonsense_body_is_rejected(self):
        for payload in (
            {'bar_kg': '25.00', 'sides': 3},
            {'bar_kg': '25.00', 'sides': 0},
            {'bar_kg': '25.00', 'sides': 'two'},
            {'bar_kg': '-1', 'sides': 2},
            {'bar_kg': 'heavy', 'sides': 2},
            {'bar_kg': None, 'sides': None},
        ):
            with self.subTest(payload=payload):
                response = self.post(self.unset, payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.unset.refresh_from_db()
        self.assertIsNone(self.unset.bar_kg)
        self.assertIsNone(self.unset.sides)

    def test_a_name_in_the_body_renames_nothing(self):
        """The route sets the loading and nothing else."""
        response = self.post(
            self.unset, {'name': 'Something else', 'bar_kg': '0', 'sides': 1}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.unset.refresh_from_db()
        self.assertEqual(self.unset.name, 'Seated calf raise')

    def test_anonymous_is_rejected_and_writes_nothing(self):
        response = self.client.post(
            self.url(self.unset), {'bar_kg': '25.00', 'sides': 2}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.unset.refresh_from_db()
        self.assertIsNone(self.unset.bar_kg)
        self.assertIsNone(self.unset.sides)

    def test_the_route_takes_post_only(self):
        """No second door: GET, PUT, PATCH and DELETE are not this action's methods."""
        self.client.force_login(self.user)
        url = self.url(self.deadlift)
        for request in (
            lambda: self.client.get(url),
            lambda: self.client.put(url, {'bar_kg': '25.00', 'sides': 2}),
            lambda: self.client.patch(url, {'bar_kg': '25.00', 'sides': 2}),
            lambda: self.client.delete(url),
        ):
            with self.subTest(request=request):
                self.assertEqual(
                    request().status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )
        self.deadlift.refresh_from_db()
        self.assertEqual(self.deadlift.bar_kg, Decimal('20.00'))
