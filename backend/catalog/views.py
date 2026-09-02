from django.db import IntegrityError, transaction
from rest_framework import mixins, viewsets

from .models import ExerciseDefinition
from .serializers import ExerciseDefinitionSerializer, duplicate_entry_error


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
