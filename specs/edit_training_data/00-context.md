# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

**[AGREED.md](AGREED.md) is above this file.** It is the output of stage ①,
signed off by the human, and every decision in it is settled. Where this file
and AGREED.md disagree, AGREED.md wins and the chunk stops rather than
improvises. What this file adds is the code the decisions land in, the override's
exact contract written out once, and the handful of things AGREED.md left open —
those are the `C…` rows at the bottom, flagged as flagged.

## What is being built

One section on Settings, behind a warning nobody can skip past, that lets the
human correct a logged block that points at the wrong movement. Everything else
in the iteration exists to make that safe:

- the backend keeps refusing writes to closed rows, and starts honouring one
  explicit header that says *"I mean it"*;
- `TrainingSessionViewSet` finally gets the guard its two siblings have already,
  which closes a live hole — an ended session can be `DELETE`d today, cascading
  everything in it, with no gate at all;
- **and no route anywhere starts permitting a delete.** The override unlocks
  `PATCH` and nothing else. Nothing in this iteration removes a set, a block or
  a session, and no screen offers to.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Apps are top-level packages
  under `backend/` (`accounts`, `catalog`, `protocols`, `observations`,
  `feedback`, `dataexport`), listed in `INSTALLED_APPS` in
  [settings.py](../../backend/settings/settings.py). Routes are registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; DRF's project-wide default permission is `IsAuthenticated`
  ([settings.py:167](../../backend/settings/settings.py)), so an anonymous
  request gets 403 rather than rows. Pagination is on by default at
  `PAGE_SIZE: 50` (`settings.py:170`).
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. Routing is `react-router-dom`, declared in
  [App.jsx](../../frontend-web/src/App.jsx) — the `/settings` route is at line
  58 there, rendering
  [Settings.jsx](../../frontend-web/src/pages/Settings.jsx). Providers are
  stacked in
  [main.jsx](../../frontend-web/src/main.jsx): `BrowserRouter` → `AuthProvider`
  → `App`.
- `make run` brings both up: the API on :8000, the app on
  <http://localhost:5173>. `make test` runs the backend suite; **178 tests, green
  on this branch before any of this lands, and green after every chunk.**
  `make dummy-data` seeds a training history worth listing.
- **There is no frontend test runner.** Chunks 03 and 04 are checked by hand with
  `make run`, and each says exactly what to click and what should happen.
- [docs/schema.dbml](../../backend/docs/schema.dbml) is generated after every
  `manage.py migrate`. **No chunk here adds a model or a migration**, so it
  should not move; if it does, something went wrong.

## The data model, as it actually is

Three tables, in `observations`, and they are the only three anything here
writes to.

| Model | Where | What matters for this iteration |
|---|---|---|
| `TrainingSession` | [models.py:8](../../backend/observations/models.py) | `type` (`CharField(max_length=8, default='mixed')`, **line 19 — no `choices` any more**; migration `0004` removed them), `started_at` (line 22, defaulted to now, *when the training happened*), `ended_at` (line 29, null while open), `created_at` (line 20, `auto_now_add`). A check constraint at line 43 forbids `ended_at < started_at`. |
| `PerformedExercise` | [models.py:55](../../backend/observations/models.py) | `training_session` (CASCADE), `exercise_definition` (line 69, **PROTECT** — a catalogue row is shared reference data), `exercise_prescription` (nullable, SET_NULL, and nothing in the app sets it), `created_at` (line 84, *also the order within the session*), `ended_at` (line 85, null while being recorded). |
| `PerformedSet` | [models.py:116](../../backend/observations/models.py) | `performed_exercise` (CASCADE), and the five measures: `weight_kg` (line 126, `DecimalField(max_digits=6, decimal_places=2)`, **null means bodyweight, not zero**), `reps`, `distance_m`, `duration_s`, `rpe`. `created_at` (line 134) is the order within the block. |
| `PerformedRep` | [models.py:147](../../backend/observations/models.py) | **Out of scope** (AGREED). It has no serializer, no viewset and no route, and gains none. |

`ExerciseDefinition` ([catalog/models.py:8](../../backend/catalog/models.py)) is
read from — its `id` and `name` fill the editor's dropdown — and **never written
to**. `PUT`/`PATCH`/`DELETE` on `/api/v1/exercises/` are 405 because no mixin
provides them ([catalog/views.py:14](../../backend/catalog/views.py)), the
`loading/` action at line 55 is a strict one-way door, and both of those stay
exactly as they are.

