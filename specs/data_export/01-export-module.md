# 01 — The export module

**Goal:** one function that turns a user into a zip of nine CSVs. Pure Python
over the ORM, with no idea that HTTP or a command line exists.

Backend only. **No migration** — this chunk adds no model and no column. No
route, no command, no frontend file changes; chunks 02, 03 and 04 are the three
callers.

## Read first

- [00-context.md](00-context.md) — the nine files, their exact headers, the
  ordering trap, and E1–E10. This chunk is that file made executable.
- [backend/observations/models.py](../../backend/observations/models.py),
  [backend/catalog/models.py](../../backend/catalog/models.py),
  [backend/protocols/models.py](../../backend/protocols/models.py),
  [backend/feedback/models.py](../../backend/feedback/models.py) — read the
  field declarations in order; the CSV headers are those, in that order
- [backend/schemadocs/dbml.py](../../backend/schemadocs/dbml.py) — the module to
  imitate: module-level constants, small named functions, a `render()` at the
  end that puts the whole document together. Nothing in it imports from Django's
  request or command layers.
- [backend/schemadocs/apps.py](../../backend/schemadocs/apps.py) and
  [backend/schemadocs/models.py](../../backend/schemadocs/models.py) — how an
  app with no models is laid out here
- [backend/observations/views.py](../../backend/observations/views.py) — the
  four scoping paths, to copy rather than re-derive
- [backend/feedback/tests.py](../../backend/feedback/tests.py) — the test
  conventions

## Build

### 1. The app

Create `backend/dataexport/` as a Django app and add `'dataexport'` to
`INSTALLED_APPS` in [settings.py](../../backend/settings/settings.py), after
`'feedback'`. `AppConfig.name` is `'dataexport'`; give it a docstring saying it
holds no models and exists so `manage.py export_data` (chunk 03) is discovered.

It needs an app, not a loose module, for exactly that reason — Django only finds
management commands inside installed apps. Files: `__init__.py`, `apps.py`,
`export.py`, `tests.py`. **No `models.py` and no `migrations/`**: unlike
`schemadocs` there is no `post_migrate` signal to receive, so there is nothing
for an empty models module to enable. Name the app `dataexport`, one word, as
`schemadocs` is.

### 2. `export.py`

The whole of this chunk. A module docstring saying what it is: everything the
requester can see, in two forms — the raw tables so the database can be rebuilt,
and `workouts.csv` so a spreadsheet can read it.

Public names the later chunks call, and which must not be renamed:

```python
build_archive(user=None, at=None) -> (filename: str, content: bytes)
zip_filename(user=None, at=None) -> str
CSV_FILES                       # the ordered specification of all nine files
render_csv(header, rows) -> bytes
```

- **`user=None` means every row** — the everything-scope (E11). A `user` whose
  `is_superuser` is true gets the same rows, under their own name.
- `at` is the timestamp in the filename, defaulting to `timezone.now()`. It is a
  parameter so a test can pin it.

Inside:

1. **A value formatter.** One function that turns any field value into its cell
   string, per the table in 00-context: `None` → `''`; datetime →
   `.astimezone(datetime.timezone.utc).isoformat(timespec='microseconds')`;
   everything else → `str(value)`. Everything in every file goes through it —
   `Decimal` included, untouched and unrounded, so `100.00` stays `100.00` (E9).

2. **`CSV_FILES`** — the ordered specification, one entry per file, carrying the
   path inside the zip (`workouts.csv`, `tables/training_sessions.csv`, …), the
   header tuple, and the callable that yields its rows for a given user. Making
   it data rather than nine hard-coded calls is what lets `build_archive` and
   the tests both walk it, and what makes "all nine are always present" (E8) a
   property of the loop rather than of nine copies.

3. **Eight table functions**, one per file under `tables/`. Each takes the user,
   applies the scope from 00-context's *Who sees what* table, applies the row
   order from its *Row order within each file* table, and yields one list of
   cell strings per row. Read columns off the model instance
   (`row.user_id`, not `row.user.id`) so no function fires a query per row.

4. **`workout_rows(user)`** — the denormalised one. Walk the user's training
   sessions in `started_at`, `id` order; within each, its performed exercises in
   `created_at`, `id` order, numbering them from 1; within each of those, its
   sets in `created_at`, `id` order, numbering them from 1. One row per set,
   exactly (E7): an exercise with no sets contributes nothing here.

   `select_related('user')` on the session and `exercise_definition` on the
   performed exercise, and a `Prefetch` of the sets ordered the same way, so the
   query count is fixed rather than one per row —
   `TrainingSessionViewSet.get_queryset` already does this exact prefetch and is
   the shape to copy.

5. **`render_csv(header, rows)`** — `csv.writer` over an `io.StringIO`, default
   dialect, then `.encode('utf-8')`. No BOM (E10). Header row first, always,
   even when `rows` is empty.

6. **`zip_filename`** — `gym-app-export-<who>-<YYYYMMDD-HHMMSS>Z.zip`, `<who>`
   being `all` for `user=None` and otherwise the username reduced to
   `[A-Za-z0-9._-]` with anything else replaced by `-`, falling back to
   `user-<pk>` if nothing survives. The stamp is `at` in UTC. Explain in a
   comment that the reduction is what keeps `Content-Disposition` in chunk 02
   plain ASCII.

