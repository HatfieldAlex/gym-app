# 01 — Ending an empty session throws it away

**Goal:** `POST training-sessions/{id}/end/` on a session with no
`PerformedExercise` rows deletes the session and answers **204**, instead of
stamping `ended_at` and filing an empty workout in history (S3).

Backend only. No file under `frontend-web/` changes — not one, not even a
comment; chunk 04 owns the one comment that is wrong. The client already handles
a 204 the same way it handles a 200 (S7), so this chunk is visible in the app
without a line of JSX moving.

## Read first

- [backend/observations/views.py](../../backend/observations/views.py) —
  `TrainingSessionViewSet.end` (`:122-155`), the three guards it already has,
  and `PerformedExerciseViewSet.end` (`:285-307`), which is the rule being
  mirrored and should be read line by line before the session's version is
  written
- [backend/observations/tests.py](../../backend/observations/tests.py) —
  `TrainingSessionLifecycleTests` (`:107-264`) and its `start()` /
  `open_exercise()` helpers; `ClosedIsFinalTests` (`:546-711`) and its fixtures
- [frontend-web/src/pages/CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx)
  — `endSession` (`:1592-1608`) and `leaveSession` (`:1580-1584`), to confirm
  for yourself that nothing there needs touching
- [00-context.md](00-context.md) — S2, S3, S4, S7, and "The three guards `end/`
  already has"

## Build

### 1. The fourth guard, and where it goes

In `TrainingSessionViewSet.end`, **after all three existing guards** and
immediately before the stamp:

```python
if not session.performed_exercises.exists():
    session.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
```

`exists()`, on the reverse accessor. **Not a count of sets, not a join through
`performed_sets`, not an annotation** — S2 says why, and a build that finds
itself writing `performed_sets` in this chunk has gone wrong.

The position matters, and a comment should say so in one sentence:

- **After the "already ended" guard**, so `end/` on a session that is already in
  history answers 400 as it always has. Ending is not a way to delete something
  already recorded — that is what Discard is for — and rows in exactly that
  state exist today, until chunk 03 sweeps them.
- **After the "starts in the future" guard**, so a future-dated empty session is
  still refused with 400 rather than deleted. It is refused for a reason that
  has nothing to do with being empty, and this iteration does not change what
  that refusal is.
- The "an exercise is still open" guard cannot fire on an empty session at all —
  an open exercise *is* a `PerformedExercise` row — so the two never meet.

State the whole thing as what it is: **the delete replaces the stamp, so it goes
exactly where the stamp goes.** The three refusals above it are answers about
*when* a session may be closed and they are untouched.

Give `end`'s docstring the second outcome, the way
`PerformedExerciseViewSet.end`'s docstring already carries it: 200 means the
workout is in the log, 204 means there was nothing in it.

### 2. Nothing else in the backend moves

