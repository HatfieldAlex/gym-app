"""The DRF API layer: every route the frontends read and write through.

Versioned under /api/v1/ so a breaking change can ship alongside the old shape
rather than in place of it.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from catalog.views import ExerciseDefinitionViewSet
from dataexport.views import DataExportView
from feedback.views import FeedbackNoteViewSet
from observations.views import (
    PerformedExerciseViewSet,
    PerformedSetViewSet,
    TrainingSessionViewSet,
)

router = DefaultRouter()
router.register('exercises', ExerciseDefinitionViewSet, basename='exercise')
# basename is explicit for the observations viewsets: they build their querysets
# per-request from the signed-in user, so the router cannot infer one.
router.register('training-sessions', TrainingSessionViewSet, basename='trainingsession')
router.register('performed-exercises', PerformedExerciseViewSet, basename='performedexercise')
router.register('performed-sets', PerformedSetViewSet, basename='performedset')
# Same reason here: a note's queryset is the signed-in user's own notes.
router.register('feedback-notes', FeedbackNoteViewSet, basename='feedbacknote')

app_name = 'api'
urlpatterns = [
    # Session login/logout/whoami for the SPA, which no longer has a
    # server-rendered login form to post to.
    path('auth/', include('accounts.urls')),
    # Not a resource collection but a single GET, so a plain path() rather than
    # a router registration -- which is why it is absent from the DefaultRouter's
    # API-root listing at /api/v1/.
    path('export/', DataExportView.as_view(), name='export'),
] + router.urls
