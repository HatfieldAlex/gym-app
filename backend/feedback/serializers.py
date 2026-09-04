from rest_framework import serializers

from .models import FeedbackNote


class FeedbackNoteSerializer(serializers.ModelSerializer):
    """A note as the API exposes it: the thought, and the little context around it.

    `user` is absent in both directions -- the view stamps the owner from the
    session, so naming one is not a thing a client can attempt.

    `resolved_at` is readable and never writable here: it is the admin's own
    column, `null` meaning still outstanding, and the only things that write it
    are the admin's triage actions and the viewset's `close/` and `reopen/`.
    """

    # allow_blank lets an empty body through the field so validate_body answers
    # it in the same words as a whitespace-only one, and trimming is left to
    # validate_body rather than happening silently underneath it.
    body = serializers.CharField(max_length=2000, allow_blank=True, trim_whitespace=False)

    def validate_body(self, value):
        body = value.strip()
        if not body:
            raise serializers.ValidationError('A note needs something in it.')
        return body

    class Meta:
        model = FeedbackNote
        # resolved_at last: the payload reads in the order the note's life happens.
        fields = ['id', 'body', 'kind', 'page_path', 'created_at', 'resolved_at']
        read_only_fields = ['id', 'created_at', 'resolved_at']
