# 02 — Backend: the create endpoint

**Goal:** `POST /api/v1/exercises/` puts a movement in the catalogue. It
normalises the name, stamps who sent it, and answers a duplicate with the entry
that already exists rather than with a complaint.

Needs chunk 01. Backend only, `backend/catalog/` only. This is the only chunk
with tests: it is the only contract here that cannot be checked from the screen.

## Read first

- [backend/catalog/serializers.py](../../backend/catalog/serializers.py),
  [views.py](../../backend/catalog/views.py) and
  [tests.py](../../backend/catalog/tests.py) — all three are short, and the last
  one currently asserts the opposite of this chunk
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
  — `validate_<field>` methods, and `perform_create` stamping the user in
  [observations/views.py](../../backend/observations/views.py)
- [frontend-web/src/api.js](../../frontend-web/src/api.js) — specifically
  `ApiError.detail`, which decides how an error body reads on screen
- [00-context.md](00-context.md), assumptions N5, N6, N7, N9

## Build

1. **The serializer owns the name.** In `ExerciseDefinitionSerializer`, declare
   `name` explicitly:

   ```python
   name = serializers.CharField(max_length=120, trim_whitespace=True)
   ```

   Declaring it is the point, not the arguments: a `ModelSerializer` that
   generates the field from `unique=True` also generates a `UniqueValidator`,
   which would answer an exact duplicate first, with its own wording and no
   pointer to the existing row. Every duplicate — exact or a case variant — has
   to come out of one path (N5), so this field is declared here and the check is
   step 3. Comment it, or someone will "simplify" the declaration away and
   quietly reintroduce two different answers to the same question.

   `fields` stays `['id', 'name', 'created_at']` and `read_only_fields` stays
   `['id', 'created_at']`. **`created_by` is not exposed** (N6): it is neither
   readable nor writable through the API, so a client can neither see it nor
   claim it.

2. **`validate_name`** — normalise, then reject what is not a name (N9):

   - Collapse whitespace: `' '.join(value.split())`. This turns
     `"  Bench   press "` into `"Bench press"`, which is what the user meant and
     what makes N4's uniqueness mean anything. `trim_whitespace` only handles the
     ends.
   - Reject the empty result with `'A name is required.'` — a box of spaces is
     not a movement.
   - Return the collapsed value. Do **not** change its case (N9).

   The 120-character cap is already the field's, and it is checked against what
   the user typed rather than the collapsed form. That is fine: collapsing only
   ever shortens.

3. **The duplicate, answered with the entry** (N5). In `validate`, after the
   name is normalised:

   ```python
   existing = ExerciseDefinition.objects.filter(name__iexact=name).first()
   ```

   and if there is one, raise a `ValidationError` whose body carries both the
   sentence and the row:

   ```json
   {
     "name": ["\"Bench press\" is already in the catalogue."],
     "existing": {"id": "…", "name": "Bench press", "created_at": "…"}
   }
   ```

   Three things about that shape, all of which a chunk downstream depends on:

   - **`name` comes first.** `ApiError.detail` in `api.js` returns the first
     message of the first key, so any client that shows `.detail` and nothing
     else still says something true. Put the sentence first and it reads;
     put `existing` first and the user is shown a UUID.
   - **The message quotes the *stored* name**, not what was typed. Someone who
     typed `bench press` is told about `Bench press`, which is the row they will
     be offered — the difference in case is the whole reason they could not find
     it.
   - **`existing` is the entry serialized**, the same three fields a create
     returns. Chunk 03.5 shows it and chunk 04 starts recording against it
     without a further request; both need the name, not only the id.

   Serialize it with this same serializer (`ExerciseDefinitionSerializer(existing).data`).
   The status code is DRF's ordinary 400 — this is a rejected create, and a
   client that only checks `response.ok` must not mistake it for a success.

4. **Stamp the sender.** `perform_create` on the viewset:
   `serializer.save(created_by=self.request.user)` (N6). The user comes from the
   request and never from the body, exactly as `TrainingSessionViewSet` does it.

5. **The race.** Two requests with the same new name, at once, both pass step 3
   and one of them hits `exercisedef_name_ci_unique` from chunk 01. Catch
   `IntegrityError` around the save in `perform_create`, re-read the row with
   `name__iexact`, and raise the *same* `ValidationError` as step 3 — the second
   caller gets the ordinary "already in the catalogue" answer with the entry
   that won, rather than a 500. Small window, one `try`, and the alternative is
   an error page for a user who did nothing wrong. If the re-read finds nothing,
   let the original exception go: that is a different bug and it should be loud.

