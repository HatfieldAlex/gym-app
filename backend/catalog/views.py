from rest_framework import viewsets

from .models import ExerciseDefinition
from .serializers import ExerciseDefinitionSerializer


class ExerciseDefinitionViewSet(viewsets.ReadOnlyModelViewSet):
    """`/api/exercises/` — the exercise catalogue, ordered by name.

    Read-only: the catalogue is shared reference data, curated through the admin
    rather than written by clients. Authentication comes from the project-wide
    DEFAULT_PERMISSION_CLASSES, so an anonymous fetch gets 403 rather than rows.
    """

    queryset = ExerciseDefinition.objects.order_by('name')
    serializer_class = ExerciseDefinitionSerializer
