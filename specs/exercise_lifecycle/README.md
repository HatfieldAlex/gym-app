# Exercise lifecycle — build specs

A training session is either open or closed, and that bit lives on the server,
so it survives closing the app, logging out and coming back the next day. An
exercise is a React `useState` that evaporates on reload, which is why it "feels
like the exercise submits without you realizing it".

**This iteration gives an exercise the same solidity.** `PerformedExercise`
gains a nullable `ended_at`. Choosing a movement opens it; leaving it closes it;
closing is final; and the rules about what may happen in between are the API's.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [An exercise that can be open, and closed](01-backend-open-and-close.md) — `ended_at`, the migration, `end/`, the CSV column, the DBML | `backend/` | — |
| 02 | [The exercise is a row on the server](02-the-exercise-is-a-row.md) — open on choosing, close on leaving, restore on load, one way out, Enter logs nothing | `CurrentSession.jsx` | 01 |
| 03 | [One at a time, and no ending over an open one](03-one-at-a-time.md) — E3 and E4, server-enforced | `backend/` | 01, 02 |
| 04 | [Closed is final](04-closed-is-final.md) — the write lock, and Completed exercises loses Edit and Delete | `backend/`, `CurrentSession.jsx` | 01, 02 |
| 05 | [Its own address](05-its-own-address.md) — `/current-session/exercise`, the back gesture, the bounce back in | `App.jsx`, `CurrentSession.jsx`, one backend test | 02 |
| 06 | [A half-typed set comes back](06-half-typed-sets-come-back.md) — the `localStorage` draft, shown as restored | `CurrentSession.jsx` | 02 |
| 07 | [Styling the pieces that moved](07-styling.md) | `styles.css` | 02, 04, 06 |

## Why this order

**The column and the closing path come first (01), and enforce nothing.** They
have to: today's `logSet` creates a `PerformedExercise` on the first set and
never closes it, so a server that refused a second open exercise would break the
running app the moment a second movement was recorded. 01 makes the state
storable and closable, leaves every existing screen untouched, and carries the
whole of the schema's fallout with it — the migration and what history gets, the
`tables/performed_exercises.csv` column and its exact-header tests, the
regenerated `docs/schema.dbml`.

**Then the client is taught the rules (02), and only then are they bolted down
(03, 04).** This is the ordering the whole directory turns on. Build the
behaviour against a permissive server, watch it work, then switch the rules on
behind a client that already obeys them — so 03 and 04 change nothing anyone can
see, which is exactly what a well-built 02 should mean. The other order would
have the app broken for two chunks and the review gate with nothing to review.

02 is the largest chunk and does not split cleanly. Opening on choosing,
closing on leaving and restoring on load are one idea — *the exercise is a row
on the server* — and any two of them without the third strands rows: open on
choosing without restore leaves an open block nothing can reach; close on
leaving without open on choosing has nothing to close.

**03 and 04 are separate because they fail differently.** 03 is two refusals a
user should never meet; it is proved entirely by tests and shows nothing.
04 is a rule the user sees the moment it lands — Edit and Delete disappear from
Completed exercises — and it is the chunk that carries a deliberate loss, so it
deserves its own review.

**05 and 06 are the two things a reload used to cost, and each is
self-contained.** The address is routing; the draft is storage. Neither depends
on the other, both depend on 02, and either could be dropped without touching
the rest. 05 comes first because a reload only lands back in the exercise once
the exercise has an address, which is what makes 06 checkable at all.

**07 last, and small.** The zone's treatment was settled by
[exercise_zone/05](../exercise_zone/05-styling.md) and stands; 07 tidies the
four places these chunks moved something.

## The lifecycle, in one place

1. Mid-session, on `/current-session`. 2. **Record new exercise** →
`/current-session/exercise`, the chooser. 3. Pick the movement: a brief
**Opening…**, and a `PerformedExercise` row exists with `ended_at` null. 4. Log
sets into it; correct or delete any of them while it is open. 5. Lock the phone,
reload, come back on the laptop — the app puts you back inside it, with a
half-typed set still in the boxes if it was typed on this device. 6. **Log
exercise** stamps `ended_at` and returns you to the workout, where the block is
now a record and cannot be changed. Or, with nothing logged, **Change exercise**
deletes the row as though it had never been picked. 7. Only now is **End
session** reachable at all.

## What is actually new

- **An exercise is a place you are, on the server.** Not a variable the tab is
  holding. It survives everything a session already survives.
- **Leaving one means something.** Three buttons that did the identical nothing
  become one that says which act it is, and does it.
- **Nothing changes after the fact.** Closed is final, server-enforced.
- **The two ways it "submitted without you realising" are gone.** Enter no
  longer logs a set, and the first set no longer silently creates the block.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **Sets appearing under Completed exercises from the first set.** The human
  looked at it and chose to leave it.
- **Making past sessions editable.** `TrainingSessionDetail.jsx` stays
  read-only, and after chunk 04 there is no editable path to a logged set
  anywhere in the app. Django admin and the database are the correction route,
  by choice (E6).
- **Two tabs, or two devices, open at once and disagreeing.** The API keeps the
  rules, so nothing can be corrupted; a stale tab is simply refused. Making one
  tab notice what the other did is a different feature.
- **Offline use.** A7: the gym has signal. The one thing stored in the browser
  (E10) is a draft that has not been submitted.
- **Supersets, or more than one exercise open at once.** E3 is the opposite of
  it, and E7's second block is what a circuit looks like under this model.
- **The stale-session banner**, and `DELETE training-sessions/{id}/`. Discarding
  a whole workout is untouched, guarded by nothing new, and still cascades.
- **Reopening a closed exercise.** There is no such act, at any level.
- **Prefilling from history.** Z6 stands for every number the user did not type;
  E10 restores only what they did type, on this device, and says so.
- **Surfacing the API's `detail` on screen.** The page's error lines are its own
  wording and stay that way; how this app reports API failures is a different
  iteration.
- **The first block of a movement as the second block's "last time".** A second
  block in the same session still excludes the whole session from `history/`
  (Z5), so it shows the previous *session*. Deliberate; `history/` is untouched.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the iteration, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–07 are all in is the sum of the "What the user sees"
sections in those chunks: an exercise that is as solid as the session around it.
All in on the movement, then out of it, then all out of the session — and
nothing that submits itself while they are not looking.
