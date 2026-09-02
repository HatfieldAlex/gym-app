# 01 — Backend: an entry that knows who added it, and a name that cannot be said twice

**Goal:** make the catalogue table safe to write to before anything can write to
it. `ExerciseDefinition` gains `created_by`, gains a case-insensitive uniqueness
constraint on `name`, and says both of those in the admin.

Backend only, `backend/catalog/` only. No API change in this chunk — the viewset
is still read-only when it ends, and chunk 02 opens it. No frontend files change.

## Read first

- [backend/catalog/models.py](../../backend/catalog/models.py) and
  [backend/catalog/admin.py](../../backend/catalog/admin.py) — all three columns
  and the whole admin, as they stand
- [backend/observations/models.py](../../backend/observations/models.py) — the
  `Meta` conventions, the `constraints` list on `TrainingSession`, and the
  comments explaining each `on_delete`
- [00-context.md](00-context.md), assumptions N4, N6, N9

## Build

1. **`created_by`.** A new field on `ExerciseDefinition` (N6):

   ```python
   created_by = models.ForeignKey(
       settings.AUTH_USER_MODEL,
       on_delete=models.SET_NULL,
       null=True,
       blank=True,
       related_name='exercise_definitions_added',
       help_text='who first added this movement; null for the seeded and admin-created rows',
   )
   ```

   Import `settings` from `django.conf`, as `observations/models.py` does. Two
   choices to keep, with a comment saying why: `SET_NULL` rather than `CASCADE`,
   because deleting a user must not delete a movement that everybody's history
   points at (`PerformedExercise.exercise_definition` is `PROTECT`ed, so the
   delete would fail anyway — loudly, in the middle of deleting a user); and
   `null=True`, because the rows already in the table have nobody to attribute
   and the admin will keep adding rows that have nobody either.

2. **Case-insensitive uniqueness.** Add a `constraints` list to `Meta`:

   ```python
   constraints = [
       models.UniqueConstraint(
           Lower('name'),
           name='exercisedef_name_ci_unique',
       ),
   ]
   ```

   `from django.db.models.functions import Lower`. **Keep `unique=True` on the
   field as well.** The two are not redundant: `unique=True` is what makes DRF
   generate a field-level validator and what the DBML records as the column's
   own contract, while the constraint is the database's backstop for the case
   and whitespace variants `unique=True` cannot see (N4). Say that in a comment,
   or the next reader will delete one of them.

   Whitespace is *not* the constraint's job — `Lower('name')` does not collapse
   internal runs of spaces, and normalising on the way in is chunk 02's (N9).
   The constraint catches the case variants and any duplicate that reaches the
   database another way, such as two requests racing.

3. **Collisions in the existing data.** The constraint cannot be applied while
   two rows collide under it. Before migrating, check:

   ```
   make shell
   >>> from django.db.models.functions import Lower
   >>> from catalog.models import ExerciseDefinition
   >>> (ExerciseDefinition.objects.annotate(key=Lower('name'))
   ...     .values('key').annotate(n=models.Count('id')).filter(n__gt=1))
   ```

   An empty result — which is what a catalogue seeded with `Squat` and
   `Bench press` gives — means the migration applies as generated. If it is not
   empty, stop and say so rather than picking a winner: merging two catalogue
   rows means repointing `PerformedExercise` rows, which is a data migration and
   a decision about somebody's history, not a step in this chunk.

4. **Admin.** In `catalog/admin.py`, on `ExerciseDefinitionAdmin`:

   - `list_display = ('name', 'created_by', 'created_at')`
   - `list_filter = ('created_by',)` — the curation question is "what has been
     added from the app, and by whom"
   - `search_fields` stays `('name',)`; it is also what makes this model
     autocompletable from `PerformedExerciseAdmin`, so do not narrow it
   - `readonly_fields = ('id', 'created_at')` stays as it is
   - `autocomplete_fields = ('created_by',)`, and `list_select_related =
     ('created_by',)` so the change list does not fetch a user per row

   `created_by` stays editable in the admin form: an admin correcting who added
   a row is exactly the curation N6 records it for.

5. **Migration.** `makemigrations catalog` then `migrate`. It is one
   `AddField` and one `AddConstraint` — nothing backfilled, no other table
   touched. The `migrate` run also rewrites
   [docs/schema.dbml](../../backend/docs/schema.dbml) through `schemadocs`;
   commit that diff, and **do not hand-edit the file**.

## Done when

- `make migrate` applies one new migration and prints
  `schemadocs: regenerated …/schema.dbml`.
- `python manage.py makemigrations --check` reports nothing outstanding.
- `docs/schema.dbml`'s `catalog_exercisedefinition` table has a nullable
  `created_by_id` referencing the user table with `on_delete=SET_NULL`, and the
  `exercisedef_name_ci_unique` constraint; no other table in the file changed.
- `make test` still passes, unchanged. Nothing in the existing suite knows about
  either field, and this chunk gives it no reason to.
- In `make shell`, with `Squat` already in the catalogue:
  `ExerciseDefinition.objects.create(name='squat')` raises `IntegrityError`, and
  so does `name='SQUAT'`. `name='Squat variation'` does not.
- A new entry created without `created_by` saves, and comes back with
  `created_by` as `None` rather than failing.
- The admin change list at `/admin/catalog/exercisedefinition/` shows the
  **Created by** column, filters by it, and still searches by name.

## Do not

- Open the viewset for writes, add a `create` path, or touch
  `catalog/serializers.py` or `catalog/views.py` — that is chunk 02, and doing it
  here makes this chunk unverifiable on its own.
- Remove `unique=True` from `name` in favour of the constraint (step 2).
- Add `muscle_group`, `equipment`, `category`, `description`, `aliases`, `slug`
  or `is_active` (N3, N2).
- Add a per-user catalogue, an `owner` field, or any read-time filter (N1).
- Normalise or lower-case the stored `name` (N9) — the constraint compares a
  lowered copy; the column keeps what was typed.
- Write a data migration that merges, renames or deletes existing rows (step 3).
- Touch `observations/`, `protocols/` or `accounts/`.
- Hand-edit `docs/schema.dbml`.
- Change anything under `frontend-web/`.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes and the API
answers exactly as it did, so every screen looks and behaves as before — the
catalogue page still lists what it listed, and the Current Session dropdown
still offers the same movements.

What changes is what the table can now promise: two spellings of one movement
can no longer both exist, and every row added from here on can say who added it.
Whoever holds the admin login — on this app, the person using it — gets a
**Created by** column and filter on `/admin/catalog/exercisedefinition/`, empty
for every row until chunk 02 lets the app write one.
