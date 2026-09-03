# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

**[AGREED.md](AGREED.md) is above this file.** It is the output of stage ①,
signed off by the human, and every decision in it is settled. Where this file
and AGREED.md disagree, AGREED.md wins and the chunk stops rather than
improvises. What this file adds is the code the decisions land in, the
arithmetic written out once, and the small number of things AGREED.md left open
— those are the `W…` rows at the bottom, flagged as flagged.

## What is being built

An `ExerciseDefinition` gains two numbers saying how it is loaded — a bar weight
and a side count — and from then on you type only the weight going on **one**
side. The app does the arithmetic:

    total = bar_kg + sides × per_side

The total is still the only thing stored. `PerformedSet.weight_kg` gains
nothing, loses nothing and means exactly what it meant yesterday: the weight
actually lifted. Per side is arithmetic done at display time and never written
down (AGREED 3).

Deadlift is `20 × 2`. EZ curl `7.5 × 2`. Lat pulldown `0 × 1`. A trap bar is not
a special case, it is a different `bar_kg` — and, because there is no edit path
(AGREED 2), a different catalogue entry.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Apps are top-level packages
  under `backend/` (`accounts`, `catalog`, `protocols`, `observations`,
  `feedback`, `dataexport`), listed in `INSTALLED_APPS` in
  [settings.py](../../backend/settings/settings.py). Routes are registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; DRF's project-wide default permission is `IsAuthenticated`, so
  an anonymous request gets 403 rather than rows.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. Django serves the built `index.html` for every
  non-API route.
- `make run` brings both up: the API on :8000, the app on
  <http://localhost:5173>. `make migrate`, `make test` and `make dummy-data` are
  the other three you will want. `make dummy-data` seeds the 34 movements the
  backfill table in AGREED.md is written against — see
  [seed_dummy_data.py](../../backend/observations/management/commands/seed_dummy_data.py),
  `EXERCISES` at line 46.
- [docs/schema.dbml](../../backend/docs/schema.dbml) is **generated** from the
  models after every `manage.py migrate` by the `schemadocs` app. Never hand-edit
  it; run the migration and commit what it wrote.

## The code this lands in — verified line references

Every reference below was read in this worktree. If one has drifted by the time
you read it, trust the name over the number.

### Backend

| Where | What is there |
|---|---|
| [catalog/models.py:8](../../backend/catalog/models.py) | `ExerciseDefinition` — `id` (UUID), `name` (`CharField(max_length=120, unique=True)`, line 16), `created_by` (line 22, `SET_NULL`, nullable), `created_at` (line 30). A `Lower('name')` `UniqueConstraint` named `exercisedef_name_ci_unique` in `Meta` (lines 32–43). **That is the whole model** — the two new columns are the fourth and fifth meaningful things it will hold. |
| [catalog/views.py:8–23](../../backend/catalog/views.py) | `ExerciseDefinitionViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet)` — list, retrieve, create, and nothing else. `PUT`, `PATCH` and `DELETE` answer **405 because no mixin provides them**, and the docstring says why. That 405 stays (AGREED 2). `perform_create` (line 25) stamps `created_by` and turns the uniqueness race into an ordinary duplicate answer. |
| [catalog/serializers.py](../../backend/catalog/serializers.py) | `ExerciseDefinitionSerializer` — `fields = ['id', 'name', 'created_at']`, `name` declared by hand on purpose (read the comment before touching it), `validate_name` collapsing whitespace, `validate` answering a duplicate through `duplicate_entry_error`. |
| [observations/models.py:109](../../backend/observations/models.py) | `PerformedSet.weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)`. **`null` means bodyweight, not zero.** No weight is not no value: it is a set that carried none. Nothing in this iteration reads, writes, migrates or reinterprets this column. |
| [observations/serializers.py:45](../../backend/observations/serializers.py) | `exercise_name = serializers.CharField(source='exercise_definition.name', read_only=True)` on `PerformedExerciseSerializer`, with the docstring saying why: *"carrying its catalogue name so listing a session does not force the client into a second request per exercise"*. That is the precedent chunk 02 follows, for the same reason. It is inherited by `PerformedExerciseDetailSerializer` (line 63) and `PerformedExerciseHistorySerializer` (line 76), so one addition reaches the session detail page **and** the zone's history in one go. |
| [dataexport/export.py](../../backend/dataexport/export.py) | `PERFORMED_SETS_HEADER` at **line 134** and the row it writes at **line 148** (`row.weight_kg`); `WORKOUTS_HEADER` at **line 220** and its `performed_set.weight_kg` at **line 265**. Also `EXERCISE_DEFINITIONS_HEADER` at line 173 and its row at line 180. **None of these five lines is touched by any chunk** — see "The fence", below. |
| [dataexport/tests.py:48, :62](../../backend/dataexport/tests.py) | The column-order assertions: `HEADERS['workouts.csv']` (line 48 is its `weight_kg, reps, distance_m, duration_s, rpe` line) and `HEADERS['tables/performed_sets.csv']` (line 62). Line 51 is the catalogue's. Asserted against every file's first row at line 201, and again at 419 and 499. **Untouched.** |

