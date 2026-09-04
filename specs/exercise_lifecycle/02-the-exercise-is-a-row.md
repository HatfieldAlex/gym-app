# 02 — The exercise is a row on the server

**Goal:** the movement being recorded stops being `heldId` and becomes the open
`PerformedExercise`. Choosing one opens it, leaving it closes it, and reopening
the app drops you straight back inside it with its sets and its comparison.

Frontend only, and one file: `frontend-web/src/pages/CurrentSession.jsx`. Needs
chunk 01. Nothing here is enforced by the server yet — this chunk teaches the
client to obey the rules, and 03 and 04 bolt the door behind it.

The zone still has no address; it is still `zoneOpen` (Z4 lives one more chunk).
That is chunk 05, and it is much easier to reason about once the state
underneath it is right.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — all of
  it, especially `heldId` (`:494`), `heldPerformed` (`:518-521`), `logSet`
  (`:595`), `releaseExercise`, `closeZone` (`:713-716`) and the three exits at
  `:841`, `:908-917`, `:923-930`
- [exercise_zone/02-the-zone.md](../exercise_zone/02-the-zone.md) — what the
  three exits mean today, and the table this chunk replaces
- [current_session/03.8-log-exercise.md](../current_session/03.8-log-exercise.md)
  — point 4, "One way out at a time", already specified and never built
- [00-context.md](00-context.md) — E2, E5, E7, E8, E11, and A9 and A7, which stand

## Build

### 1. The open exercise, derived (E8)

Delete `heldId`, `held` and `heldPerformed`. In their place, one derivation off
the session the page already holds:

```js
const openExercise =
  session?.performed_exercises.find((performed) => performed.ended_at === null) ?? null
```

That is the whole restore. `current/` answers with
`TrainingSessionDetailSerializer`, so the open block and its sets are already in
the one request the page makes on mount — a reload, a tab switch or a browser
reopened the next morning finds it with no second request and no second copy of
the truth. Say that in a comment; it is the point of the iteration.

Consequences to follow through:

- **The heading** is `openExercise.exercise_name`, which the serializer already
  supplies, not a catalogue lookup. The zone then names its movement even if
  `exercises/` has not loaded or failed.
- **The set list** is `openExercise.performed_sets`, and it is addressed by the
  block's own id. The old `.find` on `exercise_definition` — first match wins —
  is exactly what made a second block of one movement unreachable (E7).
- **History** is fetched on `openExercise?.exercise_definition` changing, and
  still passes `exclude_session=session.id` (Z5 unchanged).
- `catalogue` and `AddExerciseForm` stay; the catalogue is still what the
  chooser lists and what a new movement is inserted into (N11).

### 2. The zone shows when something is being recorded

Replace `zoneOpen` with a state that says only what it needs to:

```js
const [choosing, setChoosing] = useState(false)
const inZone = choosing || openExercise !== null
```

`Record new exercise` sets `choosing`. The zone renders while `inZone`, with the
chooser when nothing is open and the recording screen when something is. Z1 and
Z2 are unchanged: it is still a takeover, the chooser is still inside it.

An open exercise pulls the user into the zone whether or not they asked — that
is the restore, and it is correct.

### 3. Opening (E2, A9)

Picking a movement in the chooser is now a request. Replace the `setHeldId` in
the `<select>`'s `onChange`, and the two `AddExerciseForm` handlers
(`holdCreated`, `holdExisting` — rename them, "held" is retired), with one
function:

```
POST performed-exercises/ { training_session: session.id, exercise_definition: <id> }
```

- Append the created row to `session.performed_exercises`, filling in
  `performed_sets: []` — `PerformedExerciseSerializer` answers without it and
  both lists read it. This is the same fill-in `logSet` does today (`:614`);
  move it, do not write a second one.
- `setChoosing(false)`. `openExercise` now finds the new row, so the zone
  becomes the recording screen with nothing else to set.
