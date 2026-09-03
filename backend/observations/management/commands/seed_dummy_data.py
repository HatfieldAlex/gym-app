"""Fill the database with a plausible training history to develop against.

`make dummy-data` runs this. It is not a fixture and not a replica of anyone's
real log: it invents a few athletes and walks each of them forward week by week
through a training block, so the app has enough shape to be worth looking at —
history that spans months, sessions of every type, sets that get heavier over
time, and one session left open so the "current session" screens have something
to show.

Deterministic by default: the same `--seed` yields the same database, so a bug
found against seeded data can be reproduced.
"""
import math
import random
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from catalog.models import ExerciseDefinition
from observations.models import (
    PerformedExercise,
    PerformedRep,
    PerformedSet,
    TrainingSession,
)
from protocols.models import ExercisePrescription

# --- the catalogue -----------------------------------------------------------

# One entry per movement. `group` decides which session types reach for it;
# `kind` decides what a set of it looks like:
#
#   loaded      weight_kg + reps, climbing week over week
#   bodyweight  reps alone (and rpe), no bar to load
#   distance    distance_m + duration_s, derived from a pace in seconds/km
#   duration    duration_s alone — a hold, a stretch, a skipping interval
#
# The numbers are a starting point for a notional intermediate lifter; every
# athlete gets their own multiplier on top, so two seeded users never look like
# the same person.
EXERCISES = [
    # name, group, kind, extra
    ('squats', 'strength', 'loaded', {'base_kg': 90, 'reps': (4, 8), 'weekly_kg': 1.5}),
    ('front squat', 'strength', 'loaded', {'base_kg': 70, 'reps': (4, 8), 'weekly_kg': 1.0}),
    ('deadlift', 'strength', 'loaded', {'base_kg': 110, 'reps': (3, 6), 'weekly_kg': 2.0}),
    ('romanian deadlift', 'strength', 'loaded', {'base_kg': 80, 'reps': (6, 10), 'weekly_kg': 1.25}),
    ('bench press', 'strength', 'loaded', {'base_kg': 65, 'reps': (5, 10), 'weekly_kg': 1.0}),
    ('incline dumbbell press', 'strength', 'loaded', {'base_kg': 24, 'reps': (8, 12), 'weekly_kg': 0.5}),
    ('overhead press', 'strength', 'loaded', {'base_kg': 40, 'reps': (5, 8), 'weekly_kg': 0.75}),
    ('barbell row', 'strength', 'loaded', {'base_kg': 60, 'reps': (6, 10), 'weekly_kg': 1.0}),
    ('seated cable row', 'strength', 'loaded', {'base_kg': 55, 'reps': (8, 12), 'weekly_kg': 0.75}),
    ('lat pulldown', 'strength', 'loaded', {'base_kg': 50, 'reps': (8, 12), 'weekly_kg': 0.75}),
    ('leg press', 'strength', 'loaded', {'base_kg': 140, 'reps': (8, 15), 'weekly_kg': 2.5}),
    ('hip thrust', 'strength', 'loaded', {'base_kg': 85, 'reps': (8, 12), 'weekly_kg': 1.5}),
    ('barbell curl', 'strength', 'loaded', {'base_kg': 30, 'reps': (8, 12), 'weekly_kg': 0.5}),
    ('cable tricep pushdown', 'strength', 'loaded', {'base_kg': 28, 'reps': (10, 15), 'weekly_kg': 0.5}),
    ('dumbbell lateral raise', 'strength', 'loaded', {'base_kg': 10, 'reps': (10, 15), 'weekly_kg': 0.25}),
    ('face pull', 'strength', 'loaded', {'base_kg': 22, 'reps': (12, 20), 'weekly_kg': 0.25}),
    ('seated calf raise', 'strength', 'loaded', {'base_kg': 45, 'reps': (10, 15), 'weekly_kg': 1.0}),
    ('walking lunge', 'strength', 'loaded', {'base_kg': 20, 'reps': (8, 14), 'weekly_kg': 0.5}),
    ('pull ups', 'strength', 'bodyweight', {'reps': (4, 12)}),
    ('dips', 'strength', 'bodyweight', {'reps': (5, 14)}),
    ('hanging leg raise', 'strength', 'bodyweight', {'reps': (6, 15)}),
    ('outdoor run', 'cardio', 'distance', {'metres': (4000, 14000), 'pace_s_km': (280, 375)}),
    ('treadmill run', 'cardio', 'distance', {'metres': (3000, 10000), 'pace_s_km': (290, 380)}),
    ('rowing machine', 'cardio', 'distance', {'metres': (2000, 6000), 'pace_s_km': (200, 260)}),
    ('stationary bike', 'cardio', 'distance', {'metres': (8000, 25000), 'pace_s_km': (95, 140)}),
    ('assault bike', 'cardio', 'duration', {'seconds': (300, 1200)}),
    ('jump rope', 'cardio', 'duration', {'seconds': (120, 480)}),
    ('plank', 'mobility', 'duration', {'seconds': (30, 150)}),
    ('couch stretch', 'mobility', 'duration', {'seconds': (45, 120)}),
    ('pigeon pose', 'mobility', 'duration', {'seconds': (45, 120)}),
    ('90/90 hip switch', 'mobility', 'duration', {'seconds': (40, 90)}),
    ('world greatest stretch', 'mobility', 'duration', {'seconds': (40, 90)}),
    ('thoracic spine opener', 'mobility', 'duration', {'seconds': (30, 90)}),
    ('shoulder dislocates', 'mobility', 'duration', {'seconds': (30, 75)}),
]

