# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Routes are registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; every viewset scopes its queryset to `self.request.user`.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. Django serves the built `index.html` for every
  non-API route.
- The tab already exists: the `/current-session` route is wired up in
  [App.jsx](../../frontend-web/src/App.jsx) and linked from
  [Nav.jsx](../../frontend-web/src/components/Nav.jsx).
  [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) is a
  placeholder that says "No session in progress." **Do not add the route or the
  nav link again.**

## The data model

From [observations/models.py](../../backend/observations/models.py):

```
TrainingSession   id, user, created_at
                  (chunk 01 adds started_at and ended_at)
  └─ PerformedExercise   id, training_session, exercise_definition,
                         exercise_prescription (null), created_at
       └─ PerformedSet   id, performed_exercise, weight_kg, reps,
                         distance_m, duration_s, rpe, created_at
```

- `created_at` doubles as the ordering within its parent, everywhere — with one
  exception after chunk 01: sessions are ordered by `started_at`, because a
  workout typed in after the fact belongs where it was trained, not where it
  was typed. Exercises and sets are unaffected; they are logged live.
- One logged set = one `PerformedSet`. A movement performed in a session = one
  `PerformedExercise`, pointing at a shared `ExerciseDefinition`
  ([catalog](../../backend/catalog/models.py) — name only, read-only API).
- Weights are stored metric (`weight_kg`); the model comments say convert at
  display time.
- `TrainingSession` carries other columns this tab neither reads nor writes.
  Leave them alone.

## Existing frontend conventions — follow them

Read [TrainingSessionDetail.jsx](../../frontend-web/src/pages/TrainingSessionDetail.jsx)
before writing any page code. In short:

- Fetch with `useLoad` from [hooks.js](../../frontend-web/src/hooks.js); render
  `<Status state={state} error={error} />` for the waiting and failed cases; set
  the tab title with `useDocumentTitle`.
- All requests go through `api` in [api.js](../../frontend-web/src/api.js) —
  `api.get/post/patch/delete` and `api.list`. Never call `fetch` directly. A 204
  response comes back as `null`. A non-2xx throws `ApiError` with `.status`.
- Semantic HTML with a handful of class names; styles live in one section per
  page at the bottom of [styles.css](../../frontend-web/src/styles.css). There
  is a `.button` class already.
- Comments explain *why*, not *what*, and are sparse. Match that.

## Assumptions

The chunks build as though all of these were true, and cite them by number. None
of them is established: they are the questions the data model and the existing
pages leave open, answered the most likely way so the build has firm ground.
Anything wrong here is wrong in every chunk that leans on it, so this is the
first table to argue with and the cheapest thing to change.

To overturn one: rewrite its row, then `grep` the chunks for its number and
follow through.

| # | Assumption | Why it holds |
|---|------------|--------------|
| A1 | A session is either open or finished with nothing in between, so a nullable `TrainingSession.ended_at` carries the whole state: open means `ended_at IS NULL`. When it happened is a separate question from when it was recorded, so the session also gets a writable `started_at`, leaving `created_at` to mean only "when this row was written". | The model has no way to tell a live session from a finished one. `created_at` is the start time only for a workout logged as it happens; one typed up the next morning would sort and label itself by breakfast. Three columns, three questions: written, started, ended. |
| A2 | Nobody has two workouts on the go at once, so a second Start can be rejected outright. | "The current session" has to be unambiguous. |
| A3 | Everyone using this trains in kg, so no unit toggle is needed. | The column is `weight_kg`, and there is no user-preference model to hang a unit on. |
| A4 | What gets logged here is weight-and-reps work; `distance_m`, `duration_s` and `rpe` stay null. | The session detail page already hides all-null columns, so nothing looks broken. Weakest assumption in the table: steady-state cardio and mobility work cannot be logged from this tab at all while it stands. |
| A5 | Every set has reps; not every set has a weight. So `reps` is required and a blank weight stores null. | A set with no reps records nothing, and bodyweight movements have no weight. |
| A6 | Returning to an exercise later in a session is another go at the same block, not a new one, so the set joins the existing `PerformedExercise`. | Keeps the list grouped and set numbering continuous. (The model does permit the same definition twice — that is for supersets, not for this.) |
| A7 | The gym has signal. Every action reaches the API as it happens: Start creates the row, Log Set POSTs immediately, the page reads back from `current/`. Nothing is stored locally. | Persisting on every change is already satisfied by the API, and refresh / tab-switch / reopen survival comes free — nothing to sync or reconcile. |
| A8 | The tab is used in a browser on the phone *and* on a desktop, so row actions are small inline buttons rather than swipe. | A swipe gesture has no desktop equivalent. |
| A9 | A set logs fast enough that the wait needs no covering, so there is no optimistic UI: a pending request disables its button and state updates from the response. | The app has no mutation patterns yet and no rollback machinery. Keep the first ones boring. |
| A10 | Holding an exercise to log sets against it is a client-side act, not a stored one. Nothing in the model records that a movement is in progress or finished; `Log exercise` only lets go of the hold. | `PerformedExercise` has no state column, and adding one means a migration for something only this screen would read. Every set is already saved as it is logged (A7), so "finishing" has nothing left to persist. The cost: a refresh mid-exercise returns to the dropdown — nothing is lost, but the page forgets which movement the user was on. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it describes
the stack, the data model and the assumptions, and produces no code and no
screen of its own. Every visible change lives in a numbered chunk.