- **A9 stands**: the `<select>` and the add form are disabled while the request
  is in flight, and a line says **Opening…**. The human accepted this wait; do
  not paper over it with optimistic UI.
- On failure: an error line beside the chooser — "Could not open that exercise.
  Please try again." — and the chooser stays exactly as it was, ready to retry.
  Nothing is added to `session`.
- `alreadyThere` (N5) keeps working: set it when the typed name turned out to
  exist, clear it when the exercise closes.

### 4. Closing, and the one control that does it (E5, E11)

`releaseExercise` and `closeZone` both go. Closing is a request now:

```
POST performed-exercises/<openExercise.id>/end/
```

- **204** — it was empty, so the block never happened. Remove the row from
  `session.performed_exercises`.
- **200** — replace the row in `session.performed_exercises` with the response,
  which carries the stamped `ended_at`. `openExercise` becomes null.
- Either way, clear the typed weight and reps, the log error, `alreadyThere`,
  and `rows.close('held')` — a row left open or armed for deletion must not be
  waiting the next time the zone opens. That is what `releaseExercise` already
  did; keep the behaviour, lose the name.
- On failure: an error line beside the control, nothing changes, the user can
  retry. A failed close must never blank the zone or drop a set.
- While it is in flight the control is disabled and says **Logging…** /
  **Changing…** (A9).

**The three exits become one, and it says which act it is.** The `×` (`:841`),
`Log exercise` (`:908-917`) and `Change exercise` (`:923-930`) today do the
identical nothing and sit in the same button row. Replace them with exactly one
control per state:

| State | The control | What it does |
|-------|-------------|--------------|
| chooser, nothing open | **Cancel** | leaves the zone. No request — nothing was opened |
| open, **no sets** | **Change exercise** | closes (204, the row is deleted), back to the chooser, still in the zone |
| open, **with sets** | **Log exercise** | closes (200, `ended_at` stamped), leaves the zone |

This is `03.8-log-exercise.md` point 4 — "One way out at a time… Two controls
doing one thing is one too many" — finally true, and now each way out is a
different request with a different outcome.

There is deliberately **no** way to abandon an exercise that has sets in it.
That is the solidity being asked for: what is in the log is in the log. The
escape hatch already exists and needs no new code — delete the sets one by one
in the list below (they are still editable while the exercise is open), and when
the last one goes the control flips back to **Change exercise**, which removes
the block. Say that in a comment so nobody adds a Discard button.

**Enter logs nothing (E11).** `<form className="log-set" onSubmit={logSet}>`
(`:857`) becomes a plain `<div className="log-set">`, and **Log set** becomes
`type="button"` with `onClick={logSet}`; `logSet` loses its `submitEvent`
argument and its `preventDefault`. The inline edit form (`SetRow`, `:92-97`) is
**not** touched — Enter there saves an edit, which is a different act and is
fine.

### 5. `logSet` gets smaller

The `PerformedExercise` already exists by the time a set is logged, so `logSet`
is one request:

```
POST performed-sets/ { performed_exercise: openExercise.id, ...entry }
```

Delete the lazy-create branch and the `heldPerformed === null` test with it.
Everything else about it — `parseEntry`, `entry === null || logging`, weight and
reps surviving a successful log, the error line, `setSession` from the response
— stays exactly as it is.

### 6. Ending a session

`endSession`, `discardSession` and `leaveSession` are unchanged except that
`leaveSession`'s `closeZone()` becomes `setChoosing(false)` — with no session
there is no open exercise, so the zone cannot survive one. **End session** is
still only on the session page, which is unreachable while an exercise is open,
so the UI already keeps E4 before the server does in chunk 03.

## Done when

- Tapping **Record new exercise** opens the zone on the chooser, as today.
- Picking a movement briefly shows **Opening…**, then the zone names that
  movement with an empty set list. `tables/performed_exercises.csv` — or the
  admin — shows one new row with `ended_at` empty.
