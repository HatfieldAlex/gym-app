# 04 — The plain editor

**Goal:** tap a row and correct it. Labelled fields, a dropdown for which
movement the block points at, each set's numbers as they are actually stored,
and a Save that writes it back through the one door chunk 01 built.

Frontend only. Needs **01** (the header is refused without it) and **03** (the
gate and the list are what this hangs off). **No test runner: checked by hand
with `make run`,** and the walkthrough below is the check.

## Read first

- [frontend-web/src/api.js](../../frontend-web/src/api.js) — `request` (37) and
  the `api` object (100). `download` (76) is the precedent for adding a helper
  beside the others with a comment saying why it is not a flag on `request`
- [frontend-web/src/pages/Settings.jsx](../../frontend-web/src/pages/Settings.jsx)
  — chunk 03's section, and `ExportSection` (64) for how a mutation carries its
  own `busy` / `failed`
- [frontend-web/src/pages/CurrentSession.jsx:217–255](../../frontend-web/src/pages/CurrentSession.jsx)
  — the inline `.edit-set` form: labelled-for-screen-readers boxes, `Save` and
  `Cancel`, disabled while busy. **Read it for the shape, then do not copy its
  arithmetic** — that form is per-side and this one is not (C4)
- [frontend-web/src/components/LoadingFields.jsx](../../frontend-web/src/components/LoadingFields.jsx)
  — `useId` for label/control pairs, and `.add-exercise-field` as the
  stacked-label idiom
- [backend/observations/serializers.py](../../backend/observations/serializers.py)
  — what each of the three endpoints actually accepts, and which fields are
  read-only (`ended_at` on both, `created_at` everywhere)
- [00-context.md](00-context.md) — "The override: the exact contract", the scope
  boundary table, C3, C4, C7, C8

## Build

### 1. `api.correct(path, body)` in `api.js`

`request` gains a fourth parameter:

```js
async function request(method, path, body, extraHeaders) {
```

merged into `headers` after `Accept` and before the CSRF token, so nothing can
override `X-CSRFToken`. Every existing caller passes three arguments and is
unaffected; **do not change `get`, `post`, `patch`, `delete`, `list` or
`download`.**

Then, beside them:

```js
/** The header that says this PATCH means to write to a finished record. */
export const CORRECTION_HEADER = 'X-Edit-Closed-Record'

export const api = {
  …
  /** A deliberate correction to a record the API would otherwise refuse. */
  correct: (path, body) => request('PATCH', path, body, { [CORRECTION_HEADER]: '1' }),
}
```

Its comment says why it is its own name rather than an option on `patch`: a
`patch(path, body, { force: true })` reads like a retry, and this is the one call
in the app that writes to something the app has spent an entire iteration
refusing to write to. `grep -r correct\\( frontend-web/src` should find exactly
the editor.

**There is no `api.correctDelete`, and there is never going to be.**
`perform_destroy` on the server does not read the header (chunk 01), so such a
helper would be a lie in the client.

### 2. A row becomes a button

In chunk 03's list, each `<li>` now holds a `<button type="button">` carrying the
same text it carried before. `.set-action`'s register — small, quiet, text-like —
is the model; it is not a `.button`, not `.button--tap`, and not full width.

One row is open at a time. The open row's button is replaced, **in place**, by
the editor nested inside the same `<li>` — the way `SetRow` nests `.edit-set`
inside the row it is correcting, so the row keeps its place in the list and
nothing below it jumps.

### 3. The editor

Its own component in `Settings.jsx`, taking the block (as `recent/` gave it), the
catalogue array, and `onDone` / `onCancel`.

**The catalogue is loaded once for the whole armed section**, not per row:
`useLoad(() => api.list('exercises/'))` in the armed list component, handed down.
While it is still loading, rows are not yet tappable.

Three groups, each a `<fieldset>` with a `<legend>`, because this is a form about
three different rows and the legend is what says which:

```
Session
  Started            [ 2026-09-03T18:12:04 ]     ← datetime-local, step="1"
  Type               [ legs        ]             ← text, maxLength 8
  Ended              18:57, 3 Sep 2026           ← text. NOT a field.
Exercise
  Movement           [ Squat            ▾ ]      ← select of the catalogue
Sets
  1   Weight (kg) [ 100.00 ]  Reps [ 5 ]  Distance (m) [ ]  Duration (s) [ ]  RPE [ ]
  2   …
```

- **Every box has a visible `<label>`**, stacked over it, using `useId` for the
  pairing as `LoadingFields` does. Not `aria-label` — this screen has room, and
  a tool says what its fields are.
- **`Ended` is rendered as text and is not editable** — `ended_at` is read-only
  on the serializer (serializers.py:200) and stays that way (AGREED).
- **`Movement`** is a `<select>` of the catalogue by `name`, valued by `id`,
  seeded with the block's `exercise_definition`. It is the reason this whole
  iteration exists, so it is the one control that is not squeezed.
