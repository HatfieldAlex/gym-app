# 06 — A half-typed set comes back

**Goal:** the weight and reps typed but not yet logged survive a reload, a
locked phone and a closed tab — on the device they were typed on — and come
back **looking restored** rather than looking freshly typed (E10).

Frontend only: `CurrentSession.jsx`, and a rule or two in `styles.css`. Needs
chunk 02; independent of 05, but built after it, because a reload only lands
back in the exercise once the exercise has an address.

This overturns **Z6**, and Z6's objection is what shapes the solution. Read its
row in [00-context.md](00-context.md) before starting. History still never seeds
a box — that part of Z6 stands and always will.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — the
  `weight` and `reps` state and the two boxes, and `logSet`
- [exercise_zone/00-context.md](../exercise_zone/00-context.md) — Z6, in full
- [00-context.md](00-context.md) — E10, and A7, which stands

Note before writing anything: `grep` for `localStorage`, `sessionStorage`,
`beforeunload` or `visibilitychange` across `frontend-web/src` returns **zero
hits**. This is the first thing this app has ever stored in the browser, so
whatever it is, it is small, it is fenced, and it is commented.

## Build

### 1. What is stored, and where

A draft is **the two boxes, mirrored**. Not a set, not part of the log.

- **Key:** `gym-app:draft-set:<performed exercise id>`. Scoped to the block, so
  a draft can never surface against a different movement, a different session or
  a second block of the same movement (E7).
- **Value:** `JSON.stringify({ weight, reps })` — the strings exactly as typed,
  so a half-typed `62.` survives being a half-typed `62.` (the same reason
  `weight` and `reps` are strings in the first place).
- **Written** whenever either box changes. Both empty → the key is **removed**,
  not written as two empty strings.
- **Removed** when the exercise closes, either way — 200 or 204. It belonged to
  that block.
- **Not** removed when a set is logged. The boxes deliberately keep their values
  after a successful log ("another set of the same thing is the common case",
  `03.5`), and the draft is a mirror of the boxes: if it cleared here, a reload
  would come back emptier than the screen the user was looking at.
- **At most one draft exists.** Writing one removes every other
  `gym-app:draft-set:` key. There is one open exercise (E3), so a second key is
  always litter from a block that closed on another device or in a tab that
  never came back.

### 2. The code

Three small functions near `ADD_NEW` at the top of `CurrentSession.jsx`:
`readDraft(id)`, `writeDraft(id, weight, reps)`, `clearDrafts()`. Not a module
and not a hook in `hooks.js` — one caller, about twenty lines, and `hooks.js` is
for things every page uses.

**Every one of them wraps `localStorage` in `try`/`catch` and returns nothing on
failure.** Private-mode Safari, a browser with site data blocked and a full
quota all throw on access, and a draft is a nicety: it must never break the
zone, never surface an error, and never stop a set being logged. A malformed or
non-object value reads as no draft.

### 3. Restoring

When the open exercise's id changes to a block whose boxes are still untouched,
read its draft and put it in the boxes. In practice: an effect keyed on
`openExercise?.id` that fills `weight` and `reps` from the draft and sets a
`restored` flag.

It must not fight the user. The restore happens once per block, on arriving at
it; typing after that is typing, not restoring.

Opening a **new** exercise has no draft (the key is its brand-new id), so its
boxes are empty. That is Z6 as it always was: nothing seeds a box from history.

### 4. Showing that it is restored — the point of the chunk

Z6's objection was never "a filled box"; it was that **the failure is silent**.
So it must not be silent.

While `restored` is true:

- both boxes carry `data-restored` — a styling hook, in the way `data-armed` and
  `data-none` already are on set rows;
- a quiet line sits with them: **"Picked up where you left off — check these
  before logging."** One sentence, `.status`-weight, not an error;
- **Log set** works normally. This is not a confirmation gate; nobody wants a
  dialog between them and the bar.

`restored` clears on the **first keystroke in either box**, and on logging a
set. The values stay; only the marker goes. A number the user has just looked at
and touched is a number they typed.

Chunk 07 gives `data-restored` its treatment. Enough here that it is visibly
different from a typed value — the boxes must not look identical to a fresh
entry the moment the page comes back.

### 5. What is not stored

Say it in the comment above the three functions, because the next reader will
ask: **A7 stands.** The log itself is never in `localStorage`. Every set reaches
the API as it is logged, the open exercise is a row on the server (E8), and the
only thing the browser holds is two strings that have not been submitted yet.
There is nothing to sync, nothing to reconcile, and nothing lost if the storage
is empty, blocked or from another device.

## Done when

- Type `62.5` and `8`, reload the page: the exercise comes back with `62.5` and
  `8` in the boxes, visibly marked as restored, with the line beside them.
- Tapping either box and typing clears the marker and the line; the values stay.
- **Log set** logs exactly what is in the boxes, restored or not.
- After logging, the boxes keep their values and reloading brings them back —
  still consistent with what was on screen.
- Closing the exercise (either way) and opening a new one gives **empty** boxes
  and no marker.
- `localStorage` holds at most one `gym-app:draft-set:` key at any moment.
- Closing an exercise removes its key.
- Opening the app in a **different browser** mid-exercise lands inside the
  exercise (chunk 02) with **empty** boxes — the draft is per device, and that
  is right.
- With `localStorage` disabled in the browser, everything above still works
  except the restoring: no error, no broken zone, no console noise beyond a
  caught failure.
- Nothing about the last-time or Earlier columns prefills anything (Z6 stands).

## Do not

- Prefill weight or reps from history, from last time, or from the previous set
  logged in this block. Z6 stands for every number the user did not type.
- Store the session, the open exercise, its sets, the catalogue, or anything
  that is already on the server (A7).
- Add `beforeunload`, `visibilitychange`, a debounce timer, or a save indicator.
  Writing two short strings on change is cheaper than the machinery to avoid it.
- Add a confirmation step, a dialog, or a disabled **Log set** when a value is
  restored. The marker is the mitigation; a gate is a different product.
- Keep a draft per movement, or across sessions, or a history of drafts. One
  key, one open exercise, cleared when it closes.
- Use `sessionStorage` — it dies with the tab, which is exactly the case this
  chunk exists for.
- Put the storage functions in `hooks.js` or a new module.
- Let a storage failure reach `<Status>`, an error line, or the user in any way.
- Touch the inline edit form's boxes. A correction in flight is not a draft.

## What the user sees

The last thing that could vanish without them noticing stops vanishing.

- **A half-typed set is still there when they come back.** Phone locked between
  sets, a call, a tab switch, the browser killed in the background — the weight
  and the reps they had typed are in the boxes when they return.
- **And it is obvious that they came back.** The two boxes look restored, not
  freshly typed, and a line says so: *picked up where you left off — check these
  before logging.* One glance says "these are yours from a minute ago", not "the
  app has decided what you lifted".
- **Touching either box makes it theirs again.** The marker goes, the numbers
  stay.
- **Nothing is ever suggested to them.** Last time's numbers are still only for
  reading. The app never puts a number in a box that the user did not type.
- **On a different device, the boxes are empty.** The exercise itself is
  waiting for them — that lives on the server — but half a typed set does not
  follow them across a room.
