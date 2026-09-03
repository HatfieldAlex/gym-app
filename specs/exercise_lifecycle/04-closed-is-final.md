# 04 — Closed is final

**Goal:** once an exercise is logged, it is logged. The API refuses every write
to it and to its sets, and the interface stops offering controls that would now
fail (E6).

Backend and one cut to the frontend. Needs 01 and 02; independent of 03, but
built after it because it is the rule that finishes the pair.

This is the deliberate loss of the app's only set-correction path outside an
open exercise. `TrainingSessionDetail.jsx` has never had a PATCH or a DELETE, so
Completed exercises was the only place in the app a logged set could be fixed.
The human chose that: **Django admin and direct DB access are the route for a
genuine mistake.** Do not build a replacement.

## Read first

- [backend/observations/views.py](../../backend/observations/views.py) —
  `PerformedExerciseViewSet` and `PerformedSetViewSet`, and `end`'s use of
  `get_object()`
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
  — `OwnedRelationMixin` and `validate_performed_exercise`, the existing
  write-time re-check this one sits beside
- [backend/observations/tests.py](../../backend/observations/tests.py) —
  `PerformedSetAPITests` (`:261-337`): its fixtures are **open** exercises in
  **open** sessions, so every one of those tests must keep passing untouched
- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — the
  `PerformedExercise` component and the `.completed-exercises` section
- [current_session/05-edit-delete-set.md](../current_session/05-edit-delete-set.md)
  — what is being taken away, and from where
- [00-context.md](00-context.md) — E5, E6

## Build

### 1. One condition, in one place

> A row is writable only while its performed exercise is open **and** its
> session is open.

Both halves, always, as a single helper — a module-level function in `views.py`
or a small mixin, whichever reads better — so there is one definition of
"writable" and not four that drift.

Under E4 a closed session cannot contain an open exercise, so the session half
looks redundant. It is not: rows created before this iteration, and anything
done in the admin, can be in that state, and a rule that has to be reasoned
about before it can be trusted is not the rule. State the reason in a comment.

Refuse with **400** and a `detail`, the way `end/` already refuses an
already-ended session. Not 403 — nothing here is about permission, and the
requester owns the row.

### 2. Where it applies

| Route | Method | Refused when |
|-------|--------|--------------|
| `performed-exercises/` | POST | the target session is closed |
| `performed-exercises/{id}/` | PATCH, PUT, DELETE | the exercise is closed, or its session is |
| `performed-sets/` | POST | the target exercise is closed, or its session is |
| `performed-sets/{id}/` | PATCH, PUT, DELETE | its exercise is closed, or its session is |

Wording: `'That exercise has been logged and cannot be changed.'` for the
exercise-level refusal, `'That session has ended and cannot be changed.'` for
the session-level one. Two messages, because they are two different things for
the reader to do something about.

Put the create-time checks where the ownership re-check already lives — in the
serializers' `validate_training_session` / `validate_performed_exercise` — so a
create is refused by a field error, as an unowned one already is. Put the
update and delete checks in `perform_update` / `perform_destroy`.

**Not in `get_object()`.** `end/` is a POST to a detail route on an exercise
that is about to become closed, and it needs `get_object()` to keep working;
guarding there would either break `end/` or need an exception carved out of it.

`end/` on an already-closed exercise stays a 400 from chunk 01 — one message
for that case, not two.

### 3. What is not locked

- **Reads.** Every GET is untouched: the session detail page, `current/`,
  `history/` and the export all still return closed rows in full.
- **`DELETE training-sessions/{id}/`.** Discarding a whole workout is a
  different act from correcting one inside it, and the stale-session discard is
  out of scope for this iteration. Leave it alone.
- **`PerformedRep`.** It has no serializer, viewset or route, and gains none.
- **The admin.** It is the correction path, by choice. Change nothing in
  `observations/admin.py`.

### 4. Completed exercises stops offering Edit and Delete