- **The five set measures** are the columns as they are stored:
  `weight_kg`, `reps`, `distance_m`, `duration_s`, `rpe`. Every set gets all five
  boxes, even the ones it left empty — this is the record, not a reading of it,
  and an empty box is how a set says it did not measure that.
  - `type="number"`, `inputMode="decimal"` and `step="any"` for the three decimal
    columns, `inputMode="numeric"` and `step="1"` for `reps` and `duration_s`.
  - **A blank box means null**, exactly as it does in the log form. Clearing
    `weight_kg` makes it a bodyweight set (models.py:126); it does not make it
    zero.
- **No delete.** No × on a set, no "remove this set", no "add a set", no way to
  detach a block from its session, no way to delete a session. There is no
  affordance for it anywhere in this component, and the server would refuse it
  anyway (chunk 01).

**Plain by construction** (C4). No `sets.js`, no `Worked`, no `20 + 2 × 60`, no
live total, no per-side box, no `.button--tap`, no `.button--major`, no icons.
The rest of the app reads a set; this rewrites the row underneath it, and it
should look like it.

### 4. Seeding, and what counts as changed

Every box is seeded with `String(value ?? '')` off the API's own answer, and a
field is **changed only when its current string differs from the string it was
seeded with** (C7, C8). That single rule is what stops a save from rewriting
values nobody touched:

- `weight_kg` comes back as `"100.00"` and goes back as `"100.00"`, byte for
  byte, unless somebody typed in the box.
- `started_at` is the reason the rule is stated rather than assumed.
  `datetime-local` cannot hold sub-second precision, so a round trip through the
  box would silently trim a stored `…:04.317Z`. Untouched means unsent, and
  unsent means untrimmed.

The two conversions, written out once, next to each other, with the comment
saying the box holds local wall-clock time and the API wants an instant:

```js
function toLocalInput(iso) {
  const at = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

function fromLocalInput(value) {
  return new Date(value).toISOString()
}
```

