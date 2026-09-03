# 01 — Backend: two columns, and the backfill that only fills in what is known

**Goal:** `ExerciseDefinition` learns how a movement is loaded — `bar_kg` and
`sides`, both nullable, both-or-neither — and the catalogue rows whose loading
is genuinely knowable are filled in. Everything else stays null and will be
asked for once, later.

Backend only, `backend/catalog/` only. No API change in this chunk: the
serializer does not expose the columns when it ends, and chunk 02 opens them.
No frontend file changes. **This is the only chunk with a data migration.**

## Read first

- [backend/catalog/models.py](../../backend/catalog/models.py) — the whole
  model, all five lines of it, and the comment above `name` explaining why
  `unique=True` and the `Lower('name')` constraint both stay
- [backend/catalog/admin.py](../../backend/catalog/admin.py) — the whole admin
- [backend/observations/models.py](../../backend/observations/models.py) lines
  35–52 — `TrainingSession.Meta.constraints`, the house style for a
  `CheckConstraint` with a comment saying what passes and what does not
- [backend/catalog/migrations/0002_exercisedefinition_created_by_and_more.py](../../backend/catalog/migrations/) —
  the shape of the last migration this app took
- [backend/observations/management/commands/seed_dummy_data.py](../../backend/observations/management/commands/seed_dummy_data.py)
  lines 46–83 — `EXERCISES`, the 34 movements the backfill table is written
  against, all of them lower-case
- [00-context.md](00-context.md), and **AGREED.md's backfill table**, which is
  the authority on which name gets which numbers
- Assumptions W1, W5, W11

## Build

1. **The two columns**, on `ExerciseDefinition`, after `name` and before
   `created_by`:

   ```python
   bar_kg = models.DecimalField(
       max_digits=6,
       decimal_places=2,
       null=True,
       blank=True,
       help_text='weight of the bar, carriage or sled before any plates; null until this movement has been asked about',
   )
   sides = models.PositiveSmallIntegerField(
       null=True,
       blank=True,
       help_text='how many sides the typed weight goes on: 2 for a barbell, 1 for a stack or a sled',
   )
   ```

   `max_digits=6, decimal_places=2` deliberately mirrors
   `PerformedSet.weight_kg` (observations/models.py:109): one convention for
   every weight in the app, and the arithmetic in 00-context depends on both
   sides of the sum carrying two decimals.

   Both nullable, and a comment saying what null means, because it is the one
   thing a later reader will get wrong: **null is "nobody has said yet", not
   zero.** `0 × 1` is a known, answered movement — a stack, a sled, a
   pulldown — and it behaves completely differently from a row that has never
   been asked (AGREED 5).

2. **Three constraints** in `Meta.constraints`, beside the existing
   `exercisedef_name_ci_unique`. Each gets a comment in the style of
   `trainsess_ended_after_started`:

   - `exercisedef_loading_both_or_neither` — both null or both set (W1). One
     without the other cannot be added up and cannot be displayed; making it
     unrepresentable here is what lets every reader test two states instead of
     three.
   - `exercisedef_sides_1_or_2` — `sides` is null, 1 or 2 (W5, AGREED 1). Not a
     `choices` list: the constraint is the database's, and a third value is a
     different kind of machine, which under AGREED 2 is a different catalogue
     entry.
   - `exercisedef_bar_kg_not_negative` — `bar_kg` is null or `>= 0`.

3. **The schema migration.** `makemigrations catalog` — two `AddField`s and
   three `AddConstraint`s, nothing backfilled, no other table mentioned.

4. **The data migration**, a second file, generated with
   `makemigrations catalog --empty --name backfill_loading` and written by hand.

   **It reads and writes `catalog_exercisedefinition` and nothing else.** Not
   one `PerformedSet` is read, and `weight_kg` is not so much as imported
   (AGREED 4). This is the hard fence of the whole iteration: past totals are
   observations and they are not being reinterpreted. If the migration you have
   written imports anything from `observations`, it is wrong.

   - Use `apps.get_model('catalog', 'ExerciseDefinition')`, never the real
     model class — the ordinary rule for data migrations.
   - Match on name **case-insensitively** (`name__iexact`, one `filter().update()`
     per group), consistent with the catalogue's own `Lower('name')` constraint
     and with the fact that the seeded names are all lower-case while a
     hand-added one may not be. AGREED says so in as many words.
   - The name → `(bar_kg, sides)` table is **AGREED.md's, copied verbatim**.
     Do not extend it, do not guess at a name that is not in it, do not
     normalise a near-miss. `seated calf raise`, `walking lunge` and every name
     the table does not list stay null on purpose: prod's catalogue is not
     visible from here, a wrong guess is permanent under AGREED 2, and an unset
     row costs the user one question the first time they train it.
   - Only fill a row whose `bar_kg` **and** `sides` are both null, so re-running
     against a database where somebody has already answered a question changes
     nothing.
   - A reverse operation of `migrations.RunPython.noop` is wrong here — write a
     reverse that nulls **only the rows this migration set**, or, more simply,
     make the forward operation `elidable=False` with `reverse_code` nulling
     both columns for the listed names where they still hold the value this
     migration wrote. Either is fine; a migration that cannot be reversed at all
     is not.