7. **`build_archive`** — an `io.BytesIO`, a `zipfile.ZipFile(…, ZIP_DEFLATED)`,
   one `writestr` per entry in `CSV_FILES` in order, then
   `(zip_filename(user, at), buffer.getvalue())`. Nothing else goes in the zip
   (E5).

### 3. Tests

`dataexport/tests.py`, a `django.test.TestCase` (no HTTP here — chunk 02 tests
the endpoint). `setUpTestData` builds `cls.user`, `cls.other` and `cls.admin`
(a superuser), and gives the first two a session each with exercises and sets,
one of them still open (`ended_at=None`).

Reading a CSV back out of the zip in a test is three lines —
`zipfile.ZipFile(io.BytesIO(content))`, `.read(name).decode('utf-8')`,
`csv.reader` — so assert on parsed rows, not on substrings of the blob.

Cover:

- **All nine files are in the zip**, at the exact paths in 00-context, and each
  has its exact header row — headers compared as a whole list, so a reordered or
  renamed column fails.
- **`performed_reps.csv` and `exercise_prescriptions.csv` are present with a
  header and no data rows** when nothing has written to those tables (E8).
- **Cross-user isolation.** `cls.other`'s sessions, exercises, sets and notes
  appear in none of `cls.user`'s files, and `cls.other` is not in their
  `users.csv`. This is the test the feature exists to not fail.
- **No password.** `users.csv`'s header has no `password` column, and the
  requester's own password hash appears nowhere in the whole zip (search the
  decompressed bytes of every entry for it) (E6).
- **A superuser gets everybody**, and `build_archive(None)` gets the same rows.
- **The catalogue is shared** (E1): an `ExerciseDefinition` the requester has
  never performed is still in their `exercise_definitions.csv`.
- **Ordering.** Seed three sessions whose `created_at` order is the reverse of
  their `started_at` order, and assert `workouts.csv` follows `started_at`
  ascending. Seed sets whose insertion order is not their id order and assert
  `set_number` follows `created_at`. Getting this wrong is invisible until
  somebody backdates a workout.
- **`exercise_number` and `set_number`** start at 1 and restart per parent.
- **Nulls are empty strings**, not `None` or `null`: a `PerformedSet` with only
  `reps` set leaves `weight_kg`, `distance_m`, `duration_s` and `rpe` as `''` in
  both `workouts.csv` and `tables/performed_sets.csv`, and an open session
  leaves `session_ended_at` and `ended_at` empty.
- **Decimals survive**: `weight_kg=Decimal('100.00')` reads back as the string
  `100.00`, not `100.0` and not `100`.
- **Timestamps** match `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00`,
  including one saved with a whole number of seconds (E9).
- **A performed exercise with no sets** is in
  `tables/performed_exercises.csv` and absent from `workouts.csv` (E7).
- **Awkward text survives the CSV**: a feedback note whose body holds a comma, a
  double quote and a newline reads back through `csv.reader` byte-identical, and
  a non-ASCII exercise name comes back as itself.
- **A user with no data at all** gets a valid zip: nine files, nine headers,
  their own row in `users.csv`, and no rows anywhere else but the catalogue.
- **Query count is bounded**: `assertNumQueries` around `build_archive` for a
  user with several sessions of several exercises of several sets, asserting a
  fixed number rather than one that grows with the rows. Pin whatever the
  implementation actually costs; the point is that adding a set does not add a
  query.

## Done when

- `make test` passes, and the count has gone up from 90 by the tests above.
- `python manage.py makemigrations --check` reports nothing outstanding, and
  `git status` shows [docs/schema.dbml](../../backend/docs/schema.dbml)
  unchanged.
- In `make shell`:

  ```python
  from django.contrib.auth import get_user_model
  from dataexport import export
  name, blob = export.build_archive(get_user_model().objects.first())
  name          # 'gym-app-export-…-20260902-141133Z.zip'
  import io, zipfile; sorted(zipfile.ZipFile(io.BytesIO(blob)).namelist())
  ```

  lists the nine paths, and `export.build_archive()` with no argument returns a
  filename containing `-all-`.
- After `make dummy-data`, the zip for a seeded athlete opens in a spreadsheet:
  `workouts.csv` reads as a training log, oldest first, one line per set, with
  the movement named.

## Do not

- Add a model, a migration, an index, a `models.py` or a `migrations/` package.
- Add a route, a view, a serializer or a management command — those are chunks
  02 and 03, and adding one here makes this chunk unverifiable on its own.
- Import anything from `rest_framework`, `django.http` or
  `django.core.management` into `export.py`. It is a module about rows.
- Compute anything: no totals, no volume, no 1RM, no session summaries, no
  personal bests. The export reports what is stored.
- Round, truncate or reformat a `Decimal` or a datetime (E9).
- Write a `password`, a session key or an API token into any file (E6).
- Put a README, a manifest, a JSON file or SQL into the zip (E5).
- Write an import, a loader, or a test that reads the zip back into the database
  (E12).
- Touch `observations/`, `catalog/`, `protocols/`, `feedback/`, `accounts/` or
  `schemadocs/`, beyond the one line added to `INSTALLED_APPS`.
- Change anything under `frontend-web/`.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes and no URL
answers differently, so every screen looks and behaves exactly as it did.

What changes is what the app is *capable* of: `dataexport.export.build_archive`
can now hand anyone their whole training history as a zip. Until chunk 02 or 03
lands, `make shell` is the only way to ask for one.