### Frontend

| Where | What is there |
|---|---|
| [CurrentSession.jsx:25–29](../../frontend-web/src/pages/CurrentSession.jsx) | `setSummary(set)` — the one place a set becomes a line of text. `"60 kg × 8"`, `"8 reps"` for a bodyweight set, `""` for neither. This function is what chunk 03.0 replaces. |
| CurrentSession.jsx **:81**, **:133**, **:1014** | Its three callers: last time's cell in `SetRow`, this session's cell in `SetRow`, and the Earlier lines (`performed.performed_sets.map(setSummary).join(', ')`). Three of the four screens AGREED 7 lists. |
| CurrentSession.jsx:96–130 | The edit-a-set form nested inside `SetRow` — a weight box, a reps box, Save, Cancel. Seeded at line 318 (`setWeight(set.weight_kg === null ? '' : String(Number(set.weight_kg)))`) and saved at line 338 (`api.patch('performed-sets/<id>/', entry)`). Chunk 05's ground. |
| CurrentSession.jsx:223–231 | `parseEntry(weight, reps)` — the typed pair as the API wants it, or `null` when it is not a set yet. Reps whole and ≥ 1; a blank weight is `null` (bodyweight, **not** zero); the weight is passed through **as the string it was typed as**, so a decimal column never sees a float. Used by both the log form (line 558) and the edit form (line 298). |
| CurrentSession.jsx:859–871 | The live weight input in the zone's `.log-set` form: `<label htmlFor="set-weight">Weight (kg)</label>` and the `<input id="set-weight" type="number" inputMode="decimal" step="any" min="0" placeholder="—">`. Chunk 04's ground. |
| CurrentSession.jsx:473, :485–488, :495 | `useLoad(() => api.list('exercises/'))`, the catalogue copied into page state, and `const held = catalogue?.find((exercise) => exercise.id === heldId) ?? null`. **The whole catalogue row is already in hand on this page** — including any field the serializer adds to it. |
| [TrainingSessionDetail.jsx:21–27](../../frontend-web/src/pages/TrainingSessionDetail.jsx) | `SET_COLUMNS` — `weight_kg`, `reps`, `distance_m`, `duration_s`, `rpe`, each with a label. Line 44 drops the columns every set left `null`; line 70 renders `set[column.key] ?? '—'`. Chunk 03.5's ground. This page loads **only** `training-sessions/<id>/` (line 83): it has no catalogue, which is why chunk 02 puts the loading on the performed exercise. |
| [components/AddExerciseForm.jsx](../../frontend-web/src/components/AddExerciseForm.jsx) | One box, one button, three outcomes (`onAdded` / `onDuplicate` / a failure it keeps). Shared by [ExerciseCatalogue.jsx](../../frontend-web/src/pages/ExerciseCatalogue.jsx) and the zone (CurrentSession.jsx:1030). Chunk 06 adds two fields to it, once, for both. |
| [styles.css](../../frontend-web/src/styles.css) | One section per page or component, in page order. The ones this iteration is inside: `/* Add an exercise */` (line 57), the current-session set rows (line 145 on, `.set-measures` at 218–220), `.edit-set` (line 251), the zone (line 293 on), `.earlier-sessions` (441), `.log-set` (453). Colours come from `currentColor` and `color-mix`, never hex — the app is `color-scheme: light dark` and has no palette. |

