# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## What is being built

**Getting the whole thing out.** A "Download your data" section on the Settings
page produces a single zip containing every row the requester can see, in two
forms at once:

* **one CSV per table** — `training_sessions`, `performed_exercises`,
  `performed_sets`, `performed_reps`, `exercise_definitions`,
  `exercise_prescriptions`, `feedback_notes`, `users` — carrying raw UUIDs,
  foreign keys and full-precision `created_at` / `started_at` / `ended_at`
  timestamps, so the database can be rebuilt exactly;
* plus a denormalised **`workouts.csv`**, one row per set, readable in any
  spreadsheet.

A normal user gets their own rows; a superuser gets every user's. Password
hashes are never exported. The same export module backs a
`manage.py export_data --output` command mirroring the existing `export_dbml`,
so it can be run via `heroku run` and scheduled later. A new `api.download()`
helper carries the zip, keeping the app's busy/failed convention rather than a
bare `<a href>`.

**Deliberately out of scope**, in every chunk: any import or restore path;
scheduled or automatic backups; changing any existing model, endpoint or
migration; frontend tests (the project has no runner).

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite locally and Postgres on
  Heroku. Apps are top-level packages under `backend/` (`accounts`, `catalog`,
  `protocols`, `observations`, `feedback`, `schemadocs`), listed in
  `INSTALLED_APPS` in [settings.py](../../backend/settings/settings.py). Routes
  are registered in [api_urls.py](../../backend/settings/api_urls.py) under
  `/api/v1/`.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. Django serves the built `index.html` for every
  non-API route.
- `make run` brings both up: the API on :8000, the app on
  <http://localhost:5173>. Vite proxies `/api` and `/admin` through to Django
  (`vite.config.js`), so the browser sees one origin and the session cookie
  works — including for a zip download.
- `make test` is `cd backend && python manage.py test`. **Baseline: 90 tests,
  all passing.** Every chunk that adds tests adds to that number and breaks
  none of it.
- **No migration in any chunk.** This feature adds no model and no column, so
  [docs/schema.dbml](../../backend/docs/schema.dbml) must come out of every
  chunk byte-identical. It is generated; never hand-edit it.

## The data model, and the shape of it

Seven models plus `auth.User`. Read
[observations/models.py](../../backend/observations/models.py),
[catalog/models.py](../../backend/catalog/models.py),
[protocols/models.py](../../backend/protocols/models.py) and
[feedback/models.py](../../backend/feedback/models.py) before writing a line of
chunk 01 — the export is a transcription of those files and nothing else.

The training data is four levels deep, each level cascading from the one above:

```
auth.User
  └─ TrainingSession        user FK CASCADE
       └─ PerformedExercise  training_session FK CASCADE
            │                exercise_definition FK PROTECT  → catalog
            │                exercise_prescription FK SET_NULL, nullable → protocols
            └─ PerformedSet   performed_exercise FK CASCADE
                 └─ PerformedRep  performed_set FK CASCADE
```

Off to the side: `ExerciseDefinition` (the shared catalogue),
`ExercisePrescription` (a bare primary key and nothing else — the DBML declared
it that way and the model was left alone), and `FeedbackNote` (a user's own
notes).

Two things that decide how the export is written:

- **`auth.User.id` is an integer**, not a UUID. Every other `id` in the app is a
  UUID. So `user_id`, `created_by_id` are integers and everything else is a
  36-character UUID string. Do not assume one shape.
- **`PerformedRep` is empty in real use.** No endpoint writes it and only
  `seed_dummy_data` ever has. Its CSV is still produced — see E8.

### The ordering trap

**There is no position or order column anywhere in this schema.** The order of
exercises within a session, and of sets within an exercise, is carried *only* by
`created_at` — the models say so in a comment on each:

```python
# Also the order within the session.
created_at = models.DateTimeField(auto_now_add=True)
```

Everything downstream depends on that:

- Every ordering in the export is `created_at` ascending, with `id` ascending as
  a deterministic tie-break. Never `-created_at`, and never the database's
  default (unordered) order.
- `workouts.csv`'s `exercise_number` and `set_number` are **computed** from that
  ordering — they are the readable stand-in for the column the schema does not
  have.
- Timestamps therefore have to be written at **full precision**. Truncating to
  seconds destroys the only record of what order a workout happened in. This is
  the single most expensive mistake available in this feature.
- Sessions themselves sort by **`started_at`**, not `created_at` — a session
  typed up after the fact was trained when `started_at` says, and the rest of
  the app already orders history that way
  (`observations/views.py`, `.order_by('-started_at')`).

