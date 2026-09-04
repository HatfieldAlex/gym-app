# 02 — The last thirty blocks, newest first

**Goal:** one read-only endpoint that answers with the most recently logged
exercise blocks, each carrying everything the editor will need to open it
without a second request.

Backend only. Depends on nothing — it can be built before, after or beside
chunk 01. **No model change, no migration, no write of any kind.**

## Read first

- [backend/observations/views.py:248](../../backend/observations/views.py) —
  the `history` action, which this one is deliberately shaped like: a bare
  array, a cap, a queryset scoped through the session's owner, and its own
  serializer chosen in `get_serializer_class` (188)
- [backend/observations/views.py:158–184](../../backend/observations/views.py) —
  `PerformedExerciseViewSet`, its `HISTORY_DEFAULT_LIMIT` / `HISTORY_MAX_LIMIT`
  (169–170) and its default queryset
- [backend/observations/serializers.py:86–172](../../backend/observations/serializers.py)
  — the inheritance chain: `PerformedExerciseSerializer` →
  `PerformedExerciseDetailSerializer` (144, adds `performed_sets`) →
  `PerformedExerciseHistorySerializer` (157, adds
  `training_session_started_at`)
- [backend/observations/tests.py:713](../../backend/observations/tests.py) —
  `PerformedExerciseHistoryTests`, and in particular
  `test_the_answer_is_a_bare_array_not_a_page` (841) and
  `test_the_query_count_does_not_grow_with_the_rows` (879)
- [00-context.md](00-context.md) — C5, C6

## Build

### 1. The serializer

One more link on the chain already there, in `serializers.py` after
`PerformedExerciseHistorySerializer`:

```python
class PerformedExerciseRecentSerializer(PerformedExerciseHistorySerializer):
    training_session_type = serializers.CharField(
        source='training_session.type', read_only=True,
    )

    class Meta(PerformedExerciseHistorySerializer.Meta):
        fields = PerformedExerciseHistorySerializer.Meta.fields + [
            'training_session_type'
        ]
```

Its docstring says why it exists: one block, with its sets, its movement, and
enough of its session — `training_session` (the id, already on the base
serializer), `training_session_started_at` and `training_session_type` — that
the correction screen can list it *and* open it for editing from a single
request. Read-only throughout: this serializer is never used for a write, and
the two session fields are not settable through a performed exercise.

### 2. The action

On `PerformedExerciseViewSet`, beside `history`:

```python
RECENT_LIMIT = 30

@action(detail=False)
def recent(self, request):
    """The requester's most recently logged blocks, newest first."""
```

- **`GET /api/v1/performed-exercises/recent/`**, registered through the existing
  router entry. **Do not touch `api_urls.py`.**
- Add `'recent'` to `get_serializer_class` beside `'history'`.
- **Logged blocks only: `ended_at__isnull=False`** (C6). An open block is the
  one being recorded right now, in the exercise zone, and it does not belong on
  a screen that can rewrite it.
- Scoped through `training_session__user=self.request.user`, like every queryset
  in this file. Another user's blocks are simply not in it.
- Ordered `('-training_session__started_at', '-created_at')` — the same order
  `history` uses (line 276), for the same reason: history is by when the training
  happened, and within a session by the order the blocks were performed. Newest
  first, so today's mistake is the top row.
- Sliced to `RECENT_LIMIT`. **A fixed 30 with no `limit` parameter** (AGREED:
  thirty, no pagination). Do not copy `history`'s `_limit_param`; there is
  nothing here for a caller to ask for.
- `select_related('exercise_definition', 'training_session')` and a
  `Prefetch('performed_sets', queryset=PerformedSet.objects.order_by('created_at'))`,
  exactly as `history` does at 269–275, so thirty blocks cost a constant number
  of queries.
- Answers `Response(self.get_serializer(queryset, many=True).data)` — **a bare
  array, not a page.** Having logged nothing is an answer, so `[]` with 200.

Nothing else on this viewset changes. The default list route keeps its
pagination, its ascending order and its `?training_session=` filter; it has
callers.

## Tests

A new class in `backend/observations/tests.py` after
`PerformedExerciseHistoryTests` — `PerformedExerciseRecentTests`. Its fixtures
want a few closed sessions on different dates, more than thirty blocks in total,
one open block, and another user's closed block.

| Test | Asserts |
|---|---|
| anonymous | 403 |
| newest first | blocks come back ordered by their session's `started_at` descending, and within one session by `created_at` descending |
| the cap | with 35 logged blocks, exactly **30** come back, and the 31st-oldest is not among them |
| another user's identical training | invisible, whatever its date |
| an **open** block | **not in the answer** (C6), even when it is the most recent thing the user has |
| an open block's **session** | its *closed* sibling blocks are still listed — the filter is on the block, not the session |
| the sets | nested, in performed order, with all five measures |
| the session fields | every row carries `training_session`, `training_session_started_at` and `training_session_type` |
| the movement | every row carries `exercise_definition` and `exercise_name` |
| a bare array | `response.data` is a list; there is no `results`, `count` or `next` |
| nobody has trained | `[]` with 200 |
| query count | inside a `CaptureQueriesContext`, the count for 5 blocks equals the count for 30 — copy `test_the_query_count_does_not_grow_with_the_rows` (879) |
| it is read-only | `POST`, `PATCH` and `DELETE` to `…/recent/` are **405**, and nothing is written |

Build the URL with `reverse('api:performedexercise-recent')`, as the history
tests build theirs.

## Done when

- `make test` is green, with every existing class unedited.
- `GET /api/v1/performed-exercises/recent/` answers a bare array of at most 30
  logged blocks, newest first, each with its sets nested and its session's
  `started_at` and `type` beside it.
- After `make dummy-data`, that answer is exactly 30 rows and the first one is
  the most recent block in the seeded history.
- The block currently open in the exercise zone is **not** in it.
- `python manage.py makemigrations --check` reports nothing outstanding.
- `GET /api/v1/performed-exercises/` is byte-for-byte what it was: still
  paginated, still ascending, still filterable by `?training_session=`.
- Every screen behaves exactly as before; nothing in `frontend-web/` calls this
  yet.
- `git status` shows nothing modified under `backend/dataexport/`,
  `backend/catalog/`, `backend/settings/` or `frontend-web/`.

## Do not

- Add a `limit`, `offset`, `page`, `since` or `exercise_definition` parameter.
  Thirty, newest first, no arguments (AGREED, C5).
- Turn on pagination for this action, or reuse the list route instead of adding
  the action.
- Include open blocks (C6), or blocks in a session that is still open.
- Change the default list route's ordering, pagination or filtering.
- Write anything. This action is a `GET`; it has no `perform_*` and no body.
- Add `training_session_ended_at`, `bar_kg`, `sides` or any computed field the
  editor is not going to show. The two loading fields ride along already on the
  base serializer and are ignored downstream (C4).
- Touch `api_urls.py`, `models.py`, `catalog/`, `dataexport/` or anything under
  `frontend-web/`.

## What the user sees

**No user-facing change.** No screen calls this endpoint yet, so the app looks
and behaves exactly as it did.

What exists that did not is one address that answers "what have I actually
logged lately" in one request — thirty blocks, newest first, each with its date,
its movement, its session's type and every set inside it. Chunk 03 puts that
list on the screen.