## The fence: the exports are not in this iteration

AGREED 4 and AGREED 8, together, are the hardest rule here.

- **No migration reads or writes `PerformedSet.weight_kg`.** Not to correct it,
  not to split it, not to round it, not to look at it. The human's words:
  *"so long as the weights associated in the actual observations aren't changed,
  then it doesn't really matter"*. The only data migration in this iteration
  writes two columns on `catalog_exercisedefinition` and reads nothing else.
- **`backend/dataexport/` does not change, and neither do its tests.**
  `workouts.csv` and `tables/performed_sets.csv` keep their exact column order
  and their bare totals; `tables/exercise_definitions.csv` keeps its four
  columns (W11). Every chunk that goes anywhere near the backend repeats this in
  its own **Do not**, and the check is the same each time: `make test` passes
  with `backend/dataexport/tests.py` unedited, and `git status` shows nothing
  under `backend/dataexport/`.

## The arithmetic, written out once

Every chunk that shows or takes a number uses these rules, and no chunk invents
a second copy of them. Chunk 03.0 puts them in one module and everything after
it imports that module.

### Is an exercise configured?

Configured means **both** `bar_kg` and `sides` are non-null (W1). One without
the other cannot happen — a database check constraint forbids it (chunk 01) —
but the client still tests for both, because a client that tests for one is a
client that renders `undefined` the day the other is missing.

`bar_kg` arrives from DRF as a decimal **string** (`"20.00"`), the same as
`weight_kg` does. `sides` arrives as a number.

### Showing a set

Per side is `(weight_kg − bar_kg) / sides`, computed at display time and never
stored (AGREED 3).

| The set | Shown as | Why |
|---|---|---|
| `weight_kg` is null | `8 reps` | A bodyweight set carries no weight to split. **Exactly as today**, with no expression, whatever the exercise is configured as. |
| Not configured (either column null) | `140 kg × 8` | Unknown is not zero. Behaves exactly as today (AGREED 5). |
| `bar_kg` 0, `sides` 1 | `50 kg × 12` | The collapse rule (AGREED 7): `0 + 1 × 50 = 50` is silly, so it is not shown. |
| `sides` 1, `bar_kg` > 0 | `25 + 50 = 75 kg × 8` | The `1 ×` is dropped for the same reason (W8). |
| `sides` 2 | `20 + 2 × 60 = 140 kg × 8` | The full expression (AGREED 7). |
| Per side would be negative | `15 kg × 8` | A total lighter than its own bar is a set logged before the config existed, or a mistake. Either way the expression would be a lie; the plain total is not. (W4) |
| `reps` null | the weight part alone | As today. |

**The number is shown exactly, never rounded** (W3). `weight_kg` carries at most
2 decimals and `sides` is 1 or 2, so `(weight_kg − bar_kg) / sides` has at most
**3** decimals and is always exact — `(107.50 − 20) / 2` is `43.75`, and
`(107.55 − 20) / 2` is `43.775`. Trailing zeros are stripped, so `45.00` reads
`45`. An ugly number is shown ugly on purpose: the expression has to add up to
the weight that was actually lifted, and a tidied side weight is a false claim
about a set that happened. Sets logged before the config existed are exactly
where this shows up (AGREED 10 is the other place, and is a made decision — do
not "fix" it).

Arithmetic is done in **integer thousandths** — `Math.round(Number(value) * 1000)`
in, formatting out — and never in floating point across a whole expression:
`0.1 + 0.2` must not reach a screen or a decimal column. Thousandths rather than
hundredths because halving a two-decimal total is where the third decimal comes
from, and it has to stay an integer for the whole trip. A total is valid when its
thousandths are a multiple of 10; that is the same rule as "an exact multiple of
0.01", counted somewhere it can actually be counted.

### Taking a set

