# 02 — Backend: the API carries the loading, and answers it once

**Goal:** the two columns become visible and settable through the API —
`bar_kg` and `sides` on a catalogue entry, mirrored onto every performed
exercise so a screen with no catalogue in hand can still read them, plus the one
door that fills in a row nobody has answered yet.

Needs chunk 01. Backend only. This is the only chunk with tests: it is the only
contract here that cannot be checked from a screen. **No migration** — this
chunk changes no model.

## Read first

- [backend/catalog/serializers.py](../../backend/catalog/serializers.py) — all
  of it, especially the comment above the declared `name` field and
  `duplicate_entry_error`
- [backend/catalog/views.py](../../backend/catalog/views.py) — the viewset's
  docstring (which says why `PUT`/`PATCH`/`DELETE` are 405) and `perform_create`
- [backend/catalog/tests.py](../../backend/catalog/tests.py) — the two
  `APITestCase` classes and how they name things
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
  lines 41–91 — `exercise_name` at **line 45** and the three serializers that
  inherit it
- [frontend-web/src/api.js](../../frontend-web/src/api.js) lines 18–25 —
  `ApiError.detail`, which decides how an error body reads on screen
- [00-context.md](00-context.md), "Where the derivation lives, and why", and
  assumptions W1, W5, W6, W7

## Build

1. **The catalogue entry carries its loading.** In
   `ExerciseDefinitionSerializer`, `fields` becomes
   `['id', 'name', 'bar_kg', 'sides', 'created_at']`. `read_only_fields` is
   unchanged. `created_by` stays absent (N6, from the new_exercise specs).

   Both fields are **optional on create and both-or-neither** (W7). Declare them
   so the rules are the serializer's rather than the model's accident:

   - `bar_kg` — `DecimalField(max_digits=6, decimal_places=2, min_value=0,
     required=False, allow_null=True)`
   - `sides` — `ChoiceField(choices=[1, 2], required=False, allow_null=True)`
     (W5, AGREED 1)

   In `validate`, beside the existing duplicate check: if exactly one of the two
   is present and non-null, raise a `ValidationError` keyed on the missing one —
   `'Say both the bar weight and the side count, or neither.'` A row with one
   and not the other is unrepresentable in the database anyway (chunk 01's
   `exercisedef_loading_both_or_neither`); answering 400 means the client is
   told rather than 500'd.

   **Nothing here is writable after create.** The viewset offers no update
   method, so a `PATCH` carrying `bar_kg` is still 405 and never reaches this
   serializer (AGREED 2).

2. **The one-way door for a row that has never been asked** (W6, AGREED 5). A
   `@action(detail=True, methods=['post'], url_path='loading')` on
   `ExerciseDefinitionViewSet` — `POST /api/v1/exercises/<id>/loading/`, body
   `{"bar_kg": "25.00", "sides": 2}`.

   - Both fields are **required** here. This endpoint exists to answer the
     question, so a body that answers half of it is a 400.
   - If the row's `bar_kg` or `sides` is **already non-null**, answer **409**
     with `{'detail': '…is already set to 20 + 2×.', 'exercise': <the entry
     serialized>}` and write nothing. This is the whole point of the action:
     unknown → known is allowed, known → different is not, ever (AGREED 2). Say
     that in the docstring, at length, because it is the invariant somebody will
     later try to relax.
     - `detail` is the first key so `ApiError.detail` reads as a sentence
       (api.js:19–25). `exercise` carries the entry so the client can carry on
       with the answer that already exists instead of asking the user again.
   - On success answer **200** with the entry serialized — the same shape a
     create returns — so the client can drop it straight into the catalogue list
     it is holding.
   - Validate the body with `ExerciseDefinitionSerializer(instance, data=…,
     partial=True)` or a small dedicated serializer; either way the `sides`
     choices and the `bar_kg` bounds are the same ones step 1 states, and
     `name` is not settable through this route.
   - No new permission class: the project default is `IsAuthenticated`, so an
     anonymous POST is already 403.
   - The route is registered through the existing router entry. **Do not touch**
     [api_urls.py](../../backend/settings/api_urls.py).

3. **The performed exercise carries its exercise's loading.** In
   `PerformedExerciseSerializer`, beside `exercise_name` at line 45 and for
   exactly the reason its docstring already gives:

   ```python
   exercise_bar_kg = serializers.DecimalField(
       source='exercise_definition.bar_kg',
       max_digits=6, decimal_places=2, read_only=True,
   )
   exercise_sides = serializers.IntegerField(
       source='exercise_definition.sides', read_only=True,
   )
   ```

   Add both to `fields`, after `exercise_name`. Read-only, always: the loading
   belongs to the catalogue entry and is never set through a performed exercise.

   This is the whole of the backend's contribution to the display (see
   00-context, "Where the derivation lives"). Being on the base serializer, it
   is inherited by `PerformedExerciseDetailSerializer` (line 63) and
   `PerformedExerciseHistorySerializer` (line 76), which is what lets the session
   detail page, the zone's "Last time" column and the Earlier lines all read the
   loading without a second request.

   Both are **null when the exercise is unset**, and DRF renders a null source
   as `null` rather than raising — confirm that in a test rather than assuming
   it, because the whole display falls back to today's behaviour on exactly this
   case.

