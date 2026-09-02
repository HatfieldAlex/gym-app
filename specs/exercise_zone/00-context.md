# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## What already exists — read it before changing it

This feature **rebuilds no recording machinery**. All of it is in
[CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) already,
built by [specs/current_session](../current_session/README.md) chunks 02.0–07:

| What | Where, today |
|------|--------------|
| Start / resume / end a session, `current/` | `CurrentSession()`, `startSession`, `endSession` |
| The chooser — a `<select>` of the catalogue | the `else` branch of the `held ? …` ternary |
| Holding an exercise, client-side (A10) | `heldId`, `held`, `releaseExercise` |
| Weight + reps + validation | `weight`, `reps`, `parseEntry` |
| Log set — the two POSTs | `logSet` |
| Log exercise / Change exercise | both call `releaseExercise` |
| A set as a row, edit and delete | `SetRow`, `SetList`, `useSetRows` |
| Completed exercises | the `.completed-exercises` section |
| End / discard, and the shared confirm | `Confirm`, `endSession`, `discardSession` |

Every one of those keeps working exactly as it does now. The chunks here move
some of it and wrap the rest; **none of them rewrites it**. If a chunk finds
itself reimplementing `logSet`, `parseEntry` or `useSetRows`, it has gone wrong.

The [current_session assumptions A1–A10](../current_session/00-context.md#assumptions)
all still hold and are still cited by number.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Routes are registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; every viewset scopes its queryset to `self.request.user`.
  DRF's default pagination is `PageNumberPagination` at `PAGE_SIZE: 50` — but a
  `@action` only paginates if it asks to, and chunk 01's does not.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. One page component per file under `src/pages/`.
- **Styles** — one `styles.css`, a `/* Current session */` section near the
  bottom, `color-scheme: light dark` and every colour a `color-mix` of
  `currentColor`. No framework, no CSS-in-JS.

## The data model

Unchanged. No chunk here adds a column, a table or a migration.

```
TrainingSession   id, user, type, created_at, started_at, ended_at
  └─ PerformedExercise   id, training_session, exercise_definition,
                         exercise_prescription (null), created_at
       └─ PerformedSet   id, performed_exercise, weight_kg, reps,
                         distance_m, duration_s, rpe, created_at
```

Two orderings matter to this feature and they are different:

- **Sessions** order by `started_at` — when the training happened, not when the
  row was written. A workout typed up the next morning belongs where it was
  trained. This is the one the history endpoint sorts on.
- **Exercises within a session, and sets within an exercise** order by
  `created_at`. They are logged live, so the two are the same thing for them.

## Existing frontend conventions — follow them

- Fetch with `useLoad` from [hooks.js](../../frontend-web/src/hooks.js); render
  `<Status state={state} error={error} />` for waiting and failed; set the tab
  title with `useDocumentTitle`.
- All requests go through `api` in [api.js](../../frontend-web/src/api.js) —
  `api.get/post/patch/delete` and `api.list`. Never call `fetch` directly. A 204
  comes back as `null`; a non-2xx throws `ApiError` with `.status`.
- Semantic HTML with a handful of class names. Comments explain *why*, not
  *what*, and are sparse. Match that.
- `main` is `text-align: center` with `place-self: center`, and **stays that
  way** — every other page is laid out by it. Sections that need to be
  left-aligned say so themselves, the way `.record-set` and
  `.completed-exercises` already do.

## Assumptions

The chunks build as though all of these were true, and cite them by number.
`Z1`–`Z7` are new to this feature; `A1`–`A10` from
[current_session](../current_session/00-context.md#assumptions) are unchanged and
still apply.

To overturn one: rewrite its row, then `grep` the chunks for its number and
follow through.

| # | Assumption | Why it holds |
|---|------------|--------------|
| Z1 | Recording a movement deserves the whole screen, so the zone is a **takeover, not an overlay**: while it is open the Current Session page renders the zone and nothing else — no Completed exercises, no End session, no stale-session line. The app's nav bar sits above it and stays visible throughout. | The one thing being done mid-set is recording a set, and everything else on the tab is either history or a way to stop. A takeover costs no `position: fixed`, no z-index, no scroll lock and no focus trap — it is a page state, which React already has. Keeping the nav means the app never feels stuck, and the user can leave to another tab without hunting for a close button. |
| Z2 | The chooser belongs **inside** the zone, so the session page has exactly one control on it: **Record new exercise**. | Prominence was the whole point. A big button beside a dropdown is two things competing, and the dropdown wins by being the one that does something. Cost: the zone has an empty first state, before a movement is picked. |
| Z3 | The **×** is the only way out, and there is one of it. No Escape key, no browser-Back handling, no tap-outside — there is no outside. | Back and Escape both mean "close the layer" only when there is a layer; under Z1 there is not, and teaching Back to mean something different on one page state is machinery for an expectation the takeover does not set. Nothing is at risk either way: every set was saved as it was logged (A7). |
| Z4 | The zone changes no URL and pushes no history entry. Opening it, picking a movement and closing it are all one route. | It is a state of the workout, not a destination. Nobody links to "the bench press zone"; they link to the tab. Cost: a reload closes the zone, exactly as a reload already drops a held exercise (A10). |
| Z5 | History is fetched **once, when an exercise is picked** — one request per movement, not per set and not per session. | It cannot change while the user is inside the zone: the only sets being written are this session's, and those are already on screen from `session` state. Refetching would cost a request per set to show identical numbers. |
| Z6 | The boxes start **empty**, always. History is for reading, not for seeding. | A prefilled box is a number the user did not type, and the failure is silent: a deload, a bad night, a different bar, and the app has quietly logged last week. Reading three numbers off the screen is cheaper than noticing two wrong ones in a box. |
| Z7 | Three past sessions is the right amount of history: the last one in full, beside this one, and the two before it as a line each. | One is a comparison; three is a direction. Beyond that it is a chart, and a chart is a different feature on a different screen. |

## Vocabulary

Used precisely across the chunks. They are not interchangeable.

- **The zone** — the full-page state chunk 02 builds.
- **The chooser** — the `<select>` that picks a movement. Inside the zone (Z2).
- **Holding** an exercise — the existing client-side state (A10), unchanged.
- **This session** — sets logged into the held exercise in the running workout,
  read off `session` state. Editable, as they are today (chunk 05).
- **Last time** — the most recent *previous* session containing this movement.
  Read-only.
- **Earlier** — the two sessions before that. Read-only, one line each.

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it describes
what already exists, the stack, the data model and the assumptions, and produces
no code and no screen of its own. Every visible change lives in a numbered chunk.
