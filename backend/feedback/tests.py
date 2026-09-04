import uuid
from datetime import timedelta

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.urls import NoReverseMatch, resolve, reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from settings.views import spa

from .admin import FeedbackNoteAdmin
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

    def test_the_owner_is_not_readable_but_the_resolution_is(self):
        self.client.force_login(self.user)
        response = self.client.post(self.url, {'body': 'triage is shared now'})
        self.assertNotIn('user', response.data)
        # A note just written is outstanding, and says so.
        self.assertIn('resolved_at', response.data)
        self.assertIsNone(response.data['resolved_at'])

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

    def test_the_response_carries_the_six_public_fields_and_no_more(self):
        self.client.force_login(self.user)
        created = self.client.post(self.url, {'body': 'one sentence'})
        fields = {'id', 'body', 'kind', 'page_path', 'created_at', 'resolved_at'}
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


class FeedbackNoteLifecycleTests(APITestCase):
    """`close/` and `reopen/`: one column, both directions, repeats harmless."""

    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user('lifter', password='pw')
        cls.other = User.objects.create_user('stranger', password='pw')

    def close_url(self, note):
        return reverse('api:feedbacknote-close', args=[note.pk])

    def reopen_url(self, note):
        return reverse('api:feedbacknote-reopen', args=[note.pk])

    def test_anonymous_close_and_reopen_are_rejected(self):
        note = FeedbackNote.objects.create(user=self.user, body='not for strangers')
        for url in (self.close_url(note), self.reopen_url(note)):
            with self.subTest(url=url):
                response = self.client.post(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        note.refresh_from_db()
        self.assertIsNone(note.resolved_at)

    def test_another_users_note_is_not_found(self):
        stamp = timezone.now() - timedelta(days=1)
        note = FeedbackNote.objects.create(
            user=self.other, body='not yours', resolved_at=stamp,
        )
        self.client.force_login(self.user)
        for url in (self.close_url(note), self.reopen_url(note)):
            with self.subTest(url=url):
                response = self.client.post(url)
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        note.refresh_from_db()
        self.assertEqual(note.resolved_at, stamp)

    def test_an_unknown_id_is_not_found(self):
        self.client.force_login(self.user)
        missing = uuid.uuid4()
        for name in ('api:feedbacknote-close', 'api:feedbacknote-reopen'):
            with self.subTest(name=name):
                response = self.client.post(reverse(name, args=[missing]))
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_close_is_post_only(self):
        note = FeedbackNote.objects.create(user=self.user, body='mine')
        self.client.force_login(self.user)
        response = self.client.get(self.close_url(note))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        note.refresh_from_db()
        self.assertIsNone(note.resolved_at)

    def test_closing_an_open_note_stamps_it(self):
        note = FeedbackNote.objects.create(user=self.user, body='dealt with')
        self.client.force_login(self.user)
        response = self.client.post(self.close_url(note))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data['resolved_at'])

        note.refresh_from_db()
        self.assertIsNotNone(note.resolved_at)

    def test_closing_twice_does_not_move_the_stamp(self):
        note = FeedbackNote.objects.create(user=self.user, body='dealt with')
        self.client.force_login(self.user)
        first = self.client.post(self.close_url(note))
        second = self.client.post(self.close_url(note))
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        # C4: a repeat is the outcome the caller asked for, not an error, and
        # the first close time survives it.
        self.assertEqual(second.data['resolved_at'], first.data['resolved_at'])

    def test_reopening_a_closed_note_clears_the_stamp(self):
        note = FeedbackNote.objects.create(
            user=self.user, body='back on the list', resolved_at=timezone.now(),
        )
        self.client.force_login(self.user)
        response = self.client.post(self.reopen_url(note))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['resolved_at'])

        note.refresh_from_db()
        self.assertIsNone(note.resolved_at)

    def test_reopening_an_open_note_is_a_no_op(self):
        note = FeedbackNote.objects.create(user=self.user, body='never closed')
        self.client.force_login(self.user)
        response = self.client.post(self.reopen_url(note))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['resolved_at'])

        note.refresh_from_db()
        self.assertIsNone(note.resolved_at)

    def test_a_reopened_note_closes_fresh(self):
        note = FeedbackNote.objects.create(user=self.user, body='twice round')
        self.client.force_login(self.user)
        first = self.client.post(self.close_url(note))
        self.client.post(self.reopen_url(note))
        third = self.client.post(self.close_url(note))
        # It does not remember: the second close is its own moment.
        self.assertGreater(third.data['resolved_at'], first.data['resolved_at'])

    def test_neither_action_touches_the_note_itself(self):
        note = FeedbackNote.objects.create(
            user=self.user,
            body='the rest timer stops',
            kind=FeedbackNote.Kind.BUG,
            page_path='/current-session',
        )
        created_at = note.created_at
        self.client.force_login(self.user)
        self.client.post(self.close_url(note))
        self.client.post(self.reopen_url(note))

        note.refresh_from_db()
        self.assertEqual(note.body, 'the rest timer stops')
        self.assertEqual(note.kind, FeedbackNote.Kind.BUG)
        self.assertEqual(note.page_path, '/current-session')
        self.assertEqual(note.created_at, created_at)

    def test_the_list_carries_the_resolution_of_open_and_closed_notes(self):
        closed = FeedbackNote.objects.create(user=self.user, body='done')
        FeedbackNote.objects.create(user=self.user, body='still outstanding')
        self.client.force_login(self.user)
        self.client.post(self.close_url(closed))

        response = self.client.get(reverse('api:feedbacknote-list'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_id = {note['id']: note['resolved_at'] for note in response.data['results']}
        # C6: closed notes stay in the list; the client decides what to show.
        self.assertEqual(len(by_id), 2)
        self.assertIsNotNone(by_id[str(closed.pk)])
        self.assertIsNone(
            by_id[str(FeedbackNote.objects.get(body='still outstanding').pk)],
        )

    def test_the_admin_and_the_api_write_the_same_column(self):
        """C1: `close/` and **Mark selected notes unresolved** meet on `resolved_at`."""
        note = FeedbackNote.objects.create(user=self.user, body='one column')
        self.client.force_login(self.user)
        self.client.post(self.close_url(note))
        note.refresh_from_db()
        self.assertIsNotNone(note.resolved_at)

        admin_instance = FeedbackNoteAdmin(FeedbackNote, AdminSite())
        admin_instance.mark_unresolved(None, FeedbackNote.objects.filter(pk=note.pk))

        note.refresh_from_db()
        self.assertIsNone(note.resolved_at)
