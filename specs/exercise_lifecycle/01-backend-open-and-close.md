# 01 — Backend: an exercise that can be open, and closed

**Goal:** give `PerformedExercise` the same open/closed bit `TrainingSession`
already has, and one path that closes it. Nothing is enforced yet and nothing on
screen changes — this chunk only makes the state *storable* and *closable*.

Backend only. No file under `frontend-web/` changes.

The three rules that use this column (E3, E4, E6) land in chunks 03 and 04,
**after** the client has been taught to obey them in 02. Turning them on here
would break the app the moment a second movement was recorded, because today's
`logSet` creates a `PerformedExercise` and never closes it.

## Read first

- [backend/observations/models.py](../../backend/observations/models.py) —
  `TrainingSession` (`:8-52`) is the whole pattern: the nullable timestamp, its
  help text, and the `trainsess_ended_after_started` constraint
- [backend/observations/views.py](../../backend/observations/views.py) —
  `TrainingSessionViewSet.end` (`:91-110`), the action being mirrored
- [backend/observations/serializers.py](../../backend/observations/serializers.py) —
  `PerformedExerciseSerializer` and the two that inherit from it
- [backend/observations/tests.py](../../backend/observations/tests.py) —
  `TrainingSessionLifecycleTests` for the shape to match; and
  `PerformedExerciseAPITests` (`:226-258`) and `PerformedSetAPITests`
  (`:261-337`), which create rows with `training_session` +
  `exercise_definition` and nothing else
- [backend/dataexport/export.py](../../backend/dataexport/export.py) —
  `PERFORMED_EXERCISES_HEADER` and `performed_exercise_rows` (`:110-130`)
- [backend/dataexport/tests.py](../../backend/dataexport/tests.py) — the
  `HEADERS` dict at `:44-71`, asserted by `test_every_file_carries_its_exact_header`
  and by `CsvFileSpecTests`
- [00-context.md](00-context.md) — E1, E5, E12, and the mirroring table

## Build

### 1. The column (E1)

On `PerformedExercise`, immediately after `created_at`:

```python
ended_at = models.DateTimeField(
    null=True,
    blank=True,
    help_text='null while the exercise is being recorded',
)
```

Word the help text as the session's is — "null while the session is in
progress" — because it is the same idea one level down.

Add to `Meta.constraints`, mirroring `trainsess_ended_after_started`:

```
name='perfex_ended_after_created'
condition=Q(ended_at__isnull=True) | Q(ended_at__gte=F('created_at'))
```

An open row passes; a closed one may not have finished before it began. It is
the session's guard at the exercise's scale, and it is what stops a bad admin
edit or a clock jump from producing a block that ended before it started.

No index. `ended_at` is only ever read alongside `training_session`, which
`perfex_session_created_idx` already leads on, and the whole table is one
athlete's training log.

### 2. The migration, and what history gets (E12)

`makemigrations observations` then `migrate`. It contains the `AddField`, one
`RunPython`, and the `AddConstraint` — **in that order**, so the backfill runs
before the constraint it has to satisfy. Reverse is `migrations.RunPython.noop`.

Every existing row is history and is finished. `ended_at` defaults to NULL,
which would read as "open", so every row is stamped:

> `ended_at` = the `created_at` of the **last set logged into it**, falling back
> to the exercise's own `created_at` when it has no sets.

One `UPDATE`, with a `Subquery` over `PerformedSet` ordered by `-created_at`
wrapped in `Coalesce(…, F('created_at'))`. Both branches satisfy the constraint:
a set is always created after its exercise.

Do it this way rather than the two easier answers, and say so in a comment:

- **not `timezone.now()`** — the whole training log would claim to have finished
  during the deploy, the same mistake `started_at`'s backfill was written to
  avoid (`current_session/01-backend-lifecycle.md` step 4);
- **not the exercise's `created_at` alone** — a block that took twenty minutes
  would record itself as instantaneous, and `created_at` is already that answer
  for the blocks that have nothing better.

**The migration deletes nothing.** E5 governs the closing path only. Rows with
no sets exist in the database today, they stay, and
`dataexport.tests.test_a_performed_exercise_with_no_sets_is_in_the_table_and_not_the_log`
still passes because of it.

A user mid-workout when the migration runs loses nothing: their held exercise
was never a row (A10), so there is nothing to leave open.

### 3. The serializer

Add `ended_at` to `PerformedExerciseSerializer.Meta.fields` and to
`read_only_fields`. Both `PerformedExerciseDetailSerializer` and
`PerformedExerciseHistorySerializer` inherit it, so `current/`, the session
detail page and `history/` all carry it with no further change.

Read-only **throughout**, unlike the session's, which is writable on create for
backdated workouts. There is no retrospective-entry path for an exercise and no
chunk here builds one; `end/` is the only thing that stamps it (E1).

### 4. `POST /api/v1/performed-exercises/{id}/end/`

An `@action(detail=True, methods=['post'])` on `PerformedExerciseViewSet`, named
`api:performedexercise-end` by the router. It is the twin of
`training-sessions/{id}/end/` and the only path that stamps `ended_at`.

| The row | The answer |
|---------|------------|
| open, **with** at least one set | `ended_at = timezone.now()`, `save(update_fields=['ended_at'])`, **200** with the serialized exercise |
| open, **no sets** (E5) | `delete()` the row, **204** with an empty body |
| already closed (`ended_at` is not None) | **400**, `{'detail': 'This exercise has already been logged.'}` |

`get_object()` does the scoping, as everywhere else in this file: another user's
row is not in the queryset and 404s.

