# 03 — The warning, the gate, and what is behind it

**Goal:** the section on Settings. The warning that is always on screen, the two
taps that arm the gate, the quiet indicator that says it is armed, and — once
armed — the last thirty logged blocks, listed newest first.

Frontend only. Needs chunk 02 for the list. **No test runner: this chunk is
checked by hand with `make run`,** and the walkthrough below is the check.

Nothing here writes. Every field is still read-only at the end of this chunk;
chunk 04 is what makes a row tappable.

## Read first

- [frontend-web/src/pages/Settings.jsx](../../frontend-web/src/pages/Settings.jsx)
  — the whole file. `ExportSection` (64) is the shape of a section on this page:
  its own component, its own state, `<h2>`, one line of prose, one control.
  `LoggedNotes` (40) is the shape of a section that **loads** something
  (`useLoad` + `<Status>`)
- [frontend-web/src/pages/CurrentSession.jsx:935–956](../../frontend-web/src/pages/CurrentSession.jsx)
  — `Confirm`, and its docstring, which is the argument for why this is not a
  `window.confirm`. It is used at 2068 and 2150
- [frontend-web/src/auth.jsx](../../frontend-web/src/auth.jsx) — the shape of a
  provider in this app: `createContext`, a `useMemo`'d value, a `use…` hook that
  throws outside its provider
- [frontend-web/src/main.jsx](../../frontend-web/src/main.jsx) — where providers
  are stacked
- [frontend-web/src/components/Nav.jsx](../../frontend-web/src/components/Nav.jsx)
  — five links and the feedback marker, in one flex row that wraps
- [frontend-web/src/styles.css:813–839](../../frontend-web/src/styles.css) — the
  `.confirm` block; and **1102–1125**, Settings' two existing sections, including
  the shared `h2` rule at 1122
- [00-context.md](00-context.md) — C1, C2, C5, C6, and "Visual conventions"

## Build

### 1. `Confirm` moves to `components/Confirm.jsx`

A **pure move**. Cut the component and its docstring out of `CurrentSession.jsx`
(935–956), paste them into a new
`frontend-web/src/components/Confirm.jsx` as the default export, and import it
back into `CurrentSession.jsx`.

- Not one character of the component's body, its props or its class names
  changes. No new prop, no default, no `danger` variant.
- `CurrentSession.jsx`'s two call sites (2068, 2150) are untouched apart from the
  import now being at the top of the file.
- `styles.css` does not move: `.confirm` and friends stay exactly where they are,
  at 813.