`TIME_ZONE = 'UTC'` and `USE_TZ = True`, so every datetime coming off the ORM is
already UTC-aware.

## The nine files, exactly

Inside the zip:

```
workouts.csv
tables/exercise_definitions.csv
tables/exercise_prescriptions.csv
tables/feedback_notes.csv
tables/performed_exercises.csv
tables/performed_reps.csv
tables/performed_sets.csv
tables/training_sessions.csv
tables/users.csv
```

`workouts.csv` sits at the top level and the raw dump under `tables/`, so
unzipping puts the file most people want in front of them and the eight
rebuild-fidelity files one level down. The filenames under `tables/` are the
logical names from the agreed description, not Django's table names; the mapping
is below.

### `tables/` — one CSV per table, raw

Columns are in model-declaration order, so a column can be checked against the
model by reading down. Header row is exactly the column names given here, in
this order.

| File | Model / table | Header |
|------|---------------|--------|
| `users.csv` | `auth.User` / `auth_user` | `id,username,email,first_name,last_name,is_active,is_staff,is_superuser,date_joined,last_login` |
| `training_sessions.csv` | `observations.TrainingSession` / `observations_trainingsession` | `id,user_id,type,created_at,started_at,ended_at` |
| `performed_exercises.csv` | `observations.PerformedExercise` / `observations_performedexercise` | `id,training_session_id,exercise_definition_id,exercise_prescription_id,created_at` |
| `performed_sets.csv` | `observations.PerformedSet` / `observations_performedset` | `id,performed_exercise_id,weight_kg,reps,distance_m,duration_s,rpe,created_at` |
| `performed_reps.csv` | `observations.PerformedRep` / `observations_performedrep` | `id,performed_set_id,rep_index` |
| `exercise_definitions.csv` | `catalog.ExerciseDefinition` / `catalog_exercisedefinition` | `id,name,created_by_id,created_at` |
| `exercise_prescriptions.csv` | `protocols.ExercisePrescription` / `protocols_exerciseprescription` | `id` |
| `feedback_notes.csv` | `feedback.FeedbackNote` / `feedback_feedbacknote` | `id,user_id,body,kind,page_path,created_at,resolved_at` |

`users.csv` has **no `password` column** (E6). Every other concrete field of
`auth.User` is there.

Row order within each file:

| File | Ordered by |
|------|-----------|
| `users.csv` | `id` |
| `exercise_prescriptions.csv` | `id` |
| `performed_reps.csv` | `performed_set_id`, `rep_index` |
| all five others | `created_at`, then `id` |

### `workouts.csv` — one row per set

Header, exactly:

```
username,session_date,session_started_at,session_ended_at,session_type,exercise,exercise_number,set_number,weight_kg,reps,distance_m,duration_s,rpe,training_session_id,performed_exercise_id,performed_set_id
```

| Column | Is |
|--------|-----|
| `username` | `training_session.user.username` |
| `session_date` | the UTC date of `started_at`, `YYYY-MM-DD` — the column a spreadsheet pivots on |
| `session_started_at` | full-precision `started_at` |
| `session_ended_at` | full-precision `ended_at`; **empty for a session still in progress** |
| `session_type` | `training_session.type` |
| `exercise` | `exercise_definition.name` — the name, not the UUID; that is the point of this file |
| `exercise_number` | 1-based position of the performed exercise within its session, by `created_at` |
| `set_number` | 1-based position of the set within its performed exercise, by `created_at` |
| `weight_kg` `reps` `distance_m` `duration_s` `rpe` | as stored; **all five are nullable and empty is normal** |
| `training_session_id` `performed_exercise_id` `performed_set_id` | so a row can be traced back into `tables/` |

Row order: `username`, then `session_started_at`, then `training_session_id`
(tie-break), then the performed exercise's `created_at`, `id`, then the set's
`created_at`, `id`. Ascending throughout — a training log reads forwards.

### Who sees what

`user` below is the requester. A **superuser gets every row of every table**;
this column is the normal user's scope.

| File | A normal user gets |
|------|--------------------|
| `users.csv` | their own row alone |
| `training_sessions.csv` | `user=user` |
| `performed_exercises.csv` | `training_session__user=user` |
| `performed_sets.csv` | `performed_exercise__training_session__user=user` |
| `performed_reps.csv` | `performed_set__performed_exercise__training_session__user=user` |
| `exercise_definitions.csv` | **all of them** (E1) |
| `exercise_prescriptions.csv` | those referenced by their own performed exercises |
| `feedback_notes.csv` | `user=user` |
| `workouts.csv` | their own sets |