A blank number box sends `null`; a filled one sends **the string exactly as
typed**, never `Number(...)` — a decimal column must not be handed a float
(`parseEntry`'s own reasoning, CurrentSession.jsx:635).

### 5. Saving

`api.correct` throughout, **including when the row happens to be open** — the
header is never required and never harmful (chunk 01 tests exactly that), and one
code path is worth more than a branch that is right about state the client cannot
see.

One PATCH per changed row, awaited in order, **stopping at the first failure**
(C8):

1. `training-sessions/<training_session>/` — if `started_at` or `type` changed.
2. `performed-exercises/<id>/` — if `exercise_definition` changed.
3. `performed-sets/<id>/` — one per set with a changed measure, in list order.

Outermost first, so the likeliest refusal (a `started_at` moved past its own
`ended_at`, which the serializer answers 400 for) stops before anything inside
the session has moved.

Nothing changed anywhere → Save does nothing and closes the editor. It is not
disabled; a form with a live Save that turns out to have nothing to do is kinder
than a dead button the user has to work out.

- While saving: the button reads `Saving…` and every control in the editor is
  `disabled`.
- On success: call `onDone`, which **re-fetches `recent/`** and closes the
  editor, so the list shows what was actually stored rather than what was typed.
- On failure: stay open, keep every value the user typed, and say what happened
  in `<p className="status" data-state="error">` using `error.detail` with a
  plain fallback. If some requests already succeeded, say so — "Saved the session
  but could not save set 2" is the truth and "Could not save" is not. Naming
  which step failed is enough; do not attempt to roll anything back.
- Cancel closes the editor and throws the typed values away. No confirmation on
  cancel — nothing was written.

**If the gate disarms while the editor is open** — the 15-minute idle timeout, or
a log out in another tab — the whole armed branch unmounts and the section goes
back to the warning, taking any untyped work with it. That is correct and needs
no special handling. A request already in flight completes; it carries its own
header and the server never knew about the gate.

### 6. The styles

Extend chunk 03's `/* Edit training data */` section in `styles.css`; do not
start a second one.

- `.edit-data-list button` — the small, quiet, text-like register of
  `.set-action` (styles.css:315), left-aligned, full row width so the whole line
  is the tap target.
- `.record-editor` — a plain stack. `fieldset` with a hairline border and a
  `legend` in the quiet register; fields as label-over-control, reusing
  `.add-exercise-field`'s recipe (styles.css:101–116) rather than a second one.
- A set's five boxes are a wrapping row that becomes a stack on a phone. Give
  them a `min-width` that keeps 16px type — below that, focusing a number box
  zooms iOS (the comment at `.edit-set input`, line 344, says this already).
- Save and Cancel are plain `.button`s, side by side. **Not** `.button--tap`,
  **not** `.button--major`, and Cancel is the quieter of the two the way
  `.add-exercise-form .button[type="button"]` is.
- No hex; both schemes; 375px with no sideways scroll.

The comment says why this one thing in the app is allowed to look like a form
from 2003: it is a tool for correcting the record, it is behind a warning and a
two-tap gate, and looking like the rest of the app is the last thing it should do.

## Done when

Checked by hand, `make run`, signed in, after `make dummy-data`:

- **Arm the gate on Settings, tap the top row.** The row is replaced in place by
  the editor. Nothing below it jumps.
- **Every field is seeded from the record**: the session's start and type, the
  movement, and every set's five measures with the empty ones empty.
- **Change the movement** from the dropdown, Save. The editor closes, the list
  re-fetches, and the row now names the new movement.
- **Check it landed for real**: Training sessions → that session → the block is
  under the new name, with its sets unchanged. Reload the browser and it is
  still true.
- **Correct a set**: reopen the row, change `reps` from 5 to 6, Save. The session
  page shows 6.
- **Clear a set's weight**, Save, and the session page shows that set with no
  weight — a bodyweight set — rather than a zero.
- **Change the session's type and start time**, Save, and both are right on the
  Training sessions list and on the session's own page.
- **Ended is not editable.** There is no box for it anywhere.
- **There is no delete anywhere** — not on a set, not on the block, not on the
  session, not behind a long press.
- **Save with nothing changed** closes the editor and changes nothing. The
  session page is identical.
- **Cancel** closes the editor and throws the typed values away; reopening the
  row shows the stored values.
- **A refusal reads properly**: set the session's start time to after its end
  time and Save. The editor stays open, keeps what was typed, and shows the API's
  own sentence. Fix it and Save again; it works.
- **A dead backend** while saving shows the failure line, keeps the editor open
  and keeps every typed value.
- **The gate still gates.** Turn editing off, and the list and the editor are
  gone. Reload while armed → disarmed, and nothing is editable.
- **Nothing else moved.** `TrainingSessionDetail` is read-only exactly as it was;
  `CurrentSession`'s zone, log form and Completed exercises are exactly as they
  were; Log out, Download and Your notes on Settings are exactly as they were.
- **At 375px** the editor stacks, every label is readable, and nothing scrolls
  sideways. **Light and dark** both read correctly.
- `npm run build` completes with no new warning.
- `make test` is still green: **no backend file changed in this chunk.**
- `grep -rn 'X-Edit-Closed-Record' frontend-web/src` finds it in **`api.js`
  only**.

## Do not

- Send the header from anywhere but `api.correct`, or add a second helper that
  sends it.
- Add `api.correctDelete`, a `DELETE` of any kind, or any control that removes a
  set, a block or a session (AGREED, and chunk 01 refuses it anyway).
- Add a set, or create anything. This screen corrects existing rows only — the
  create half of the closed rule is untouched and would refuse it.
- Write to `ended_at` on a session or an exercise, or to any `created_at`.
- Touch the catalogue: no rename, no `bar_kg`, no `sides`, no
  `POST exercises/<id>/loading/`, no "add exercise" from here. The dropdown is a
  **read** of `exercises/` (AGREED).
- Import `sets.js` or `Worked`, show a per-side box, a live total, or the
  `20 + 2 × 60` expression (C4).
- Use `Number(...)` on a weight, a distance or an RPE on the way out. The string
  as typed.
- Send fields nobody changed, and in particular do not round-trip an untouched
  `started_at` (C7).
- Bulk anything: no "save all rows", no multi-select, no batch endpoint.
- Add an undo, a history, a diff, a "you changed 3 fields" summary, or anything
  that records the edit. Edits overwrite silently (AGREED).
- Add a confirmation on Save. The warning and the gate are the deliberateness;
  a third tap is theatre.
- Modify `TrainingSessionDetail.jsx` or `CurrentSession.jsx` at all.
- Change any backend file, or add a frontend test file — there is no runner.
- Touch `frontend-mobile/`.

## What the user sees

**The thing that was impossible this morning.**

Editing armed, the top row of the list is the block logged an hour ago. Tapping
it opens a form in its place that looks nothing like the rest of the app —
labels above boxes, a fieldset for the session, one for the exercise, one for the
sets, and every number exactly as the database holds it. The movement is a
dropdown of the whole catalogue.

Change **Incline bench press** to **Bench press**, tap Save, and it closes. The
list re-reads itself and the row says Bench press. Open Training sessions and
that block, in that workout, on that date, is a bench press — with the same five
sets, the same weights and the same reps it always had. The export says so too.

What is not there is as much the point as what is. Nothing removes a set. Nothing
removes a block. Nothing removes a session — including the ended session that,
before this iteration, an ordinary request could have deleted outright. There is
no delete in this form and no delete behind it. Ended times cannot be moved.
Nothing writes an audit line, because nothing here needs forgiving: the warning
said what a wrong correction costs, the gate made it deliberate, and every write
it lets through said so in a header.

Reload the page and it all goes back to being a warning and a button.