## The closed-guard rule, and where it lives

> A row is writable only while its performed exercise is open **and** its session
> is open.

One definition, in one function:

| Where | What is there |
|---|---|
| [observations/serializers.py:11](../../backend/observations/serializers.py) | `closed_reason(performed_exercise=None, training_session=None)` — returns the sentence saying why this row may not be written to, or `None` when it may. The two sentences are module constants at **lines 7–8**: `EXERCISE_IS_CLOSED = 'That exercise has been logged and cannot be changed.'` and `SESSION_IS_CLOSED = 'That session has ended and cannot be changed.'` Read its docstring; it explains why the session half is not redundant. |
| [observations/serializers.py:53](../../backend/observations/serializers.py) | `OwnedRelationMixin._require_open(**target)` — the **create** half of the rule, called from `validate_performed_exercise` (line 66) and `validate_training_session` (line 120), so a create is refused as a *field* error the way an unowned target already is. |
| [observations/views.py:21](../../backend/observations/views.py) | `ClosedIsFinalMixin` — the **update and delete** half. `refuse_if_closed(instance)` at line 36 raises `ValidationError({'detail': reason})`; `perform_update` at 41 and `perform_destroy` at 46 call it. Its docstring says why the check is deliberately **not** in `get_object()`: `end/` is a POST to a detail route on a row about to become closed and needs `get_object()` to keep working. |
| [observations/views.py:163](../../backend/observations/views.py), [:315](../../backend/observations/views.py) | `writable_target(instance)` — each viewset says what to hand `closed_reason`. `PerformedExerciseViewSet` gives the exercise itself; `PerformedSetViewSet` gives `instance.performed_exercise`, because a set has no state of its own. |
| [observations/views.py:51](../../backend/observations/views.py) | `TrainingSessionViewSet(viewsets.ModelViewSet)` — **and this is the hole.** No `ClosedIsFinalMixin`, no `writable_target`. `DELETE /api/v1/training-sessions/<id>/` on an ended session succeeds today and cascades every block and set in it; `PATCH` rewrites `type` and `started_at` freely. Chunk 01 closes it. |

Refusals are **400 with a `detail`**, never 403: nothing here is about
permission — the requester owns the row, it is simply finished. Ownership is
answered *before* state, so another user's closed row is still a **404**.

### The tests that pin it, and must keep passing unchanged

- [observations/tests.py:546](../../backend/observations/tests.py) —
  `ClosedIsFinalTests`, **nine tests**, with fixtures built closed on purpose:
  `closed_session` / `closed` / `closed_set`, the `stranded` open-block-in-a-
  closed-session pair, and `other_closed` for the ownership answer.
- [observations/tests.py:469](../../backend/observations/tests.py) —
  `PerformedSetAPITests`, whose rows are **open** exercises in **open**
  sessions. `test_correcting_a_set_can_clear_its_weight` (508),
  `test_deleting_a_set_leaves_its_exercise_behind` (525) and
  `test_another_users_set_cannot_be_edited_or_deleted` (534) are the three that
  prove the lock never overreached.

Twelve tests between them. **Not one line of either class is edited by any chunk
here.** New behaviour gets new tests in new classes.

Two more that chunk 01 walks straight past and must not break:

- `test_discarding_a_session_is_not_guarded_by_an_open_exercise`
  ([tests.py:199](../../backend/observations/tests.py)) — deletes an **open**
  session. `closed_reason` answers `None` for an open session, so the new guard
  lets it through untouched. Discarding a live workout is still one tap.
- `test_patch_cannot_close_a_session`
  ([tests.py:255](../../backend/observations/tests.py)) — patches an **open**
  session; still 200, still cannot set `ended_at`.

## The override: the exact contract

**Header name: `X-Edit-Closed-Record`. Value: the single character `1`.**

```
PATCH /api/v1/performed-exercises/<id>/
X-Edit-Closed-Record: 1
```

That is the whole thing. Written out because every chunk touches one end of it:

1. **It is a header, not a body field, not a query string.** A body field would
   ride along in a serializer and end up somewhere it can be defaulted; a query
   string would land in logs and in a link somebody can be sent. A header is
   per-request, invisible to a bookmark, and greppable: `grep -r
   X-Edit-Closed-Record` finds every place in the repo that can write to a
   finished record, in both languages, and there should be exactly three
   (`views.py`, `api.js`, and the tests).
