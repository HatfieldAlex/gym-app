"""Admin for what actually happened in the gym.

The four models nest -- session > exercise > set > rep -- so each level is both
registered in its own right and available as an inline on its parent.
"""
from django.contrib import admin

from .models import PerformedExercise, PerformedRep, PerformedSet, TrainingSession


class PerformedExerciseInline(admin.TabularInline):
    model = PerformedExercise
    extra = 0
    fields = ('exercise_definition', 'exercise_prescription')
    autocomplete_fields = ('exercise_definition',)
    raw_id_fields = ('exercise_prescription',)
    show_change_link = True


class PerformedSetInline(admin.TabularInline):
    model = PerformedSet
    extra = 0
    fields = ('weight_kg', 'reps', 'distance_m', 'duration_s', 'rpe')
    show_change_link = True


class PerformedRepInline(admin.TabularInline):
    model = PerformedRep
    extra = 0
    fields = ('rep_index',)
    ordering = ('rep_index',)


@admin.register(TrainingSession)
class TrainingSessionAdmin(admin.ModelAdmin):
    list_display = ('started_at', 'user', 'type', 'is_open', 'exercise_count')
    list_filter = ('type', 'started_at')
    # Newest training first, matching how history is read everywhere else.
    ordering = ('-started_at',)
    date_hierarchy = 'started_at'
    search_fields = ('user__username', 'user__email')
    autocomplete_fields = ('user',)
    readonly_fields = ('id', 'created_at')
    list_select_related = ('user',)
    inlines = [PerformedExerciseInline]

    @admin.display(boolean=True, description='open', ordering='ended_at')
    def is_open(self, obj):
        return obj.ended_at is None

    @admin.display(description='exercises')
    def exercise_count(self, obj):
        return obj.performed_exercises.count()


@admin.register(PerformedExercise)
class PerformedExerciseAdmin(admin.ModelAdmin):
    list_display = ('exercise_definition', 'training_session', 'created_at', 'set_count')
    list_filter = ('exercise_definition',)
    ordering = ('-created_at',)
    search_fields = ('exercise_definition__name', 'training_session__user__username')
    autocomplete_fields = ('exercise_definition',)
    raw_id_fields = ('training_session', 'exercise_prescription')
    readonly_fields = ('id', 'created_at')
    list_select_related = ('exercise_definition', 'training_session')
    inlines = [PerformedSetInline]

    @admin.display(description='sets')
    def set_count(self, obj):
        return obj.performed_sets.count()


@admin.register(PerformedSet)
class PerformedSetAdmin(admin.ModelAdmin):
    list_display = (
        'performed_exercise',
        'weight_kg',
        'reps',
        'distance_m',
        'duration_s',
        'rpe',
        'created_at',
    )
    ordering = ('-created_at',)
    search_fields = ('performed_exercise__exercise_definition__name',)
    raw_id_fields = ('performed_exercise',)
    readonly_fields = ('id', 'created_at')
    list_select_related = ('performed_exercise', 'performed_exercise__exercise_definition')
    inlines = [PerformedRepInline]


@admin.register(PerformedRep)
class PerformedRepAdmin(admin.ModelAdmin):
    list_display = ('performed_set', 'rep_index')
    ordering = ('performed_set', 'rep_index')
    raw_id_fields = ('performed_set',)
    readonly_fields = ('id',)
    list_select_related = ('performed_set',)
