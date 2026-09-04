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
  non-API route. Routing is `react-router-dom`, declared in
  [App.jsx](../../frontend-web/src/App.jsx): `/current-session/*` is one route
  for two addresses, because **the exercise zone is an address of its own** —
  `/current-session/exercise` — rather than a flag on the page.
- `make run` brings both up: the API on :8000, the app on
  <http://localhost:5173>. `make migrate`, `make test` and `make dummy-data` are
  the other three you will want. `make dummy-data` seeds the 34 movements the
  backfill table in AGREED.md is written against — see
  [seed_dummy_data.py](../../backend/observations/management/commands/seed_dummy_data.py),
  `EXERCISES` at line 59.
- [docs/schema.dbml](../../backend/docs/schema.dbml) is **generated** from the
  models after every `manage.py migrate` by the `schemadocs` app. Never hand-edit
  it; run the migration and commit what it wrote.

## The code this lands in — verified line references

Every reference below was re-read in this worktree, after `main`'s exercise-zone
rework landed. If one has drifted by the time you read it, trust the name over
the number — and two of them will have drifted on purpose:

- **Chunks 01, 02, 03.0, 03.5 and 06 are already built.** The rows below
  describe the code *after* them, not before. What is left is 04, 05, 07 and 08.
- **`CurrentSession.jsx` and `styles.css` are mid-merge with `main`**, which
  restructured the zone in `3c0cab3` (+548/−222). Their numbers here are
  `main`'s — `git show 3c0cab3:frontend-web/src/pages/CurrentSession.jsx` and
  the same for `styles.css` — and every one of them shifts by whatever the
  resolution keeps of chunks 03.0–06's edits to the same two files. Read the
  file before trusting a number in it.

### Backend

| Where | What is there |
|---|---|
| [catalog/models.py:8](../../backend/catalog/models.py) | `ExerciseDefinition` — `id` (UUID), `name` (`CharField(max_length=120, unique=True)`, line 16), **`bar_kg` (line 28) and `sides` (line 38), both nullable** (chunk 01), `created_by` (line 51, `SET_NULL`, nullable), `created_at` (line 59). `Meta.constraints` (line 64) holds the `Lower('name')` `UniqueConstraint` `exercisedef_name_ci_unique` (line 71) and the three checks chunk 01 added: `exercisedef_loading_both_or_neither` (83), `exercisedef_sides_1_or_2` (96), `exercisedef_bar_kg_not_negative` (102). |
| [catalog/views.py:14–32](../../backend/catalog/views.py) | `ExerciseDefinitionViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet)` — list, retrieve, create, and nothing else. `PUT`, `PATCH` and `DELETE` answer **405 because no mixin provides them**, and the docstring says why. That 405 stays (AGREED 2). `perform_create` (line 34) stamps `created_by` and turns the uniqueness race into an ordinary duplicate answer. |
| [catalog/views.py:55–110](../../backend/catalog/views.py) | The `loading` action chunk 02 built: `POST /api/v1/exercises/<id>/loading/` with `{"bar_kg": "25.00", "sides": 2}`. **200 with the entry**, or **409 with `detail` and `exercise`** when either column is already set — the one-way door W6 is built on, and the only write to these two columns anywhere. Its docstring is the argument; read it before adding a second write of any kind. Chunk 07's request. |
| [catalog/serializers.py](../../backend/catalog/serializers.py) | `ExerciseDefinitionSerializer` — `fields = ['id', 'name', 'bar_kg', 'sides', 'created_at']` (line 49), `bar_kg` a `DecimalField` (29) and `sides` a `ChoiceField(choices=[1, 2])` (39), both optional (W7), with `validate` refusing one without the other (77–82). `ExerciseLoadingSerializer` (110) is the `loading/` body, where **both are required**. A create and the `loading/` response are the same five fields, so either can be dropped straight into a list the client is holding. |
| [observations/models.py:126](../../backend/observations/models.py) | `PerformedSet.weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)`. **`null` means bodyweight, not zero.** No weight is not no value: it is a set that carried none. Nothing in this iteration reads, writes, migrates or reinterprets this column. |
| [observations/serializers.py:86–141](../../backend/observations/serializers.py) | `PerformedExerciseSerializer`, and **the row the whole frontend now reads its arithmetic off**. `exercise_name` at line 90 is the precedent — *"carrying its catalogue name so listing a session does not force the client into a second request per exercise"* — and chunk 02 hung `exercise_bar_kg` (109) and `exercise_sides` (115) beside it for the same reason, read-only, both null while the movement is unanswered. `PerformedExerciseDetailSerializer` (144) and `PerformedExerciseHistorySerializer` (157) inherit them, so `training-sessions/current/`, `training-sessions/<id>/`, `performed-exercises/history/` **and the answer to `POST performed-exercises/`** all carry each block's own loading. |
| [dataexport/export.py](../../backend/dataexport/export.py) | `PERFORMED_SETS_HEADER` at **line 134** and the row it writes at **line 149** (`row.weight_kg`); `WORKOUTS_HEADER` at **line 218** and its `performed_set.weight_kg` at **line 266**. Also `EXERCISE_DEFINITIONS_HEADER` at line 174 and its row at line 181 — still four columns, and still four after chunk 01 gave the model two more (W11). **None of these five lines is touched by any chunk** — see "The fence", below. |
| [dataexport/tests.py:45, :61](../../backend/dataexport/tests.py) | The column-order assertions: `HEADERS['workouts.csv']` (line 45; line 48 is its `weight_kg, reps, distance_m, duration_s, rpe` line) and `HEADERS['tables/performed_sets.csv']` (line 61). Line 51 is the catalogue's four columns. Asserted against every file's first row at line 201 and again at 419. **Untouched.** |

