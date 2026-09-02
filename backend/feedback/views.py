from rest_framework import mixins, viewsets

from .models import FeedbackNote
from .serializers import FeedbackNoteSerializer


class FeedbackNoteViewSet(mixins.CreateModelMixin,
                          mixins.ListModelMixin,
                          viewsets.GenericViewSet):
    """`/api/v1/feedback-notes/` — write a note, or list your own, newest first.

    Create and list are the only two things a client may do: a note is a thought
    as it arrived, so there is nothing to edit, and deleting one is the admin's
    job. Authentication comes from the project-wide DEFAULT_PERMISSION_CLASSES,
    so an anonymous post gets 403 rather than an ownerless note.
    """

    serializer_class = FeedbackNoteSerializer

    def get_queryset(self):
        """Scoped to the requester: ownership is never a client-supplied filter."""
        # Meta.ordering already puts newest first.
        return FeedbackNote.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