One box, holding the weight for **one side** (AGREED 6):

    DEADLIFT
      20 + 2 × [ 60 ]  = 140 kg
      reps       [  8 ]

| The exercise | The box | What is sent |
|---|---|---|
| Not configured | one box, labelled `Weight (kg)`, holding the total | exactly as today |
| `bar_kg` 0, `sides` 1 | one plain box, labelled `Weight (kg)`, holding the total | exactly as today — nothing to add or multiply (AGREED 6) |
| Anything else | `bar_kg` and `sides` sit beside the box as fixed, non-editable context, and the total is computed live to the right of it | `weight_kg` = the computed total |

- **Blank still means bodyweight** (W9). A blank per-side box sends
  `weight_kg: null`, exactly as a blank total box does today — not `bar_kg`, and
  not `0`.
- A typed per side goes through the same shape check as today's total
  (`/^\d+(\.\d+)?$/`, `parseEntry` line 229) and, **on the configured path
  only**, one more rule: the total it produces must be an exact multiple of
  0.01, because that is all a `decimal_places=2` column can hold. `43.775` per
  side on a `20 / 2` movement is fine — it makes exactly `107.55`. A total that
  does not land on a whole penny of a kilo is "not a set yet", the same as a
  half-typed number: Log set stays off and nothing is sent.
  - The rule is on the **total**, never on the typed value, or a set whose
    stored total divides into three decimals could not be edited back to itself.
  - And it applies only where a total is *computed*. The plain-box path — unset,
    or `0 / 1` — passes the typed string through exactly as it does today, and
    an over-precise number is still the server's 400 to give, not the button's
    to pre-empt. This iteration changes nothing about a box it did not change.
- The total is sent as a **string with exactly two decimals** (`"140.00"`), built
  from the integer-thousandths arithmetic above. Never a JavaScript number.

## Where the derivation lives, and why

**In the frontend. The API ships the two raw numbers and computes nothing.**

This was a real choice and it is made here, once, so that no chunk re-opens it.

1. **It keeps the material record byte-identical.** A `per_side` on
   `PerformedSetSerializer` would not be stored, but it would put an assumption
   inside the API's representation of a set — one hop from `dataexport`, one
   refactor from being persisted, and directly against AGREED 3's reason for
   existing. The set payload this iteration leaves behind is the same set
   payload it found. That is the strongest guarantee available that the fence
   above holds.
2. **A single derived number cannot express the display anyway.** The table in
   "Showing a set" branches on `sides === 1`, on `bar_kg === 0`, on a null
   weight and on a negative result, and it renders differently in a line, a
   narrow column and a table cell. Every one of those branches needs the raw
   `bar_kg` and `sides`. Sending a computed `per_side` as well would mean
   sending both — the raw numbers *and* a number derived from them — and then
   owning the day they disagree.
3. **The raw numbers are nearly all already there.** Verified: `CurrentSession.jsx`
   already holds the entire catalogue in page state (`:473`, `:485–488`) and the
   held exercise's own row at `:495`, so the zone, its set list and its Earlier
   lines need no new request. The one screen that does **not** have it is
   `TrainingSessionDetail.jsx`, which loads only `training-sessions/<id>/`
   (`:83`) — so chunk 02 hangs `exercise_bar_kg` and `exercise_sides` on
   `PerformedExerciseSerializer` beside the `exercise_name` that is already
   there at `observations/serializers.py:45`, for the reason that field's own
   docstring gives. That single addition is inherited by the detail and history
   serializers, so it also feeds the zone's "Last time" column and Earlier lines
   without a second lookup.
4. **One copy of the arithmetic.** Frontend-side, there is exactly one module
   with the rounding rule, the collapse rule and the bodyweight rule in it.
   Backend-side there would be a second, and the two would drift the first time
   one of them was corrected.

The cost, stated plainly: a non-browser client of this API gets `weight_kg` and
has to divide it itself. That is the right side of the trade for an app with one
frontend and an export whose whole point is bare totals.

## Assumptions

