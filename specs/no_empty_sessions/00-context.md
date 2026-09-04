# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## The intent

**A training session never lands in history without at least one exercise in
it.**

A session is still *started* empty. That does not change and is not up for
discussion — an empty open session is how the app works: you tap Start before
you know what you are going to do. What changes is the moment that session would
stop being a live thing and become a permanent record. At that moment it must
have something in it, and if it does not, it is thrown away rather than filed.

The precedent is one level down and already built. `PerformedExerciseViewSet.end`
([views.py:285-307](../../backend/observations/views.py)) closes a movement by
stamping `ended_at` — unless nobody logged a set into it, in which case it
deletes the row and answers 204, because picking the wrong movement should cost
nothing. This iteration is that same rule at the session's scale: tapping Start
at the wrong moment should cost nothing either.

Two things carry it:

1. a fourth guard in `TrainingSessionViewSet.end` — chunk 01;
2. a one-off sweep of the sessions already recorded — chunk 03.

Chunk 04 corrects the two places that currently say the opposite in writing.

**The rule is enforced at `end/` only.** A second door — a hand-written
`POST training-sessions/` carrying `ended_at` — was going to be shut in a chunk
02 that has since been cut from this iteration. It stays open. Read "What was
cut, and why" below before building anything, and do not close it here.

## What already exists — read it before changing it

Nothing here is rebuilt. The whole of this iteration is one guard's worth of
code, a migration and a comment.

| What | Where, today |
|------|--------------|
| The session model, `ended_at` null = open | [models.py:8-52](../../backend/observations/models.py) |
| `POST training-sessions/{id}/end/` and its three guards | [views.py:122-155](../../backend/observations/views.py) |
| `POST training-sessions/` and the retrospective branch — **not touched by this iteration** | `TrainingSessionViewSet.perform_create`, [views.py:96-113](../../backend/observations/views.py) |
| `GET training-sessions/current/`, 204 when none | [views.py:113-120](../../backend/observations/views.py) |
| **The rule being mirrored** — close an exercise, delete it if empty | `PerformedExerciseViewSet.end`, [views.py:285-307](../../backend/observations/views.py) |
| `ended_at` writable on create, read-only after — **stays that way** | [serializers.py:200-206](../../backend/observations/serializers.py) |
| The only cross-field validation a session has — **not touched by this iteration** | `TrainingSessionSerializer.validate`, [serializers.py:208-221](../../backend/observations/serializers.py) |
| "A row is writable only while its exercise and its session are open" | `closed_reason` ([serializers.py:11-36](../../backend/observations/serializers.py)) and `ClosedIsFinalMixin` ([views.py:21-48](../../backend/observations/views.py)) |
| End session, its two-tap confirm, and what happens after | `endSession`, `leaveSession`, the `.end-session` section in [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) |

### The three guards `end/` already has

In the order they are written, and all three unchanged by this iteration:

1. **An exercise is still open** → 400, carrying `open_exercise`. Closing over
   an open block would strand a row that can never be closed (E4).
2. **The session has already ended** → 400. A second call must not move the
   timestamp.
3. **The session starts in the future** → 400. Saving would break the
   `trainsess_ended_after_started` check constraint; say so rather than let the
   database raise.

Chunk 01 adds a fourth, **after** all three. Where it sits is not cosmetic, and
that chunk says why.

### The rule being mirrored, in full

```python
if not performed_exercise.performed_sets.exists():
    performed_exercise.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
```

— `views.py:302-304`, with a docstring worth reading before writing the
session's version: *"The two success shapes are different on purpose: 200 means
'this block is now in your log', 204 means 'there was nothing in it'."* The
session's version means exactly the same two things, one level up.

## The data model

Unchanged by this iteration. No column is added, no constraint is added, and
[backend/docs/schema.dbml](../../backend/docs/schema.dbml) must come out of all
three chunks **byte-identical**.

```
TrainingSession   id, user, type, created_at, started_at, ended_at ← null = open
  └─ PerformedExercise   id, training_session, exercise_definition, …, ended_at
       └─ PerformedSet   …
            └─ PerformedRep   …
```

The rule is about the *first* of those arrows: does this session have at least
one `PerformedExercise` row? It is not about the second (S2 below).

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite at `backend/db.sqlite3`
  (per worktree, and not created until `make migrate` has run here). Tests are
  `APITestCase`, `setUpTestData`, `reverse('api:…')`, `force_login`.
  **`make test` runs them and reads `Ran 178 tests` on this branch as it
  stands.** Every chunk says what that number should be when it is done.
- **Migrations** — `backend/observations/migrations/`, five so far.
  `0005_performedexercise_ended_at_and_more.py` is the house pattern for a data
  migration: a module-level function with a docstring explaining the choice,
  `apps.get_model`, and `RunPython(fn, migrations.RunPython.noop)`.