- Add one sentence to the docstring saying it is shared now, and by whom
  (`CurrentSession` and Settings' edit gate), so the next reader knows why it is
  no longer beside its only caller.

This is the only edit `CurrentSession.jsx` receives in the whole iteration, and
it is a move. **Nothing about the exercise zone, the log form, "Completed
exercises" or the two session exits changes.**

### 2. The gate: `frontend-web/src/editing.jsx`

A new module, in the shape of `auth.jsx`.

```jsx
export function EditGateProvider({ children }) { … }
export function useEditGate() { … }
```

What the context carries: `{ armed, arm, disarm }`. Nothing else — no reason
string, no timestamp on the value, no counter.

- `armed` is a `useState(false)`. **In memory only.** No `localStorage`, no
  `sessionStorage`, no cookie, no query parameter, no API call. A reload starts
  disarmed, and that is the whole persistence story (AGREED).
- **It dies on log out.** The provider mounts *inside* `AuthProvider` and reads
  `useAuth().isAuthenticated`; an effect disarms whenever that goes false. Do not
  reach into the auth module any other way.
- **It dies after 15 minutes idle** (C2). While `armed` is true — and only then —
  the provider keeps a `setTimeout(disarm, 15 * 60 * 1000)` and listens on
  `document` for `pointerdown` and `keydown`, restarting the timer on either.
  The effect's cleanup clears the timeout and removes both listeners, so a
  disarmed app has no listeners and no timer at all.
  - `15 * 60 * 1000` written out as a named constant with the minutes visible:
    `const IDLE_MS = 15 * 60 * 1000`.
  - Listeners are passive and on `document`, not on `window`, and are registered
    once per arming rather than per render — the effect depends on `armed`, and
    the timer restart is a ref or a plain reschedule inside the handler, not a
    state update. **Arming must not make the app re-render on every keystroke.**
- The value is `useMemo`'d on `[armed, arm, disarm]` with `arm`/`disarm` from
  `useCallback`, as `auth.jsx` does.
- `useEditGate()` throws outside the provider, with the same wording shape as
  `useAuth`'s.

Give the module a file-level docstring that says what it is for and, more
importantly, what it is not: it is a **deliberateness gate, not a permission**.
The server refuses a write to a finished record whatever this says; all this does
is decide whether the app is willing to ask. Nothing in it is trusted by anything
but the UI.

Mount it in `main.jsx`, inside `AuthProvider` and outside `App`.

### 3. The indicator

In `Nav.jsx`, between the links and `<FeedbackMarker />`:

```jsx
{armed && <span className="edit-armed">Editing on</span>}
```

Quiet, and **not a control** — no `onClick`, no button, no `title` tooltip
explaining itself. It is there so that the one unusual state this app can be in
is legible from every screen, and the way out of it is on the page that put it
there.

### 4. The section on Settings

A new component in `Settings.jsx`, beside `ExportSection` and `LoggedNotes`, and
rendered **last** — after `<LoggedNotes />`. Log out and the export are things
you came to Settings to do; this is a workshop door, and it reads last.

**The warning is always visible.** Not inside the armed branch, not inside a
`<details>`, not shortened once armed. It is the first thing in the section and
it stays there whatever the gate is doing.

```jsx
<section className="edit-data">
  <h2>Edit training data</h2>
  <p className="edit-data-warning">
    Everything this app can tell you about your training — what is going up,
    what a session cost you, what worked — it reads out of these records. A
    record changed into something you did not actually do does not just get that
    day wrong. It bends every comparison drawn through it afterwards, quietly,
    and nothing here will remember which numbers were real.
  </p>
  <p className="edit-data-warning">
    Change a record only to make it match the training that happened.
  </p>
  …
</section>
```

That wording is **decided, not a suggestion** — the heading and both paragraphs.
It is the app's own voice: plain, second person, no shouting, no icon, no red.

Then, by state:

**Disarmed** — one button, and the two-tap `Confirm` in its place:

```jsx
{confirming ? (
  <Confirm
    question="Turn on editing?"
    verb="Turning on"
    busy={false}
    onConfirm={() => { arm(); setConfirming(false) }}
    onCancel={() => setConfirming(false)}
  />
) : (
  <button className="button" type="button" onClick={() => setConfirming(true)}>
    Turn on editing
  </button>
)}
```

`busy` is `false` because nothing is in flight — arming is local. Pass it
explicitly rather than making the prop optional; `Confirm` is not being changed
in this chunk.

**Armed** — a quiet line saying what is true and how it ends, a way out, and the
list:

```jsx
<p className="edit-data-state">
  Editing is on. It turns off when you reload, log out, or after 15 minutes.
</p>
<button className="button" type="button" onClick={disarm}>Turn off editing</button>
```

### 5. The list

Below that, and only while armed:

- `useLoad(() => api.get('performed-exercises/recent/'), [])` — `api.get`, not
  `api.list`: chunk 02 answers a bare array and there are no pages to walk.
- `<Status state={state} error={error} />` for waiting and failing, as
  `LoggedNotes` does.
- Empty is `<p className="status">Nothing logged yet.</p>`.
- **The load happens only once the gate is armed.** Mount the list as its own
  component and render it only in the armed branch, so `useLoad` fires on arming
  rather than on every visit to Settings. Disarming unmounts it; arming again
  re-fetches, which is what you want after an edit anyway.

One row per block, newest first, in the order the API gave them — **nothing
here sorts**:

```
3 Sep 2026 · legs · Squat · 4 sets
```

- the date from `training_session_started_at`, through
  `toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })`
  — the same call `Note` (Settings.jsx:19) and `TrainingSessionDetail` use;
- `training_session_type` as it is stored, lower case, no relabelling;
- `exercise_name`;
- `performed_sets.length` through a `1 set` / `4 sets` singular-plural helper.

A `<ul>` of plain `<li>`s. **No link, no button, no chevron, no `cursor:
pointer`** — nothing on a row is tappable in this chunk, and a row that looks
tappable and is not is worse than a row that does not. Chunk 04 turns each row
into a button.

### 6. The styles

A new commented section at the **bottom** of `styles.css`, after
`/* Download your data */`, plus one line for the nav indicator.

- `.edit-data { margin-top: 2.5rem; text-align: left; }`, matching
  `.notes-section` and `.export-section`. Its `<h2>` **joins the existing shared
  selector at line 1122** rather than getting a size of its own — that rule
  exists precisely because Settings' headings must not drift apart.
- `.edit-data-warning` — full strength, not the quiet register `.export-summary`
  uses. This paragraph is the point of the section, not a caption. Capped at the
  same `30rem` the notes list and the export summary use so it wraps rather than
  running a desktop window's width.
- `.edit-data-state` — quiet, the register `.export-summary` is in.
- `.edit-data-list` — list-style none, no padding, `max-width: 30rem`, rows
  separated by the same hairline `.note + .note` uses
  (`color-mix(in srgb, currentColor 20%, transparent)`).
- `.edit-armed` in the nav — small, quiet, no background, no border, and it must
  not stop the row wrapping at 375px (see the `nav` rule at line 899 and the
  comment above it, which explains what the width there is already carrying).
- **No hex.** `currentColor` and `color-mix` only, and check both schemes.

The comment above the section says *why*, in the house register: this is the one
part of the app that writes to a finished record, so its section is the one part
of Settings that does not read as quiet furniture.

## Done when

Checked by hand, `make run`, signed in, after `make dummy-data`:

- **On Settings, under Your notes, a section headed "Edit training data"**, with
  both warning paragraphs visible **before anything is tapped**, and a
  `Turn on editing` button.
- **Tapping it once** replaces the button, in place, with `Turn on editing?` ·
  `Confirm` · `Cancel`. Nothing above or below moves.
- **Cancel** puts the button back. Nothing else changed.
- **Confirm** arms the gate: the line `Editing is on. It turns off when you
  reload, log out, or after 15 minutes.`, a `Turn off editing` button, and a list
  of thirty blocks, newest first, each reading like
  `3 Sep 2026 · legs · Squat · 4 sets`.
- **`Editing on` appears in the nav**, on every page, and disappears the moment
  the gate is off.
- **`Turn off editing`** puts the section back to its disarmed state, and the nav
  indicator goes.
- **Reload the page while armed** → disarmed. The warning is still there; the
  list is not.
- **Log out while armed, then log back in** → disarmed.
- **Navigate to Current session and back to Settings while armed** → still
  armed, and the list re-fetches (a brief `Loading…`).
- **Nothing in the list is tappable.** No hand cursor, no hover state, no
  underline.
- **The list matches the exercise zone**: start a session, log a block, end the
  exercise. Come back to Settings, arm, and the block is the **top row**. An
  exercise still open in the zone is **not** in the list.
- **A failure says so**: stop the backend, arm the gate → the section shows the
  standard `Could not load this page. Please try again.` line, and Log out and
  Your notes above it still work.
- **At 375px**: both paragraphs wrap, the rows wrap, nothing scrolls sideways,
  and the nav row still wraps with `Editing on` in it.
- **Light and dark** both read correctly.
- **Nothing else on any page changed.** Settings' Log out, Download and Your
  notes behave exactly as before. Current session's zone, log form, Completed
  exercises, Discard and End session all behave exactly as before — the only
  edit that file received was `Confirm` moving out of it.
- `npm run build` in `frontend-web/` completes with no new warning.
- `make test` is still green: no backend file changed.

The 15-minute timeout is not practical to check by hand at 15 minutes. Check it
by temporarily lowering `IDLE_MS` to about 10 seconds, confirming that the gate
disarms on its own with no interaction and that typing or tapping keeps it
armed, then **putting the constant back to `15 * 60 * 1000` before handing over**.

## Do not

- Persist the gate anywhere: no `localStorage`, no `sessionStorage`, no cookie,
  no URL parameter, no backend call, no user-settings model, no migration
  (AGREED).
- Hide, shorten, collapse or move the warning once armed. It is always visible.
- Use `window.confirm`, a `<dialog>`, a modal or a toast. `Confirm` replaces its
  button in place, and that is the app's idiom.
- Change `Confirm`'s markup, props or class names while moving it, or move its
  styles.
- Change anything else in `CurrentSession.jsx`, and anything at all in
  `TrainingSessionDetail.jsx` (AGREED, twice over).
- Make a row a link, a button, a `<details>`, or anything with a pointer cursor.
  Chunk 04 does that.
- Add a search box, a filter, a date picker, a "load more", or pagination.
  Thirty rows, newest first (AGREED).
- Add `api.list` here — the endpoint answers a bare array (chunk 02).
- Call `fetch` outside `api.js`.
- Add a route or a nav link for this. It is a section on Settings.
- Give the nav indicator an `onClick`, a tooltip or a colour of its own.
- Add a countdown, a "12 minutes left" line, or a warning before the timeout
  fires.
- Change any backend file, or add a frontend test file — there is no runner.
- Touch `frontend-mobile/`.

## What the user sees

**A door, with the reason for the door written on it.**

At the bottom of Settings there is now a section headed **Edit training data**,
and before anything is tapped it says what it costs: everything the app can tell
you about your training is read out of these records, and a record changed into
something you did not do bends every comparison drawn through it afterwards,
quietly, with nothing left to say which numbers were real. Change a record only
to make it match the training that happened.

Under that, one button. Tapping it asks once more, where the button was —
`Turn on editing?` · Confirm · Cancel — and confirming turns the section on: a
line saying editing is on and how it ends, a way to turn it off again, and the
last thirty exercise blocks the user has logged, newest first, each with its
date, its session type, its movement and how many sets were in it. The block
logged an hour ago is the top row.

`Editing on` sits quietly in the nav from then on, on every screen, so the app
never pretends to be in its ordinary state while it is not. Reload, log out, or
walk away for fifteen minutes and all of it goes back to just the warning.

Nothing in the list can be tapped yet, and nothing in the app can be changed by
any of this. It is the shelf, before the tool is put on it.
