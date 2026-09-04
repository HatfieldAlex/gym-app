"""The SPA shell: what Django still does for the frontend, and what it must not do."""
import tempfile
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import resolve

from catalog.models import ExerciseDefinition
from observations.models import PerformedExercise, TrainingSession
from settings.views import spa

SHELL = '<!DOCTYPE html><html><body><div id="root"></div></body></html>'


class SpaRoutingTests(SimpleTestCase):
    """The catch-all has to cover the app's routes without covering the API's."""

    def test_every_app_route_resolves_to_the_shell(self):
        paths = [
            '/',
            '/login',
            '/exercises-catelog',
            # A deep link into the exercise zone: the app's only child route
            # that is not an id, and the one a reload mid-exercise lands on.
            '/current-session/exercise',
            # Trailing slashes, as the server-rendered pages used to publish them.
            '/exercises-catelog/',
            '/exercises-catelog/6f1f6dcb-6c9d-4a2e-9f3b-2a1b8c5d4e3f/',
            '/training-sessions/',
            '/settings/',
            # A route the app does not know either: the 404 is its to render.
            '/nothing/here',
        ]
        for path in paths:
            with self.subTest(path=path):
                self.assertIs(resolve(path).func, spa)

    def test_api_and_admin_are_not_swallowed(self):
        for path in ['/api/v1/exercises/', '/api/v1/auth/session/', '/admin/']:
            with self.subTest(path=path):
                self.assertIsNot(resolve(path).func, spa)


class SpaShellTests(TestCase):
    """The shell is a static file, and has to stay one."""

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('lifter', password='pw')
        squat = ExerciseDefinition.objects.create(name='Squat')
        session = TrainingSession.objects.create(user=cls.user, type='legs')
        PerformedExercise.objects.create(training_session=session, exercise_definition=squat)

    def setUp(self):
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        index = Path(self._directory.name) / 'index.html'
        index.write_text(SHELL)
        patcher = mock.patch('settings.views.INDEX_HTML', index)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_serves_the_built_shell(self):
        response = self.client.get('/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), SHELL)

    def test_shell_carries_no_data_and_does_not_vary(self):
        # The pages used to be templates, and a template can leak a queryset into
        # the HTML by accident. One byte-identical file for everyone cannot.
        anonymous = self.client.get('/training-sessions/').content
        self.client.force_login(self.user)
        authenticated = self.client.get('/training-sessions/').content
        catalogue = self.client.get('/exercises-catelog/').content

        self.assertEqual(anonymous, authenticated)
        self.assertEqual(anonymous, catalogue)
        self.assertNotIn(b'legs', anonymous)
        self.assertNotIn(b'Squat', catalogue)


class SpaNotBuiltTests(SimpleTestCase):
    def test_says_so_rather_than_crashing(self):
        missing = Path(tempfile.gettempdir()) / 'no-such-frontend-build' / 'index.html'
        with mock.patch('settings.views.INDEX_HTML', missing):
            response = self.client.get('/')

        self.assertEqual(response.status_code, 501)
        self.assertIn('npm run build', response.content.decode())
