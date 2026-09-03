# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## The intent

A training session is either open or closed, and that bit lives on the server.
It survives closing the app, logging out, and coming back the next day. The
human describes it as feeling *solid*: "I'm clearly in my gym session now… I'm
all in. And then you end it and I'm all out."

An exercise has none of that. It is a React `useState` — `heldId` in
[CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — and it
evaporates on navigation or reload. The complaint it produces is precise: it
"feels like the exercise submits without you realizing it."

**This iteration gives an exercise the same solidity as a session.**
`PerformedExercise` gains a nullable `ended_at`, exactly as `TrainingSession`
has one. Opening one, closing one, and the rules about what may happen in
between are all the API's, not the interface's.

## What already exists — read it before changing it

None of the recording machinery is rebuilt. It is all in
[CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx), built by
[current_session](../current_session/README.md) 02.0–07 and moved into the zone
by [exercise_zone](../exercise_zone/README.md) 02–05.

| What | Where, today |
|------|--------------|
| Start / resume / end a session, `current/` | `CurrentSession()`, `startSession`, `endSession` |
| The zone as a page state | `zoneOpen`, `closeZone`, the `.exercise-zone` section |
| The chooser, inside the zone (Z2) | the `<select>` in the `else` branch |
| Holding an exercise, client-side (A10) | `heldId`, `held`, `heldPerformed`, `releaseExercise` |
| Weight + reps + validation | `weight`, `reps`, `parseEntry` |
| Log set — the two POSTs | `logSet` |
| A set as a row, edit and delete | `SetRow`, `SetList`, `useSetRows` |
| Last time and Earlier | `history`, `lastTime`, `earlier`, `SessionDate` |
| Completed exercises | the `.completed-exercises` section |
| End / discard, and the shared confirm | `Confirm`, `endSession`, `discardSession` |

The pieces that move are the ones that decide *which* exercise is being recorded
into and *when* it stops being recorded into. `logSet`, `parseEntry`,
`useSetRows`, `SetList`, `SetRow`, `AddExerciseForm` and the whole last-time
block keep working as they do. A chunk that finds itself reimplementing one of
them has gone wrong.

## The pattern being mirrored

`TrainingSession` already does all of this, and every piece of it has a twin in
these chunks. Read the session's version before writing the exercise's.

| The session does it | Where | The exercise's twin |
|---------------------|-------|---------------------|
| `ended_at` null = open | [models.py:8-52](../../backend/observations/models.py) | chunk 01 |
| a check constraint on it | `trainsess_ended_after_started` | chunk 01 |
| `GET current/`, 204 when none | [views.py:83-89](../../backend/observations/views.py) | not needed — `current/` already nests it |
| `POST <id>/end/`, "the only path that stamps `ended_at` itself" | views.py:91-110 | `POST performed-exercises/<id>/end/`, chunk 01 |
| a second open one refused, with the open id in the error | views.py:65-81 | chunk 03 |
| `ended_at` writable on create, read-only after | [serializers.py:114-125](../../backend/observations/serializers.py) | chunk 01, read-only throughout |

The same nullable-timestamp shape is used a third time in
[feedback/models.py:33-37](../../backend/feedback/models.py) — `resolved_at`,
"null means the note is still outstanding".

## The data model

`PerformedExercise` has exactly five columns today and none of them is a state.
`ExercisePrescription` ([protocols/models.py](../../backend/protocols/models.py))
is a bare primary key, so it is not a hook either. There is nothing to carry
"open" but a new column.

```
TrainingSession   id, user, type, created_at, started_at, ended_at ← null = open
  └─ PerformedExercise   id, training_session, exercise_definition (PROTECT),
                         exercise_prescription (SET_NULL, null), created_at,
                         ended_at ← null = open        (chunk 01 adds it)
       └─ PerformedSet   id, performed_exercise, weight_kg, reps,
                         distance_m, duration_s, rpe, created_at
            └─ PerformedRep   id, performed_set, rep_index
```

Nothing in the schema stops two `PerformedExercise` rows with the same
`exercise_definition` in one session — [models.py:56-59](../../backend/observations/models.py)
says so in as many words. That is what E7 relies on.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Routes registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; every viewset scopes its queryset to `self.request.user`.
  Tests are `APITestCase`, `setUpTestData`, `reverse('api:…')`, `force_login`.
  `make test` runs them.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript, **no test suite**. A frontend chunk is proved by
  its own "done when", by hand, in `make run`.
- **Routing** — `react-router-dom`; routes in
  [App.jsx](../../frontend-web/src/App.jsx), nav links in
  [Nav.jsx](../../frontend-web/src/components/Nav.jsx). Django's catch-all
  (`settings/urls.py:24`) already serves any path to the SPA shell, so a new
  frontend route needs no backend change.
- **Styles** — one [styles.css](../../frontend-web/src/styles.css), a
  `/* Current session */` section near the bottom. No framework.
- **Requests** — always through `api` in [api.js](../../frontend-web/src/api.js).
  A 204 comes back as `null`; a non-2xx throws `ApiError` with `.status` and
  `.detail`. Fetch with `useLoad` from [hooks.js](../../frontend-web/src/hooks.js).

## Assumptions

The chunks build as though all of these were true, and cite them by number.
`E1`–`E12` are new to this iteration. To overturn one: rewrite its row, then
`grep` the chunks for its number and follow through.

| # | Assumption | Why it holds |
|---|------------|--------------|
| E1 | An exercise is either open or closed with nothing in between, so a nullable `PerformedExercise.ended_at` carries the whole state: open means `ended_at IS NULL`. It mirrors `TrainingSession.ended_at` down to the check constraint. | The session's open/closed bit is one nullable timestamp and it has held up. A second way of saying the same thing — a `status`, a boolean, a `closed` flag — would be a second thing to keep in step with it. |
| E2 | **Opening an exercise is choosing it.** The row is created when the movement is picked, not when its first set is logged. | This is the whole complaint: today the first Log set silently creates the block, so the exercise "submits without you realising". Creating it on the tap that means "I am doing this now" puts the write where the intent is. It costs a round trip, which is accepted (A9). |
| E3 | **One exercise open at a time per session.** A second is refused, and the refusal carries the open exercise's id so a lost client can recover — the same shape as a second open session. | Supersets are out of scope, so "the exercise I am on" has to be unambiguous the way "the current session" already is. |
| E4 | **A session cannot be ended while an exercise is open.** Close the exercise, then close the session. Server-enforced, not a prompt. | A session that ended over an open exercise would leave a row that can never be closed and never be corrected. Refusing is cheaper than a repair path. |
| E5 | **An exercise with no sets is not logged.** Closing an empty one deletes the row: no trace in the session, in history or in the CSV. The rule governs the closing path only — it never goes back over rows already recorded. | Picking the wrong movement should cost nothing. Sweeping history for empty blocks would delete data the user never asked to lose, and `dataexport` already has a test that a setless block is in `tables/performed_exercises.csv`. |
| E6 | **Closing is final.** A row is writable only while its performed exercise is open **and** its session is open. One condition, checked once, covering create, update and delete of a set and of a performed exercise. | "Locked hard once the session ends" and "a closed exercise cannot be changed" are the same rule at two levels, and under E4 the session level can only be reached by data that predates this iteration or was made in the admin. Django admin and direct DB access are the only correction route, by choice. |
| E7 | **Re-picking a movement already closed in this session starts a second block.** The log may show "Bench press" twice. There is no reopening. **Replaces A6.** | Under E2 every pick writes a row, so continuing an old block would mean an "is one already open for this movement?" branch — which is reopening, which E6 forbids. Two blocks is also the truth: the user came back to it later. |
| E8 | **The open exercise is data, not page state.** It is `session.performed_exercises.find(p => p.ended_at === null)`, read off the answer `current/` already gives. **Replaces A10.** | `current/` uses the detail serializer, so the open exercise and its sets are already in the one request the page makes on mount. Restoring costs no second request and no second copy of the truth. |
| E9 | **The exercise has its own address**, `/current-session/exercise`, and an open exercise pins the user to it: backing out lands on `/current-session` and is sent straight back in. **Replaces Z4, changes Z3.** | The back gesture should be a real step rather than nothing, and the address is what makes a reload land where the user was. Being sent back in is the same rule the API keeps (E4), shown rather than explained: while an exercise is open, End session is not reachable. |
| E10 | **A half-typed set is kept in `localStorage`**, per device and per performed exercise, and comes back **shown as restored** rather than as freshly typed. **Overturns Z6, with Z6's own objection as the mitigation.** | Z6 was right that a number the user did not type is dangerous *silently*. A number the user did type, on this device, minutes ago, marked as restored, is not the same thing. Nothing about the log is stored locally — A7 stands; only what has not been submitted yet. |
| E11 | **Enter in the weight or reps box does nothing.** The log-set form stops being a `<form>`. | It is the second named cause of "it submits without me realising": the boxes sit inside `<form onSubmit={logSet}>` (`:857`) and Enter logs a set. The inline edit form (`:92-97`) is a different act and keeps its Enter. |
| E12 | **Every exercise already recorded is finished.** The migration stamps `ended_at` from the last set logged into it, falling back to the row's own `created_at`. | They are history; leaving them null would read as "every workout you have ever done is still in progress", and the first thing E3 would do is refuse a new one. The last set's timestamp is what a live close would roughly have stamped; `created_at` is the only answer for a block that never got one. |

### Assumptions from earlier iterations that this one overturns

These files stay on disk and are still cited by their own chunks. A reader who
finds them must know they have been superseded **here**, and only here.

- **A10** — [current_session/00-context.md:84](../current_session/00-context.md):
  *"Holding an exercise to log sets against it is a client-side act, not a
  stored one. Nothing in the model records that a movement is in progress or
  finished; `Log exercise` only lets go of the hold. … The cost: a refresh
  mid-exercise returns to the dropdown."*
  **OVERTURNED by E1, E2 and E8.** It is stored. `PerformedExercise.ended_at`
  records exactly that, `Log exercise` is now a request, and a refresh
  mid-exercise comes back inside the exercise.

- **A6** — [current_session/00-context.md:80](../current_session/00-context.md):
  *"Returning to an exercise later in a session is another go at the same block,
  not a new one, so the set joins the existing `PerformedExercise`."* — restated
  at [03.8-log-exercise.md:32-35](../current_session/03.8-log-exercise.md) as
  *"Finishing is not final. Holding the same exercise again later in the session
  continues the same block."*
  **REPLACED by E7.** Finishing is final, and returning to a movement starts a
  second block. `heldPerformed`'s `.find` on `exercise_definition` (`:518-521`)
  goes with it: first match wins, which makes a second block unaddressable.

- **Z4** — [exercise_zone/00-context.md:94](../exercise_zone/00-context.md):
  *"The zone changes no URL and pushes no history entry. Opening it, picking a
  movement and closing it are all one route. … Cost: a reload closes the zone."*
  **OVERTURNED by E9.** The zone has an address and a reload lands back in it.

- **Z3** — [exercise_zone/00-context.md:93](../exercise_zone/00-context.md):
  *"The **×** is the only way out, and there is one of it. No Escape key, no
  browser-Back handling, no tap-outside — there is no outside."*
  **CHANGED by E9.** Back is now a real step, and while the exercise is open it
  returns the user into the zone. The **×** goes: leaving an exercise is a
  request with a meaning, and chunk 02 replaces all three of today's identical
  exits with one control that says which act it is. Escape and tap-outside are
  still not handled.

- **Z6** — [exercise_zone/00-context.md:96](../exercise_zone/00-context.md):
  *"The boxes start **empty**, always. History is for reading, not for seeding.
  A prefilled box is a number the user did not type, and the failure is
  silent."*
  **OVERTURNED by E10, for restored drafts only.** History still never seeds a
  box — no prefill from last time, ever. What comes back is what this user typed
  on this device into this exercise, and it must look visibly restored rather
  than freshly typed, which is the answer to Z6's actual objection.

### Assumptions that STAND

- **A7** — *"The gym has signal."* Every action still reaches the API as it
  happens. `localStorage` (E10) holds only what has **not** been submitted;
  nothing about the log is stored locally and there is nothing to sync.
- **A9** — no optimistic UI; a pending request disables its button and state
  updates from the response. Deliberately kept: opening an exercise now costs a
  round trip and a brief wait, and the human accepted the wait.
- **Z1** (the zone is a takeover, not an overlay), **Z2** (the chooser lives
  inside the zone), **Z5** (history fetched once per movement) and **Z7** (three
  past sessions) all stand unchanged.
- **A1–A5, A8** and `new_exercise`'s **N1–N11** are untouched.

## Vocabulary

Used precisely across the chunks. They are not interchangeable.

- **Open** an exercise — create its `PerformedExercise` row, `ended_at` null.
- **Close** an exercise — `POST performed-exercises/<id>/end/`. Deletes the row
  if it has no sets (E5), stamps `ended_at` if it has (E1). Final either way.
- **The open exercise** — the one row in this session with `ended_at IS NULL`.
  At most one (E3). Derived from `session`, never a second copy (E8).
- **A block** — one `PerformedExercise`, one appearance of a movement in the
  session. A movement can have two blocks in one session (E7).
- **The chooser** — the `<select>` that picks a movement. Still inside the zone
  (Z2), and now the state of the zone in which nothing is open.
- **The exercise address** — `/current-session/exercise` (chunk 05).
- **A draft** — the weight and reps typed but not yet logged, mirrored into
  `localStorage` (chunk 06). Never a logged set.
- **Held** — the old client-side word. It is retired; do not add new code using
  it.

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it describes
the intent, what exists, the data model and the assumptions, and produces no
code and no screen of its own. Every visible change lives in a numbered chunk.