# Which groups a session of each type draws from, and how many movements it runs
# through. `mixed` is the session that started as one thing and became another.
SESSION_TYPES = {
    'strength': {'groups': ('strength',), 'exercises': (3, 6), 'weight': 55},
    'cardio': {'groups': ('cardio',), 'exercises': (1, 2), 'weight': 20},
    'mobility': {'groups': ('mobility',), 'exercises': (3, 5), 'weight': 10},
    'mixed': {'groups': ('strength', 'cardio', 'mobility'), 'exercises': (3, 6), 'weight': 15},
}

# The athletes. The first one is the account to log in as: it gets the open
# session and the densest history.
ATHLETES = [
    # username, first name, sessions per week, strength multiplier
    ('alex', 'Alex', (3, 5), 1.00),
    ('maria', 'Maria', (3, 4), 0.85),
    ('sam', 'Sam', (2, 4), 1.15),
    ('priya', 'Priya', (2, 3), 0.95),
    ('tom', 'Tom', (1, 3), 1.30),
]

ADMIN_USERNAME = 'superuser'

# Prescriptions are a bare primary key today, so all this can do is put a
# handful of stable rows there for performed exercises to point at. Fixed UUIDs
# keep re-runs from breeding more of them.
PRESCRIPTION_NAMESPACE = uuid.UUID('6f1b7f6a-2c2b-4e4e-9d2f-0a1b2c3d4e5f')
PRESCRIPTION_COUNT = 6

# Sessions start in the morning or the evening, never at 03:00.
START_HOURS = (6, 7, 7, 8, 9, 12, 17, 18, 18, 19, 20)


def to_2_5(kg):
    """Round to the plates that actually exist."""
    return round(kg / 2.5) * 2.5


def logged_at(instance, when):
    """Remember when a row should claim it was written.

    created_at is auto_now_add, so it cannot be set on the way in: bulk_create
    calls pre_save, which stamps the wall clock over whatever the instance held.
    Park the intended value out of reach until `restore_logged_at` puts it back
    for the follow-up bulk_update.
    """
    instance._logged_at = when
    return instance


def restore_logged_at(instances):
    for instance in instances:
        instance.created_at = instance._logged_at
    return instances


def finished_at(instance, when):
    """Remember when a performed exercise should claim it was closed.

    Parked out of reach for the same reason as `logged_at`, but for a different
    one of the two columns the check constraint compares: at bulk_create time
    created_at is still the wall clock, so a block that finished in March would
    be rejected against a created_at of today. It goes in on the bulk_update
    that puts created_at back, where the pair is consistent again.
    """
    instance._finished_at = when
    return instance


def restore_finished_at(instances):
    for instance in instances:
        instance.ended_at = instance._finished_at
    return instances


