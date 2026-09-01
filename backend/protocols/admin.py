"""Admin for prescriptions."""
from django.contrib import admin
from django.db.models import Count

from .models import ExercisePrescription


@admin.register(ExercisePrescription)
class ExercisePrescriptionAdmin(admin.ModelAdmin):
    """The model is a bare primary key, so the id and its usage are all there is."""

    list_display = ('id', 'performed_exercise_count')
    readonly_fields = ('id',)
    # Exact-match only: a UUID is not something anyone types a fragment of.
    search_fields = ('=id',)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _performed_exercise_count=Count('performed_exercises'),
        )

    @admin.display(description='performed exercises', ordering='_performed_exercise_count')
    def performed_exercise_count(self, obj):
        return obj._performed_exercise_count