- **Frontend** `frontend-web/` — React + Vite, **no test suite**. This iteration
  changes one comment in it and nothing else.
- **Requests** — through `api` in [api.js](../../frontend-web/src/api.js). A 204
  comes back as `null` (`api.js:53`); a non-2xx throws `ApiError` with `.status`
  and `.detail`.
- **`make migrate`** applies migrations to the dev database; **`make run`**
  brings up both servers.

## Assumptions

The chunks build as though all of these were true, and cite them by number.
`S1`–`S7` are new to this iteration. To overturn one: rewrite its row, then
`grep` the chunks for its number and follow through.

**`S5` is withdrawn** along with chunk 02 and does not appear below. It said the
retrospective-create path closes entirely; it no longer does anything, and
nothing cites it. The numbers of the others are left as they were rather than
closed up, so a citation elsewhere still means what it always meant. See "What
was cut, and why".

| # | Assumption | Why it holds |
|---|------------|--------------|
| S1 | **Starting a session is untouched.** A session is still created empty, from a bare POST, and stays empty for as long as the user likes. The rule applies only where a session would become a permanent record. | This is how the app works and the human said so in as many words. A rule at creation time would mean choosing the first movement before tapping Start, which is a different app. |
| S2 | **The rule counts `PerformedExercise` rows, not sets.** `session.performed_exercises.exists()` is the whole query. A session holding one exercise that somehow has no sets still counts as non-empty. | An ended session's exercises always have sets anyway: a setless exercise deletes itself on close (E5) and an open exercise refuses to let the session end (E4), so the two existing rules already compose to give it. Counting sets would be a second, slower rule saying the same thing — and it would force a decision about a case that cannot occur. |
| S3 | **`end/` on an empty session deletes it and answers 204.** Not a 400, and not a stamped session with nothing in it. The two success shapes mean what they already mean on the exercise: 200 "this workout is now in your log", 204 "there was nothing in it". | The mirrored rule (`views.py:302-304`) is already exactly this, and a user who taps End on a session they started by mistake wants it gone, not an error to argue with. The delete cascades to nothing: an empty session has no exercises, therefore no sets and no reps. |
| S4 | **No database-level constraint.** "Has at least one child row" is cross-table and not expressible as a Django `CheckConstraint`, which can only see the row being written. The only route to it is a raw-SQL trigger in a migration, and that is out of scope. | The app's other invariants of this shape — one open session, one open exercise, closed is final — are all kept by the API and none of them is in the schema. A trigger would be the first, would not be visible in `models.py`, would not appear in `schema.dbml`, and would fire on the admin and the seeder too. Nobody is to reach for one. |
| S6 | **History is swept once, and the sweep takes open sessions too.** Every session with no exercises is deleted, whether or not it has ended. | The human was shown the ended-only alternative and the risk that comes with the full sweep — a session open on a phone at that moment, with nothing logged into it yet, disappearing from under the user — and chose the full sweep anyway. Build what was chosen. |
| S7 | **The frontend needs no change in order to work.** `endSession` already ignores the response body and calls `leaveSession()`, and `api.js:53` turns a 204 into `null`, so a 204 already behaves exactly as a 200 does: the tab returns to the Start screen. | This is not luck; it is what "the client never writes `ended_at`" bought. The one frontend edit in this iteration (chunk 04) is inside a `{/* … */}` comment and changes nothing that renders. |

### What this iteration REVERSES

**This is the one thing to know before writing any of it.** A previously agreed
decision, signed off by the human at the time and written into a spec that is
still on disk, said the opposite of S3. It is being reversed deliberately, with
the human's agreement, and the old file stays where it is as the record of how
the app got here.

- **[current_session/06-end-and-discard.md](../current_session/06-end-and-discard.md),
  item 4:** *"**Ending an empty session** (nothing logged) is allowed and needs
  no special case; it simply lands in history with no exercises, which the
  sessions list and detail page already render."*
  **REVERSED by S3.** It is not allowed, it does need a special case, and it
  does not land in history: it is deleted.

- The same file's **"Done when" bullet** (`:55`): *"Ending a session with no
  sets logged works and produces an empty session in history."* — and its
  **"What the user sees"** line (`:87`): *"**Ending a workout with nothing
  logged is allowed** and produces an empty session in history; there is no
  nagging about it."*
  **REVERSED by the same.** The "no nagging" half survives untouched: there is
  still no warning, no extra tap and no different wording. The session simply is
  not kept.

- **[CurrentSession.jsx:2142-2147](../../frontend-web/src/pages/CurrentSession.jsx)**
  restates item 4 in a code comment, which is the copy a future reader is most
  likely to trust.