- **Reloading the page at that moment comes straight back into the exercise**,
  with its name, its sets and its Last time block. This is the chunk's whole
  point; check it before anything else.
- Logging a set adds it to the list and to Completed exercises below, exactly as
  before. No second `PerformedExercise` is created.
- **Enter** in the weight box and in the reps box logs nothing, at any point.
- With no sets logged, the only way out is **Change exercise**; tapping it
  returns to the chooser and the row is **gone** from the database and from
  Completed exercises.
- With one set logged, **Change exercise** is gone and **Log exercise** is the
  only way out; tapping it leaves the zone and the block is in Completed
  exercises with a stamped `ended_at`.
- Deleting the last set of an open exercise brings **Change exercise** back.
- Picking a movement already logged earlier in this session starts a **second**
  block: Completed exercises shows it twice, each with its own sets (E7).
- Logging a set into that second block does not touch the first.
- Closing the browser mid-exercise and reopening it on the **same account in a
  different browser** lands inside the same exercise.
- Ending or discarding the session leaves no zone on screen.
- `/training-sessions`, `/exercises-catelog` and `/settings` are untouched.

## Do not

- Rewrite `parseEntry`, `useSetRows`, `SetList`, `SetRow`, `Confirm`,
  `AddExerciseForm` or the last-time / Earlier block. Rewire; do not reimplement.
- Keep a `useState` for the open exercise, its id, or its name. It is derived
  from `session` (E8); a second copy is a second thing to get wrong.
- Add optimistic UI, a spinner overlay, or a way to skip the wait when opening
  (A9).
- Add a route, a URL or a history entry — chunk 05.
- Store anything in `localStorage` — chunk 06.
- Persist `choosing`. Landing on the page with nothing open shows the session,
  and that is right.
- Enforce anything client-side that the server will enforce in 03 and 04 by
  hiding it: do not, for instance, filter the chooser to exclude movements
  already done. Re-picking one is legal and expected (E7).
- Touch the inline edit form's `onSubmit` (`:92-97`).
- Add a Discard or Abandon control for an exercise that has sets.
- Change what **Log set** does, what a set row looks like, or how Completed
  exercises renders. Its Edit and Delete controls are chunk 04's to remove.
- Change `styles.css` beyond what a renamed or removed control forces. Chunk 07
  is the styling pass.

## What the user sees

The exercise stops being something the app is *remembering* and becomes
something they are *in*.

- **Choosing a movement is now a commitment, and it says so.** There is a brief
  **Opening…** while the app writes it down. That pause is the difference
  between "I picked a thing off a list" and "I am doing this exercise now".
- **It survives everything.** Lock the phone, switch tabs, run the battery flat,
  pick the workout up on the laptop at home — reopening the app puts them back
  inside the same exercise, with the sets they logged and what they did last
  time still beside it. Nothing has to be picked again.
- **Enter does not log a set any more.** The single most reliable way to log
  something by accident is gone.
- **There is one way out, and it tells them what it will do.** Nothing logged
  yet: **Change exercise**, and the movement is dropped as though it had never
  been picked. Something logged: **Log exercise**, and it goes into the workout.
  No more three buttons that all did the same nothing.
- **Nothing empty is ever logged.** Picking the wrong movement and backing out
  leaves no trace — not in the session, not in history, not in the export.
- **The same movement can appear twice.** Come back to bench press at the end of
  the session and it is a second block, listed separately, with its own sets —
  rather than silently joining the first one.
- **A mistake is still recoverable, while the exercise is open.** Delete its
  sets and the way out becomes **Change exercise** again, which removes the
  block entirely.

What they cannot do yet: use the back gesture (chunk 05), or come back to a
half-typed weight (chunk 06). And the app is still the only thing keeping the
rules — chunks 03 and 04 move them to the server, where two tabs and a stale
page cannot get around them.