Every block under **Completed exercises** is, by definition, closed — the open
one is in the zone. So every Edit and Delete button down there is a control that
now fails.

In `CurrentSession.jsx`, render the completed list's sets **without** row
actions: the `PerformedExercise` component stops being passed `rows`, and
`SetList` / `SetRow` render the set and nothing else. `useSetRows` stays and is
still used by the zone's own list, where the exercise is open and a set can
still be fixed.

Follow through:

- `rows.close('completed')` in `leaveSession` has nothing left to close. Remove
  it rather than leaving a call that means nothing.
- The `scope` argument exists because a set could be on screen twice at once,
  in two lists (`useSetRows`'s doc comment). It cannot any more — the open
  exercise is not in Completed exercises. Keep `scope` anyway; it costs nothing
  and the comment explaining why gets one sentence about what changed.
- `SetRow`'s `rows` prop becoming optional is fine. Do not fork it into two
  components.

### 5. Tests

In `PerformedSetAPITests`, or a new class beside it — build the closed fixtures
explicitly rather than changing the existing ones:

- POST a set into a **closed exercise** → 400, no row created.
- POST a set into an open exercise in a **closed session** → 400.
- PATCH and DELETE a set of a closed exercise → 400 each, and the set is
  unchanged and still there.
- PATCH and DELETE a closed **exercise** → 400 each, and it is still there.
- POST `performed-exercises/` into a closed session → 400.
- Another user's closed row → still **404**, not 400. Ownership is answered
  before state is.
- Every existing test in `PerformedSetAPITests` passes **unchanged** — its rows
  are open exercises in open sessions, which is exactly the state that is still
  writable. `test_correcting_a_set_can_clear_its_weight` and
  `test_deleting_a_set_leaves_its_exercise_behind` are the two that prove the
  lock did not overreach.

## Done when

- A set cannot be created, edited or deleted in a closed exercise: 400 each way,
  nothing changed.
- A closed exercise cannot be edited or deleted: 400, still there.
- A new exercise cannot be created in a closed session: 400.
- Everything inside the **open** exercise still works exactly as it did — log a
  set, edit it, delete it.
- Another user's rows still answer 404.
- `make test` passes, with `PerformedSetAPITests` untouched.
- In `make run`: **Completed exercises shows no Edit and no Delete on any set.**
  The zone's own list still shows both.
- `/training-sessions/{id}` is unchanged and still read-only.

## Do not

- Build a replacement correction path: no unlock, no reopen, no "edit last
  session", no admin-lite screen, no PATCH on `TrainingSessionDetail.jsx`. This
  is a deliberate loss.
- Delete `useSetRows`, `SetRow`'s edit form, or the arming behaviour. They are
  what the open exercise still uses.
- Guard `DELETE training-sessions/{id}/`.
- Guard reads. `history/`'s fixtures deliberately leave `ended_at` null and it
  must keep returning what it returns.
- Put the check in `get_object()`, or anywhere `end/` passes through.
- Answer 403, or raise `PermissionDenied`. 400 with a `detail`, like every other
  refusal in this file.
- Sweep, repair or migrate any existing row (E5 again: this is a rule about
  writing, not a clean-up).
- Change `styles.css`. Chunk 07 tidies what the removed buttons leave behind.

## What the user sees

**A logged exercise is finished, and it looks it.**

- **No Edit and no Delete under Completed exercises.** Once a movement is
  logged, its sets sit there as a record. Nothing on the screen invites a
  correction that would not go through.
- **Corrections still work where they make sense.** Inside the open exercise —
  the one being recorded right now — Edit and Delete are exactly where they
  were, and still work on every set of it.
- **Nothing was lost by mistake.** Every set already logged is still there, on
  every screen it was on before, and in the export.

The trade, stated plainly because the human chose it: **a set logged into the
wrong movement, and left there, cannot be fixed from the app.** Not on the
session page, not in history. The route is Django admin or the database. In
exchange, the workout stops being something that can quietly change after the
fact — which was the whole complaint.