The chunks build as though these were true and cite them by number. They are
**not** in AGREED.md — they are what AGREED.md left open, answered the most
likely way so the build has firm ground. The four marked ⚑ are the ones worth
the human's eye at review: each resolves something AGREED.md does not settle,
and each is a one-line change here plus a `grep` through the chunks.

| # | Assumption | Why it holds |
|---|---|---|
| W1 | `bar_kg` and `sides` are **both set or both null**, never one of each. A database check constraint enforces it. | Neither number means anything alone: a bar with no side count cannot be added up, and a side count with no bar cannot either. "Unset" has to be one state, or every reader needs three branches instead of two. |
| W2 | The derivation is **the frontend's**; the API carries `bar_kg` and `sides` and nothing computed. | Argued in full above. |
| W3 | A per side that does not divide evenly is shown **exactly**, to at most 3 decimals, never rounded. | The expression must equal the weight that was lifted. Rounding `43.775` to `43.78` makes `20 + 2 × 43.78 = 107.56`, which is a set nobody did. |
| W4 | A total **below its own bar** shows as today's plain total, with no expression. | `20 + 2 × −2.5` is not a description of anything. It happens only on rows logged before the config existed, and the total is still true. |
| W5 | `sides` is **1 or 2**; `bar_kg` is **≥ 0**, at most 2 decimals. Both enforced by the database and the serializer. | AGREED 1 names exactly these two values ("`sides` (1 or 2)"). A negative bar is not a thing, and a third side is a different kind of machine, which is a different catalogue entry. |
| W6 ⚑ | Setting the loading on a row that has none is a **custom action** on the catalogue detail route (`POST …/exercises/<id>/loading/`), which refuses if either column is already set. `PUT`/`PATCH`/`DELETE` stay 405. | AGREED 2 says no edit path and the 405 stays; AGREED 5 says an unset row is set once, on first use. Both hold only if the write is a separate, one-way door: unknown → known, and 409 for known → different. Read as: AGREED 2 forbids *changing* a known value, not *learning* an unknown one. If the human meant "no write of any kind", chunk 07 and AGREED 5 both go. |
| W7 ⚑ | A create **may** omit both columns; the API accepts an unset row. The add form always sends both, so an unset row can only come from the admin or from before this iteration. | AGREED 6 says the form asks for both, and says nothing about the API. Requiring them at the serializer would make the API stricter than the model's own nullability and would 400 the admin's own workflow; requiring them in the form is what actually stops unset rows appearing. |
| W8 ⚑ | `sides` 1 with `bar_kg` > 0 reads `25 + 50 = 75 kg` — the `1 ×` is dropped, the bar is not. | AGREED 7 spells out the collapse only for `0 × 1` ("rather than the silly `0 + 1 × 50 = 50`"). `1 ×` is silly for the same reason; `+ 25` is not, because it is load. |
| W9 | A **blank** per-side box means bodyweight, exactly as a blank total box does today. | `weight_kg` null is bodyweight (models.py:109, and parseEntry's comment at :219). Reading a blank box as "just the bar" would invent a set the user did not log. |
| W10 | An unset exercise held in the zone is **asked** about, and the question is **skippable** in one tap. | Resolved at build time, reversing this spec's first draft. The draft had the question blocking the log form, faithful to AGREED 5's "asks for bar and sides, then locks" — but that made the feature able to stand between somebody and their workout, which is the opposite of why it exists. The skip drops into the ordinary plain-total box, stores nothing at all, and the movement is asked about again next time it is held. AGREED 5 governs what an *answer* does; it does not require the question to be a wall. AGREED 2/5's guarantee is untouched, because a skip writes no value. |
| W11 ⚑ | `tables/exercise_definitions.csv` does **not** gain the two columns; it keeps `id, name, created_by_id, created_at`. | AGREED 8: the exports are unchanged and their tests pass untouched. The consequence, said out loud: the table dump of the catalogue stops being a complete dump of that table, so a database rebuilt from the zip would come back with every exercise unset. If the human wants that closed, it is a change to `EXERCISE_DEFINITIONS_HEADER`, its row function and `HEADERS` in the export tests — a small chunk, and explicitly not this one. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it produces
no code and no screen of its own. Every visible change lives in a numbered
chunk.
