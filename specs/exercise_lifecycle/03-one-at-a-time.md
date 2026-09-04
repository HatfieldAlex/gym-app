# 03 — One at a time, and no ending over an open one

**Goal:** move two of the rules off the interface and onto the API. One exercise
open at a time per session (E3), and no ending a session while one is open (E4).

Backend only. No file under `frontend-web/` changes.

Chunk 02 already made the client obey both, so switching them on is invisible:
these are the rules a user should never meet. They are here so that a second
tab, a stale page, a hand-written `curl` or a client bug cannot produce a
session with two blocks in flight or a closed session with a block that can
never be closed.

## Read first

- [backend/observations/views.py](../../backend/observations/views.py) —
  `TrainingSessionViewSet.perform_create` (`:65-81`), the refusal being mirrored
  down a level, and `.end` (`:91-110`), which grows a second guard
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
  — `OwnedRelationMixin`, and why the ownership re-check lives on the way in
- [backend/observations/tests.py](../../backend/observations/tests.py) —
  `test_only_one_session_may_be_open_at_a_time` (`:138`) and
  `test_ending_a_session_closes_it_once` (`:153`), the two tests to write twins of
- [00-context.md](00-context.md) — E3, E4, and the mirroring table

## Build

### 1. One exercise open at a time (E3)

In `PerformedExerciseViewSet.perform_create`, before saving, refuse a create
into a session that already has an open exercise:

```python
open_exercise = PerformedExercise.objects.filter(
    training_session=serializer.validated_data['training_session'],
    ended_at__isnull=True,
).first()
```

Raise DRF's `ValidationError` with the same body shape the session's refusal
uses, so a lost client can recover by loading what is already open rather than
being stuck:

```
{'detail': 'An exercise is already open in this session.',
 'open_exercise': str(open_exercise.pk)}
```

The session comes out of `validated_data`, not out of the request body, so it
has already been through `validate_training_session` and is known to belong to
the requester. Ownership stays the serializer's job; do not re-do it here.

Scoped to that one session: two different sessions are not a case that can
arise, because a user can only have one session open at a time (A2) — but the
filter is by session anyway, because that is what the rule actually says.

### 2. A session cannot end over an open exercise (E4)

In `TrainingSessionViewSet.end`, alongside the two guards it already has —
already-ended, and starts-in-the-future — add a third, and put it **first**,
because it is the one a user could plausibly hit:

```python
open_exercise = session.performed_exercises.filter(ended_at__isnull=True).first()
```

→ **400**, `{'detail': 'Finish the exercise you are recording before ending the
session.', 'open_exercise': str(open_exercise.pk)}`.

Wording matters here: this is the one refusal in the pair that a person might
actually read, so it says what to do rather than what went wrong.

`DELETE training-sessions/{id}/` — discarding a workout — is **not** guarded.
Throwing the whole session away is a different act from closing it, the cascade
takes the open exercise with it, and the stale-session discard is out of scope.

### 3. Tests

