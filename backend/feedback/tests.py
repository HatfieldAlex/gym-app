from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import NoReverseMatch, resolve, reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from settings.views import spa

from .models import FeedbackNote


class FeedbackNoteAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')
        cls.url = reverse('api:feedbacknote-list')

    def test_anonymous_post_is_rejected(self):
        response = self.client.post(self.url, {'body': 'the rest timer stops'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(FeedbackNote.objects.exists())

    def test_anonymous_list_is_rejected(self):
        FeedbackNote.objects.create(user=self.user, body='not for strangers')
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_body_alone_is_a_note(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': 'the rest timer should keep running'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        note = FeedbackNote.objects.get()
        self.assertEqual(note.user, self.user)
        self.assertEqual(note.kind, FeedbackNote.Kind.IDEA)
        self.assertEqual(note.page_path, '')

        self.assertEqual(response.data['id'], str(note.pk))
        self.assertEqual(response.data['kind'], 'idea')
        self.assertEqual(response.data['page_path'], '')
        self.assertIn('created_at', response.data)

    def test_kind_and_page_path_are_taken_when_given(self):
        self.client.force_login(self.user)
        response = self.client.post(
            self.url,
            {'body': 'the timer resets', 'kind': 'bug', 'page_path': '/current-session'},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        note = FeedbackNote.objects.get()
        self.assertEqual(note.kind, FeedbackNote.Kind.BUG)
        self.assertEqual(note.page_path, '/current-session')
        self.assertEqual(response.data['kind'], 'bug')
        self.assertEqual(response.data['page_path'], '/current-session')

    def test_the_owner_is_not_a_field_a_client_can_set(self):
        self.client.force_login(self.user)
        response = self.client.post(
            self.url,
            {'body': 'filed for someone else', 'user': self.other.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Ignored rather than obeyed: the note belongs to whoever wrote it.
        self.assertEqual(FeedbackNote.objects.get().user, self.user)

    def test_neither_owner_nor_resolution_is_readable(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': 'triage stays in the admin'})
        self.assertNotIn('user', response.data)
        self.assertNotIn('resolved_at', response.data)

    def test_resolution_and_creation_time_are_not_client_settable(self):
        self.client.force_login(self.user)
        stamp = timezone.now() - timedelta(days=365)
        response = self.client.post(
            self.url,
            {'body': 'already dealt with, honest', 'resolved_at': stamp, 'created_at': stamp},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        note = FeedbackNote.objects.get()
        self.assertIsNone(note.resolved_at)
        self.assertGreater(note.created_at, stamp)

    def test_the_response_carries_the_five_public_fields_and_no_more(self):
        self.client.force_login(self.user)
        created = self.client.post(self.url, {'body': 'one sentence'})
        fields = {'id', 'body', 'kind', 'page_path', 'created_at'}
        self.assertEqual(set(created.data), fields)
        # The same shape coming back out of the list, not just out of the write.
        listed = self.client.get(self.url)
        self.assertEqual(set(listed.data['results'][0]), fields)

    def test_a_missing_body_is_rejected(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'kind': 'bug'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('body', response.data)
        self.assertFalse(FeedbackNote.objects.exists())

    def test_an_empty_body_is_rejected(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': ''})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('body', response.data)
        self.assertFalse(FeedbackNote.objects.exists())

    def test_a_whitespace_only_body_is_rejected(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': '   ', 'kind': 'bug'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('body', response.data)
        self.assertFalse(FeedbackNote.objects.exists())

    def test_surrounding_whitespace_is_stripped(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': '  spaced out  '})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FeedbackNote.objects.get().body, 'spaced out')

    def test_a_body_over_the_cap_is_rejected(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': 'x' * 2001})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('body', response.data)
        self.assertFalse(FeedbackNote.objects.exists())

    def test_a_body_at_the_cap_is_accepted(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': 'x' * 2000})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(FeedbackNote.objects.get().body), 2000)

    def test_an_unknown_kind_is_rejected(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': 'x', 'kind': 'nonsense'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('kind', response.data)

    def test_list_is_scoped_to_the_requester_newest_first(self):
        first = FeedbackNote.objects.create(user=self.user, body='first thought')
        second = FeedbackNote.objects.create(user=self.user, body='second thought')
        FeedbackNote.objects.create(user=self.other, body='not yours')
        # created_at is auto_now_add, so the order is pinned after the fact
        # rather than left to how fast the two rows above were written.
        now = timezone.now()
        FeedbackNote.objects.filter(pk=first.pk).update(created_at=now - timedelta(minutes=1))
        FeedbackNote.objects.filter(pk=second.pk).update(created_at=now)

        self.client.force_login(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [note['id'] for note in response.data['results']],
            [str(second.pk), str(first.pk)],
        )

    def test_no_route_exists_for_editing_or_deleting_a_note(self):
        """The viewset offers create and list only, so a note has no detail URL.

        Editing and deleting are not endpoints a client can reach at all -- the
        router builds no detail route to reject, so there is nothing to guard.
        """
        note = FeedbackNote.objects.create(user=self.user, body='mine')
        with self.assertRaises(NoReverseMatch):
            reverse('api:feedbacknote-detail', args=[note.pk])

        self.client.force_login(self.user)
        detail = f'{self.url}{note.pk}/'
        for method in (self.client.patch, self.client.put, self.client.delete):
            with self.subTest(method=method.__name__):
                # Nothing in the API answers this path, so it falls through to
                # the SPA catch-all rather than reaching the viewset.
                self.assertIs(resolve(detail).func, spa)
                method(detail, {'body': 'edited'})
                note.refresh_from_db()
                self.assertEqual(note.body, 'mine')
        self.assertEqual(FeedbackNote.objects.count(), 1)
