# 03 — Sweeping the empty sessions already recorded

**Goal:** one data migration that deletes every `TrainingSession` with no
`PerformedExercise` rows, so that after this iteration the rule is true of the
whole database and not only of what happens from now on (S6).

Backend only, one new file, no test. Needs 01: sweeping before the rule is in
would leave the app free to make more empties the moment the sweep finished.
(Chunk 02, which would have shut the retrospective-create door as well, was cut
from this iteration — see 00-context, "What was cut, and why". That door stays
open, and this chunk does nothing about it.)

> **This chunk destroys data and cannot be undone.** It is the one chunk in the
> iteration that does. Read the next section before writing it, and read it
> again at review time.

## What it deletes, and what the human chose

**Every session with no exercises. Open ones included.** Not only the ended
ones.

The human was shown the narrower alternative — sweep only sessions with
`ended_at` set, leaving open ones alone — and was shown the risk that comes with
the wider one: **a session that is open on a phone at the moment the migration
runs, with nothing logged into it yet, disappears from under its user.** The
next request that page makes gets a 404 or a 204 from `current/`, and the tab
falls back to the Start screen with no explanation. In this app, deployed for
one person, that is a few seconds of confusion at worst.

They chose the full sweep anyway. **Build what was chosen.** Do not narrow it,
do not add a flag, do not add a prompt, do not ask again.

The reverse operation is `RunPython.noop`, because deleted rows do not come
back. `migrate observations 0005` will therefore succeed and restore nothing —
which is honest, and is the same shape `0005`'s own backfill uses.

## Read first

- [backend/observations/migrations/0005_performedexercise_ended_at_and_more.py](../../backend/observations/migrations/0005_performedexercise_ended_at_and_more.py)
  — the house pattern for a data migration: a module-level function whose
  docstring argues for the choice it makes, `apps.get_model`, and
  `RunPython(fn, migrations.RunPython.noop)`
- [backend/observations/models.py](../../backend/observations/models.py) — the
  `performed_exercises` reverse accessor and the cascade from
  `TrainingSession` down
- [00-context.md](00-context.md) — S2, S4, S6, and E5's scoping sentence, which
  this chunk is the one deliberate exception to

## Build

### 1. The migration

`backend/observations/migrations/0006_delete_empty_sessions.py`, generated with
`manage.py makemigrations observations --empty -n delete_empty_sessions` and
then written by hand. It depends on `0005` and contains exactly one operation.

```python
def delete_empty_sessions(apps, schema_editor):
    TrainingSession = apps.get_model('observations', 'TrainingSession')
    TrainingSession.objects.filter(performed_exercises__isnull=True).delete()
```

- **Exercise rows, not sets** (S2). `performed_exercises`, never
  `performed_sets`.
- **No user filter, no date filter, no `ended_at` filter.** Every user, every
  date, open and closed alike (S6).
- **The cascade reaches nothing.** A session with no exercises has no sets and
  no reps under it, so the only rows this deletes are the sessions themselves.
- `apps.get_model`, not an import of the real model, so the migration keeps
  working when `models.py` moves on.
- If the ORM objects to `.delete()` across the reverse join on any backend, the
  same set is
  `TrainingSession.objects.exclude(pk__in=PerformedExercise.objects.values('training_session'))`.
  Prefer the first form; it says what it means.

The docstring carries the reasoning, as `0005`'s does: what is deleted, that
open sessions are included, that the human chose that over the ended-only sweep
knowing an open session could vanish from a phone mid-use, and that the reverse
is a `noop` because this cannot be undone.

### 2. Silent, and one-shot

No `print`, no `stdout`, no logging — `0005` has none either, and a migration is
not a management command. No progress, no count, no summary.

Nothing else in the repo changes: no model, no view, no serializer, no test, no
`schema.dbml`. The migration is the entire diff.

### 3. No test

`make test` builds a fresh database, so there is nothing for this migration to
find and a test of it would be a test of Django's ORM. `0005`'s backfill has no
test for the same reason. The proof is the verification below, run by hand
against a database that actually has empty sessions in it.

**Do not add a migration-replay test**, and do not add a management command
alongside it.

## Done when

- `make migrate` applies `0006` cleanly on this worktree's database (which
  `make migrate` will create from scratch the first time, and where the sweep
  correctly finds nothing).
- Against a database that has some, it removes exactly the right rows.
  A hand check, from `backend/`, before and after:

  ```
  manage.py shell -c "from observations.models import TrainingSession as T; \
    print(T.objects.filter(performed_exercises__isnull=True).count(), T.objects.count())"
  ```

  Seed with `make dummy-data` (every seeded session has exercises), then create
  two empties by hand in `manage.py shell` — one ended, one open — plus leave at
  least one seeded session alone. After `make migrate`: both empties gone, the
  count of seeded sessions unchanged, and **no `PerformedExercise` or
  `PerformedSet` row lost** (count those before and after too — that is the
  assertion that catches a cascade going wrong).
- `manage.py migrate observations 0005` runs without error and restores nothing.
- `manage.py makemigrations --check --dry-run` reports no missing migrations —
  this chunk changes no model, so it must not want one.
- `make test` still passes and still reads **182 tests**, unchanged from
  chunk 01.
- `git diff` shows one new file under `backend/observations/migrations/` and
  nothing else.

## Do not

- Narrow the sweep to ended sessions, or to one user, or to sessions older than
  some date. S6.
- Add a `--dry-run`, a confirmation prompt, an environment-variable escape
  hatch, or a management command wrapper. It is a migration; it runs when
  migrations run.
- Write a reverse that recreates anything.
- Count sets (S2).
- Add a constraint or a trigger to stop empties at the database level (S4). This
  chunk cleans up what exists; chunk 01 is what stops new ones being ended into
  history.
- Touch `views.py`, `serializers.py`, `models.py`, `tests.py`, the seeder, the
  export, or anything under `frontend-web/`.
- Edit `0005` or any earlier migration.
- Run it against production. Deploying is the human's, separately, and is not
  part of this iteration.

## What the user sees

**The empty rows in history are gone.**

- **`/training-sessions` stops listing workouts with nothing in them.** Every
  session left in the list has at least one exercise under it, so tapping one
  always lands on a detail page with something to read.
- **Nothing that had anything logged in it is touched.** Every set, every rep
  and every exercise ever recorded is still there, on every screen and in the
  CSV export.
- **A session open right now, with nothing logged into it, is included.** If the
  app happens to be open on that session when this runs, the next thing it does
  returns the tab to the Start screen. That is the trade the human accepted for
  a history with no empty rows anywhere in it.

After this chunk the app's rule is true of everything recorded so far, not just
of what happens next: **no session anywhere has nothing in it.** It stays that
way for everything the app itself does; the one path that could still make an
empty finished session is a hand-written request nothing sends, parked for a
later iteration (00-context, "What was cut, and why").
