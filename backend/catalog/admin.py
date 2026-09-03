"""Admin for the exercise catalogue."""
from django.contrib import admin

from .models import ExerciseDefinition


@admin.register(ExerciseDefinition)
class ExerciseDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'bar_kg', 'sides', 'created_by', 'created_at')
    ordering = ('name',)
    # The curation questions a writable catalogue raises: what came in from the app
    # and from whom, and — since the loading columns are nullable — what has not been
    # answered yet. bar_kg and sides stay editable on the form: no-edit is a fence
    # around the app, not around whoever owns the database.
    list_filter = ('sides', 'created_by')
    # Also what makes this model autocompletable from PerformedExercise.
    search_fields = ('name',)
    readonly_fields = ('id', 'created_at')
    autocomplete_fields = ('created_by',)
    # Otherwise the change list fetches a user row per line.
    list_select_related = ('created_by',)
