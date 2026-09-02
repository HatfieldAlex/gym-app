# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## What is being built

A way to put a movement into the exercise catalogue from inside the app, so that
a workout is never blocked by a name that is not on the list yet.

The catalogue is shared reference data. Everything logged in this app points at
one of its rows: `PerformedExercise.exercise_definition` is a `PROTECT`ed
foreign key to `catalog.ExerciseDefinition`, and the Current Session tab can
only log a set against a movement that is already in it. Today the only way in
is the Django admin — so the first time someone trains a movement the app has
never heard of, the flow is: leave the workout, find the admin, add the row,
come back, and hope the page still knows what it was doing.

The shape of the interaction every chunk serves:

1. You need an exercise. It is not in the list.
2. You type its name where you are — on the catalogue page, or in the dropdown
   in the middle of a session.
3. One tap. It is in the catalogue, for you and for everyone.
4. If you are mid-workout, you are now recording it. Nothing navigated, nothing
   reloaded, and the session under you is untouched.

Step 4 is the point. A catalogue you can add to only by stopping the workout is
the situation the feature exists to end.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Apps are top-level packages
  under `backend/` (`accounts`, `catalog`, `protocols`, `observations`), listed
  in `INSTALLED_APPS` in
  [settings.py](../../backend/settings/settings.py). Routes are registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; DRF's project-wide default permission is `IsAuthenticated`, so
  an anonymous request gets 403 rather than rows.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. Django serves the built `index.html` for every
  non-API route.
- `make run` brings both up: the API on :8000, the app on
  <http://localhost:5173>. `make migrate` and `make test` are the other two you
  will want.
- [docs/schema.dbml](../../backend/docs/schema.dbml) is **generated** from the
  models after every `manage.py migrate` by the `schemadocs` app. Never hand-edit
  it; run the migration and commit what it wrote.

## The data model

From [catalog/models.py](../../backend/catalog/models.py) — the whole app is one
model with three columns:

```
ExerciseDefinition   id, name (unique, max 120), created_at
                     (chunk 01 adds created_by and a case-insensitive
                      uniqueness constraint)
```

What points at it, from
[observations/models.py](../../backend/observations/models.py):

```
PerformedExercise    exercise_definition → ExerciseDefinition  (on_delete=PROTECT)
```

`PROTECT` is the fact the whole feature is shaped around: once anyone has
trained a movement, its catalogue row cannot be deleted, and renaming it
rewrites every past session that shows its name. Adding a row is cheap and
safe; changing or removing one is not. See N2.

## Where the feature lives

- **Backend** — `backend/catalog/` only. The viewset there is a
  `ReadOnlyModelViewSet` today; chunks 01 and 02 make it read-and-**add**, and
  nothing else. No other app changes in any chunk.
- **Frontend** — two places, one component:
  - [ExerciseCatalogue.jsx](../../frontend-web/src/pages/ExerciseCatalogue.jsx),
    the list at `/exercises-catelog` (chunk 03.0). The route name is misspelled
    in the code; leave it alone (N12).
  - [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx), in
    the exercise dropdown of the **Record new exercise** section (chunk 04).
  - The form itself is one new shared component,
    `frontend-web/src/components/AddExerciseForm.jsx`, built in 03.0 and reused
    in 04. Both places ask the same question and both send the same POST; two
    copies of it would drift in wording, validation and failure handling.

## Existing conventions — follow them

Read [catalog/](../../backend/catalog/) (the smallest complete app: model,
serializer, viewset, admin, tests) and
[ExerciseCatalogue.jsx](../../frontend-web/src/pages/ExerciseCatalogue.jsx)
before writing anything. For the frontend patterns a *write* needs, read
[Settings.jsx](../../frontend-web/src/pages/Settings.jsx) (a small page that
POSTs and handles its own pending/failed states) and the log-set form in
[CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx). In short:

- Fetch with `useLoad` from [hooks.js](../../frontend-web/src/hooks.js); render
  `<Status state={state} error={error} />` for the waiting and failed cases; set
  the tab title with `useDocumentTitle`. A *mutation* does not use `useLoad` — it
  keeps its own `busy` / failure state, as `Settings.jsx` does.
- All requests go through `api` in [api.js](../../frontend-web/src/api.js) —
  `api.get/post/patch/delete` and `api.list`. Never call `fetch` directly. A 204
  comes back as `null`; a non-2xx throws `ApiError` with `.status`, `.data` and
  `.detail`.