5. **Admin.** On `ExerciseDefinitionAdmin`: add `bar_kg` and `sides` to
   `list_display` after `name`, and a `list_filter` entry for `sides` — the
   curation question a nullable pair raises is "what has not been answered yet".
   Both fields stay **editable in the admin form**: AGREED 2 fences off editing
   *from the app*, and the admin is where a genuinely wrong row is corrected by
   the person who owns the database.

6. **`make migrate`** applies both, and rewrites
   [docs/schema.dbml](../../backend/docs/schema.dbml) through `schemadocs`.
   Commit that diff; do not hand-edit the file.

## Done when

- `make migrate` applies two new migrations and prints
  `schemadocs: regenerated …/schema.dbml`.
- `python manage.py makemigrations --check` reports nothing outstanding.
- `docs/schema.dbml`'s `catalog_exercisedefinition` gains a nullable
  `bar_kg` (decimal) and a nullable `sides` (smallint), and the three new
  constraints. **No other table in that file changed** — in particular
  `observations_performedset` is byte-identical.
- In `make shell`, after `make dummy-data`:
  - `ExerciseDefinition.objects.get(name__iexact='deadlift')` has
    `bar_kg == Decimal('20.00')` and `sides == 2`.
  - `…get(name__iexact='lat pulldown')` has `bar_kg == Decimal('0.00')` and
    `sides == 1`.
  - `…get(name__iexact='seated calf raise')` and `…get(name__iexact='walking lunge')`
    both have `bar_kg is None` and `sides is None`.
  - `ExerciseDefinition.objects.filter(bar_kg__isnull=True).count()` is exactly
    the number of catalogue rows AGREED's table does not name.
  - Saving a row with `bar_kg=Decimal('20')` and `sides=None` raises
    `IntegrityError`; so does `sides=3`; so does `bar_kg=Decimal('-1')`.
- `make test` still passes, **unchanged**. Nothing in the existing suite knows
  about either column, and this chunk gives it no reason to. In particular
  `backend/dataexport/tests.py` is not edited and still passes: the export
  headers are the same nine sets of columns they were.
- `git status` shows nothing modified under `backend/dataexport/` or
  `backend/observations/`.

## Do not

- Read, write, migrate, round or otherwise touch `PerformedSet.weight_kg`, or
  import anything from `observations` into a migration (AGREED 4).
- Add columns to `PerformedSet` for the bar, the sides or the per-side weight
  (AGREED 3). The total is the record.
- Add `bar_kg` or `sides` to `EXERCISE_DEFINITIONS_HEADER` or to any other
  export file, or edit `backend/dataexport/` at all (AGREED 8, W11).
- Expose the columns through the API, touch `catalog/serializers.py` or
  `catalog/views.py`, or open `PUT`/`PATCH` — chunks 02 and 07, and doing it
  here makes this chunk unverifiable on its own.
- Guess at a name AGREED's backfill table does not list, or "improve" the table
  (AGREED 5).
- Give either column a non-null default, or backfill the unmatched rows with
  `0`/`1` "to keep things tidy". Zero is an answer; null is the absence of one.
- Add an enum, a `loading_type`, a `kind`, or a choices list (AGREED 1).
- Change anything under `frontend-web/`.
- Hand-edit `docs/schema.dbml`.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes and the API
answers exactly as it did — the catalogue page lists what it listed, the
dropdown offers the same movements, every set reads the same, and the export
downloads the same bytes.

What changes is what the catalogue can now say. Whoever holds the admin login
gets **Bar kg** and **Sides** columns on
`/admin/catalog/exercisedefinition/`, filled in for the movements whose loading
is not in doubt — deadlift `20 / 2`, lat pulldown `0 / 1`, pull ups `0 / 1` —
and blank for the two the human deliberately left open and for anything the
migration did not recognise. Nothing in the app reads them yet.
