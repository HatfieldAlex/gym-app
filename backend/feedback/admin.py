"""Admin for feedback notes -- reading and resolving them is the whole triage."""
from django.contrib import admin
from django.utils import timezone

from .models import FeedbackNote


@admin.register(FeedbackNote)
class FeedbackNoteAdmin(admin.ModelAdmin):
    list_display = ('body_preview', 'kind', 'user', 'page_path', 'created_at', 'is_open')
    list_filter = ('kind', 'created_at')
    ordering = ('-created_at',)
    search_fields = ('body', 'user__username')
    autocomplete_fields = ('user',)
    readonly_fields = ('id', 'created_at')
    list_select_related = ('user',)
    actions = ('mark_resolved', 'mark_unresolved')

    @admin.display(description='note')
    def body_preview(self, obj):
        return str(obj)

    @admin.display(boolean=True, description='open', ordering='resolved_at')
    def is_open(self, obj):
        return obj.resolved_at is None

    @admin.action(description='Mark selected notes resolved')
    def mark_resolved(self, request, queryset):
        queryset.update(resolved_at=timezone.now())

    @admin.action(description='Mark selected notes unresolved')
    def mark_unresolved(self, request, queryset):
        queryset.update(resolved_at=None)
