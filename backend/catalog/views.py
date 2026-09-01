from django.shortcuts import get_object_or_404, render

from .models import ExerciseDefinition


def exercises_catelog(request):
    """List the exercise catalogue, ordered by name.

    No @login_required: base.html gates the page body on user.is_authenticated,
    so anonymous visitors get the "not signed in" layout instead of a redirect.
    """
    if request.user.is_authenticated:
        exercises = ExerciseDefinition.objects.order_by('name')
    else:
        exercises = ExerciseDefinition.objects.none()

    return render(request, 'exercises_catelog.html', {'exercises': exercises})


def exercise_detail(request, exercise_id):
    """One catalogue entry.

    Same anonymous handling as exercises_catelog: base.html hides the body, so
    there is nothing to look up (and nothing to leak) for a signed-out visitor.
    """
    if request.user.is_authenticated:
        exercise = get_object_or_404(ExerciseDefinition, pk=exercise_id)
    else:
        exercise = None

    return render(request, 'exercise_detail.html', {'exercise': exercise})
