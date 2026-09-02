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


class SignupApiTests(TestCase):
    """Opening an account, and using it afterwards."""

    def signup(self, **credentials):
        return self.client.post(
            '/api/v1/auth/signup/',
            credentials,
            content_type='application/json',
        )

    def test_signup_creates_the_account_and_signs_it_in(self):
        response = self.signup(username='newcomer', password='first-session')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {'authenticated': True, 'username': 'newcomer'})
        self.assertTrue(User.objects.filter(username='newcomer').exists())
        self.assertEqual(self.client.get('/api/v1/auth/session/').json()['authenticated'], True)

    def test_signup_stores_the_password_hashed(self):
        self.signup(username='newcomer', password='first-session')

        user = User.objects.get(username='newcomer')
        self.assertNotEqual(user.password, 'first-session')
        self.assertTrue(user.check_password('first-session'))

    def test_the_new_account_can_log_in_afterwards(self):
        self.signup(username='newcomer', password='first-session')
        self.client.post('/api/v1/auth/logout/')

        response = self.client.post(
            '/api/v1/auth/login/',
            {'username': 'newcomer', 'password': 'first-session'},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'authenticated': True, 'username': 'newcomer'})

    def test_signup_rejects_a_username_already_taken(self):
        User.objects.create_user(username='newcomer', password='first-session')

        response = self.signup(username='newcomer', password='second-attempt')

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.json())
        self.assertEqual(User.objects.filter(username='newcomer').count(), 1)

    def test_signup_needs_both_a_username_and_a_password(self):
        self.assertEqual(self.signup(username='newcomer').status_code, 400)
        self.assertEqual(self.signup(password='first-session').status_code, 400)
        self.assertEqual(self.signup(username='', password='first-session').status_code, 400)
        self.assertEqual(self.signup(username='newcomer', password='').status_code, 400)
        self.assertFalse(User.objects.filter(username='newcomer').exists())