- `perform_create`, `current/`, `get_queryset` and the serializers: untouched.
  No chunk in this iteration touches them (see 00-context, "What was cut, and
  why").
- `DELETE training-sessions/{id}/`: untouched.
- No model change, no migration, no constraint (S4). `backend/docs/schema.dbml`
  comes out byte-identical.

### 3. The one existing test this breaks, and how it is fixed

`test_ending_a_session_closes_it_once` (`tests.py:164-179`) ends a session that
has nothing in it and expects 200. Under this chunk it would get a 204 and a
deleted row, so it has to change — and it changes by **giving the session an
exercise**, not by weakening what it asserts:

- open a block with a set (`self.open_exercise(session_id, with_set=True)`),
  close it through `performedexercise-end`, then end the session;
- every assertion after that stands exactly as written: 200, a non-null
  `ended_at`, a second call refused with 400, the timestamp unmoved, and
  `current/` answering 204 afterwards.

That is the only existing test in the suite that ends an empty session through
the API. The other two that look nearby are fine and **must not be touched**:

- `test_ending_a_session_that_has_not_started_is_400_not_500` (`:211-218`) —
  empty *and* future-dated, and it still gets its 400 because of where the new
  guard sits. If this test fails, the guard is in the wrong place.
- `test_a_session_cannot_end_over_an_open_exercise` (`:181-197`) — its session
  has a block throughout.

Everything in `dataexport`, `settings` and the rest of `observations` builds its
fixtures through the ORM and is unaffected.

### 4. Tests

In `TrainingSessionLifecycleTests`:

- **`test_ending_a_session_with_nothing_in_it_deletes_it`** — start a session,
  `POST end/`, assert **204** with an empty body, the `TrainingSession` row gone
  from the database, and `current/` answering 204 afterwards. *This is the test
  that fails without this chunk.*
- **`test_ending_a_session_with_an_exercise_still_records_it`** — start, open a
  block with a set, close the block, `POST end/`: **200**, `ended_at` not null,
  the row still there and listing on `training-sessions/`. The other half of the
  rule, so a build that deletes too eagerly is caught.
- **`test_ending_a_session_that_already_ended_is_still_refused_when_it_is_empty`**
  — build an empty *ended* session through the ORM (the state chunk 03 sweeps,
  and the state the admin can still produce), `POST end/`: **400**, "already
  ended", and the row **still there**. This pins the guard order down: an empty
  session already in history is not deleted by ending it again.

In `ClosedIsFinalTests`, one regression, with its own fixture rather than by
reusing `cls.closed_session` (which has two exercises on purpose):

- **`test_the_only_exercise_of_a_logged_session_cannot_be_deleted`** — a closed
  session with exactly one closed exercise carrying one set. `DELETE` that
  exercise → **400**, the exercise still there, and the session still holding
  one. `ClosedIsFinalMixin` already gives this; the test exists so that the
  invariant this iteration establishes cannot be quietly undone from the other
  end later.

## Done when

- `POST training-sessions/{id}/end/` on a session with no exercises answers
  **204** with an empty body and the session no longer exists.
- The same call on a session with an exercise answers **200** and stamps
  `ended_at`, exactly as it did before.
- The same call on a session that has already ended answers **400**, empty or
  not, and deletes nothing.
- A future-dated empty session still answers **400**, not 204.
- The last exercise of a logged session still cannot be deleted.
- `make test` passes and reads **182 tests** (178 + four new).
- In `make run`: start a session, log nothing, End → Confirm. The tab returns to
  the Start screen, and **`/training-sessions` does not list the session that
  was just ended.** Start another, log one set, close the exercise, End → it is
  listed with its sets, as always.
- `git diff` touches `backend/observations/views.py` and
  `backend/observations/tests.py` and nothing else.

## Do not

- Count sets. S2. `performed_sets` does not appear anywhere in this chunk.
- Put the new guard before any of the three that exist, or reorder them.
- Answer 400, or a 200 with a body, when a session is empty. It is a 204, like
  its twin one level down.
- Touch `DELETE training-sessions/{id}/`, `current/`, `perform_create`, or any
  serializer. The retrospective-create hole — a hand-written
  `POST training-sessions/` carrying `ended_at` — **stays open, deliberately and
  permanently as far as this iteration is concerned.** The chunk that was going
  to close it was cut; see 00-context, "What was cut, and why". Leaving it open
  is expected and is not a bug in this chunk, so do not close it here and do not
  add a test about it.
- Add a model constraint or a migration (S4).
- Change a single character under `frontend-web/`, including the stale comment
  at `CurrentSession.jsx:2142-2147`. It is wrong, chunk 04 fixes it, and leaving
  it wrong for one chunk is better than two chunks editing the same file.
- Add a warning, a second confirmation, or different wording for the empty case.
- Weaken `test_ending_a_session_closes_it_once` by dropping assertions instead
  of giving its session an exercise.
- Sweep, repair or migrate any existing row. That is chunk 03, and it is
  deliberately a separate, reviewable act.

## What the user sees

**A workout you never actually started stops being a workout you did.**

- **Nothing changes about ending a real session.** Two taps — End session, then
  Confirm on "End this session?" — and the tab returns to the Start screen with
  the workout filed in history, its start time, end time and every set attached.
  Same button, same question, same wording, same wait.
- **Ending a session with nothing logged looks identical and keeps nothing.**
  The confirmation reads exactly the same, the tab returns to the Start screen
  exactly the same, and there is no warning, no second question and no message.
  The difference is only visible afterwards: **`/training-sessions` no longer
  gains an empty row.** Tapping Start by accident, or on a session that turned
  into a rest day, now costs nothing at all.
- **Nothing already in history moves.** Empty sessions recorded before today are
  still listed after this chunk — the sweep is chunk 03 — and ending them again
  is refused, as it always was.
