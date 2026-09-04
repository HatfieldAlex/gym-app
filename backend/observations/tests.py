import uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import ExerciseDefinition

from .models import PerformedExercise, PerformedSet, TrainingSession
from .views import CORRECTION_HEADER


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
        cls.squat = ExerciseDefinition.objects.create(name='Squat')

    def setUp(self):
        self.client.force_login(self.user)

    def start(self, **body):
        return self.client.post(
            reverse('api:trainingsession-list'), body, format='json'
        )

    def open_exercise(self, session_id, with_set=False):
        """A block in progress in that session, built through the ORM."""
        performed = PerformedExercise.objects.create(
            training_session_id=session_id, exercise_definition=self.squat
        )
        if with_set:
            PerformedSet.objects.create(performed_exercise=performed, reps=5)
        return performed

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

    def test_a_session_cannot_end_over_an_open_exercise(self):
        """Close the block, then the session; the other order is refused (E4)."""
        session_id = self.start().data['id']
        performed = self.open_exercise(session_id, with_set=True)
        end_url = reverse('api:trainingsession-end', args=[session_id])

        response = self.client.post(end_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # The client can recover by loading the block it had lost track of.
        self.assertEqual(response.data['open_exercise'], str(performed.pk))
        self.assertIsNone(TrainingSession.objects.get(pk=session_id).ended_at)

        # The same two acts the other way round.
        self.client.post(reverse('api:performedexercise-end', args=[performed.pk]))
        response = self.client.post(end_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data['ended_at'])

    def test_discarding_a_session_is_not_guarded_by_an_open_exercise(self):
        """Throwing the workout away is a different act from closing it: the
        cascade takes the open block with it, so nothing is left unclosable."""
        session_id = self.start().data['id']
        performed = self.open_exercise(session_id)

        response = self.client.delete(
            reverse('api:trainingsession-detail', args=[session_id])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PerformedExercise.objects.filter(pk=performed.pk).exists())

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


class PerformedExerciseLifecycleTests(APITestCase):
    """Opening an exercise, closing it, and what closing an empty one costs."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.session = TrainingSession.objects.create(user=cls.user, type='legs')
        cls.other_performed = PerformedExercise.objects.create(
            training_session=TrainingSession.objects.create(user=cls.other, type='push'),
            exercise_definition=cls.squat,
        )

    def setUp(self):
        self.client.force_login(self.user)

    def open_exercise(self, with_set=False):
        performed = PerformedExercise.objects.create(
            training_session=self.session, exercise_definition=self.squat
        )
        if with_set:
            PerformedSet.objects.create(performed_exercise=performed, reps=5)
        return performed

    def create(self, session=None):
        """Open one the way the app does: a POST that picks a movement (E2)."""
        return self.client.post(
            reverse('api:performedexercise-list'),
            {
                'training_session': str((session or self.session).pk),
                'exercise_definition': str(self.squat.pk),
            },
            format='json',
        )

    def test_anonymous_request_is_rejected(self):
        self.client.logout()
        performed = self.open_exercise(with_set=True)
        response = self.client.post(
            reverse('api:performedexercise-end', args=[performed.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_another_users_exercise_cannot_be_ended(self):
        response = self.client.post(
            reverse('api:performedexercise-end', args=[self.other_performed.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_performed.refresh_from_db()
        self.assertIsNone(self.other_performed.ended_at)

    def test_creating_an_exercise_opens_it(self):
        response = self.create()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['ended_at'])

    def test_only_one_exercise_may_be_open_at_a_time(self):
        first = self.create()
        response = self.create()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # The client can recover by loading the block it had lost track of.
        self.assertEqual(response.data['open_exercise'], first.data['id'])
        self.assertEqual(
            PerformedExercise.objects.filter(training_session=self.session).count(), 1
        )

    def test_closing_the_open_one_lets_the_next_one_start(self):
        first = self.create()
        PerformedSet.objects.create(
            performed_exercise=PerformedExercise.objects.get(pk=first.data['id']), reps=5
        )
        self.client.post(reverse('api:performedexercise-end', args=[first.data['id']]))

        second = self.create()
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        # E7: the same movement twice in one session is two blocks, not a reopening.
        self.assertEqual(
            PerformedExercise.objects.filter(training_session=self.session).count(), 2
        )

    def test_a_closed_exercise_does_not_block_a_new_one(self):
        """Including one closed outside the API — every row the migration
        backfilled is closed, and none of them may stand in a new block's way."""
        closed = self.open_exercise(with_set=True)
        closed.ended_at = timezone.now()
        closed.save(update_fields=['ended_at'])
        self.assertEqual(self.create().status_code, status.HTTP_201_CREATED)

    def test_another_users_session_is_refused_for_ownership_not_for_this_rule(self):
        """The stranger's session has an open block of its own, and the refusal
        must still be the ownership one: answering with `open_exercise` here
        would hand out the id of a row this user cannot see."""
        response = self.create(session=self.other_performed.training_session)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('open_exercise', response.data)
        self.assertIn('training_session', response.data)

    def test_ending_an_exercise_with_sets_closes_it_once(self):
        performed = self.open_exercise(with_set=True)
        end_url = reverse('api:performedexercise-end', args=[performed.pk])

        response = self.client.post(end_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data['ended_at'])

        performed.refresh_from_db()
        self.assertIsNotNone(performed.ended_at)
        self.assertEqual(performed.performed_sets.count(), 1)

        # A second call must not move the timestamp.
        ended_at = performed.ended_at
        response = self.client.post(end_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        performed.refresh_from_db()
        self.assertEqual(performed.ended_at, ended_at)

    def test_ending_an_exercise_with_no_sets_deletes_it(self):
        """Picking the wrong movement costs nothing (E5)."""
        performed = self.open_exercise()
        response = self.client.post(
            reverse('api:performedexercise-end', args=[performed.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.content, b'')
        self.assertFalse(PerformedExercise.objects.filter(pk=performed.pk).exists())

    def test_patch_cannot_close_an_exercise(self):
        """Only end/ stamps a timestamp the client did not choose."""
        performed = self.open_exercise(with_set=True)
        response = self.client.patch(
            reverse('api:performedexercise-detail', args=[performed.pk]),
            {'ended_at': timezone.now().isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        performed.refresh_from_db()
        self.assertIsNone(performed.ended_at)

    def test_the_open_state_rides_along_wherever_an_exercise_is_read(self):
        performed = self.open_exercise(with_set=True)

        current = self.client.get(reverse('api:trainingsession-current'))
        self.assertIsNone(current.data['performed_exercises'][0]['ended_at'])

        detail = self.client.get(
            reverse('api:trainingsession-detail', args=[self.session.pk])
        )
        self.assertIsNone(detail.data['performed_exercises'][0]['ended_at'])

        self.client.post(reverse('api:performedexercise-end', args=[performed.pk]))
        history = self.client.get(
            reverse('api:performedexercise-history'),
            {'exercise_definition': str(self.squat.pk)},
        )
        self.assertIsNotNone(history.data[0]['ended_at'])

    def test_an_exercise_cannot_end_before_it_began(self):
        """The session's guard at the exercise's scale, enforced by the database."""
        performed = self.open_exercise()
        performed.ended_at = performed.created_at - timedelta(hours=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            performed.save(update_fields=['ended_at'])


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


class ClosedIsFinalTests(APITestCase):
    """A row is writable only while its exercise and its session are open (E6).

    The fixtures are built closed on purpose rather than by closing the ones
    above: `PerformedSetAPITests` is the other half of this rule -- open
    exercises in open sessions, still correctable -- and it has to keep passing
    exactly as it is.
    """

    @staticmethod
    def close(performed_exercise):
        """Stamp `ended_at` the way end/ does, after the row's own created_at."""
        performed_exercise.ended_at = timezone.now()
        performed_exercise.save(update_fields=['ended_at'])
        return performed_exercise

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')

        # A finished workout: the session closed over an exercise closed first,
        # which is the only order E4 allows.
        cls.closed_session = TrainingSession.objects.create(
            user=cls.user,
            type='legs',
            started_at=timezone.now() - timedelta(hours=1),
            ended_at=timezone.now(),
        )
        cls.closed = cls.close(
            PerformedExercise.objects.create(
                training_session=cls.closed_session, exercise_definition=cls.squat
            )
        )
        cls.closed_set = PerformedSet.objects.create(
            performed_exercise=cls.closed, weight_kg='100.00', reps=5
        )

        # Open inside a closed session: nothing this app does can make one (E4),
        # but a row from before this iteration or a hand in the admin can.
        cls.stranded = PerformedExercise.objects.create(
            training_session=cls.closed_session, exercise_definition=cls.squat
        )
        cls.stranded_set = PerformedSet.objects.create(
            performed_exercise=cls.stranded, reps=5
        )

        cls.other_closed = cls.close(
            PerformedExercise.objects.create(
                training_session=TrainingSession.objects.create(
                    user=cls.other,
                    type='push',
                    started_at=timezone.now() - timedelta(hours=1),
                    ended_at=timezone.now(),
                ),
                exercise_definition=cls.squat,
            )
        )
        cls.other_closed_set = PerformedSet.objects.create(
            performed_exercise=cls.other_closed, reps=5
        )

    def setUp(self):
        self.client.force_login(self.user)

    def post_set(self, performed_exercise):
        return self.client.post(
            reverse('api:performedset-list'),
            {'performed_exercise': str(performed_exercise.pk), 'reps': 3},
            format='json',
        )

    def test_a_set_cannot_be_logged_into_a_closed_exercise(self):
        before = PerformedSet.objects.count()
        response = self.post_set(self.closed)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('logged', str(response.data['performed_exercise'][0]))
        self.assertEqual(PerformedSet.objects.count(), before)

    def test_a_set_cannot_be_logged_into_an_open_exercise_in_a_closed_session(self):
        before = PerformedSet.objects.count()
        response = self.post_set(self.stranded)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('session', str(response.data['performed_exercise'][0]))
        self.assertEqual(PerformedSet.objects.count(), before)

    def test_a_set_of_a_closed_exercise_cannot_be_corrected(self):
        detail = reverse('api:performedset-detail', args=[self.closed_set.pk])
        response = self.client.patch(detail, {'reps': 99}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'], 'That exercise has been logged and cannot be changed.'
        )
        self.closed_set.refresh_from_db()
        self.assertEqual(self.closed_set.reps, 5)

    def test_a_set_of_a_closed_exercise_cannot_be_deleted(self):
        detail = reverse('api:performedset-detail', args=[self.closed_set.pk])
        response = self.client.delete(detail)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(PerformedSet.objects.filter(pk=self.closed_set.pk).exists())

    def test_a_set_in_a_closed_session_is_locked_by_the_session(self):
        detail = reverse('api:performedset-detail', args=[self.stranded_set.pk])
        response = self.client.patch(detail, {'reps': 99}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'], 'That session has ended and cannot be changed.'
        )
        self.assertEqual(
            self.client.delete(detail).status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertTrue(PerformedSet.objects.filter(pk=self.stranded_set.pk).exists())

    def test_a_closed_exercise_cannot_be_edited_or_deleted(self):
        detail = reverse('api:performedexercise-detail', args=[self.closed.pk])
        response = self.client.patch(
            detail, {'exercise_definition': str(self.squat.pk)}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'], 'That exercise has been logged and cannot be changed.'
        )
        self.assertEqual(
            self.client.delete(detail).status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertTrue(PerformedExercise.objects.filter(pk=self.closed.pk).exists())

    def test_an_exercise_cannot_be_opened_in_a_closed_session(self):
        response = self.client.post(
            reverse('api:performedexercise-list'),
            {
                'training_session': str(self.closed_session.pk),
                'exercise_definition': str(self.squat.pk),
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('session', str(response.data['training_session'][0]))

    def test_another_users_closed_rows_are_still_404(self):
        """Ownership is answered before state is: 404, never 'it is finished'."""
        exercise = reverse('api:performedexercise-detail', args=[self.other_closed.pk])
        logged = reverse('api:performedset-detail', args=[self.other_closed_set.pk])
        for detail in (exercise, logged):
            self.assertEqual(
                self.client.patch(detail, {'reps': 1}, format='json').status_code,
                status.HTTP_404_NOT_FOUND,
            )
            self.assertEqual(self.client.delete(detail).status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(PerformedExercise.objects.filter(pk=self.other_closed.pk).exists())
        self.assertTrue(PerformedSet.objects.filter(pk=self.other_closed_set.pk).exists())

    def test_reads_of_closed_rows_are_untouched(self):
        """Only writing is locked: the log still reads back in full."""
        response = self.client.get(
            reverse('api:trainingsession-detail', args=[self.closed_session.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [len(p['performed_sets']) for p in response.data['performed_exercises']], [1, 1]
        )


# Passed as `headers=CORRECTING` to the client call, so every test below is one
# line and there is one place the header is spelled.
CORRECTING = {CORRECTION_HEADER: '1'}


class CorrectionOverrideTests(APITestCase):
    """One header lets a deliberate correction through to a finished row (C3).

    `X-Edit-Closed-Record: 1` unlocks `PATCH`/`PUT` on a closed row and nothing
    else: no delete of a finished anything, and no new row created inside one.
    The fixtures are built closed here rather than borrowed from
    `ClosedIsFinalTests`, which is the other half of the story -- the refusal
    without the header -- and has to keep passing exactly as it is.
    """

    @staticmethod
    def close(performed_exercise):
        """Stamp `ended_at` the way end/ does, after the row's own created_at."""
        performed_exercise.ended_at = timezone.now()
        performed_exercise.save(update_fields=['ended_at'])
        return performed_exercise

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.bench = ExerciseDefinition.objects.create(name='Bench press')

        # A finished workout, closed in the only order E4 allows.
        cls.closed_session = TrainingSession.objects.create(
            user=cls.user,
            type='legs',
            started_at=timezone.now() - timedelta(hours=1),
            ended_at=timezone.now(),
        )
        cls.closed = cls.close(
            PerformedExercise.objects.create(
                training_session=cls.closed_session, exercise_definition=cls.squat
            )
        )
        cls.closed_set = PerformedSet.objects.create(
            performed_exercise=cls.closed, weight_kg='100.00', reps=5
        )

        # Open inside a closed session: only the session half of the rule locks it.
        cls.stranded = PerformedExercise.objects.create(
            training_session=cls.closed_session, exercise_definition=cls.squat
        )
        cls.stranded_set = PerformedSet.objects.create(
            performed_exercise=cls.stranded, reps=5
        )

        # A workout still being recorded: nothing here needs the header at all.
        cls.open_session = TrainingSession.objects.create(user=cls.user, type='push')
        cls.open_exercise = PerformedExercise.objects.create(
            training_session=cls.open_session, exercise_definition=cls.squat
        )
        cls.open_set = PerformedSet.objects.create(
            performed_exercise=cls.open_exercise, reps=5
        )

        cls.other_closed_session = TrainingSession.objects.create(
            user=cls.other,
            type='push',
            started_at=timezone.now() - timedelta(hours=1),
            ended_at=timezone.now(),
        )
        cls.other_closed = cls.close(
            PerformedExercise.objects.create(
                training_session=cls.other_closed_session,
                exercise_definition=cls.squat,
            )
        )
        cls.other_closed_set = PerformedSet.objects.create(
            performed_exercise=cls.other_closed, reps=5
        )

    def setUp(self):
        self.client.force_login(self.user)

    def set_detail(self, performed_set):
        return reverse('api:performedset-detail', args=[performed_set.pk])

    def exercise_detail(self, performed_exercise):
        return reverse('api:performedexercise-detail', args=[performed_exercise.pk])

    def session_detail(self, session):
        return reverse('api:trainingsession-detail', args=[session.pk])

    def test_the_header_is_the_one_agreed_name(self):
        """Written out once so the client and the tests cannot drift apart."""
        self.assertEqual(CORRECTION_HEADER, 'X-Edit-Closed-Record')

    def test_a_set_of_a_closed_exercise_can_be_corrected_with_the_header(self):
        response = self.client.patch(
            self.set_detail(self.closed_set), {'reps': 8}, format='json', headers=CORRECTING
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.closed_set.refresh_from_db()
        self.assertEqual(self.closed_set.reps, 8)

    def test_only_the_exact_value_one_unlocks_a_correction(self):
        """Nothing a proxy could normalise into a yes counts as one."""
        detail = self.set_detail(self.closed_set)
        for value in ('0', 'true', 'yes', 'on', ''):
            with self.subTest(value=value):
                response = self.client.patch(
                    detail,
                    {'reps': 99},
                    format='json',
                    headers={CORRECTION_HEADER: value},
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.closed_set.refresh_from_db()
                self.assertEqual(self.closed_set.reps, 5)

        # A header spelled differently is simply a header nobody reads.
        response = self.client.patch(
            detail, {'reps': 99}, format='json', headers={'X-Edit-Closed': '1'}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.closed_set.refresh_from_db()
        self.assertEqual(self.closed_set.reps, 5)

    def test_without_the_header_a_closed_set_is_refused_as_before(self):
        response = self.client.patch(
            self.set_detail(self.closed_set), {'reps': 99}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'], 'That exercise has been logged and cannot be changed.'
        )
        self.closed_set.refresh_from_db()
        self.assertEqual(self.closed_set.reps, 5)

    def test_the_header_does_not_unlock_deleting_a_closed_set(self):
        response = self.client.delete(self.set_detail(self.closed_set), headers=CORRECTING)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(PerformedSet.objects.filter(pk=self.closed_set.pk).exists())

    def test_the_header_does_not_unlock_deleting_a_closed_exercise(self):
        response = self.client.delete(self.exercise_detail(self.closed), headers=CORRECTING)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(PerformedExercise.objects.filter(pk=self.closed.pk).exists())

    def test_a_closed_blocks_movement_can_be_corrected_with_the_header(self):
        """The whole point of the iteration: the block pointed at the wrong lift."""
        response = self.client.patch(
            self.exercise_detail(self.closed),
            {'exercise_definition': str(self.bench.pk)},
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.closed.refresh_from_db()
        self.assertEqual(self.closed.exercise_definition_id, self.bench.pk)

    def test_the_header_does_not_make_an_exercises_ended_at_settable(self):
        """It is read-only in the serializer; the header says nothing about that."""
        was = self.closed.ended_at
        response = self.client.patch(
            self.exercise_detail(self.closed),
            {'ended_at': (timezone.now() + timedelta(hours=2)).isoformat()},
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.closed.refresh_from_db()
        self.assertEqual(self.closed.ended_at, was)

    def test_the_header_does_not_unlock_logging_a_set_into_a_closed_exercise(self):
        before = PerformedSet.objects.count()
        response = self.client.post(
            reverse('api:performedset-list'),
            {'performed_exercise': str(self.closed.pk), 'reps': 3},
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PerformedSet.objects.count(), before)

    def test_the_header_does_not_unlock_opening_a_block_in_a_closed_session(self):
        before = PerformedExercise.objects.count()
        response = self.client.post(
            reverse('api:performedexercise-list'),
            {
                'training_session': str(self.closed_session.pk),
                'exercise_definition': str(self.squat.pk),
            },
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PerformedExercise.objects.count(), before)

    def test_the_override_clears_the_session_half_of_the_rule_too(self):
        """An open block in a closed session is locked by the session; this frees it."""
        response = self.client.patch(
            self.set_detail(self.stranded_set),
            {'reps': 8},
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.stranded_set.refresh_from_db()
        self.assertEqual(self.stranded_set.reps, 8)

    def test_another_users_closed_rows_are_still_404_with_the_header(self):
        """Ownership is answered before the header is ever read."""
        for detail in (
            self.exercise_detail(self.other_closed),
            self.set_detail(self.other_closed_set),
        ):
            self.assertEqual(
                self.client.patch(
                    detail, {'reps': 1}, format='json', headers=CORRECTING
                ).status_code,
                status.HTTP_404_NOT_FOUND,
            )
        self.assertTrue(PerformedExercise.objects.filter(pk=self.other_closed.pk).exists())
        self.assertTrue(PerformedSet.objects.filter(pk=self.other_closed_set.pk).exists())

    def test_an_anonymous_request_with_the_header_is_still_403(self):
        self.client.logout()
        response = self.client.patch(
            self.set_detail(self.closed_set), {'reps': 99}, format='json', headers=CORRECTING
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.closed_set.refresh_from_db()
        self.assertEqual(self.closed_set.reps, 5)

    def test_the_header_is_never_required_on_an_open_row(self):
        detail = self.set_detail(self.open_set)
        self.assertEqual(
            self.client.patch(detail, {'reps': 6}, format='json').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.patch(
                detail, {'reps': 7}, format='json', headers=CORRECTING
            ).status_code,
            status.HTTP_200_OK,
        )
        self.open_set.refresh_from_db()
        self.assertEqual(self.open_set.reps, 7)

    def test_a_closed_session_can_be_corrected_with_the_header(self):
        was_ended_at = self.closed_session.ended_at
        started_at = was_ended_at - timedelta(minutes=30)
        response = self.client.patch(
            self.session_detail(self.closed_session),
            {'type': 'push', 'started_at': started_at.isoformat()},
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.closed_session.refresh_from_db()
        self.assertEqual(self.closed_session.type, 'push')
        self.assertEqual(self.closed_session.started_at, started_at)
        self.assertEqual(self.closed_session.ended_at, was_ended_at)

    def test_a_closed_session_without_the_header_is_refused(self):
        """The hole this chunk closes: this was a 200 that rewrote the row."""
        response = self.client.patch(
            self.session_detail(self.closed_session), {'type': 'push'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'], 'That session has ended and cannot be changed.'
        )
        self.closed_session.refresh_from_db()
        self.assertEqual(self.closed_session.type, 'legs')

    def test_a_closed_session_cannot_be_deleted_with_or_without_the_header(self):
        """It was a 204 that cascaded every block and every set inside it."""
        detail = self.session_detail(self.closed_session)
        self.assertEqual(
            self.client.delete(detail).status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertEqual(
            self.client.delete(detail, headers=CORRECTING).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertTrue(TrainingSession.objects.filter(pk=self.closed_session.pk).exists())
        self.assertTrue(PerformedExercise.objects.filter(pk=self.closed.pk).exists())
        self.assertTrue(PerformedSet.objects.filter(pk=self.closed_set.pk).exists())

    def test_an_open_session_is_still_discarded_in_one_tap(self):
        response = self.client.delete(self.session_detail(self.open_session))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PerformedExercise.objects.filter(pk=self.open_exercise.pk).exists())

    def test_a_closed_sessions_start_cannot_move_past_its_own_end(self):
        """The serializer's own validate already covers this new path."""
        response = self.client.patch(
            self.session_detail(self.closed_session),
            {'started_at': (self.closed_session.ended_at + timedelta(hours=1)).isoformat()},
            format='json',
            headers=CORRECTING,
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ended_at', response.data)
        was = self.closed_session.started_at
        self.closed_session.refresh_from_db()
        self.assertEqual(self.closed_session.started_at, was)

    def test_ending_a_session_did_not_walk_into_the_new_guard(self):
        """`end/` uses get_object() and never goes through perform_update."""
        response = self.client.post(
            reverse('api:trainingsession-end', args=[self.open_session.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['open_exercise'], str(self.open_exercise.pk))
        self.assertIsNone(TrainingSession.objects.get(pk=self.open_session.pk).ended_at)


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


class PerformedExerciseRecentTests(APITestCase):
    """`recent/` — the last thirty blocks this user actually logged.

    History answers "when did I last do *this movement*"; recent answers "what
    have I logged lately", whatever the movement was. It is the list the
    correction screen is built on, so each row has to arrive complete.
    """

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

        cls.squat = ExerciseDefinition.objects.create(name='Squat')
        cls.bench = ExerciseDefinition.objects.create(name='Bench press')

        cls.url = reverse('api:performedexercise-recent')

    # The rows are built per test rather than here, so that "nobody has
    # trained" can be an honest empty database.

    @staticmethod
    def workout(user, days_ago, type='mixed', ended=True):
        """One session on a given day, finished unless asked otherwise."""
        trained_at = timezone.now() - timedelta(days=days_ago)
        return TrainingSession.objects.create(
            user=user,
            type=type,
            started_at=trained_at,
            ended_at=trained_at + timedelta(hours=1) if ended else None,
        )

    @staticmethod
    def log(session, exercise, ended=True):
        """A block in that session, stamped closed the way end/ closes one.

        Closed in a second save, not at create: `ended_at` may not precede the
        row's own `created_at` (perfex_ended_after_created).
        """
        performed = PerformedExercise.objects.create(
            training_session=session, exercise_definition=exercise
        )
        if ended:
            performed.ended_at = timezone.now()
            performed.save(update_fields=['ended_at'])
        return performed

    def train(self, user, exercise, days_ago, **session_kwargs):
        """A whole one-block workout, the common case in one line."""
        return self.log(self.workout(user, days_ago, **session_kwargs), exercise)

    def recent(self):
        return self.client.get(self.url)

    def test_anonymous_request_is_rejected(self):
        response = self.recent()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_newest_first_by_when_it_was_trained_then_by_performed_order(self):
        """Sessions newest first; inside one, the last block done comes first."""
        # Written oldest-session first, so created_at cannot be doing the work
        # across sessions.
        older = self.workout(self.user, days_ago=8)
        first_that_day = self.log(older, self.squat)
        newer = self.workout(self.user, days_ago=1)
        opener = self.log(newer, self.squat)
        closer = self.log(newer, self.bench)
        self.assertLess(first_that_day.created_at, opener.created_at)

        self.client.force_login(self.user)
        response = self.recent()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [e['id'] for e in response.data],
            [str(closer.pk), str(opener.pk), str(first_that_day.pk)],
        )

    def test_thirty_is_the_whole_answer(self):
        """Thirty-five logged blocks, thirty rows, and no way to ask for more."""
        # days_ago 1 is the newest, 35 the oldest.
        blocks = {
            days_ago: self.train(self.user, self.squat, days_ago=days_ago)
            for days_ago in range(1, 36)
        }

        self.client.force_login(self.user)
        response = self.recent()
        ids = [e['id'] for e in response.data]
        self.assertEqual(len(ids), 30)
        self.assertEqual(ids, [str(blocks[days_ago].pk) for days_ago in range(1, 31)])
        # The thirty-first newest falls off the end, and stays off it.
        self.assertNotIn(str(blocks[31].pk), ids)

    def test_another_users_training_is_invisible_whatever_its_date(self):
        for days_ago in (0, 400):
            self.train(self.other, self.squat, days_ago=days_ago)
        mine = self.train(self.user, self.squat, days_ago=7)

        self.client.force_login(self.user)
        response = self.recent()
        self.assertEqual([e['id'] for e in response.data], [str(mine.pk)])

    def test_an_open_block_is_not_listed(self):
        """The block being recorded right now is not something to correct (C6)."""
        logged = self.train(self.user, self.squat, days_ago=3)
        being_recorded = self.log(
            self.workout(self.user, days_ago=0, ended=False), self.bench, ended=False
        )

        self.client.force_login(self.user)
        ids = [e['id'] for e in self.recent().data]
        self.assertEqual(ids, [str(logged.pk)])
        self.assertNotIn(str(being_recorded.pk), ids)

    def test_a_closed_block_beside_an_open_one_is_still_listed(self):
        """The filter is on the block, not on its session."""
        running = self.workout(self.user, days_ago=0, ended=False)
        done = self.log(running, self.squat)
        being_recorded = self.log(running, self.bench, ended=False)

        self.client.force_login(self.user)
        ids = [e['id'] for e in self.recent().data]
        self.assertEqual(ids, [str(done.pk)])
        self.assertNotIn(str(being_recorded.pk), ids)

    def test_sets_come_back_nested_in_performed_order(self):
        performed = self.train(self.user, self.squat, days_ago=1)
        PerformedSet.objects.create(
            performed_exercise=performed,
            weight_kg='60.00',
            reps=8,
            distance_m='0.00',
            duration_s=45,
            rpe='7.5',
        )
        PerformedSet.objects.create(performed_exercise=performed, weight_kg='70.00', reps=5)

        self.client.force_login(self.user)
        sets = self.recent().data[0]['performed_sets']
        self.assertEqual([s['weight_kg'] for s in sets], ['60.00', '70.00'])
        # Every measure the editor can rewrite arrives with the row.
        self.assertEqual(
            {key: sets[0][key] for key in
             ('weight_kg', 'reps', 'distance_m', 'duration_s', 'rpe')},
            {
                'weight_kg': '60.00',
                'reps': 8,
                'distance_m': '0.00',
                'duration_s': 45,
                'rpe': '7.5',
            },
        )

    def test_every_row_carries_its_session(self):
        """Its id, its date and its type — enough to head the row and edit it."""
        performed = self.train(self.user, self.squat, days_ago=1, type='legs')

        self.client.force_login(self.user)
        row = self.recent().data[0]
        # A relation renders as its UUID in `response.data`; JSON stringifies
        # it downstream.
        self.assertEqual(row['training_session'], performed.training_session_id)
        self.assertEqual(
            parse_datetime(row['training_session_started_at']),
            performed.training_session.started_at,
        )
        self.assertEqual(row['training_session_type'], 'legs')

    def test_every_row_carries_its_movement(self):
        performed = self.train(self.user, self.squat, days_ago=1)

        self.client.force_login(self.user)
        row = self.recent().data[0]
        self.assertEqual(row['exercise_definition'], self.squat.pk)
        self.assertEqual(row['exercise_name'], 'Squat')

    def test_the_answer_is_a_bare_array_not_a_page(self):
        self.train(self.user, self.squat, days_ago=1)

        self.client.force_login(self.user)
        response = self.recent()
        self.assertIsInstance(response.data, list)
        for key in ('results', 'count', 'next'):
            self.assertNotIn(key, response.data)

    def test_having_logged_nothing_is_an_empty_list(self):
        """Never having trained is an answer, not a missing resource."""
        self.client.force_login(self.user)
        response = self.recent()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_the_query_count_does_not_grow_with_the_rows(self):
        """select_related + a prefetch, so thirty blocks are not thirty queries."""
        def log_workouts(days):
            for days_ago in days:
                performed = self.train(self.user, self.squat, days_ago=days_ago)
                PerformedSet.objects.create(performed_exercise=performed, reps=5)

        self.client.force_login(self.user)
        log_workouts(range(1, 6))
        with CaptureQueriesContext(connection) as five_rows:
            self.assertEqual(len(self.recent().data), 5)
        log_workouts(range(6, 31))
        with CaptureQueriesContext(connection) as thirty_rows:
            self.assertEqual(len(self.recent().data), 30)
        self.assertEqual(len(thirty_rows), len(five_rows))

    def test_the_action_is_read_only(self):
        performed = self.train(self.user, self.squat, days_ago=1)
        was = (PerformedExercise.objects.count(), TrainingSession.objects.count())

        self.client.force_login(self.user)
        for method, kwargs in (
            (self.client.post, {'data': {'exercise_definition': str(self.bench.pk)}}),
            (self.client.patch, {'data': {'exercise_definition': str(self.bench.pk)}}),
            (self.client.delete, {}),
        ):
            with self.subTest(method=method.__name__):
                response = method(self.url, format='json', **kwargs)
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )
        self.assertEqual(
            (PerformedExercise.objects.count(), TrainingSession.objects.count()), was
        )
        performed.refresh_from_db()
        self.assertEqual(performed.exercise_definition_id, self.squat.pk)


class PerformedExerciseLoadingTests(APITestCase):
    """Every performed exercise carries its movement's loading, on every route.

    The session detail page loads only `training-sessions/<id>/` and has no catalogue
    in hand, so the two numbers ride along beside `exercise_name` for the reason that
    field's own docstring gives. Being on the base serializer, one addition reaches the
    plain list, the session detail and the zone's history at once.

    Nothing is computed: `weight_kg` is the total, as it always was, and the per-side
    arithmetic is the frontend's (W2, AGREED 3).
    """

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')

        cls.deadlift = ExerciseDefinition.objects.create(
            name='Deadlift', bar_kg=Decimal('20.00'), sides=2
        )
        cls.pulldown = ExerciseDefinition.objects.create(
            name='Lat pulldown', bar_kg=Decimal('0.00'), sides=1
        )
        # Never answered: the case the whole display falls back to plain totals on.
        cls.calf_raise = ExerciseDefinition.objects.create(name='Seated calf raise')

        trained_at = timezone.now() - timedelta(days=1)
        cls.session = TrainingSession.objects.create(
            user=cls.user,
            type='legs',
            started_at=trained_at,
            ended_at=trained_at + timedelta(hours=1),
        )
        cls.performed_deadlift = PerformedExercise.objects.create(
            training_session=cls.session, exercise_definition=cls.deadlift
        )
        cls.performed_pulldown = PerformedExercise.objects.create(
            training_session=cls.session, exercise_definition=cls.pulldown
        )
        cls.performed_calf_raise = PerformedExercise.objects.create(
            training_session=cls.session, exercise_definition=cls.calf_raise
        )
        PerformedSet.objects.create(
            performed_exercise=cls.performed_deadlift, weight_kg=Decimal('140.00'), reps=8
        )

    def setUp(self):
        self.client.force_login(self.user)

    @staticmethod
    def loading_of(performed_exercises):
        return {
            performed['exercise_name']: (
                performed['exercise_bar_kg'],
                performed['exercise_sides'],
            )
            for performed in performed_exercises
        }

    EXPECTED = {
        'Deadlift': ('20.00', 2),
        'Lat pulldown': ('0.00', 1),
        # Unset stays unset, and rendering it raises nothing.
        'Seated calf raise': (None, None),
    }

    def test_the_plain_list_carries_the_loading(self):
        response = self.client.get(reverse('api:performedexercise-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.loading_of(response.data['results']), self.EXPECTED)

    def test_the_session_detail_carries_it_on_every_nested_exercise(self):
        response = self.client.get(
            reverse('api:trainingsession-detail', args=[self.session.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.loading_of(response.data['performed_exercises']), self.EXPECTED
        )

    def test_the_history_endpoint_carries_it_too(self):
        response = self.client.get(
            reverse('api:performedexercise-history'),
            {'exercise_definition': str(self.deadlift.pk)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['exercise_bar_kg'], '20.00')
        self.assertEqual(response.data[0]['exercise_sides'], 2)

    def test_an_unanswered_movement_is_null_on_the_history_endpoint(self):
        response = self.client.get(
            reverse('api:performedexercise-history'),
            {'exercise_definition': str(self.calf_raise.pk)},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data[0]['exercise_bar_kg'])
        self.assertIsNone(response.data[0]['exercise_sides'])

    def test_the_set_itself_is_untouched(self):
        """`weight_kg` is the total and nothing beside it is stored or sent (AGREED 3)."""
        response = self.client.get(
            reverse('api:trainingsession-detail', args=[self.session.pk])
        )
        performed = response.data['performed_exercises'][0]
        [logged] = performed['performed_sets']
        self.assertEqual(logged['weight_kg'], '140.00')
        self.assertEqual(
            set(logged),
            {
                'id',
                'performed_exercise',
                'weight_kg',
                'reps',
                'distance_m',
                'duration_s',
                'rpe',
                'created_at',
            },
        )

    def test_the_loading_is_read_only_on_a_performed_exercise(self):
        """The loading belongs to the catalogue entry; this route cannot move it."""
        # Into a session that is still open: the fixture above is a finished
        # workout, and nothing may be recorded into one of those (E4). The rest
        # of this class reads that session back; only this test writes.
        running = TrainingSession.objects.create(user=self.user, type='legs')
        response = self.client.post(
            reverse('api:performedexercise-list'),
            {
                'training_session': str(running.pk),
                'exercise_definition': str(self.calf_raise.pk),
                'exercise_bar_kg': '25.00',
                'exercise_sides': 2,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['exercise_bar_kg'])
        self.calf_raise.refresh_from_db()
        self.assertIsNone(self.calf_raise.bar_kg)
        self.assertIsNone(self.calf_raise.sides)

    def test_the_query_count_does_not_grow_with_the_exercises(self):
        """The catalogue row was already being followed for the name (step 5)."""
        with CaptureQueriesContext(connection) as queries:
            self.client.get(reverse('api:trainingsession-detail', args=[self.session.pk]))
        before = len(queries)
        for name in ('Hip thrust', 'Leg press', 'Walking lunge'):
            PerformedExercise.objects.create(
                training_session=self.session,
                exercise_definition=ExerciseDefinition.objects.create(name=name),
            )
        with CaptureQueriesContext(connection) as queries:
            self.client.get(reverse('api:trainingsession-detail', args=[self.session.pk]))
        self.assertEqual(len(queries), before)