class Command(BaseCommand):
    help = 'Fill the database with dummy athletes, sessions, sets and reps.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--users', type=int, default=3,
            help='how many athletes to invent, 1–%d (default 3)' % len(ATHLETES),
        )
        parser.add_argument(
            '--weeks', type=int, default=14,
            help='how many weeks of history to walk back (default 14)',
        )
        parser.add_argument(
            '--seed', type=int, default=20260902,
            help='RNG seed; the same seed rebuilds the same database (default 20260902)',
        )
        parser.add_argument(
            '--password', default='gym',
            help='password given to every seeded account (default "gym")',
        )
        parser.add_argument(
            '--append', action='store_true',
            help='keep the seeded users\' existing sessions instead of replacing them',
        )
        parser.add_argument(
            '--no-admin', action='store_true',
            help='skip the %s superuser' % ADMIN_USERNAME,
        )
        parser.add_argument(
            '--force', action='store_true',
            help='seed even when DEBUG is off',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options['force']:
            raise CommandError(
                'DEBUG is off, so this looks like a real database. '
                'Re-run with --force if you meant it.'
            )
        if not 1 <= options['users'] <= len(ATHLETES):
            raise CommandError('--users must be between 1 and %d.' % len(ATHLETES))
        if options['weeks'] < 1:
            raise CommandError('--weeks must be at least 1.')

        self.rng = random.Random(options['seed'])
        athletes = ATHLETES[:options['users']]

        with transaction.atomic():
            users = self._users(athletes, options['password'], options['no_admin'])
            definitions = self._definitions()
            prescriptions = self._prescriptions()

            if not options['append']:
                self._clear()

            counts = {'sessions': 0, 'exercises': 0, 'sets': 0, 'reps': 0}
            for index, (username, _, per_week, strength) in enumerate(athletes):
                grown = self._history(
                    user=users[username],
                    per_week=per_week,
                    strength=strength,
                    weeks=options['weeks'],
                    definitions=definitions,
                    prescriptions=prescriptions,
                    # Only the first athlete is left mid-workout: the API allows
                    # one open session per user, and having several accounts in
                    # that state makes the state harder to reason about, not easier.
                    leave_open=(index == 0),
                )
                for key, value in grown.items():
                    counts[key] += value

        self._report(athletes, options, counts)

    # --- the fixed rows ------------------------------------------------------

    def _users(self, athletes, password, no_admin):
        User = get_user_model()
        users = {}

        if not no_admin:
            admin, created = User.objects.get_or_create(
                username=ADMIN_USERNAME,
                defaults={'email': 'super@user.com', 'is_staff': True, 'is_superuser': True},
            )
            # An existing superuser keeps its password: someone may already be
            # logging in with it, and this command has no business changing that.
            if created:
                admin.set_password(password)
                admin.save(update_fields=['password'])

        for username, first_name, _, _ in athletes:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': first_name,
                    # example.com is reserved for exactly this, so nothing seeded
                    # here can reach a real inbox.
                    'email': '%s@example.com' % username,
                },
            )
            if created:
                user.set_password(password)
                user.save(update_fields=['password'])
            users[username] = user

        return users

    def _definitions(self):
        """The catalogue, keyed by name. Shared reference data: never deleted."""
        definitions = {}
        for name, group, kind, spec in EXERCISES:
            definition, _ = ExerciseDefinition.objects.get_or_create(name=name)
            definitions[name] = (definition, group, kind, spec)
        return definitions

    def _prescriptions(self):
        prescriptions = []
        for index in range(PRESCRIPTION_COUNT):
            pk = uuid.uuid5(PRESCRIPTION_NAMESPACE, str(index))
            prescription, _ = ExercisePrescription.objects.get_or_create(pk=pk)
            prescriptions.append(prescription)
        return prescriptions

    def _clear(self):
        """Drop the dummy athletes' sessions; the cascade takes exercises and sets.

        Only their rows: a database can hold hand-made data alongside this, and
        re-seeding should not cost you the session you were in the middle of
        testing something with. Every athlete in ATHLETES is cleared, not just the
        ones this run will refill, so dropping from --users 5 back to 3 does not
        leave two accounts stranded with a stale history.
        """
        deleted, _ = TrainingSession.objects.filter(
            user__username__in=[username for username, _, _, _ in ATHLETES],
        ).delete()
        if deleted:
            self.stdout.write('Cleared %d existing row(s) for the seeded users.' % deleted)

    # --- the history ---------------------------------------------------------

    def _history(self, user, per_week, strength, weeks, definitions, prescriptions, leave_open):
        rng = self.rng
        now = timezone.now()

        # Per-athlete offsets on the catalogue's notional numbers, drawn once so
        # one user's bench stays their bench across the whole block.
        loads = {name: strength * rng.uniform(0.82, 1.18) for name in definitions}

        sessions, exercises, sets, reps = [], [], [], []

        for week in range(weeks - 1, -1, -1):
            for _ in range(rng.randint(*per_week)):
                day = now - timedelta(
                    weeks=week,
                    days=rng.randint(0, 6),
                    hours=rng.randint(0, 23),
                )
                started_at = day.replace(
                    hour=rng.choice(START_HOURS),
                    minute=rng.choice((0, 5, 10, 15, 20, 30, 40, 45, 50)),
                    second=rng.randint(0, 59),
                    microsecond=0,
                )
                if started_at > now:
                    continue

                type_ = rng.choices(
                    list(SESSION_TYPES),
                    weights=[spec['weight'] for spec in SESSION_TYPES.values()],
                )[0]
                session = TrainingSession(user=user, type=type_, started_at=started_at)
                # Most sessions are logged as they happen, but a few are typed up
                # an hour or two later, which is the whole reason started_at and
                # created_at are separate columns.
                sessions.append(logged_at(session, started_at + (
                    timedelta(minutes=rng.randint(30, 120))
                    if rng.random() < 0.15
                    else timedelta(seconds=rng.randint(0, 90))
                )))

                minute = 0.0
                for name in self._pick(type_, definitions, rng):
                    definition, _, kind, spec = definitions[name]
                    performed = PerformedExercise(
                        training_session=session,
                        exercise_definition=definition,
                        # Most logged work is off-plan; a minority follows one.
                        exercise_prescription=(
                            rng.choice(prescriptions) if rng.random() < 0.2 else None
                        ),
                    )
                    minute += rng.uniform(0.5, 3)
                    exercises.append(
                        logged_at(performed, started_at + timedelta(minutes=minute))
                    )

                    for performed_set, span in self._sets(kind, spec, loads[name], week, weeks, rng):
                        performed_set.performed_exercise = performed
                        minute += span
                        sets.append(
                            logged_at(performed_set, started_at + timedelta(minutes=minute))
                        )
                        # A rep row per rep, which is what the schema asks for and
                        # what makes the per-rep screens have anything to render.
                        for index in range(performed_set.reps or 0):
                            reps.append(PerformedRep(
                                performed_set=performed_set,
                                rep_index=index + 1,
                            ))

                    # Seeded work is finished work: a null ended_at reads as "in
                    # progress", and the API refuses a new exercise while one is
                    # open, so a history of open blocks would make the app
                    # unusable rather than just look wrong. `minute` has not moved
                    # since the last set, so this is that set's stamp, falling
                    # back to the exercise's own -- the rule migration 0005 used
                    # to close the history that already existed.
                    finished_at(performed, started_at + timedelta(minutes=minute))

                # The last session of the densest athlete is still running; every
                # other one finished when its work did.
                session.ended_at = started_at + timedelta(
                    minutes=math.ceil(minute) + rng.randint(2, 10)
                )

        if not sessions:
            return {'sessions': 0, 'exercises': 0, 'sets': 0, 'reps': 0}

        sessions.sort(key=lambda session: session.started_at)
        if leave_open:
            # The session is what is left in progress, not an exercise inside it:
            # every seeded block is closed, so the app opens on the chooser with
            # the session's finished work behind it, and End session works.
            open_session = sessions[-1]
            # Only if nobody else already holds the one open slot — with --append
            # there may be a session in progress from a previous run.
            if not TrainingSession.objects.filter(user=user, ended_at__isnull=True).exists():
                open_session.ended_at = None

        TrainingSession.objects.bulk_create(sessions)
        PerformedExercise.objects.bulk_create(exercises)
        PerformedSet.objects.bulk_create(sets)
        PerformedRep.objects.bulk_create(reps, batch_size=2000)

        # Put the intended created_at back over the wall clock bulk_create just
        # stamped, and write it. This matters beyond cosmetics: created_at is the
        # order of exercises within a session and of sets within an exercise, and
        # a whole seeded history sharing one timestamp has no order at all. The
        # exercises' ended_at rides along in the same pass, for the reason
        # `finished_at` gives.
        restore_finished_at(exercises)
        for model, rows, fields in (
            (TrainingSession, sessions, ['created_at']),
            (PerformedExercise, exercises, ['created_at', 'ended_at']),
            (PerformedSet, sets, ['created_at']),
        ):
            model.objects.bulk_update(restore_logged_at(rows), fields, batch_size=500)

        return {
            'sessions': len(sessions),
            'exercises': len(exercises),
            'sets': len(sets),
            'reps': len(reps),
        }

    def _pick(self, type_, definitions, rng):
        """Distinct movements for one session, in the order they were worked."""
        spec = SESSION_TYPES[type_]
        pool = [
            name for name, (_, group, _, _) in definitions.items()
            if group in spec['groups']
        ]
        wanted = min(rng.randint(*spec['exercises']), len(pool))
        chosen = rng.sample(pool, wanted)
        if type_ == 'mixed':
            return chosen
        # Compounds first, accessories after, the way the session was actually run.
        return sorted(chosen, key=lambda name: -_ORDER.get(name, 0))

    def _sets(self, kind, spec, load, week, weeks, rng):
        """Yield (set, minutes it took) pairs for one movement.

        `week` counts backwards from the start of the block, so subtracting it
        from `weeks` gives how far into the block this session sits — which is
        what turns a flat log into one where the bar gets heavier.
        """
        progress = weeks - 1 - week

        if kind in ('distance', 'duration'):
            # One continuous effort, not a set scheme.
            performed_set = PerformedSet(rpe=round(rng.uniform(5.5, 9.0), 1))
            if kind == 'distance':
                metres = rng.randint(*spec['metres'])
                metres -= metres % 100
                pace = rng.uniform(*spec['pace_s_km'])
                # A slow drift toward faster paces over the block.
                pace *= 1 - 0.004 * progress
                performed_set.distance_m = metres
                performed_set.duration_s = int(metres / 1000 * pace)
            else:
                performed_set.duration_s = rng.randint(*spec['seconds'])
            yield performed_set, performed_set.duration_s / 60 + rng.uniform(1, 4)
            return

        count = rng.randint(3, 5)
        low, high = spec['reps']

        if kind == 'bodyweight':
            top = rng.randint(low, high) + progress // 4
            for index in range(count):
                yield PerformedSet(
                    # Reps fall away as the sets pile up, but nobody logs a set of
                    # one pull-up and calls it training.
                    reps=max(2, top - index // 2 - (1 if rng.random() < 0.35 else 0)),
                    rpe=round(min(10, 6.5 + index * 0.7 + rng.uniform(-0.3, 0.5)), 1),
                ), rng.uniform(1.5, 3.5)
            return

        # Loaded. The working weight climbs with the block and wobbles a little
        # week to week, because nobody's log is a straight line.
        working = spec['base_kg'] * load + spec['weekly_kg'] * progress
        working *= rng.uniform(0.96, 1.04)
        for index in range(count):
            # Ramping up to the top set, then holding it.
            ratio = (0.80, 0.90, 1.0, 1.0, 0.95)[index]
            yield PerformedSet(
                weight_kg=max(2.5, to_2_5(working * ratio)),
                reps=max(1, rng.randint(low, high) - (index // 2)),
                rpe=round(min(10, 6.0 + index * 0.8 + rng.uniform(-0.4, 0.6)), 1),
            ), rng.uniform(2, 4.5)

    # --- output --------------------------------------------------------------

    def _report(self, athletes, options, counts):
        write = self.stdout.write
        write(self.style.SUCCESS('Seeded %d sessions, %d exercises, %d sets, %d reps.' % (
            counts['sessions'], counts['exercises'], counts['sets'], counts['reps'],
        )))
        write('')
        write('  %d weeks of history, seed %d.' % (options['weeks'], options['seed']))
        open_session = (
            TrainingSession.objects
            .filter(user__username__in=[username for username, _, _, _ in athletes])
            .filter(ended_at__isnull=True)
            .select_related('user')
            .first()
        )
        if open_session is not None:
            write('  %s is mid-session, so /training-sessions/current has something '
                  'to return.' % open_session.user.username)
        write('')
        write('  log in with:')
        if not options['no_admin']:
            write('    %-10s %s   (admin)' % (ADMIN_USERNAME, options['password']))
        for username, _, _, _ in athletes:
            write('    %-10s %s' % (username, options['password']))
        write('')
        write('  (passwords are only set on accounts this command creates)')


# Roughly the order these come up in a session: the heavy compounds while you
# are fresh, the small stuff at the end.
_ORDER = {
    'squats': 10, 'deadlift': 10, 'front squat': 9, 'bench press': 9,
    'overhead press': 8, 'romanian deadlift': 8, 'barbell row': 7, 'pull ups': 7,
    'incline dumbbell press': 6, 'dips': 6, 'leg press': 5, 'hip thrust': 5,
    'lat pulldown': 4, 'seated cable row': 4, 'walking lunge': 4,
    'barbell curl': 3, 'cable tricep pushdown': 3, 'dumbbell lateral raise': 2,
    'face pull': 2, 'seated calf raise': 2, 'hanging leg raise': 1,
}
