# 01 — Backend: session lifecycle

**Goal:** give the API a notion of an *open* session, so a client can ask "am I
mid-workout?", start one, and end one — and separate when a row was written from
when the training it records actually happened.

Backend only. No frontend files change in this chunk.

## Read first

- [backend/observations/models.py](../../backend/observations/models.py)
- [backend/observations/views.py](../../backend/observations/views.py)
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
- [backend/docs/schema.dbml](../../backend/docs/schema.dbml)

## Three timestamps, three questions (A1)

`TrainingSession.created_at` is `auto_now_add` — it records when the *row* was
written. That is the same moment the workout started only when the workout is
logged live, which is the one case this tab covers. It is the wrong column to
hang the workout's identity on: a session typed up the morning after has a
`created_at` that says nothing about when it was trained, so history would sort
and label it as if it happened at breakfast.

So the session carries three fields, and each answers exactly one question:

| Field | Question | Set by |
|-------|----------|--------|
| `created_at` | When was this row written? | The ORM, always, never a client. |
| `started_at` | When did the training materially begin? | Defaults to now; a client may supply it. |
| `ended_at` | When did the training materially end? | The `end/` action, or a client at create time. Null = still in progress. |

For a session started from this tab all three collapse onto roughly the same
moment, and that is fine — the point is that nothing *depends* on them being
equal. Retrospective entry (typing in a workout after the fact) is not built in
these chunks, but every column and constraint it needs lands here, so it can be
added later without a second migration to the same table.

## Build

1. **Model.** Add to `TrainingSession`:

   - `started_at = models.DateTimeField(default=timezone.now)` — not nullable,
     with a comment that this is when the training actually happened, as opposed
     to `created_at`, which is when the row was written.
   - `ended_at = models.DateTimeField(null=True, blank=True)`, with a comment
     that null means the session is still in progress.

   Add a `CheckConstraint` to `Meta.constraints` rejecting `ended_at` earlier
   than `started_at` (null `ended_at` must still pass), named
   `trainsess_ended_after_started`.

2. **Order history by `started_at`, not `created_at`.** Replace the
   `(user, created_at)` index in `Meta.indexes` with `(user, started_at)`,
   keeping the name `trainsess_user_created_idx` so the migration is one index
   swap and not a rename dance — or rename it to `trainsess_user_started_idx`
   and let the migration drop and recreate. Either is fine; pick one and be
   consistent with the DBML in step 10.

3. **Let a session be created from nothing but a POST.** Besides the timestamps,
   `TrainingSession` has one other required column with no default, which would
   force every caller to supply a value for something this tab has no opinion
   about. Give that field a sensible default on the model so
   `POST training-sessions/` succeeds with an empty body. Nothing else in these
   chunks reads or writes it.

4. **Migration.** `makemigrations observations` then `migrate`. It should
   contain the two new columns, the constraint, the index swap, the new default,
   and nothing else. Two data steps, both `RunPython` with a reverse of
   `migrations.RunPython.noop`, and both ordered *after* the `AddField`s and
   *before* the `AddConstraint`:

   - `started_at` is non-null with a callable default, so Django stamps every
     existing row with the moment the migration ran. Backfill it:
     `started_at = created_at` for every existing row. Without this, the entire
     history claims to have been trained during the deploy.
   - `ended_at` defaults to NULL, which would read as "open". Backfill
     `ended_at = started_at` for every existing row, leaving no historical
     session open and no row that violates the constraint added afterwards.

5. **Serializer.** Add `started_at` and `ended_at` to
   `TrainingSessionSerializer.Meta.fields`.

   - `created_at` stays in `read_only_fields`, as it is now.
   - `started_at` is writable, so a caller can say when the workout really was.
     Omitted, it defaults to now, which is what this tab always does.
   - `ended_at` is writable **on create only** and read-only thereafter: closing
     a live session goes through the `end/` action (step 7), which is the only
     path that stamps a timestamp the client did not choose. Enforce it in
     `update` (or by swapping the field to read-only when `self.instance` is
     set) rather than by listing it in `read_only_fields`, which would block the
     create case too.
   - `validate` rejects `ended_at` before `started_at` with a field error, so
     the API answers 400 rather than letting the database constraint surface as
     a 500.

