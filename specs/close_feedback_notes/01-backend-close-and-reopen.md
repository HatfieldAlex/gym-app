# 01 — Backend: a note can be closed, and reopened

**Goal:** `resolved_at` becomes readable through the API, and two named actions
set it: `POST feedback-notes/<id>/close/` and `POST feedback-notes/<id>/reopen/`.
The same column the admin already resolves (C1), reached the way every other
state change in this app is reached (C3).

Backend only. **No file under `frontend-web/` changes.** No model change, no
migration, no new column.

## Read first

- [backend/feedback/models.py](../../backend/feedback/models.py) — `resolved_at`
  is already there, with the help text that says what null means
- [backend/feedback/serializers.py](../../backend/feedback/serializers.py) — the
  docstring you are about to make wrong
- [backend/feedback/views.py](../../backend/feedback/views.py) — the viewset, and
  its docstring
- [backend/feedback/admin.py](../../backend/feedback/admin.py) — `is_open`,
  `mark_resolved`, `mark_unresolved`. The other half of C1; **do not change it**
- [backend/observations/views.py](../../backend/observations/views.py) —
  `TrainingSessionViewSet.end` and `PerformedExerciseViewSet.end`, the
  `@action(detail=True, methods=['post'])` shape being copied
- [backend/catalog/views.py](../../backend/catalog/views.py) —
  `ExerciseDefinitionViewSet.loading`, an action whose docstring carries the
  decision it enforces; match that habit
- [backend/feedback/tests.py](../../backend/feedback/tests.py) — all of it, and
  in particular the three tests named below
- [00-context.md](00-context.md) — C1, C3, C4, C5, C6

## Build

### 1. The serializer

Add `resolved_at` to `Meta.fields` and to `Meta.read_only_fields`. It goes
**last**, after `created_at`, so the payload reads in the order the note's life
happens.

Read-only, permanently: closing is `close/`'s job and reopening is `reopen/`'s
(C3). A PATCH could not set it even if there were a PATCH route, and there is
not.

Rewrite the class docstring. It currently says `resolved_at` is absent in both
directions and that resolving "never reaches the writer" — both halves are now
false. It should say instead that `user` is still absent both ways, that
`resolved_at` is readable and never writable through the serializer, and that
the column it exposes is the admin's own (C1). Keep it to a few lines, in the
register the file already has.

### 2. `POST /api/v1/feedback-notes/<id>/close/`

An `@action(detail=True, methods=['post'])` on `FeedbackNoteViewSet`, named
`api:feedbacknote-close` by the router.

| The note | The answer |
|----------|------------|
| open (`resolved_at is None`) | `resolved_at = timezone.now()`, `save(update_fields=['resolved_at'])`, **200** with the serialized note |
| already closed | **200** with the serialized note, `resolved_at` **not moved**, nothing written (C4) |

`get_object()` does the scoping, exactly as the other viewsets do it: the
queryset is already `filter(user=self.request.user)`, so another user's note is
not in it and 404s. Add no permission class of your own.

The request body is ignored — there is nothing to send.

### 3. `POST /api/v1/feedback-notes/<id>/reopen/`

The mirror: `resolved_at = None` when it is set, and a no-op 200 when it is
already null. Same scoping, same shape, same answer.

### 4. The docstrings

Both actions get one. Between them they should carry the two decisions a reader
of this file needs and cannot infer:

- **why they are actions and not a PATCH** (C3): a note's body and kind are not
  editable, so the only detail route that may exist is one that changes this one
  column — and a router `@action` builds `<pk>/close/` without building `<pk>/`,
  which is what keeps editing and deleting unreachable rather than merely
  refused;
- **why a repeat is a no-op rather than a 400** (C4): unlike a session's
  `ended_at`, this flag is shared with admin triage and can move under a client
  that is showing a perfectly reasonable stale list. Closing something already
  closed is the outcome the caller asked for. The original close time is not
  overwritten.

Update the `FeedbackNoteViewSet` docstring too: "create and list are the only
two things a client may do" is no longer true. It is now create, list, close and
reopen — and *still* no edit and no delete.

### 5. What does not change, and must be confirmed

Say it out loud in the "Done when" checks rather than assuming it:

- **No migration.** `python manage.py makemigrations --check` reports nothing
  outstanding. The column has existed since the feedback app was written.
- **`docs/schema.dbml` does not move.** It is generated on `post_migrate` and no
  model changed; `git status` must show it unmodified.
- **The CSV export is untouched.** `FEEDBACK_NOTES_HEADER` already ends with
  `resolved_at` and `dataexport/tests.py`'s `HEADERS` already asserts it. Change
  neither file.
- **The admin is untouched.** `is_open`, `mark_resolved` and `mark_unresolved`
  keep working, and after this chunk they are writing the column the API now
  reads (C1).
- **The route registration is untouched.** `router.register('feedback-notes', …)`
  in [api_urls.py](../../backend/settings/api_urls.py) already builds both new
  URLs; the `@action`s are the only thing needed.

