# 01 — The override, and the guard the session never got

**Goal:** one header that lets a deliberate correction through to a finished
row, and `TrainingSessionViewSet` finally standing behind the same rule its two
siblings have stood behind since the exercise-lifecycle iteration.

Backend only. Depends on nothing. **No model change and no migration** — this
chunk touches two files in `observations/` and adds a test class.

Read the whole of this chunk before writing anything, because the interesting
half is what the header **does not** do.

## Read first

- [backend/observations/views.py](../../backend/observations/views.py) —
  `ClosedIsFinalMixin` (line 21) and its docstring, `refuse_if_closed` (36),
  `perform_update` (41), `perform_destroy` (46), `TrainingSessionViewSet` (51)
  and its `end` action (122), and the two `writable_target` staticmethods at 163
  and 315
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
  — `closed_reason` (11) and its docstring, `_require_open` (53),
  `TrainingSessionSerializer` (175) with `get_fields` (200) and `validate` (208)
- [backend/observations/tests.py](../../backend/observations/tests.py) —
  `ClosedIsFinalTests` (546) end to end: its fixtures are what the new class
  copies, and every one of its nine tests must pass **unedited**. Also
  `test_discarding_a_session_is_not_guarded_by_an_open_exercise` (199) and
  `test_patch_cannot_close_a_session` (255), the two in
  `TrainingSessionLifecycleTests` that walk through the code this chunk changes
- [00-context.md](00-context.md) — "The closed-guard rule", "The override: the
  exact contract", and C3

## Build

### 1. One helper, one header

Module level in `views.py`, above `ClosedIsFinalMixin`:

```python
CORRECTION_HEADER = 'X-Edit-Closed-Record'


def correcting(request):
    """True when this request explicitly asks to write to a finished record."""
    return request.headers.get(CORRECTION_HEADER) == '1'
```

The constant is a name so the tests and the docstring can point at one string.
`request.headers` is case-insensitive, so nothing needs to know about
`HTTP_X_EDIT_CLOSED_RECORD` — mention it in a comment and nowhere else.

**Only the exact string `1`.** Absent, empty, `'0'`, `'true'`, `'on'` are all
"no", and the request is refused exactly as it is today. One accepted value, so
there is nothing to argue about later.

Give `correcting` a docstring that is the argument, not a description, because
it is the invariant somebody will later try to relax. It should say:

- what the header unlocks (`PATCH`/`PUT` on a closed row) and what it deliberately
  does not (`DELETE`, and creating a row inside a closed one);
- that the server holds no memory of it — the arming is the browser's, and every
  write carries the header itself, which is what makes each one deliberate and
  greppable;
- that it is not permission: anonymous is still 403 and another user's row is
  still 404, both answered before this is read.

### 2. `perform_update` consults it. `perform_destroy` never does.

```python
def perform_update(self, serializer):
    # The row as it stands, before the change is written into it.
    if not correcting(self.request):
        self.refuse_if_closed(serializer.instance)
    serializer.save()
```

`perform_destroy` is left **exactly as it is**. So is `_require_open` in
`serializers.py`, which is the create half. That asymmetry is the feature: this
iteration corrects records and never removes them, and the place that rule is
actually enforced is these two untouched functions. Say so in a comment on
`perform_destroy` — one sentence, pointing at `correcting` — so the next reader
finds out here rather than by trying it.

`refuse_if_closed` itself does not change. It stays the function that answers
"is this row finished"; the header decides whether the answer is acted on, and
those are two different questions.

### 3. `TrainingSessionViewSet` joins the mixin

```python
class TrainingSessionViewSet(ClosedIsFinalMixin, viewsets.ModelViewSet):
    ...
    @staticmethod
    def writable_target(instance):
        return {'training_session': instance}
```

That is the whole change to that class. Add a short paragraph to its docstring
saying what it fixes: until now this viewset had no closed-guard at all, so an
ended session could be `DELETE`d outright — cascading every block and every set
in it — and `PATCH`ed freely, with no gate and no warning. It has both halves
now, and the delete half has no override.

What this does and does not change, checked against the existing suite:

| Request | Before | After |
|---|---|---|
| `DELETE` an **open** session (discard a live workout) | 204 | **204, unchanged.** `closed_reason` answers `None` for an open session. |
| `DELETE` an **ended** session | 204, cascade | **400**, `'That session has ended and cannot be changed.'` |
| `DELETE` an ended session **with the header** | — | **400.** Destroy never reads it. |
| `PATCH` an **open** session | 200 | **200, unchanged**, and `ended_at` still read-only. |
| `PATCH` an ended session | 200 | **400.** |
| `PATCH` an ended session **with the header** | — | **200**, and `ended_at` is still read-only (`get_fields`, serializers.py:200). |
| `POST …/end/` | as before | **as before.** `end/` uses `get_object()` and never goes through `perform_update`. |

`TrainingSessionSerializer.validate` (line 208) already refuses an `ended_at`
earlier than `started_at`, reading `ended_at` off the instance when the body does
not carry one — so moving a closed session's `started_at` past its own `ended_at`
is a 400 from the serializer rather than a database error. **Do not add a second
check for it**; add a test that proves the existing one covers this new path.

## Tests