- Semantic HTML with a handful of class names; styles live in one section per
  page or component at the bottom of
  [styles.css](../../frontend-web/src/styles.css). There is a `.button` class
  already, and `.status` / `.status[data-state="error"]` for messages.
- Colours come from `currentColor` and `color-mix`, never from hex literals —
  the app is `color-scheme: light dark` and has no palette.
- On the backend: viewsets scope by the requester, serializers re-check
  ownership on the way in, and comments explain *why*, not *what*. Match that.

## Assumptions

The chunks build as though all of these were true, and cite them by number. None
of them is established: they are the questions the request leaves open, answered
the most likely way so the build has firm ground. Anything wrong here is wrong in
every chunk that leans on it, so this is the first table to argue with and the
cheapest thing to change.

To overturn one: rewrite its row, then `grep` the chunks for its number and
follow through.

| # | Assumption | Why it holds |
|---|------------|--------------|
| N1 | The catalogue stays **one shared, global list**. What anyone adds, everyone sees; there is no per-user catalogue and no ownership filter on reads. | `ExerciseDefinition` has no user column, `name` is globally unique, and every user's `PerformedExercise` rows point into the same table. A private catalogue is a different model, not a flag. |
| N2 | **Adding is the only write.** No renaming, editing, deleting or retiring from the app — those stay in the admin. | `on_delete=PROTECT` means the database refuses to delete a row anything has been logged against, and a rename silently rewrites the name shown against every past session. Both are curation decisions, not things to hand a user mid-workout. |
| N3 | An entry is **a name and nothing else** — no muscle group, equipment, category, description or aliases. | The model has one meaningful column and every screen in the app reads only `name`. Anything more is a schema change with no reader. |
| N4 | Two names that differ only in case or in surrounding/repeated whitespace are **the same movement**. "bench press", "Bench Press" and "Bench  press" all collide with "Bench press". | The dropdown is a flat list of names read at a glance mid-set; three spellings of one movement in it is the failure this feature would otherwise introduce. `unique=True` alone catches none of them. |
| N5 | A duplicate is **an answer, not a scolding**. The API refuses the create and hands back the entry that already exists; the client's job is to offer that one, not to make the user retype. | The user asked for "a catalogue entry called X". One already exists. Nothing about that is a mistake worth an error message and a lost sentence. |
| N6 | **Who added an entry is recorded and never shown.** `created_by` is nullable, `SET_NULL`, and appears only in the admin. | With a writable catalogue, curation needs to know where a row came from. Nullable because the rows that exist today, and anything added in the admin, have nobody to attribute; `SET_NULL` because deleting a user must never delete a movement that everyone's history points at. |
| N7 | **Anyone signed in may add**, with no approval step and no moderation queue. | This is a small app with a handful of trusted users and an admin who can clean up. A queue would put a workout behind someone else's attention. |
| N8 | Adding is **one POST, sent when Add is tapped**. Nothing is queued, nothing is stored locally, and the screen updates from the response rather than ahead of it. | Matches every other write in the app (A7 and A9 in the current-session specs). The app has no rollback machinery; keep the writes boring. |
| N9 | A name is **1–120 characters** after trimming, and is stored as typed apart from that trimming. The cap is the column's. | 120 is what `name` already holds, and matching it means the serializer rejects what the database would. Preserving the typed case matters: the catalogue should read "Romanian deadlift", not "romanian deadlift", because someone was in a hurry. |
| N10 | Adding one mid-workout **costs the user nothing**. No navigation, no reload, no re-read of `current/`, nothing logged disturbed — and the new movement is held for recording the moment it exists. | This is the case the feature is for. An add that drops the user on the catalogue page has moved the trip to the admin, not removed it. |
| N11 | The list on screen takes the **created row from the POST response**, and the catalogue is not re-fetched. | The response is the row, ordering by name is a one-line insert, and a second GET is a second chance to fail. Same rule the current-session page follows for logged sets. |
| N12 | The misspelled route `/exercises-catelog` **stays misspelled**. | Renaming it touches `App.jsx`, `Nav.jsx`, `ExerciseDetail.jsx` and every link, breaks bookmarks, and has nothing to do with adding an exercise. It is a clean commit of its own, later. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it describes
the stack, the model, the conventions and the assumptions, and produces no code
and no screen of its own. Every visible change lives in a numbered chunk.
