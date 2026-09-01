from django.contrib.auth.models import User
from django.test import TestCase


class AuthApiTests(TestCase):
    """The three calls the SPA makes to manage its session."""

    def setUp(self):
        self.user = User.objects.create_user(username='lifter', password='barbell-2026')

    def test_session_is_anonymous_before_logging_in(self):
        response = self.client.get('/api/v1/auth/session/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'authenticated': False, 'username': None})

    def test_session_view_sets_the_csrf_cookie(self):
        response = self.client.get('/api/v1/auth/session/')

        self.assertIn('csrftoken', response.cookies)

    def test_login_starts_a_session(self):
        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'lifter', 'password': 'barbell-2026'},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'authenticated': True, 'username': 'lifter'})
        self.assertEqual(self.client.get('/api/v1/auth/session/').json()['authenticated'], True)

    def test_login_rejects_bad_credentials(self):
        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'lifter', 'password': 'wrong'},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get('/api/v1/auth/session/').json()['authenticated'], False)

    def test_logout_ends_the_session(self):
        self.client.force_login(self.user)

        response = self.client.post('/api/v1/auth/logout/')

        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get('/api/v1/auth/session/').json()['authenticated'], False)
