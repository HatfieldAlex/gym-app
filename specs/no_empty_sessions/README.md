# No empty sessions — build specs

A training session never lands in history without at least one exercise in it.
It is still *started* empty — that is how the app works, and it does not change
— but the moment it would become a permanent record, it must have something in
it. Tapping **Start** by accident, or on a day that turned into a rest day,
should cost nothing.

The rule already exists one level down. `PerformedExerciseViewSet.end` stamps
`ended_at` on a movement — unless nobody logged a set into it, in which case it
deletes the row and answers 204. This iteration is that same rule at the
session's scale, plus a one-off sweep of the empty sessions already recorded.

**It reverses a decision.**
[current_session/06-end-and-discard.md](../current_session/06-end-and-discard.md)
item 4 says ending an empty session is allowed and files it in history. That was
agreed at the time; it is being reversed here, with the human's agreement, and
the old file stays on disk as the record. `00-context.md` has the full list of
what is being reversed and what survives.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [Ending an empty session throws it away](01-ending-an-empty-session.md) — the fourth guard in `end/`, delete and 204, and the regression on a logged session's last exercise | `backend/observations/views.py`, `tests.py` | — |
| 03 | [Sweeping the empty sessions already recorded](03-sweeping-what-is-already-there.md) — the data migration, open sessions included | `backend/observations/migrations/` | 01 |
| 04 | [Correcting what the old specs say](04-correcting-what-was-written.md) — the stale comment, and a pointer in `current_session/06` | `CurrentSession.jsx` (a comment), `specs/current_session/` | 01, 03 |

**There is no chunk 02, and the gap is deliberate.** It was "A finished session
cannot be typed in empty" — the refusal in `TrainingSessionSerializer.validate`
— and the human cut it from this iteration. Its file is deleted and the numbers
of the others are left alone, so the gap is the record. The create path is
untouched by everything above; `00-context.md` has the full account under **"What
was cut, and why"**, and nothing here should be built without reading it.

**No chunk changes the schema.** No column, no constraint, no index — so
[backend/docs/schema.dbml](../../backend/docs/schema.dbml) must come out of all
three **byte-identical**, and `makemigrations --check` must want nothing.
`make test` reads **178 tests** on this branch as it stands; 01 takes it to 182,
and 03 and 04 leave it there.

**No chunk changes anything the user reads.** No button, no label, no
confirmation, no error string. The two-tap "End this session?" is word for word
what it was, whether or not anything was logged — the human was asked directly
and chose "identical either way".

## Why this order

**01 first, because it is the rule.** It is the only chunk with anything to see:
end a session with nothing in it and it does not appear in history. It is also
the only chunk whose placement is delicate — the new guard has to sit *after*
the three `end/` already has, or ending an already-recorded session starts
deleting it and a future-dated one stops being refused. Both failures are caught
by tests that already exist, which is why 01 carries the responsibility for
keeping them passing and is the chunk with the most to review.

It is also the only chunk that breaks an existing test, and it carries exactly
one: `test_ending_a_session_closes_it_once`. Nothing else in the suite moves in
any chunk.

**03 after it, because a sweep before the rule is a sweep that has to be run
twice.** With 01 in, nothing the app does can file another empty session, so the
migration runs once against a database that will not grow more of them through
any screen. The other order leaves a window — however short — in which the app
is still making exactly what was just cleaned up. (The one path that is *not*
shut is the retrospective create, which was chunk 02's job before it was cut. No
screen sends one, so it opens no such window in practice.)

03 is also on its own because **it is the only chunk that destroys data, and it
cannot be undone.** It deletes every session with no exercises, *including open
ones*, which is the wider of the two options the human was shown and the one
they chose knowing that a session open on a phone at that moment can vanish from
under them. A chunk like that deserves its own diff, its own read and its own
decision to run.

**04 last, because it describes what happened.** It changes one code comment and
adds one note to an old spec, and both would be a promise rather than a record
if they were written before 03.

## The one thing to get right

**The rule counts `PerformedExercise` rows, not sets.**
`session.performed_exercises.exists()` is the entire query in chunk 01's guard,
and `performed_exercises__isnull=True` is the whole of chunk 03's filter.
`performed_sets` does not appear anywhere in this iteration.

It is safe because the two rules underneath it already compose: a setless
exercise deletes itself when it is closed (E5), and an open exercise refuses to
let the session end at all (E4). So by the time `end/` looks, an ended session's
exercises always have sets in them. Counting sets would be a second, slower rule
saying the same thing — and it would force a decision about a state that cannot
occur.

## Why there is no database constraint

Because there cannot be one, not because it was forgotten. "Has at least one
child row" is cross-table, and a Django `CheckConstraint` can only see the row
being written. The only way to it is a raw-SQL trigger in a migration, and that
is out of scope: it would be the first invariant in this app kept below the API,
invisible in `models.py`, absent from `schema.dbml`, and firing on the admin and
the seeder as well. Every comparable rule here — one open session, one open
exercise, closed is final — is the API's. So is this one. **Nobody is to reach
for a trigger.**

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **A database constraint or trigger**, per the section above.
- **Any change to starting a session.** It is still created empty from a bare
  POST and stays empty as long as the user likes.
- **The retrospective-create path**, parked. `ended_at` stays writable on
  create, `TrainingSessionSerializer.validate` and
  `TrainingSessionViewSet.perform_create` are untouched, and the existing tests
  about them stay exactly as they are — so an empty finished session can still
  be made by a hand-written `POST training-sessions/`, which nothing in the app
  sends. A known, accepted gap for a later iteration; the rule here is enforced
  at `end/` only. See `00-context.md`, "What was cut, and why".
- **Any new button, label, warning, confirmation or error text.** The frontend
  is untouched except for one comment in chunk 04.
- **A guard in the Django admin.** It can still empty a logged session by hand,
  and it stays the correction path, by choice (E6).
- **Anything more about deleting the last exercise from a logged session.**
  `ClosedIsFinalMixin` already refuses it through the API; chunk 01 adds a
  regression test and stops there.
- **`DELETE training-sessions/{id}/`** and the stale-session Discard line.
  Throwing a whole workout away is a different act and is untouched.
- **The seeder and the export.** Neither makes or asserts an empty session.
- **Deploying, and running the migration against production.** The human's, and
  separate from this iteration.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the iteration, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01, 03 and 04 are in is the sum of the "What the user sees"
sections in those chunks:

**End session works exactly as it always did** — same button, same question,
same two taps, same return to the Start screen — and the workouts that reach
history all have something in them. A session started by mistake, or on a day
that turned into a rest day, is thrown away when it is ended rather than filed;
the empty rows already in the list are gone; and nothing that ever had a set
logged into it is touched.
