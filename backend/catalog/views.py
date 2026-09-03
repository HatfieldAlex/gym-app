from django.db import IntegrityError, transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import ExerciseDefinition
from .serializers import (
    ExerciseDefinitionSerializer,
    ExerciseLoadingSerializer,
    duplicate_entry_error,
)


class ExerciseDefinitionViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    """`/api/exercises/` — the exercise catalogue, ordered by name.

    List, retrieve and add. Anyone signed in may add an entry (N7): a workout must
    never be blocked by a movement that is not on the list yet, and the catalogue is
    one shared list, so what anyone adds everyone sees. Editing and removing stay
    admin work and answer 405 here, because history points at these rows: renaming
    one rewrites the name shown against every past session, and deleting one is
    refused by PerformedExercise's PROTECT anyway.

    Authentication comes from the project-wide DEFAULT_PERMISSION_CLASSES, so an
    anonymous request gets 403 rather than rows.

    The one exception to "adding is the only write" is `loading/` below, and it is an
    exception in a very narrow sense: read its docstring before adding a second one.
    """

    queryset = ExerciseDefinition.objects.order_by('name')
    serializer_class = ExerciseDefinitionSerializer

    def perform_create(self, serializer):
        try:
            # atomic() so that a failed INSERT leaves a connection the re-read below
            # can still use.
            with transaction.atomic():
                # The sender comes from the request and never from the body (N6).
                serializer.save(created_by=self.request.user)
        except IntegrityError:
            # Two requests for the same new name at once: both got past the
            # serializer's lookup and one lost to exercisedef_name_ci_unique. Answer
            # the loser with the ordinary duplicate reply, carrying the row that won,
            # rather than a 500 for a user who did nothing wrong.
            existing = ExerciseDefinition.objects.filter(
                name__iexact=serializer.validated_data['name'],
            ).first()
            if existing is None:
                # Not the race, then -- some other integrity problem, and it should
                # be loud.
                raise
            raise duplicate_entry_error(existing)

    @action(detail=True, methods=['post'], url_path='loading')
    def loading(self, request, pk=None):
        """Answer, once and for all, how a movement that nobody has answered is loaded.

        `POST /api/v1/exercises/<id>/loading/` with `{"bar_kg": "25.00", "sides": 2}`.
        200 with the entry on success; **409** with the entry if it is already set.

        This is a one-way door, and that is the whole reason it exists rather than a
        PATCH. A loading only ever goes **unknown -> known**. It never goes known ->
        different, under any flag, parameter, query string or later convenience:

        - AGREED 2 is that loading is set once and then fixed forever, because
          `PerformedSet.weight_kg` stores only the total. Every past set of this
          movement is read back through `(weight_kg - bar_kg) / sides`, so changing
          either number silently rewrites what every one of those sets is *claimed to
          have been*. Nobody re-racked those plates; the display would just start
          lying about them. That is why a 25 kg trap bar is a different catalogue
          entry and not an edited deadlift.
        - AGREED 5 is that rows predating this feature -- and any row the admin left
          blank -- start unset and are answered on first use. Without this route that
          promise cannot be kept, because `PUT`/`PATCH`/`DELETE` are 405 here and stay
          405.

        Both of those hold only while this action refuses a row that already has an
        answer. So: if either column is non-null, nothing is written and the answer is
        409 -- `detail` first, so `ApiError.detail` (frontend api.js) reads it as a
        sentence, then `exercise`, so a client that raced another one can carry on with
        the answer that already exists instead of asking the user a question that has
        been answered.

        Anonymous requests are already 403 from DEFAULT_PERMISSION_CLASSES; no
        permission class of its own is needed or wanted.
        """
        exercise = self.get_object()
        if exercise.bar_kg is not None or exercise.sides is not None:
            return Response(
                {
                    'detail': (
                        f'"{exercise.name}" is already set to {loading_reads_as(exercise)}, '
                        f'and how a movement is loaded is never changed.'
                    ),
                    'exercise': self.get_serializer(exercise).data,
                },
                status=status.HTTP_409_CONFLICT,
            )

        body = ExerciseLoadingSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        exercise.bar_kg = body.validated_data['bar_kg']
        exercise.sides = body.validated_data['sides']
        # Only the two columns, so this route can never touch a name.
        exercise.save(update_fields=['bar_kg', 'sides'])
        # The same shape a create returns, so the client can drop it straight into the
        # catalogue list it is already holding.
        return Response(self.get_serializer(exercise).data)


def loading_reads_as(exercise):
    """`20 + 2x` -- how this movement adds up, for the 409's sentence.

    Trailing zeros come off the bar weight so a `DecimalField` does not say
    "20.00 + 2x" at somebody. The `?` branches cannot happen --
    exercisedef_loading_both_or_neither forbids one without the other -- but a sentence
    is not the place to find that out.
    """
    bar = exercise.bar_kg
    if bar is None:
        bar_text = '?'
    else:
        bar_text = format(bar, 'f')
        if '.' in bar_text:
            bar_text = bar_text.rstrip('0').rstrip('.')
    sides_text = '?' if exercise.sides is None else str(exercise.sides)
    return f'{bar_text} + {sides_text}\u00d7'