The two success answers are deliberately different shapes, because they are
different outcomes and the client has to tell them apart: 200 means "this block
is now in your log", 204 means "there was nothing in it, so there is no block".
204 is the same "nothing to give you" the session's `current/` already uses.

Deleting cascades to nothing — an exercise with no sets has no sets to cascade
to — and it is the only delete in this iteration that happens on the user's
behalf. Say so in a comment.

### 5. The CSV export

`tables/performed_exercises.csv` is the raw-table half of the export and exists
so the database can be rebuilt exactly, so a new column belongs in it:

- `PERFORMED_EXERCISES_HEADER` gains `'ended_at'` as its **last** entry, after
  `created_at`;
- `performed_exercise_rows` yields `row.ended_at` in the same position;
- `dataexport/tests.py` `HEADERS['tables/performed_exercises.csv']` gains it too.

Appending rather than inserting keeps every existing column at the position a
saved spreadsheet expects.

`workouts.csv` is **unchanged**. It is one row per set and already carries
`session_started_at` and `session_ended_at`; a set only exists inside a block
that was logged, so an exercise's `ended_at` adds a column that is never null
and never interesting there. `training_sessions.csv` is unchanged too.

`cell()` already renders `None` as `''` and a datetime with microseconds, so an
open exercise exports as an empty cell exactly as an open session does — which
`test_an_open_session_has_no_end` is the existing model for.

### 6. The DBML

`backend/docs/schema.dbml` is **generated**, not hand-written: `schemadocs`
rewrites it on `post_migrate` (`schemadocs/apps.py`). Running `migrate` in step
2 regenerates it. Do not edit it by hand; confirm it instead:

    python manage.py export_dbml --check

It must report up to date, and the `observations_performedexercise` table must
have gained `ended_at` and the `perfex_ended_after_created` check in its `Note`.

### 7. Tests

In `observations/tests.py`, a new `PerformedExerciseLifecycleTests`, written the
way `TrainingSessionLifecycleTests` is:

- Anonymous → 403.
- Another user's exercise → 404 on `end/`.
- A new `POST performed-exercises/` comes back with `ended_at: null` — creating
  one opens it.
- `end/` on an exercise with a set → 200, `ended_at` non-null, the row still
  there, its sets still there.
- `end/` on an exercise with **no** sets → 204, empty body, and
  `PerformedExercise.objects.filter(pk=…).exists()` is False (E5).
- `end/` twice on a set-bearing exercise → 400 the second time, and `ended_at`
  is **not** moved.
- `PATCH` cannot set `ended_at` — mirror `test_patch_cannot_close_a_session`:
  the PATCH succeeds and the column is still null.
- `ended_at` is present on the nested exercises in
  `training-sessions/current/`, in `training-sessions/{id}/`, and in
  `performed-exercises/history/`.
- A migration test is not needed, but assert the constraint holds: saving a row
  with `ended_at` before `created_at` raises `IntegrityError`.

The whole existing suite must pass **untouched** apart from the one `HEADERS`
line in `dataexport/tests.py`. `PerformedExerciseAPITests` and
`PerformedSetAPITests` create rows with no `ended_at`, which is now "open" —
still legal, because nothing is enforced until 03 and 04.

## Done when

- `python manage.py makemigrations --check` reports nothing outstanding.
- `POST performed-exercises/` returns 201 with `ended_at: null`.
- `POST performed-exercises/{id}/end/` on a set-bearing exercise returns 200
  with a non-null `ended_at`; a second call returns 400.
- `POST performed-exercises/{id}/end/` on an empty exercise returns 204 and the
  row is gone.
- `training-sessions/current/` carries `ended_at` on every nested exercise.
- Every `PerformedExercise` that existed before the migration has a non-null
  `ended_at`, and none of them was deleted.
- `python manage.py export_dbml --check` reports up to date.
- `make test` passes.
- The export zip still holds nine files;
  `tables/performed_exercises.csv` has six columns, `ended_at` last.

## Do not

- Enforce anything. One open at a time, "no ending a session over an open
  exercise" and "closed is final" are chunks 03 and 04, and adding them here
  breaks the running app.
- Add a `started_at` to `PerformedExercise`. `created_at` is when the block
  began — it is `auto_now_add` and it is already the ordering within the session
  (`models.py:87`). Only the ending was missing.
- Add a `status` field, a boolean, or any second way of saying `ended_at IS NULL`.
- Delete, sweep or repair any existing row. E5 is a rule about closing, not a
  clean-up.
- Change `history/` — not its queryset, its ordering, its serializer or its
  parameters. It is untouched by this iteration, and its fixtures deliberately
  leave `ended_at` null.
- Change `workouts.csv`, `tables/training_sessions.csv` or the order of the
  existing columns in `tables/performed_exercises.csv`.
- Hand-edit `docs/schema.dbml`.
- Touch `TrainingSessionViewSet`, `PerformedSetViewSet`, or anything under
  `frontend-web/`.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes, so every
screen behaves exactly as it did.

Two things that could have been visible and deliberately are not:

- **History looks identical.** The backfill stamps `ended_at` on every existing
  row from its last set, so no past workout reads as still in progress and
  nothing in `/training-sessions` moves or re-dates.
- **Nothing is deleted.** A block with no sets recorded months ago is still in
  the export exactly where it was.

The one thing worth knowing for the chunk after this: from here until chunk 02
lands, every `PerformedExercise` the running app creates is created **open** and
nothing ever closes it. That is expected, it is invisible on screen, and it is
what chunk 02 exists to fix.
