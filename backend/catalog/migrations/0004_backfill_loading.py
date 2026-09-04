"""Fill in the loading of the movements whose loading is not in doubt.

Only the genuinely knowable, copied verbatim from the agreed backfill table.
Everything the table does not name — `seated calf raise`, `walking lunge`, and
any row somebody added by hand — stays null and is asked about once, the first
time it is trained. Prod's catalogue is not visible from here, a value can only
ever go unknown -> known, and so a wrong guess would be permanent. An unset row
costs the user one question; a wrong one costs them the truth of their history.

This migration reads and writes `catalog_exercisedefinition` and nothing else.
Not one PerformedSet is read and `weight_kg` is not so much as imported: past
totals are observations, and this iteration does not reinterpret them.
"""
from decimal import Decimal

from django.db import migrations

# (bar_kg, sides) -> the movements loaded that way. Case-insensitive on name,
# consistent with the catalogue's own Lower('name') unique constraint and with
# the fact that the seeded names are lower-case while a hand-added one may not be.
LOADING = [
    # The barbell lifts: a 20 kg bar, plates on both ends.
    ((Decimal('20.00'), 2), [
        'squats',
        'front squat',
        'deadlift',
        'romanian deadlift',
        'bench press',
        'overhead press',
        'barbell row',
        'barbell curl',
        'hip thrust',
    ]),
    # Dumbbells: no bar to speak of, but two of them. Two 30 kg bells record 60.
    ((Decimal('0.00'), 2), [
        'incline dumbbell press',
        'dumbbell lateral raise',
    ]),
    # Cable stacks: one stack, and the number on it is the whole weight.
    ((Decimal('0.00'), 1), [
        'seated cable row',
        'lat pulldown',
        'cable tricep pushdown',
        'face pull',
    ]),
    # A sled, loaded as one number.
    ((Decimal('0.00'), 1), [
        'leg press',
    ]),
    # Bodyweight, cardio and mobility: nothing is loaded, so there is nothing to
    # split. 0 / 1 is an answer — it says "the number you type is the number" —
    # and it stops these ever asking the question.
    ((Decimal('0.00'), 1), [
        'pull ups',
        'dips',
        'hanging leg raise',
        'outdoor run',
        'treadmill run',
        'rowing machine',
        'stationary bike',
        'assault bike',
        'jump rope',
        'plank',
        'couch stretch',
        'pigeon pose',
        '90/90 hip switch',
        'world greatest stretch',
        'thoracic spine opener',
        'shoulder dislocates',
    ]),
]


def backfill_loading(apps, schema_editor):
    """Set bar_kg and sides on the listed movements that nobody has answered yet."""
    ExerciseDefinition = apps.get_model('catalog', 'ExerciseDefinition')
    for (bar_kg, sides), names in LOADING:
        for name in names:
            # Both-null only, so re-running against a database where somebody has
            # already answered the question through the app changes nothing.
            ExerciseDefinition.objects.filter(
                name__iexact=name,
                bar_kg__isnull=True,
                sides__isnull=True,
            ).update(bar_kg=bar_kg, sides=sides)


def unfill_loading(apps, schema_editor):
    """Put back to null only the rows still holding what the forward pass wrote.

    A row somebody has since answered differently is left exactly as it is: this
    reverse undoes this migration, not the user.
    """
    ExerciseDefinition = apps.get_model('catalog', 'ExerciseDefinition')
    for (bar_kg, sides), names in LOADING:
        for name in names:
            ExerciseDefinition.objects.filter(
                name__iexact=name,
                bar_kg=bar_kg,
                sides=sides,
            ).update(bar_kg=None, sides=None)


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0003_exercisedefinition_bar_kg_exercisedefinition_sides_and_more'),
    ]

    operations = [
        migrations.RunPython(
            backfill_loading,
            unfill_loading,
            # Squashing this away would lose the only record of which movements
            # were filled in without anybody being asked.
            elidable=False,
        ),
    ]