Chunk 04 corrects the comment and puts a pointer in the old spec. **Do not edit
`specs/current_session/` from any other chunk**, and do not delete or reword
what it originally said — its reasoning is history and stays intact.

### Assumptions from earlier iterations that STAND

- **E4** — a session cannot be ended while an exercise is open. Untouched, and
  it stays the *first* guard in `end/`. It is also half of why S2 can count
  exercises rather than sets.
- **E5** — an exercise with no sets is not logged; closing an empty one deletes
  the row. This iteration is the same idea one level up, and E5's own scoping
  sentence — *"The rule governs the closing path only — it never goes back over
  rows already recorded"* — is the one place the session's version differs: S6
  *does* go back over what is already recorded, once, because the human asked
  for it.
- **E6** — closed is final. `ClosedIsFinalMixin` already makes it impossible to
  delete an exercise out of a session that has ended, so a logged session cannot
  be emptied after the fact through the API. Chunk 01 adds a regression test for
  exactly that and nothing more.
- **A7** — the gym has signal; every action reaches the API as it happens.
- Everything in `exercise_zone`, `new_exercise`, `feedback`,
  `split_weight_components` and `data_export` is untouched.

## What was cut, and why

**Chunk 02 — "A finished session cannot be typed in empty" — was cut from this
iteration by the human, and its file is deleted.** This is a scope decision,
recorded here so that nobody builds it by accident and nobody hunts for the
missing `02-`.

What that means, precisely:

- **The create path is left exactly as it is.**
  `backend/observations/serializers.py` and
  `TrainingSessionViewSet.perform_create` are **not touched by any chunk in this
  iteration**, and neither is any existing test about them —
  `test_a_session_typed_in_after_the_fact_is_not_open` and
  `test_a_session_cannot_end_before_it_started` stay word for word as they are
  and must still pass unmodified.
- **`ended_at` remains writable on create.** A hand-written
  `POST training-sessions/` carrying an `ended_at` is still accepted, so **an
  empty finished session can still be brought into existence through the API**.
  No screen sends such a request, so nothing the app itself does can produce
  one.
- **This iteration's rule is therefore enforced at `end/` only.** Chunk 01 shuts
  the door every real workout walks through; the create door stays open.
- **It is a known, accepted gap, parked for a later iteration.** Not an
  oversight and not a bug in chunk 01, 03 or 04. Do not close it here, do not
  work around it, and do not weaken chunk 01 to compensate for it.

One consequence worth stating plainly: chunk 03's sweep cleans out the empty
sessions that exist today, and after it the database has none — but because the
create door is still open, an empty finished session could be made again by
hand afterwards. That is understood and accepted.

## Vocabulary

- **Empty** — a `TrainingSession` with no `PerformedExercise` rows. Never "a
  session with no sets": that is a different thing and it is not what any rule
  here tests (S2).
- **End** a session — `POST training-sessions/{id}/end/`. Stamps `ended_at` if
  the session has an exercise, deletes the session if it does not (S3).
- **Discard** a session — `DELETE training-sessions/{id}/`. A different act,
  offered only on a session started before today, and **untouched by this
  iteration**.
- **Retrospective create** — `POST training-sessions/` carrying an `ended_at`,
  meaning "a workout that already happened". No screen sends one, and **this
  iteration does not touch it**: see "What was cut, and why".
- **The sweep** — chunk 03's one-off data migration (S6).

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **A database constraint or trigger.** S4.
- **Any change to how a session is created or started.** S1 — and, since chunk
  02 was cut, that now includes the **retrospective-create path**:
  `TrainingSessionSerializer` (`ended_at` stays writable on create, `validate`
  stays as it is) and `TrainingSessionViewSet.perform_create` are untouched by
  every chunk. See "What was cut, and why".
- **Any new button, label, warning, confirmation or error string in the UI.**
  The two-tap "End this session?" reads identically whether or not anything was
  logged — the human was asked directly and chose "identical either way".
- **A guard in the Django admin**
  ([admin.py:34-53](../../backend/observations/admin.py)). It can still empty a
  logged session by hand, and it stays the correction path, by choice (E6).
- **Anything further about deleting the last exercise from a logged session.**
  `ClosedIsFinalMixin` already refuses it. It gets a regression test in chunk 01
  and nothing more.
- **`DELETE training-sessions/{id}/`** and the stale-session Discard line.
  Throwing a whole workout away is untouched and still cascades.
- **The seeder** (`observations/management/commands/seed_dummy_data.py`) and the
  export (`dataexport/`). Neither produces or asserts an empty session.
- **Any schema change**, and therefore any regeneration of
  `backend/docs/schema.dbml`.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it produces
no code and no screen of its own. Every visible change lives in a numbered
chunk — and in this iteration there is exactly one of them, in chunk 01.