The four scoping paths above are the ones already used in
[observations/views.py](../../backend/observations/views.py) — `user=`,
`training_session__user=`, `performed_exercise__training_session__user=`. Copy
them rather than inventing a fifth spelling.

## How values are written

| Value | Written as | Example |
|-------|-----------|---------|
| `None` | the empty string | `` |
| datetime | `.isoformat(timespec='microseconds')` after `.astimezone(datetime.timezone.utc)` | `2026-09-02T14:11:33.123456+00:00` |
| `Decimal` | `str(value)`, exactly as stored — no rounding, no reformatting | `100.00`, `7.5` |
| `bool` | `True` / `False` (Python's `str`) | `True` |
| `int`, `str`, `UUID` | `str(value)` | `a3f1…`, `12` |

`timespec='microseconds'` is deliberate: plain `.isoformat()` drops the
fractional part when it happens to be zero, which makes the column variable
width and makes any test that asserts on it flaky.

CSV mechanics: Python's `csv` module, default dialect (`,` and `\r\n`, RFC
4180), UTF-8, **no byte-order mark** (E10). A feedback note's body can contain
newlines, commas and quotes; `csv.writer` quotes them correctly and nothing else
should try to.

## The zip

- Filename: `gym-app-export-<who>-<YYYYMMDD-HHMMSS>Z.zip`, e.g.
  `gym-app-export-lifter-20260902-141133Z.zip`. `<who>` is the requester's
  username reduced to `[A-Za-z0-9._-]` (anything else becomes `-`; if nothing
  survives, `user-<pk>`), so the name is always plain ASCII and the
  `Content-Disposition` header needs no encoding. `<who>` is `all` for the
  everything-scope export. The stamp is UTC, at the moment the export was taken.
- `zipfile.ZipFile` with `ZIP_DEFLATED`. Built in memory into an
  `io.BytesIO` (E4).
- Nothing else is in it (E5): no README, no manifest, no JSON, no SQL.

## Existing conventions — follow them

- **The management command to mirror** is
  [schemadocs/management/commands/export_dbml.py](../../backend/schemadocs/management/commands/export_dbml.py):
  a thin `BaseCommand` with `-o/--output`, `-` meaning stdout, and all the real
  work in a plain module beside it
  ([schemadocs/dbml.py](../../backend/schemadocs/dbml.py), with `render()`,
  `output_path()` and `write()`). The same division applies here: `export.py`
  knows nothing about HTTP or argv, and both callers are a handful of lines.
- **Auth.** SessionAuthentication only, `IsAuthenticated` project-wide
  ([settings.py](../../backend/settings/settings.py)), under the comment
  *"Everything is somebody's training data; opt out per-view, never
  per-default."* An anonymous request gets **403**, and that is the first test
  in nearly every test class in this project
  ([feedback/tests.py](../../backend/feedback/tests.py),
  [catalog/tests.py](../../backend/catalog/tests.py)).
- **Tests** are Django's own runner: `django.test.TestCase` or DRF
  `APITestCase`, a `setUpTestData` classmethod, `reverse('api:…')` for URLs,
  `force_login`. Cross-user isolation is tested explicitly, with a second user
  called `cls.other`. There is **no frontend test runner at all** — frontend
  chunks are checked by hand with `make run`.
- **Routing.** [urls.py](../../backend/settings/urls.py) ends in a catch-all
  `re_path(r'^.*$', spa)`. Anything not registered under `/api/v1/` is swallowed
  by the SPA shell and comes back as HTML with a 200. A new backend route goes
  in [api_urls.py](../../backend/settings/api_urls.py) or it does not exist.
- **Frontend.** Every request goes through `api` in
  [api.js](../../frontend-web/src/api.js) — never call `fetch` directly from a
  component. Reads use `useLoad` + `<Status>`; a *mutation* keeps its own
  `busy` / `failed` state, exactly as the Log out button in
  [Settings.jsx](../../frontend-web/src/pages/Settings.jsx) does. A download is
  a mutation-shaped thing: it is a tap, it can fail, and it has no state to
  render afterwards.
- **Styles** live in one commented section per page or component at the
  **bottom** of [styles.css](../../frontend-web/src/styles.css). `.button`,
  `.button--tap` (the 44px thumb target), `.status` and
  `.status[data-state="error"]` already exist. `.notes-section` is the model for
  a new block on Settings. Colours come from `currentColor` and `color-mix`,
  never from a hex literal.