2. **Read it with `request.headers.get('X-Edit-Closed-Record')`.** DRF's
   `request.headers` is case-insensitive, so the client's casing does not matter.
   Do not reach into `request.META` and do not name `HTTP_X_EDIT_CLOSED_RECORD`
   anywhere but a comment.
3. **Only the exact string `1` counts.** Absent, empty, `0`, `true`, `yes`,
   `on` — all of them are *not* an override, and the request is refused exactly
   as it is today. One accepted value, so there is nothing to argue about later
   and nothing a proxy can normalise into a yes.
4. **It unlocks `PATCH`/`PUT` and nothing else.** `perform_destroy` never reads
   it. `_require_open` — the *create* half — never reads it. So: no delete of a
   finished anything, and no new set logged into a finished block, override or
   not. This is AGREED's "nothing is ever removed", enforced rather than
   promised.
5. **It says nothing about permission.** Anonymous is still 403, another user's
   row is still 404, and both are answered before the header is ever looked at.
6. **It is not a session flag, a user setting, or a mode.** The server holds no
   memory of it between requests. The arming lives entirely in the browser's
   React state (C1), and every single write it permits carries the header
   itself.

Where it goes: a module-level helper in
[observations/views.py](../../backend/observations/views.py), next to
`ClosedIsFinalMixin`, because it is an HTTP concern and `closed_reason` — which
is not — stays in `serializers.py` knowing nothing about requests.

## The scope boundary

Repeated from AGREED because it is the fence every chunk is inside:

| Editable | Read but never written | Not touched at all |
|---|---|---|
| `TrainingSession.type`, `TrainingSession.started_at` | `TrainingSession.ended_at` (read-only already — `TrainingSessionSerializer.get_fields`, [serializers.py:200](../../backend/observations/serializers.py)) | `PerformedRep` |
| `PerformedExercise.exercise_definition` | `PerformedExercise.ended_at` (read-only throughout, [serializers.py:141](../../backend/observations/serializers.py)) | `catalog/` — no name change, no `bar_kg`/`sides` change, `loading/` untouched |
| `PerformedSet.weight_kg`, `reps`, `distance_m`, `duration_s`, `rpe` | `created_at` everywhere | `dataexport/` and its 40 tests |
| | | `TrainingSessionDetail.jsx` — **not modified at all** |
| | | `CurrentSession.jsx` — except the pure extraction in chunk 03 |
| | | `protocols/`, `accounts/`, `feedback/`, `frontend-mobile/` |

**`dataexport` is not in this iteration.** No model is added, and
[export.py](../../backend/dataexport/export.py) names every column of every CSV
by hand (`PERFORMED_SETS_HEADER` at line 134, `WORKOUTS_HEADER` at 218,
`CSV_FILES` at 279), so nothing here reaches it. The check is the same each
time: `make test` passes with `backend/dataexport/tests.py` unedited, and
`git status` shows nothing under `backend/dataexport/`. There is **no audit
model and no audit CSV** — an edit overwrites silently, which is a made decision
(AGREED) and not an oversight to close.

## Visual conventions to follow

The app has no palette and no UI library. Everything below is already true of
the code; a chunk that invents a second way of doing one of them is wrong.

- **Colours come from `currentColor` and `color-mix`, never hex.** `:root` is
  `color-scheme: light dark` ([styles.css:1](../../frontend-web/src/styles.css))
  and there is no palette to reach for. Check both schemes.
- **One section per page or component in `styles.css`, in page order, and the
  comment says *why*.** Settings' two sections are at the very bottom:
  `/* Your notes */` at line 1102 and `/* Download your data */` at 1117.
  `.notes-section h2, .export-section h2` at line 1122 is the shared heading
  rule — a third `<h2>` on Settings joins that selector rather than writing its
  own size.
- **Saying what happened**: `<p className="status">` for waiting, and
  `<p className="status" data-state="error">` for a failure
  ([styles.css:48](../../frontend-web/src/styles.css)). `<Status state error>`
  ([components/Status.jsx](../../frontend-web/src/components/Status.jsx)) is for
  a **read** driven by `useLoad`; a mutation carries its own `busy`/`failed`, as
  `ExportSection` does ([Settings.jsx:64](../../frontend-web/src/pages/Settings.jsx)).
- **The two-tap confirmation** is `Confirm`
  ([CurrentSession.jsx:942](../../frontend-web/src/pages/CurrentSession.jsx)) and
  its styles at [styles.css:813–839](../../frontend-web/src/styles.css). It
  replaces its button *in place*, so the second tap lands where the first one
  did and nothing moves under the thumb. **No `window.confirm`, no modal, no
  dialog element** — that is stated in its own docstring and it is the rule here
  too.
