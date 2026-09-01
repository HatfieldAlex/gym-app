"""Admin for the exercise catalogue."""
from django.contrib import admin

from .models import ExerciseDefinition


@admin.register(ExerciseDefinition)
class ExerciseDefinitionAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    ordering = ('name',)
    # Also what makes this model autocompletable from PerformedExercise.
    search_fields = ('name',)
    readonly_fields = ('id', 'created_at')
