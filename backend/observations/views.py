from django.db.models import Prefetch
from django.shortcuts import render

from .models import PerformedExercise, TrainingSession


def training_sessions(request):
    """List the signed-in user's training sessions, newest first.

    No @login_required: base.html gates the page body on user.is_authenticated,
    so anonymous visitors get the "not signed in" layout instead of a redirect.
    Filtering by an AnonymousUser would raise, hence the empty queryset.
    """
    if request.user.is_authenticated:
        sessions = (
            TrainingSession.objects
            .filter(user=request.user)
            .order_by('-created_at')
            .prefetch_related(
                # One extra query for every session's exercises rather than one per
                # session, and select_related folds in the catalogue name too.
                # created_at is the order within the session.
                Prefetch(
                    'performed_exercises',
                    queryset=PerformedExercise.objects
                    .select_related('exercise_definition')
                    .order_by('created_at'),
                ),
            )
        )
    else:
        sessions = TrainingSession.objects.none()

    return render(request, 'training_sessions.html', {'sessions': sessions})