### Frontend

`main` reworked this page in `3c0cab3` and the rework is the ground chunks 04,
05 and 07 stand on, so the rows below say what is there **now**, and say plainly
where that is not what an earlier draft of a chunk assumed.

| Where | What is there |
|---|---|
| [CurrentSession.jsx:612–617](../../frontend-web/src/pages/CurrentSession.jsx) | `const openExercise = session?.performed_exercises.find((performed) => performed.ended_at === null) ?? null`, and `openSets = openExercise?.performed_sets ?? []`. **The two lines every remaining chunk turns on.** An exercise is a row on the server (lifecycle E1, E8), derived from the session `training-sessions/current/` already answered with. There is no `heldId`, no `held`, no `heldPerformed` and no `heldSets`: those names are gone, and so is the catalogue lookup that produced them. |
| CurrentSession.jsx:1103–1398 | The zone — `<section className="record-set exercise-zone">`, rendered *instead of* the workout rather than over it, at its own address `/current-session/exercise` (`atExercise`, line 634; the two redirects at 1058–1066). Three states inside it: an open exercise (`openExercise ?`, line 1117), the add form (`adding`, 1323), the dropdown (1335). |
| CurrentSession.jsx:1133–1239 | The `.log-set` block — **a `<div>`, not a `<form>`** (lifecycle E11). The weight `<p>` at 1134–1152, the reps `<p>` at 1153–1165, the restored note at 1172–1176, `.log-set-actions` at 1198–1226, `logError` and `closeError` at 1229–1238. Chunk 04's ground. |
| CurrentSession.jsx:1136–1151 | The weight input, and **it is not a plain box any more**: besides `value={weight}` it carries `data-restored={restored ? '' : undefined}` and `onChange={(event) => typeWeight(event.target.value)}`. Both belong to the draft (lifecycle E10) and chunk 04 has to keep both. |
| CurrentSession.jsx:684–729 | What is being typed, and what it costs. `weight`/`reps` at 684–685 and `entry = parseEntry(weight, reps)` at 686 — the one call chunk 04 changes; `restored` at 692; the read-the-draft effect at 702–709, keyed on `openExercise?.id`; `typeWeight` at 719 and `typeReps` at 725, which set the box, clear `restored` and mirror both strings into `localStorage`. The three storage helpers are at 53, 76 and 88. |
| CurrentSession.jsx:1198–1226 | The buttons, and there are exactly two. Log set is `type="button"` with `onClick={logSet}`, off while `entry === null || logging || closing`. Beside it, **one** way out: `openSets.length > 0 ? 'Log exercise' : 'Change exercise'`, both `onClick={closeExerciseRow}`. No ×, no third exit, no `closeZone`, no `zoneOpen`. |
| CurrentSession.jsx:770–802 | `logSet()` — **no event parameter**, because nothing submits: it is a tap and only a tap. One POST to `performed-sets/` against `openExercise.id`, straight into `session`, and the boxes keep what is in them. It already spreads `...entry`, so a computed total travels the path a typed one did. |
| CurrentSession.jsx:820–848 | `openExerciseRow(exerciseDefinition, alreadyInCatalogue = null)` — the POST to `performed-exercises/` that creates the block when a movement is **picked**, with `opening`/`openError` (639–640). Its response is `PerformedExerciseSerializer`, so the new block carries `exercise_bar_kg` and `exercise_sides` from the moment it exists. `chooseCreated` (920) and `chooseExisting` (933) both end here. |
| CurrentSession.jsx:864–910 | `closeExerciseRow()` — async, `POST performed-exercises/<id>/end/`, with `closing`/`closeError` (644–645). 204 means the block was empty and is deleted; the user stays on the chooser. 200 means it is closed and stamped, and the page navigates to `/current-session`. It is also where everything belonging to the block is dropped: the two boxes, every draft key, `restored`, `logError`, `alreadyThere`, `rows.close('held')`. |
| CurrentSession.jsx:950–954 | `cancelChoosing()` — the other half of what `releaseExercise` used to be. No request, because nothing was opened; only reachable from the chooser. |
| CurrentSession.jsx:316–324 | `parseEntry(weight, reps)` — the typed pair as the API wants it, or `null` when it is not a set yet. Reps whole and ≥ 1; a blank weight is `null` (bodyweight, **not** zero); the weight is passed through **as the string it was typed as**, so a decimal column never sees a float. Two callers: the log form (686) and `useSetRows` (399). |
| CurrentSession.jsx:152–261 | `SetRow` — one logged set, with the inline edit form nested in it at 187–221 (`aria-label="Weight (kg)"` at 195, `onSubmit` kept: **that** form still submits on Enter, and should). `rows` is **absent** for a list rendered without actions, and the row guards on it at 156 and 225. Chunk 05's ground. |
| CurrentSession.jsx:386–507 | `useSetRows(setSession)` — created once at 737 and now handed to **one** list, the zone's (1288). `entry` at 399, `edit` at 416 (the seed `String(Number(set.weight_kg))` at 419), `save` at 431, `close` at 483. |
| CurrentSession.jsx:521–531 | `PerformedExercise({ performed, index })` — **`rows` is gone** (lifecycle 04). Completed exercises has no Edit and no Delete, because every block down there is closed and the API refuses every write to a closed one. |
| CurrentSession.jsx:580, 600–603, 1353–1357 | `useLoad(() => api.list('exercises/'))`, the catalogue copied into page state, and the only place that copy is read: the `<option>` list. **The catalogue is names now.** Nothing on this page reads `bar_kg` or `sides` off it, and nothing should start to — see "Where the derivation lives", below. |
| [sets.js](../../frontend-web/src/sets.js) | Chunk 03.0's module, and the only home of the arithmetic. `loadingOf(performed)` (104) turns `exercise_bar_kg`/`exercise_sides` into the `{ bar_kg, sides }` everything else here takes; `perSide` (127), `weightParts` (180), `weightText` (203), `setParts` (224), `setSummary` (246), `entryPrefix` (269), `totalFrom` (294). |
| [components/Worked.jsx](../../frontend-web/src/components/Worked.jsx) | The two tiers drawn: `working` a step behind `total`, and **no markup at all** when there is no working. It wears `.per-side-fixed` and `.per-side-total`, the classes the log form's live sum wears, on purpose. |
| [TrainingSessionDetail.jsx](../../frontend-web/src/pages/TrainingSessionDetail.jsx) | Chunk 03.5, done: `SET_COLUMNS` at 23, `weightCell` at 59 using `weightParts(..., { unit: false })`, `loadingOf(performed)` at 70. It loads **only** `training-sessions/<id>/` (line 12) and has no catalogue — which is why chunk 02 put the loading on the performed exercise. |
| [components/LoadingFields.jsx](../../frontend-web/src/components/LoadingFields.jsx) | Chunk 06's shared pair: `loadingAnswered(value)` (18), `EMPTY_LOADING` (28), the component (56) with its Bar (kg) box, its Sides `<select>` and the one permanence note at 105. Neither field has a default, deliberately. `AddExerciseForm` stands it at line 160; chunk 07 stands the same component somewhere else. |
| [styles.css](../../frontend-web/src/styles.css) | One section per page or component, in page order. The ones this iteration is inside: `/* Add an exercise */` (57), the current-session set rows (145 on, `ol.sets .set-measures` at 231), `.edit-set` (264), the zone (278 on), `.earlier-sessions` (445), `.log-set` (457), `.log-set input` (463), the restored-draft rules (472–511), `.log-set-actions` (522). Colours come from `currentColor` and `color-mix`, never hex — the app is `color-scheme: light dark` and has no palette. |

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
3. **The raw numbers arrive on the row being recorded into, in a request the
   page already makes.** Chunk 02 hung `exercise_bar_kg` and `exercise_sides` on
   `PerformedExerciseSerializer` (`observations/serializers.py:109`, `:115`),
   beside the `exercise_name` that was already at `:90`, for the reason that
   field's own docstring gives. The detail and history serializers inherit them
   (`:144`, `:157`), so **one** addition feeds every screen at once:
   `training-sessions/current/` carries the open block's loading and every
   completed block's, `performed-exercises/history/` carries last time's and the
   Earlier lines', `training-sessions/<id>/` carries the session detail page's —
   and `POST performed-exercises/` answers with it too, so a block knows how it
   loads from the moment it is opened. `loadingOf(performed)` (`sets.js:104`) is
   the one line that turns that pair into the `{ bar_kg, sides }` shape the
   arithmetic takes.

   **The zone reads its loading off `openExercise`, and not from the
   catalogue.** `loadingOf(openExercise)` is the loading for the log form, the
   zone's set list and the Last time column beside it; `loadingOf(performed)` is
   the loading for every other list. Nothing on any screen looks a movement up.

   *Do not reintroduce a lookup.* `main`'s `3c0cab3` removed the
   `catalogue.find(...)` this page used to derive its held exercise from, and it
   removed it on purpose: the zone is the recording screen, and it has to keep
   working when `exercises/` failed to load — which is exactly why the heading
   now comes off the block (`:1110`) rather than off a catalogue row. A loading
   read out of the catalogue would be a second copy of a number the block is
   already carrying, and the copy that is missing precisely when somebody is
   standing in front of the bar.

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
| W10 | An unset exercise opened in the zone is **asked** about, and the question is **skippable** in one tap. | Resolved at build time, reversing this spec's first draft. The draft had the question blocking the log form, faithful to AGREED 5's "asks for bar and sides, then locks" — but that made the feature able to stand between somebody and their workout, which is the opposite of why it exists. The skip drops into the ordinary plain-total box, stores nothing at all, and the movement is asked about again the next time it is opened — see W12 for what "next time" means now that a block outlives the page. AGREED 5 governs what an *answer* does; it does not require the question to be a wall. AGREED 2/5's guarantee is untouched, because a skip writes no value. |
| W12 ⚑ | The question in chunk 07 is asked **only into a block with no sets in it**. Once a set has been logged against the open exercise the panel does not come back, in that block, for any reason. | New under the exercise lifecycle, and it is what keeps W10 true. An open exercise now survives a reload (E8, E9), and a skip is deliberately stored nowhere (W10) — so without this rule, reloading mid-exercise re-erects the question in front of somebody who already declined it and has sets on the board. "Asked again next time" means the next time the movement is *picked up*, which under E2/E7 is a new block; it does not mean every time the page mounts. A block with a set in it has answered the question the other way already. |
| W11 ⚑ | `tables/exercise_definitions.csv` does **not** gain the two columns; it keeps `id, name, created_by_id, created_at`. | AGREED 8: the exports are unchanged and their tests pass untouched. The consequence, said out loud: the table dump of the catalogue stops being a complete dump of that table, so a database rebuilt from the zip would come back with every exercise unset. If the human wants that closed, it is a change to `EXERCISE_DEFINITIONS_HEADER`, its row function and `HEADERS` in the export tests — a small chunk, and explicitly not this one. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it produces
no code and no screen of its own. Every visible change lives in a numbered
chunk.
