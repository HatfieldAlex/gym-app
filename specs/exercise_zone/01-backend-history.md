# 01 — Exercise history endpoint

**Goal:** one request answers "what happened the last few times I did this
movement?" — the performed exercises, newest first, each with its sets and the
date it was trained.

The only backend chunk. **No migration:** every column already exists.

## Read first

- [observations/views.py](../../backend/observations/views.py) — especially
  `TrainingSessionViewSet.current` and `.end`, the two `@action`s already here,
  and how `get_queryset` scopes by `self.request.user`
- [observations/serializers.py](../../backend/observations/serializers.py) —
  `PerformedExerciseSerializer` and `PerformedExerciseDetailSerializer`
- [observations/tests.py](../../backend/observations/tests.py) — the conventions
  to match: `APITestCase`, `setUpTestData`, `reverse('api:…')`, `force_login`
- [00-context.md](00-context.md) — the two orderings, and Z5, Z7

## Build

### 1. The route

A `detail=False` `@action` on `PerformedExerciseViewSet`:

```
GET /api/v1/performed-exercises/history/
      ?exercise_definition=<uuid>     required
      &exclude_session=<uuid>         optional
      &limit=<n>                      optional, default 3, capped at 20
```

The router names it `api:performedexercise-history`. It answers a **bare JSON
array**, newest first — not a paginated envelope. A `detail=False` action is not
auto-paginated; return `Response(serializer.data)` and do not call
`self.paginate_queryset`. Nothing found is `[]` with 200: never having done a
movement is an answer, not an absence (`current/`'s 204 is a different case — a
single object that is not there).

### 2. The query

Scoped to the requester, like every other queryset in this file. Reach ownership
through the session — `training_session__user=self.request.user` — so another
user's rows are simply not in the queryset.

- Filter to `exercise_definition=<uuid>`.
- Exclude `training_session=<exclude_session>` when given. This is how the
  client keeps the running workout out of its own history: the sets logged into
  it are already on screen (Z5), and showing them again as "last time" would be
  a lie about what happened last time.
- Order by `training_session__started_at` **descending**, then `created_at`
  descending as a tie-break. Sessions sort by when they were trained, not when
  they were typed — see 00-context. Getting this wrong is invisible until
  somebody backdates a workout, so make it a test.
- `[:limit]`.

Query count is fixed, not per-row: `select_related('exercise_definition',
'training_session')` and a `Prefetch` of `performed_sets` ordered by
`created_at`. Three queries whatever `limit` is.

### 3. Validation

The client sends UUIDs it read from the API, so bad input means a bug or a hand-
written URL — but it must still be a 400, not a 500.

- `exercise_definition` missing → `400` with a `detail`.
- Either id present but not a valid UUID → `400`. Filtering a `UUIDField` on
  garbage raises `django.core.exceptions.ValidationError`, which DRF does **not**
  turn into a 400 — it becomes a 500. Parse both with `uuid.UUID()` first.
- `limit` non-numeric, zero or negative → `400`. Above the cap → clamp silently.
- An `exercise_definition` that does not exist, or one the user has never
  trained → `[]`. Not a 404: the question was answerable and the answer is none.

### 4. The serializer

`PerformedExerciseHistorySerializer(PerformedExerciseDetailSerializer)` — the
detail serializer already nests `performed_sets` in performed order, which is
most of the job. It adds one read-only field:

```
training_session_started_at   from training_session.started_at
```

The client needs to date each block ("Last time · 12 Aug") and has only the
performed exercise. Add the timestamp rather than nesting the whole session:
everything else on it is either already known or none of this screen's business.

Wire it up in `get_serializer_class`, the way `TrainingSessionViewSet` already
selects a serializer per action.

### 5. Tests

The contract is not checkable from a screen, so it is checkable here.

- Anonymous → 403.
- Another user's identical training does not appear — same exercise, same day,
  different user.
- Newest first **by `started_at`**: seed three sessions whose `created_at` order
  is the reverse of their `started_at` order and assert the response follows
  `started_at`.
- `exclude_session` removes exactly that session and nothing else.
- `limit` caps the count; the default with no `limit` is 3.
- Sets come back nested, in performed order, with `weight_kg` and `reps`.
- Never-trained exercise → `200` and `[]`.
- Missing `exercise_definition` → 400. Malformed UUID → 400, **not 500**.

## Done when

- `GET performed-exercises/history/?exercise_definition=<id>` returns a bare
  array of at most 3 performed exercises, newest-trained first, each carrying
  `performed_sets` and `training_session_started_at`.
- `&exclude_session=<id>` drops that session from the result.
- A malformed UUID in either parameter returns 400.
- `make test` passes, including the existing suite.
- Nothing else about the API changed: `training-sessions/current/`,
  `performed-exercises/` and `performed-sets/` return byte-identical responses.

## Do not

- Add a migration, a model, a field or an index. Every column exists, and
  `perfex_session_created_idx` plus the FK indexes already cover this query at
  the size this app is.
- Paginate the action, or return `{"results": …}`.
- Add filtering, ordering or search backends to the viewset. Three query
  parameters, read by hand, on one action.
- Change `PerformedExerciseViewSet.get_queryset`'s existing behaviour, its
  ordering, or the `?training_session=` filter — the list route has callers.
- Compute anything: no totals, no volume, no best set, no comparison to the
  current session. The endpoint returns rows.
- Let `exclude_session` or `exercise_definition` widen what a user can read.
  Ownership is the queryset's job and stays there.

## What the user sees

Nothing. No screen changes; this chunk only makes the question askable. Chunks
03 and 04 are what put the answer in front of anyone.
