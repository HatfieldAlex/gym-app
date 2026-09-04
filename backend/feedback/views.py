from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import FeedbackNote
from .serializers import FeedbackNoteSerializer


class FeedbackNoteViewSet(mixins.CreateModelMixin,
                          mixins.ListModelMixin,
                          viewsets.GenericViewSet):
    """`/api/v1/feedback-notes/` — write a note, or list your own, newest first.

    Create, list, `close/` and `reopen/` are the only four things a client may
    do: a note is a thought as it arrived, so there is still nothing to edit,
    and deleting one is still the admin's job. Authentication comes from the
    project-wide DEFAULT_PERMISSION_CLASSES, so an anonymous post gets 403
    rather than an ownerless note.

    The list carries every note, open and closed; which of them is on screen is
    the client's business, so there is no filter and no query parameter.
    """

    serializer_class = FeedbackNoteSerializer

    def get_queryset(self):
        """Scoped to the requester: ownership is never a client-supplied filter."""
        # Meta.ordering already puts newest first.
        return FeedbackNote.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Mark the note dealt with: stamp `resolved_at` now. 200 with the note.

        An action rather than a PATCH, and that is the point. A note's body and
        kind are not editable from anywhere but the admin, so the only detail
        route that may exist is one that changes this single column — and a
        router `@action` builds `<pk>/close/` *without* building `<pk>/`, which
        is what keeps editing and deleting unreachable rather than merely
        refused.

        Closing an already-closed note is a no-op that still answers 200, and
        the first close time is never overwritten. Unlike a session's
        `ended_at`, this flag is shared with admin triage and can move under a
        client that is showing a perfectly reasonable stale list; the caller
        asked for the note to be closed and it is closed, so a 400 there would
        be an error line for the outcome they wanted.

        The request body is ignored — there is nothing to send. Nothing is ever
        deleted here: this is a flag, not a soft delete.
        """
        note = self.get_object()
        if note.resolved_at is None:
            note.resolved_at = timezone.now()
            note.save(update_fields=['resolved_at'])
        return Response(self.get_serializer(note).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """Put the note back on the outstanding list: `resolved_at = None`. 200.

        The mirror of `close/`, and an action for the same reason (see it): the
        column it clears is the admin's own, so this and **Mark selected notes
        unresolved** are one act on one column.

        Reopening an already-open note writes nothing and still answers 200, for
        the same reason a repeated close does. A reopened note closes fresh
        afterwards — it does not remember when it was closed before.
        """
        note = self.get_object()
        if note.resolved_at is not None:
            note.resolved_at = None
            note.save(update_fields=['resolved_at'])
        return Response(self.get_serializer(note).data)