In `PerformedExerciseLifecycleTests` (chunk 01's class):

- A second `POST performed-exercises/` into a session with one open → **400**,
  and the body carries `open_exercise` = the open row's id.
- Closing the first, then posting again → **201**. The loop works.
- A create into a session whose only exercise is **closed** → **201** (E7: that
  is a second block, and it is allowed).
- A create into *another user's* session is still 400 for the ownership reason,
  not this one — `test_cannot_attach_to_another_users_session` (`:247`) must
  pass unchanged, and must not start passing for the wrong reason.

In `TrainingSessionLifecycleTests`:

- `end/` on a session with an open exercise → **400**, `open_exercise` in the
  body, and `session.ended_at` still null afterwards.
- Closing the exercise, then `end/` → **200**. Both orders of the same two acts,
  one of which is refused.
- `end/` on a session whose exercises are all closed → 200, as today.
- `DELETE` on a session with an open exercise → **204**, and the exercise is
  gone with it.

The existing suite passes untouched. `PerformedSetAPITests` and the `history/`
fixtures build their rows through the ORM, which these guards do not sit on;
`PerformedExerciseAPITests` never creates two exercises in one session over the
API.

## Done when

- `POST performed-exercises/` twice into one session, without closing the first,
  returns 201 then 400 with `open_exercise` naming the first.
- Closing the first and posting again returns 201.
- `POST training-sessions/{id}/end/` with an exercise open returns 400 and the
  session stays open; closing the exercise and calling it again returns 200.
- `DELETE training-sessions/{id}/` still works with an exercise open.
- `make test` passes.
- **The app behaves identically.** Working through a whole session in
  `make run` — start, three movements, end — never surfaces either refusal,
  because chunk 02 already keeps both rules.

## Do not

- Add a way to reopen, steal, or force-close an open exercise. There is no
  reopening (E7), and `end/` is the only path that closes one.
- Guard `DELETE` on a training session, or add any check to `discardSession`'s
  path.
- Enforce "closed is final" here — chunk 04. This chunk is about what may be
  *open*, not about what may be *changed*.
- Reject a create into a **closed** session here either; that is also chunk 04,
  and it belongs with the rest of the locking.
- Move ownership checking out of the serializer, or widen what any queryset can
  reach.
- Change `history/`, `current/`, the serializers, or any model.
- Change anything under `frontend-web/`. The client already obeys; if it
  suddenly needs a fix, chunk 02 was built wrong and that is where the fix goes.

## What the user sees

**Nothing, if everything is working.** Both refusals are invisible from inside
the app: chunk 02 already made the interface unable to ask for either. That is
the intended outcome, not a shortfall — the UI and the API now enforce the same
rule, and the API is the one that holds when the UI is stale, duplicated across
two tabs, or wrong.

The one place it has any effect is the one it was written for: an old tab left
open on the session page from before an exercise was started, where **End
session** is still on screen. Tapping it now fails — the page shows its existing
"Could not end the session. Please try again." line and the session stays open —
instead of silently closing a session over a block that could then never be
finished or corrected. Reloading that tab lands the user back inside the
exercise (chunk 02), where **Log exercise** is waiting.

The server's own wording ("Finish the exercise you are recording before ending
the session") is in the response body for anyone reading it, but no chunk here
puts a server `detail` on screen: the page has said "Could not end the session"
since `current_session/06`, and changing how this app surfaces API errors is a
different iteration.

---

## ADDED AFTER THIS SPEC WAS WRITTEN — the seeder

**Not specified above. Decided when chunk 03 was handed over, and built as part
of it.** Recorded here so the diff and the spec tell the same story.

`backend/observations/management/commands/seed_dummy_data.py` has never stamped
`PerformedExercise.ended_at` — the column did not exist until chunk 01, and no
chunk went back for the seeder. Nothing above it made that fatal: an open block
merely read oddly. **This chunk makes it fatal.** With E3 switched on, every one
of the ~560 exercises `make dummy-data` writes is open, so the first movement a
reviewer picks is refused, and `alex`'s open session can never be ended under
E4 either. The app would be unusable for anyone reviewing against seeded data —
which is how it is reviewed.

What was built:

- Each seeded exercise is closed at **its last set's timestamp**, falling back
  to its own `created_at` when it has none — the same rule migration 0005 used
  to close the history that already existed (E12), so seeded and migrated rows
  agree.
- `ended_at` goes in on the follow-up `bulk_update`, not at `bulk_create`, for
  the same reason `created_at` does: `perfex_ended_after_created` compares the
  two columns, and at insert time `created_at` is still the wall clock, so a
  March block would be rejected against a `created_at` of today. New helpers
  `finished_at` / `restore_finished_at` mirror the existing `logged_at` pair.
- **The session left open keeps no open exercise.** Judgement call: the seeder's
  stated reason for leaving one session open is that `current/` has something to
  return, and closing every block means the app opens on the chooser with the
  session's finished work behind it and **End session** working. An open block
  would drop a reviewer inside an exercise they did not pick, before they had
  done anything — a state they can reach in one tap if they want it.

Verified by re-running `make dummy-data`: 563 exercises, none open, none whose
`ended_at` differs from its last set (or its own `created_at`), one open session
containing five closed blocks — and the whole loop driven over the API as
`alex` against that data, in the order the "Done when" list gives.