6. **The viewset opens for creates and nothing else.**

   ```python
   class ExerciseDefinitionViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
   ```

   `from rest_framework import mixins`. That is list, retrieve and create; `PUT`,
   `PATCH` and `DELETE` stay 405 because no mixin provides them (N2). Update the
   class docstring: it currently says the catalogue is read-only and curated
   through the admin, which stops being true here. Say what is true instead —
   anyone signed in may add an entry (N7); editing and removing remain admin
   work, because history points at these rows.

   No permission class is added: the project default is `IsAuthenticated`, so an
   anonymous POST is a 403 already.

   The route is registered and stays as it is — do not touch
   [api_urls.py](../../backend/settings/api_urls.py).

7. **Tests** in `backend/catalog/tests.py`. `test_catalogue_is_read_only` now
   asserts the opposite of the feature: **rewrite it** as
   `test_catalogue_rejects_edits_and_deletes` — `PUT`, `PATCH` and `DELETE` on
   the detail route each answer 405. Leave the other three tests alone; they
   still hold.

   Add, in a second `APITestCase` class for the create route:

   | Test | Asserts |
   |------|---------|
   | anonymous create | 403, and nothing was written |
   | a signed-in create | 201, body has `id`/`name`/`created_at`, the row exists |
   | the sender is stamped | the created row's `created_by` is the requester |
   | `created_by` in the body is ignored | POSTing `created_by` as another user's pk still stamps the requester |
   | whitespace | `"  Front   squat "` is stored as `"Front squat"` |
   | a blank name | `""` and `"   "` are both 400 |
   | too long | 121 characters is 400 |
   | an exact duplicate | 400, `existing['id']` is the existing row's, and no second row was created |
   | a case-variant duplicate | `"bench press"` against `"Bench press"` — same 400, same `existing`, and the stored name is untouched |
   | a whitespace-variant duplicate | `"Bench  press"` — same 400 (this is what step 2's collapsing buys) |
   | the message | the first `name` error quotes the **stored** spelling |
   | it appears in the list | a create then a `GET` finds it, in name order |

   Use `reverse('api:exercise-list')` and `reverse('api:exercise-detail',
   args=[…])` as the existing tests do.

## Done when

- `make test` passes, including the rewritten read-only test.
- `POST /api/v1/exercises/` with `{"name": "Front squat"}` while signed in
  answers 201 with the entry; the same POST again answers 400 with the sentence
  and the `existing` block; `{"name": "front  SQUAT"}` answers 400 the same way.
- The created row's `created_by` is the signed-in user, and no response body
  anywhere mentions `created_by`.
- `PUT`, `PATCH` and `DELETE` on an entry are all 405; an anonymous `POST` is 403.
- `python manage.py makemigrations --check` reports nothing outstanding — this
  chunk changes no model and needs no migration.
- The catalogue page and the Current Session dropdown still work exactly as
  before: this chunk adds an endpoint and changes no response the app already
  reads.

## Do not

- Add `PUT`, `PATCH`, `DELETE`, an `UpdateModelMixin` or a `DestroyModelMixin`
  (N2).
- Expose `created_by` in `fields`, or accept it from the request body (N6).
- Return 200 or 409 for a duplicate, or create a second row for one (N5).
- Lower-case, title-case or otherwise restyle the stored name (N9).
- Add a permission class, a throttle, a moderation flag or an approval step
  (N7).
- Filter the list by user, or add a `?mine=` parameter (N1).
- Touch `api_urls.py`, `settings.py`, or any app but `catalog`.
- Change anything under `frontend-web/` — chunks 03.0 onwards are the client.

## What the user sees

**No user-facing changes.** No screen in `frontend-web/` calls this endpoint
yet, so the app looks and behaves exactly as it did.

What changes is that the catalogue has a door. Anyone signed in can now add a
movement with one request — from `curl`, from the browsable API at
`/api/v1/exercises/` while `DEBUG` is on, and from chunk 03.0 onwards from the
app itself. Ask for something already in the list and the API hands back the
entry that is already there instead of a second copy of it, which is what makes
the two screens in the chunks after this able to say "that one exists — here it
is" rather than "no".
