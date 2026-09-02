import uuid

from django.conf import settings
from django.db import models


class FeedbackNote(models.Model):
    """A thought logged from anywhere in the app without leaving the page."""

    class Kind(models.TextChoices):
        IDEA = 'idea', 'Idea'
        BUG = 'bug', 'Bug'
        OTHER = 'other', 'Other'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='feedback_notes',
    )
    # The length cap is the serializer's job: the column should never be the
    # thing that rejects a thought.
    body = models.TextField()
    # Defaulted so a note can be written without deciding what it is; the
    # column exists so the admin list can be filtered.
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.IDEA)
    page_path = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='where the writer was when the thought arrived, e.g. /current-session',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='null means the note is still outstanding',
    )

    class Meta:
        verbose_name = 'feedback note'
        verbose_name_plural = 'feedback notes'
        # Newest first is the only order anything ever wants.
        ordering = ('-created_at',)
        indexes = [
            models.Index(fields=['user', 'created_at'], name='feednote_user_created_idx'),
        ]

    def __str__(self):
        return self.body[:60]
