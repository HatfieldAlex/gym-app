# 03 — The command

**Goal:** `manage.py export_data --output backup.zip` writes the same zip from a
terminal, so it can be run through `heroku run` against production and scheduled
later without a browser in the loop.

Needs chunk 01. Independent of chunk 02 — it shares the module, not the view.
Backend only; no frontend files change, and no migration.

## Read first

- [00-context.md](00-context.md) — E11 (no `--user` means everything) and the
  zip filename
- [backend/schemadocs/management/commands/export_dbml.py](../../backend/schemadocs/management/commands/export_dbml.py)
  — **the command to mirror**, top to bottom: `help`, `add_arguments` with
  `-o/--output` and `-` for stdout, a `handle` that is nothing but plumbing, and
  `CommandError` for the failure case
- [backend/observations/management/commands/seed_dummy_data.py](../../backend/observations/management/commands/seed_dummy_data.py)
  — the other command here, for its module docstring and its use of
  `self.style.SUCCESS`
- `backend/dataexport/export.py` as chunk 01 left it

## Build

### 1. `dataexport/management/commands/export_data.py`

With `dataexport/management/__init__.py` and
`dataexport/management/commands/__init__.py` beside it, as `schemadocs` has.

```
manage.py export_data [--user USERNAME] [-o PATH | -o -]
```

`help`: `Write every row a user can see to a zip of CSVs.`

**`--user USERNAME`** — export as that user, with that user's scope: their own
rows, unless the account is a superuser, in which case everything. Omitted, the
command exports **everything** (E11): the command exists for a backup, and a
backup is the whole database. An unknown username is a `CommandError`, not a
traceback and not an empty zip.

**`-o/--output PATH`** — where to write. `-` writes the zip to stdout. Omitted,
the file is written into the current working directory under the name
`export.zip_filename` chose, and the path is printed.

### 2. `handle`

Plumbing only, as `export_dbml`'s is. Resolve the user, call
`export.build_archive(user)`, write the bytes.

Two details that are not obvious and are the whole reason this chunk is not one
line:

- **stdout has to be binary.** `self.stdout` is Django's `OutputWrapper` around a
  text stream and will not take zip bytes; write to `sys.stdout.buffer` and
  flush it. And when `--output -` is in play, **nothing else may go to stdout** —
  every message, including the success line, goes to `self.stderr`, or the zip
  arrives corrupt with a sentence glued to the front of it.
- **Writing to a path** is `pathlib.Path(...).write_bytes(...)`, after
  `parent.mkdir(parents=True, exist_ok=True)` — `export_dbml.write()` does the
  same, for the same reason.

On success with a real path, one line through `self.style.SUCCESS`, naming the
path and the size, e.g. `Wrote /home/a/backup.zip (412.3 kB)`.

### 3. Tests

Add a third class to `dataexport/tests.py`, a plain `django.test.TestCase`
driving the command with `django.core.management.call_command` and capturing
output with `StringIO`. Write real files into a `tempfile.TemporaryDirectory()`.

- `--output <path>` writes a file at that path, and it opens as a zip with the
  nine entries.
- With no `--output`, a file appears in the working directory under the name
  `export.zip_filename` returns. Run it inside a temporary directory so the test
  does not litter the repository.
- `--user lifter` produces the same rows as `build_archive(that_user)`: the
  other user's session id is in none of the entries.
- **No `--user` exports everything** — both users' sessions are in it, and the
  filename contains `-all-` (E11).
- `--user` naming a superuser gets everything too.
- `--user nobody` raises `CommandError` and writes no file.
- `--output -` writes zip bytes to stdout and **nothing** to stdout but those
  bytes: capture it binary, and assert the first two bytes are `PK` and that the
  captured stream opens as a zip.

## Done when

- `make test` passes, with the new cases on top of chunks 01 and 02.
- From `backend/`:

  ```
  ../.venv/bin/python manage.py export_data -o /tmp/all.zip
  ../.venv/bin/python manage.py export_data --user lifter -o /tmp/lifter.zip
  ../.venv/bin/python manage.py export_data --user lifter -o - > /tmp/piped.zip
  ../.venv/bin/python manage.py export_data
  ```

  write, respectively: everything; that athlete's rows; a byte-identical zip
  through the pipe; and a stamped file in the current directory whose path is
  printed. `unzip -l` lists nine entries in all four.
- `../.venv/bin/python manage.py export_data --user nobody` prints an error and
  exits non-zero, having written nothing.
- `manage.py help export_data` describes both flags in one screen.
- `manage.py help` lists `export_data` under `[dataexport]`.
- Nothing else changed: `git status` shows no migration and no change to
  [docs/schema.dbml](../../backend/docs/schema.dbml).

## Do not

- Add a `--check` flag. It is meaningful for `export_dbml`, whose output is a
  tracked file; a backup has nothing to be out of date with.
- Add `--format`, `--tables`, `--since`, `--compress`, or a flag to leave a file
  out. One zip, all nine files, every time.
- Add a `make` target, a cron entry, a Heroku Scheduler config, a `Procfile`
  line, or anything else that runs it on a timer — scheduling is out of scope by
  name, and this chunk is what makes it possible later.
- Upload anywhere: no S3, no email, no bucket, no `requests`, no new dependency
  in `requirements.txt`.
- Print progress bars, per-table counts or a summary table. One line, or silence
  when the zip is going to stdout.
- Change `export.py`, `views.py` or `api_urls.py`. This chunk is a second caller
  of chunk 01's module, not a second implementation.
- Change anything under `frontend-web/`.

## What the user sees

**No screen changes.** The app is untouched; this chunk is for whoever holds a
terminal — which on this app is the same person using it.

What they get is a backup they can take without a browser: `manage.py
export_data -o backup.zip` locally, and
`heroku run --no-tty 'python manage.py export_data -o -' > backup.zip` against
production, pulling the whole database down as CSVs in one command.
