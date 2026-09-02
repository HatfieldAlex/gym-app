# Download your data — build specs

Everything the app holds for you, out of it and onto your own disk: one zip
holding a CSV per table for rebuilding the database exactly, and a denormalised
`workouts.csv` a spreadsheet can read. From the Settings page in a tap, and from
a terminal with `manage.py export_data`.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [The export module](01-export-module.md) — new `dataexport` app, `export.py`, the nine CSVs, the zip, tests | `backend/` | — |
| 02 | [The endpoint](02-backend-endpoint.md) — `GET /api/v1/export/`, the route, tests | `backend/` | 01 |
| 03 | [The command](03-management-command.md) — `manage.py export_data --user --output`, tests | `backend/` | 01 |
| 04 | [Download your data](04-download-on-settings.md) — `api.download()`, the Settings section, its styles | `api.js`, `Settings.jsx`, `styles.css` | 02 |

**No chunk has a migration.** The feature adds no model and no column, so
[docs/schema.dbml](../../backend/docs/schema.dbml) must come out of all four
byte-identical — it is generated, and a diff in it means something was touched
that should not have been.

## Why this order

**01 carries the whole feature and all of its risk.** The export is a
transcription of seven models plus `auth.User` into nine files, and everything
that can actually go wrong lives there: a column in the wrong order, a
`Decimal` rounded, a timestamp truncated to seconds, another user's set in the
wrong zip, a password hash where it should not be. It is also the only part that
is pure — rows in, bytes out, no HTTP and no argv — so it is the only part that
can be tested exhaustively and cheaply. It is deliberately the biggest chunk,
and the three after it are thin.

That division is not invented for this feature. `schemadocs` already does it:
[dbml.py](../../backend/schemadocs/dbml.py) renders the document and
[export_dbml.py](../../backend/schemadocs/management/commands/export_dbml.py) is
twenty lines of plumbing over it. 02 and 03 are the same twenty lines, twice.

**02 and 03 are independent of each other** and could be built in either order,
or at the same time. They share chunk 01's module and touch no file in common —
02 adds `views.py` and one line to `api_urls.py`, 03 adds
`management/commands/export_data.py`. The endpoint is numbered first only
because 04 needs it and it is the half a user will meet.

**04 is one chunk and not two.** `api.download()` on its own changes nothing
anybody can see and cannot be reviewed except by reading it — a helper with no
caller is the definition of a chunk that only makes sense once the next one
lands. It ships with the section that uses it.

**There is no styling chunk**, which is a departure from the other spec
directories here. The visible surface of this feature is a heading, a sentence,
a button and an error line, in a page that already has `.notes-section` as a
model for exactly that shape; the CSS is under a dozen lines and belongs with
the markup it hangs on. A separate chunk for it would be padding.

**The backend tests live inside the chunks that add the code they test** — 01,
02 and 03 each grow `dataexport/tests.py` by a class. There is no test chunk at
the end, because a chunk whose tests arrive later is a chunk nobody could review
when it landed. There are **no frontend tests** in 04: the project has no runner
at all, and adding one is out of scope.

## What is in the zip

```
workouts.csv                       one row per set, oldest first, movements named
tables/users.csv                   no password column, ever
tables/training_sessions.csv
tables/performed_exercises.csv
tables/performed_sets.csv
tables/performed_reps.csv
tables/exercise_definitions.csv
tables/exercise_prescriptions.csv
tables/feedback_notes.csv
```

The readable file at the top, the eight rebuild-fidelity files one level down.
Every one of them is always present with its header row, even the two that are
normally empty. [00-context.md](00-context.md) has the exact columns, in order,
for all nine, and the scoping rules for each.

A normal user gets their own rows (plus the shared exercise catalogue, which
everyone can already see through `GET /api/v1/exercises/`). A superuser gets
every user's.

## The one thing to get right

**There is no position column anywhere in this schema.** The order of exercises
within a session, and of sets within an exercise, is carried only by
`created_at` — the models say so in a comment on each. So every ordering in the
export is `created_at` ascending, and every timestamp is written at full
microsecond precision. A truncated timestamp does not lose a few digits; it
loses the only record of what order the workout happened in, and it does it
silently. 00-context calls this the ordering trap and every chunk leans on it.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **Any import, restore or round-trip.** Nothing in the app reads a zip back
  (E12). The CSVs are for a human, a spreadsheet, or a script somebody writes
  later.
- **Scheduled or automatic backups.** Chunk 03 is what makes a schedule
  possible; no chunk adds a cron entry, a Heroku Scheduler config, a `Procfile`
  line or a `make` target that runs on a timer.
- **Changing any existing model, endpoint or migration.** Not one column, not
  one field on `auth/session/`, not one line of `observations/`, `catalog/`,
  `protocols/`, `feedback/` or `accounts/` beyond the single `INSTALLED_APPS`
  entry chunk 01 adds.
- **Frontend tests.** The project has no runner; chunk 04 is verified by hand
  with `make run`.
- **Choosing what to export** — a date range, a table picker, a
  `?format=json`, a "sessions only" option. One zip, all nine files, every time.
- **A README, manifest, schema or SQL dump inside the zip** (E5). Nine CSVs and
  nothing else.
- **Uploading it anywhere.** No S3, no email, no bucket, no webhook, no new
  dependency in `requirements.txt`.
- **Anything computed.** No totals, no volume, no 1RM, no personal bests, no
  session summaries. The export reports what is stored.
- **A page, a route or a nav link for exporting.** It is a section on Settings
  and a URL under `/api/v1/`.
- **Deleting your data, or an account-closure flow.** Downloading is not the
  first half of anything.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the feature, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–04 are in is the sum of the "What the user sees" sections
in those chunks: a **Download your data** section on Settings that hands them a
zip of their whole training history in a tap, and — for whoever holds a
terminal — the same zip out of `manage.py export_data`, locally or through
`heroku run`.