- **Comments explain why, not what**, and are sparse. Match that.

## Commands you will want

```
make test                        # the whole suite; 90 before this feature
make run                         # both servers; app at localhost:5173
cd backend && ../.venv/bin/python manage.py export_data -o /tmp/export.zip
unzip -l /tmp/export.zip         # what landed in it
make dummy-data                  # athletes and months of sessions to export
```

## Assumptions

The chunks build as though all of these were true, and cite them by number. None
of them is established: they are the questions the description leaves open,
answered the most likely way so the build has firm ground. Anything wrong here
is wrong in every chunk that leans on it, so this is the first table to argue
with and the cheapest thing to change.

To overturn one: rewrite its row, then `grep` the chunks for its number and
follow through.

| # | Assumption | Why it holds |
|---|------------|--------------|
| E1 | "Every row the requester can see" makes `exercise_definitions.csv` the **whole catalogue** for everyone, and everything else the requester's own. | The catalogue is shared: `catalog/views.py` is the one unscoped queryset in the app, and `GET /api/v1/exercises/` already hands every user every row. It is also needed to resolve the `exercise_definition_id` in their own performed exercises. |
| E2 | The export is a snapshot of what one person can see, **not a referentially closed dump**. A normal user's `exercise_definitions.created_by_id` can name a user who is not in their `users.csv`. | Closing it would mean exporting other people's user rows to a normal user, which is worse than a dangling integer. The superuser export is closed, and that is the one a rebuild uses. |
| E3 | The endpoint is a DRF `APIView` that returns a plain `HttpResponse`, not a `Response` and not a plain Django view. | `DEFAULT_RENDERER_CLASSES` is `[JSONRenderer]`, so a DRF `Response` cannot carry zip bytes — but `finalize_response` passes a non-`Response` `HttpResponseBase` straight through untouched. Going through DRF keeps SessionAuthentication and `IsAuthenticated` exactly as every other route has them, so an anonymous request is a 403 and not `login_required`'s 302 into the SPA catch-all. |
| E3a | **No renderer is added for `application/zip`.** DRF negotiates content in `initial()`, *before* the handler runs, so a caller sending `Accept: application/zip` alone gets a 406 — and every caller in this feature therefore sends `Accept: application/zip, application/json`. | A zip renderer would win negotiation for the error responses too, and DRF would hand it a `{'detail': …}` dict to render as bytes. A 406 for one exotic `Accept` header is a smaller wart than a broken 403 body. |
| E4 | The zip is built in memory and answered whole, not streamed. | One athlete's entire log is tens of kilobytes; the seeded database of five athletes and months of sessions is under a megabyte. `StreamingHttpResponse` would buy nothing and cost a chunk. |
| E5 | The zip holds the nine CSVs and nothing else — no README, no manifest, no schema, no JSON. | The agreed description lists what is in it. A manifest is a thing to keep in step with the export forever, for a file nobody asked for. |
| E6 | `users.csv` omits `password` and nothing else. `last_login`, `date_joined`, `email`, `is_staff` and `is_superuser` are all exported. | Password hashes are the one thing the description forbids by name; the rest are facts about the account and belong to whoever the account is. |
| E7 | `workouts.csv` is one row per **set**, literally. A performed exercise with no sets logged produces no row in it. | It is the readable view, not the record; `tables/performed_exercises.csv` is where an exercise with no sets is still visible. A half-blank row would break every spreadsheet formula over the numeric columns. |
| E8 | All nine CSVs are always present, with their header row, even when they have zero rows — `performed_reps.csv` and `exercise_prescriptions.csv` normally do. | A consumer's script should never have to ask whether a file is there. An empty table is an answer. |
| E9 | Datetimes are UTC ISO-8601 at microsecond precision; `None` is the empty string, in every column of every file. | See the ordering trap: `created_at` *is* the order. One formatting rule everywhere means one function, tested once. |
| E10 | UTF-8 with no BOM, in all nine files. | A BOM helps one spreadsheet and corrupts the first header cell for every naive parser, including `csv.DictReader`. |
| E11 | `manage.py export_data` with no `--user` exports **everything**; `--user <username>` exports as that user, with that user's scope. | The command's reason to exist is `heroku run` and a scheduled backup later, and a backup is the whole database. Naming a user is the exception. |
| E12 | Nothing reads a zip back. No import, no restore, no round-trip test that re-inserts rows. | Out of scope by name in the agreed description. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it describes
the stack, the data and the decisions, and produces no code and no screen of its
own. Every visible change lives in a numbered chunk.