A new class in
[backend/observations/tests.py](../../backend/observations/tests.py), beside
`ClosedIsFinalTests` and **after** it — call it `CorrectionOverrideTests`. Build
its own closed fixtures the way `ClosedIsFinalTests` does (its `close()`
staticmethod at line 555 is the pattern) rather than reusing or changing that
class's.

A small helper for the header keeps every test in it one line:

```python
CORRECTING = {CORRECTION_HEADER: '1'}   # passed as **CORRECTING to the client call
```

DRF's test client takes extra headers as `headers={...}`.

| Test | Asserts |
|---|---|
| a set of a closed exercise, PATCHed **with** the header | **200**, and the stored `reps` is the new value |
| the same PATCH with `'0'`, `'true'`, `''`, and a header spelled differently | **400** each, and the set is unchanged |
| the same PATCH with **no** header | 400 — the existing behaviour, restated here so the class reads whole |
| a set of a closed exercise, **DELETE**d with the header | **400**, and the row is still there |
| a **closed exercise**, DELETEd with the header | **400**, still there |
| a closed exercise's `exercise_definition`, PATCHed with the header | **200**, and the block now points at the other movement |
| a closed exercise's `ended_at`, PATCHed with the header | 200 **and `ended_at` is unchanged** — it is read-only (serializers.py:141), so the header does not make it settable |
| a **new set POSTed** into a closed exercise with the header | **400** — create is not unlocked, and no row is written |
| a **new exercise POSTed** into a closed session with the header | **400**, nothing written |
| a set in the `stranded` block (open exercise, closed session) PATCHed with the header | **200** — the override clears both halves of the rule, not just one |
| another user's closed set and closed exercise, with the header | **404** each, both rows still there |
| an anonymous request with the header | **403**, nothing written |
| the header on an **open** row | 200, exactly as without it — the header is never required |
| a **closed session** PATCHed with the header: `type` and `started_at` | **200**, both written, and `ended_at` unchanged |
| a closed session PATCHed **without** the header | **400**, `detail` is `'That session has ended and cannot be changed.'`, nothing written |
| a closed session **DELETE**d without the header, and again with it | **400** both times, and the session, its block and its set all still exist |
| an **open** session DELETEd | **204**, and its blocks are gone — the discard path is untouched |
| a closed session's `started_at` moved **after** its `ended_at`, with the header | **400** keyed on `ended_at`, nothing written (the serializer's own `validate`) |
| `POST …/end/` on an open session with an open block | 400 as before — proof `end/` did not walk into the new guard |

And the whole point of the class beside it:

- **`ClosedIsFinalTests` passes unedited.** All nine.
- **`PerformedSetAPITests` passes unedited.** All five.
- `test_discarding_a_session_is_not_guarded_by_an_open_exercise` and
  `test_patch_cannot_close_a_session` pass unedited.

## Done when

- `make test` is green, at **178 + the new class** and with
  `backend/observations/tests.py`'s existing classes untouched.
- `python manage.py makemigrations --check` reports nothing outstanding.
- `grep -rn 'X-Edit-Closed-Record' backend/` finds it in exactly two files:
  `observations/views.py` and `observations/tests.py`.
- `grep -rn 'correcting(' backend/` finds exactly one call site:
  `perform_update`. If it appears in `perform_destroy` or in `serializers.py`,
  the chunk is wrong.
- `git status` shows nothing modified under `backend/dataexport/`,
  `backend/catalog/`, `backend/protocols/`, `backend/accounts/`,
  `backend/feedback/`, `backend/settings/` or `frontend-web/`.
- Every screen behaves exactly as before, because nothing on any screen sends
  the header yet.

## Do not

- Read the header in `perform_destroy`, in `_require_open`, in `closed_reason`,
  in `get_object()`, or in any serializer. One call site.
- Add a `DestroyModelMixin`, a delete affordance, or an "unlock" flag of any
  kind, on any viewset.
- Accept any value but `'1'`, or add a second header, a query parameter or a
  body field that means the same thing.
- Move, rename or reword `closed_reason`, `EXERCISE_IS_CLOSED` or
  `SESSION_IS_CLOSED`. The existing tests assert those two sentences verbatim.
- Make `ended_at` writable anywhere, on a session or on an exercise.
- Guard `end/`, or move a check into `get_object()` — read
  `ClosedIsFinalMixin`'s docstring for why that breaks `end/`.
- Add a permission class, a throttle, or a `is_staff` check. The project default
  is `IsAuthenticated` and that is the whole story.
- Edit an existing test. New behaviour, new class.
- Touch `api_urls.py`, `settings.py`, `models.py`, or anything under
  `backend/dataexport/`, `backend/catalog/` or `frontend-web/`.
- Add an audit model, an audit field, a `modified_at`, or a log line recording
  who changed what. AGREED: edits overwrite silently.

## What the user sees

**No user-facing change, and one hole quietly closed.**

Nothing on any screen sends the header, so every page looks and behaves exactly
as it did. What moved is underneath: an ended session can no longer be deleted
by a request that reaches the API — which it could this morning, cascading every
exercise and every set inside it — and it can no longer be patched either.
Discarding the workout you are in the middle of still works in one tap, because
that session is open.

And there is now exactly one door into a finished record: a `PATCH` carrying
`X-Edit-Closed-Record: 1`. It opens for corrections, it does not open for
deletes, and until chunk 04 nothing in the app knows how to knock.