- **`.button`** ([styles.css:32](../../frontend-web/src/styles.css)) is the
  ordinary tap; **`.button--tap`** (line 230) adds the 44px thumb target and is
  for things used mid-set, one-handed; **`.button--major`** (line 252) is
  full-width and belongs to the two taps that open and close a workout. The
  editor in chunk 04 uses **none of the last two** — see C4.
- **Labelled fields stacked over their control** is `.add-exercise-field`
  ([styles.css:101](../../frontend-web/src/styles.css)), with
  `.add-exercise-field input, .loading-field select` (106) as the one recipe for
  every box and menu of that shape. It is not Settings' idiom today, and chunk 04
  says what it does instead.
- **375px is the width to check**, and nothing may scroll sideways at it.
- `api.js` is *"the single door between frontend-web and the backend"*
  ([api.js:1](../../frontend-web/src/api.js)). No component calls `fetch`.

## Assumptions

The chunks build as though these were true and cite them by number. They are
**not** in AGREED.md — they are what AGREED.md left open, answered the most
likely way so the build has firm ground. The three marked ⚑ are the ones worth
the human's eye at review.

| # | Assumption | Why it holds |
|---|---|---|
| C1 | The gate is **one React context**, `EditGateProvider` in a new `src/editing.jsx`, mounted in `main.jsx` inside `AuthProvider`. Not `useState` inside `Settings.jsx`. | AGREED says "React context/state" and asks for an indicator visible while armed. A page-local `useState` dies the moment the user navigates away from Settings, which makes "15 minutes idle" and "dies on log out" both meaningless, and leaves nowhere for an indicator to live. A provider gives all three honestly and is about thirty lines. |
| C2 | **Idle** means no `pointerdown` and no `keydown` anywhere in the document. The 15-minute timer starts when the gate is armed and restarts on either event, and the listeners exist **only while armed**. | The simplest thing that matches the words. A timer that never restarts would be "15 minutes armed", not "15 minutes idle", and would disarm mid-edit. |
| C3 ⚑ | The header is **`X-Edit-Closed-Record: 1`**, exact value, unlocking `PATCH`/`PUT` only. | AGREED left the name to the spec. Argued in full above. The `PATCH`-only half is the load-bearing part: it is what turns "no delete affordance anywhere" from a UI promise into a server rule. |
| C4 | The editor is **plain by construction**: raw column values in labelled boxes, no `.button--tap`, no `.button--major`, no import of `sets.js`, no `Worked`, **no per-side arithmetic and no `20 + 2 × 60` expression anywhere in it**. | AGREED: "a deliberately plain editor … that reads as a tool rather than as part of the app proper". `weight_kg` is the column, and this screen edits columns. The expression is the app's way of *reading* a set; a tool that rewrites the record shows the record. |
| C5 | The list of blocks comes from a **new read-only action**, `GET /api/v1/performed-exercises/recent/`, a bare array of at most 30, newest first — not from the existing paginated list route with new query parameters. | `history/` ([views.py:248](../../backend/observations/views.py)) is the precedent for exactly this shape, down to the cap and the bare array. AGREED says 30 and no pagination; the list route is paginated at 50 and ordered `created_at` ascending, and bending it would change an endpoint that already has callers. |
| C6 ⚑ | `recent/` returns **closed blocks only** (`ended_at__isnull=False`). | AGREED says "the most recently logged exercise blocks", and `end/`'s own docstring defines logged: *"200 means this block is now in your log"*. It also keeps the block being recorded **right now** out of a screen that could rewrite it from under the exercise zone. |
| C7 ⚑ | `started_at` is edited through a `<input type="datetime-local" step="1">`, and is **sent only when it actually changed**. `type` is a plain text box with `maxLength={8}`, not a dropdown. | `datetime-local` cannot hold sub-second precision, so sending an untouched `started_at` back would silently trim it; the dirty check is what stops that, and it is why the rule is stated rather than left to taste. `type` lost its `choices` in migration `0004` and is free text with a `max_length` of 8 — a dropdown here would reinvent a list the model deliberately does not have. |
| C8 | A save is **one PATCH per changed row**, sent in order, stopping at the first failure. | The three tables are three endpoints; there is no bulk route and this iteration is not building one. A block with four sets and one wrong movement is two requests. Stopping at the first failure is what keeps the error message true about what did and did not land. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it produces
no code and no screen of its own. Every visible change lives in a numbered chunk.