4. **Nothing is computed here.** No `per_side`, no `total`, no expression string
   anywhere in a serializer. The API ships `weight_kg`, `bar_kg` and `sides`,
   and the arithmetic is the frontend's (W2). `PerformedSetSerializer` is not
   edited in this chunk or in any other.

5. **Query cost.** `PerformedExerciseViewSet` and `TrainingSessionViewSet`
   already reach `exercise_definition.name` through the same relation, so
   whatever `select_related` they do today covers these two fields as well.
   Check [observations/views.py](../../backend/observations/views.py) and, if
   `exercise_definition` is not in a `select_related` on a path that now reads
   two more of its columns, add it — one line, and it is the same relation that
   was already being followed.

6. **Tests**, in `backend/catalog/tests.py` (a third `APITestCase` class for the
   action) and `backend/observations/tests.py` (the mirrored fields):

   | Test | Asserts |
   |---|---|
   | a create with both | 201, and the row has `bar_kg` 25.00 and `sides` 2 |
   | a create with neither | 201, both null — an unset row is legal (W7) |
   | a create with one | 400, nothing written |
   | `sides` of 3, of 0, of `"two"` | 400 each |
   | a negative `bar_kg` | 400 |
   | the entry is in the list body | `GET /exercises/` carries `bar_kg` and `sides` on every row, null included |
   | `PATCH` with `bar_kg` | still **405** (AGREED 2) |
   | the action on an unset row | 200, the row is set, the body is the entry |
   | the action on a set row | **409**, `detail` reads as a sentence, `exercise` is the entry, **and the stored values are unchanged** |
   | the action with half a body | 400 |
   | the action, anonymous | 403, nothing written |
   | a performed exercise's body | carries `exercise_bar_kg` and `exercise_sides` matching its definition |
   | a performed exercise of an unset movement | carries both as `null`, and nothing raises |
   | the session detail body | the same two fields are on every nested performed exercise |
   | the history endpoint's body | the same two fields are there too |

   Use `reverse('api:exercise-detail', args=[…])` plus `'loading/'`, as the
   existing tests build their URLs.

## Done when

- `make test` passes, including the existing `dataexport` suite **unedited**.
- `GET /api/v1/exercises/` carries `bar_kg` and `sides` on every entry; the ones
  chunk 01 backfilled carry numbers and the rest carry `null`.
- `POST /api/v1/exercises/` with `{"name": "Trap bar deadlift", "bar_kg": "25",
  "sides": 2}` answers 201 with all three.
- `POST /api/v1/exercises/<unset id>/loading/` with `{"bar_kg": "0", "sides": 1}`
  answers 200 and the row is set; the same POST again answers **409** and the
  row still reads `0 / 1`.
- `PATCH` and `PUT` on `/api/v1/exercises/<id>/` are still 405, with or without
  a loading in the body.
- `GET /api/v1/training-sessions/<id>/` and
  `GET /api/v1/performed-exercises/history/?…` both carry `exercise_bar_kg` and
  `exercise_sides` on every performed exercise.
- `python manage.py makemigrations --check` reports nothing outstanding.
- Every screen still looks and behaves exactly as before: nothing in
  `frontend-web/` reads any of these fields yet.
- `git status` shows nothing modified under `backend/dataexport/`.

## Do not

- Add `per_side`, `total`, `expression` or any computed field to
  `PerformedSetSerializer` — or edit that serializer at all (W2, AGREED 3).
- Read or write `PerformedSet.weight_kg` anywhere in this chunk (AGREED 4).
- Add `UpdateModelMixin`, `DestroyModelMixin`, a `PATCH` route, or a second
  action that changes a loading already set (AGREED 2, W6).
- Let the `loading/` action overwrite a non-null value under any flag,
  parameter or query string.
- Make `bar_kg`/`sides` required on create (W7) — the *form*, in chunk 06, is
  what makes sure they are answered.
- Change `backend/dataexport/` or its tests, or add either column to any CSV
  header (AGREED 8, W11).
- Touch `api_urls.py`, `settings.py`, or `protocols/`, `accounts/`, `feedback/`.
- Change anything under `frontend-web/` — chunks 03.0 onwards are the client.

## What the user sees

**No user-facing changes.** No screen calls any of this yet, so the app looks
and behaves exactly as it did, and the export downloads the same bytes.

What changes is that the loading is now something the app can *read*. Every
catalogue entry comes back saying how it is loaded or saying nothing; every
performed exercise, on every screen that lists one, carries its movement's bar
and side count beside the name it already carried — so the pages in the chunks
after this can show the expression without asking a second time. And there is
now exactly one door for filling in a movement nobody has answered, which opens
once and then refuses.