6. **`GET /api/v1/training-sessions/current/`** — a `@action(detail=False)` on
   `TrainingSessionViewSet` returning the requester's open session, serialized
   with `TrainingSessionDetailSerializer` (exercises *and* their sets nested, so
   the whole page is one request). With no open session, return **204 No
   Content** rather than 404: having none is a normal state, not an error.

7. **`POST /api/v1/training-sessions/{id}/end/`** — a `@action(detail=True)`
   setting `ended_at = timezone.now()` and returning the updated session. If it
   is already ended, return 400 with a message rather than moving the timestamp.
   If `started_at` is somehow in the future (a mistyped retrospective entry left
   open), the constraint would reject the save — return 400 with a message
   naming the problem rather than a 500.

8. **At most one open session (A2).** In `perform_create`, reject the create
   with a `ValidationError` if the user already has a session with
   `ended_at__isnull=True`. Include the open session's id in the error body so a
   client can recover by loading it. A create that supplies its own `ended_at`
   is not open and must not be rejected by this check — a completed session
   typed in after the fact is allowed while one is running.

9. **Querysets and prefetching.** In `get_queryset`, order the list by
   `-started_at` so a backdated session lands where it was trained rather than
   where it was typed. The nested `performed_exercises` and `performed_sets`
   keep ordering by their own `created_at` — they are logged live, in order, and
   nothing about this change touches them. The nested sets are currently loaded
   only when `self.action == 'retrieve'`; `current` needs them too, so extend
   that check to cover both actions.

10. **Docs.** In the `training_session` table in `docs/schema.dbml`, keeping its
    formatting: add

    ```
    started_at    timestamptz  [not null, default: `now()`, note: 'when the training actually happened; created_at is when the row was written']
    ended_at      timestamptz  [null, note: 'null while the session is in progress']
    ```

    change the index to `(user_id, started_at)`, and add the
    `ended_at >= started_at` check.

## Done when

- `python manage.py makemigrations --check` reports nothing outstanding.
- Signed in with no open session, `GET /api/v1/training-sessions/current/`
  returns 204 with an empty body.
- `POST /api/v1/training-sessions/` with an empty body `{}` returns 201 with
  `started_at` ≈ now, `ended_at: null`; a second identical POST returns 400.
- `current/` now returns that session, with `performed_exercises` present (empty
  list) on it.
- `POST .../{id}/end/` returns the session with a non-null `ended_at`; calling
  it again returns 400; `current/` returns 204 again afterwards.
- `POST /api/v1/training-sessions/` with `{"started_at": "<last week>",
  "ended_at": "<last week, an hour later>"}` returns 201, is *not* rejected by
  the one-open-session check even with a session already open, does not appear
  in `current/`, and lists between the sessions either side of it by
  `started_at` — not at the top, where its `created_at` would put it.
- The same POST with `ended_at` before `started_at` returns 400, not 500.
- `PATCH` on a session cannot change `ended_at`.
- Every existing session in the database has `started_at == created_at` and a
  non-null `ended_at`.

## Do not

- Add a `status` field, or any other way of saying the same thing as `ended_at`.
- Replace or repurpose `created_at`. It stays exactly as it is —
  `auto_now_add`, never client-settable — and keeps meaning "when this row was
  written". `started_at` is an addition, not a rename.
- Build a UI or an endpoint for retrospective entry. This chunk only makes the
  columns able to hold it.
- Touch `PerformedExerciseViewSet` or `PerformedSetViewSet` — chunk 03.5 uses them
  exactly as they are — or change how the nested exercises and sets are ordered.
- Add a serializer or viewset for `PerformedRep`.
- Change anything under `frontend-web/`.

## What the user sees

**No user-facing changes.** Nothing under `frontend-web/` changes in this chunk,
so every screen looks and behaves exactly as it did before it.

Two things worth stating, because both *could* have been visible and are
deliberately not:

- **History looks identical.** Sessions are now ordered by `started_at` instead
  of `created_at`, but the migration backfills `started_at = created_at` on every
  existing row, so `/training-sessions` lists the same sessions in the same
  order, with the same dates on them.
- **No session appears open.** The backfill also stamps `ended_at` on every
  existing row, so the history contains no half-finished workout, and the
  Current Session tab — still the placeholder that says "No session in progress."
  — keeps saying exactly that.

What this chunk actually delivers is capability, not appearance: the API can now
answer "am I mid-workout?", start a workout, and close one. Chunk 02 is the first
thing the user can see.