### 6. Tests

Two existing tests in `feedback/tests.py` change, because the payload has gained
a field. Change exactly these two and nothing else:

- `test_neither_owner_nor_resolution_is_readable` — half of it is now wrong.
  Rename it for what it now asserts (the owner is still not readable, the
  resolution now is) and assert both: no `user` in the payload, and
  `resolved_at` present and `None` on a note just written.
- `test_the_response_carries_the_five_public_fields_and_no_more` — six fields
  now. Rename, add `resolved_at` to the set, and keep it checking both the
  create response and a row out of the list.

`test_no_route_exists_for_editing_or_deleting_a_note` **must pass unmodified**.
It is the check on C3 and it is worth more than the two above: if a builder
reaches for `ModelViewSet` or a `partial_update`, that test is what says so.
Leave it exactly as it is; if it fails, the approach is wrong, not the test.

Add a `FeedbackNoteLifecycleTests(APITestCase)` alongside, two users as the
existing class has, covering:

- anonymous `close/` and anonymous `reopen/` → **403**;
- another user's note → **404** on both, and the note's `resolved_at` unchanged;
- a random UUID → **404**;
- `GET` on `close/` → **405** (the action is POST-only);
- close an open note → 200, `resolved_at` non-null in the payload **and** on the
  row refreshed from the database;
- close **twice** → 200 both times, and the second answer's `resolved_at` is
  exactly the first's (C4 — assert equality, not just non-null);
- reopen a closed note → 200 and `resolved_at` is null, in the payload and on
  the row;
- reopen an already-open note → 200, still null, nothing written;
- close, reopen, close again → the third stamp is **later** than the first: a
  reopened note closes fresh, it does not remember;
- neither action touches `body`, `kind`, `page_path` or `created_at` — assert
  the row's body and kind are what they were;
- the list carries `resolved_at` for an open note (null) and a closed one
  (a timestamp);
- **the admin and the API write the same column** (C1): create a note, call
  `close/`, and assert `FeedbackNoteAdmin.mark_unresolved` on that queryset
  leaves `resolved_at` null — i.e. that admin triage and the app's control meet
  on `resolved_at` and not merely near it. Call the admin action directly with
  the model's queryset; do not drive the admin through the HTTP client.

## Done when

- `make test` passes, the whole suite, with only the two renamed tests changed
  and one new class added.
- `python manage.py makemigrations --check` reports nothing outstanding.
- `git status` shows no change to `backend/docs/schema.dbml`,
  `backend/dataexport/`, `backend/feedback/models.py`,
  `backend/feedback/admin.py` or `backend/settings/api_urls.py`.
- Signed in, `POST /api/v1/feedback-notes/<id>/close/` returns 200 and the body
  carries `resolved_at` with a timestamp; a second identical POST returns the
  **same** timestamp.
- `POST /api/v1/feedback-notes/<id>/reopen/` returns 200 with
  `resolved_at: null`.
- `GET /api/v1/feedback-notes/` carries `resolved_at` on every note.
- `PATCH`, `PUT` and `DELETE` on `/api/v1/feedback-notes/<id>/` still fall
  through to the SPA view — there is still no detail route to reach.
- With `make run` up: close a note over the API, then load
  `/admin/feedback/feedbacknote/` and see its **open** tick has gone off. Run
  **Mark selected notes unresolved** there and `GET` the list again:
  `resolved_at` is null. One column, both directions (C1).
- The export zip's `tables/feedback_notes.csv` still has its seven columns in
  the same order, and a closed note's `resolved_at` cell is filled.

## Do not

- Add a column, a boolean, a `status` field, a `closed` property or any second
  way of saying `resolved_at IS NULL`. There is one bit and it already exists.
- Write a migration. If one appears, something was changed that should not have
  been.
- Use `ModelViewSet`, or add `retrieve`, `update`, `partial_update` or
  `destroy`. A `/feedback-notes/<pk>/` detail route must still not exist (C3).
- Delete a note, or make either action delete one under any condition (C5).
- Make `resolved_at` writable — not on create, not on update, not "just for
  the admin".
- Add a `?open=` / `?resolved=` query parameter, a filter backend, search or
  ordering to the list (C6).
- Answer a repeat with 400, 409 or 304 (C4), or move `resolved_at` on a second
  close.
- Touch `admin.py`, `models.py`, `dataexport/`, `api_urls.py`,
  `docs/schema.dbml`, or anything under `frontend-web/`.
- Send an email, a webhook or a notification on either action.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes, so Settings
still lists notes exactly as it did: body, date, kind, path, and no controls.

The list request now carries a `resolved_at` on every note, and the app ignores
it until chunk 02 — that is expected and invisible.

One thing that *is* visible, to the one person with the admin open: a note
closed through the API from here on shows as not-open in the admin list
immediately, because it is the same column. That is the whole point of C1, and
it is checkable today with `curl` before any of the frontend exists.
