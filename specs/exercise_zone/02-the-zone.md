# 02 — The zone

**Goal:** the way in and the way out. **Record new exercise** becomes one
prominent button; tapping it turns the page into a screen that is about one
movement and nothing else, with the existing recording setup inside it,
unchanged.

Needs nothing from chunk 01 — build them in either order. This chunk shows **no
history**; that is 03. Build it anyway, and check it works, before putting
anything in it: if getting in and out costs the user their place in the workout,
nothing inside can make up for that.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — all of
  it. Every piece this chunk moves is already there and already works.
- [00-context.md](00-context.md) — the "What already exists" table, and Z1–Z4
- [current_session/03.0](../current_session/03.0-pick-exercise.md) and
  [03.8](../current_session/03.8-log-exercise.md) — what the chooser and the two
  release buttons mean today

## Build

### 1. The button

The `.record-set` section's `<h2>Record new exercise</h2>` and everything under
it stop being a section on the page. In their place, when the zone is closed:
one button, **Record new exercise**, full width and unmistakable — `.button
.button--tap .button--major`, the treatment `Start session` and `End session`
already have.

It sits where the section sat: above **Completed exercises**, below the started-
at line. The tab's shape does not change; its top section is now a door rather
than a form.

### 2. Opening it

One piece of state — call it `zoneOpen` — and nothing else. Tapping the button
sets it true. That is the whole mechanism (Z4): no route, no history entry, no
`localStorage`.

### 3. The takeover

While `zoneOpen`, the page renders the zone **instead of** its other contents,
not on top of them (Z1). Gone while it is open:

- the started-at line and the stale-session line
- **Completed exercises**
- **End session**

The `<h1>Current session</h1>` stays — one heading, so the user always knows
which tab they are on — and the nav bar above it is untouched, because it is
rendered by [App.jsx](../../frontend-web/src/App.jsx), outside this page.

This is why the zone is a page state and not an overlay: there is nothing to
position, nothing to stack, no scroll to lock and no focus to trap. If this
chunk reaches for `position: fixed` or a `z-index`, it has misread Z1.

### 4. What is inside it

An `<h2>` and a **×**, then the recording setup **exactly as it stands today**:

- **Before a movement is picked** — the chooser, and nothing else (Z2). It is
  the same `<select>`, the same `api.list('exercises/')` load, the same disabled
  state while the catalogue is in flight, and the same error line when it fails.
  Heading: **Record new exercise**.
- **Once one is held** — the held-exercise block as it is now: the name, the
  weight and reps boxes, **Log set**, **Log exercise**, **Change exercise**, the
  log error line, and the list of sets logged into it this session with their
  Edit and Delete. Heading: the movement's name.

Move this code. Do not rewrite it. `logSet`, `parseEntry`, `useSetRows`,
`SetList`, `releaseExercise` and the two `useLoad` calls all stay as they are —
if a diff of this chunk changes what any of them *does*, it has gone wrong.

Extracting the zone into its own component in the same file is fine and probably
tidier. Splitting it into a new file is not required and not forbidden; the page
is long already.

### 5. The three ways out, and what each means

They are different acts and stay different, but two of them now also close the
zone:

| Control | When it shows | Does |
|---------|---------------|------|
| **Log exercise** | only once the held movement has a set | releases the hold **and closes the zone** — the movement is done |
| **Change exercise** | whenever one is held | releases the hold, **zone stays open**, back to the chooser |
| **×** | always, in the zone's header | releases the hold if there is one, **and closes the zone** |

The **×** is the only dismissal (Z3): no Escape, no browser-Back handling, no
tap-outside — under Z1 there is no outside. It is safe to be blunt about,
because it destroys nothing: every set reached the API as it was logged (A7),
and letting go of a movement never deleted anything (03.8).

Closing must go through `releaseExercise` — which already clears the typed
weight and reps, the log error, and any row left open or armed in the held list
(`rows.close('held')`). A row left armed for deletion must not be waiting when
the zone is opened again.

### 6. Ending a session while the zone is open

You cannot, and that is correct. **End session** is not on screen; close the zone
first. It is the one tap that finishes the workout and it should take a
deliberate step, which it already did by sitting a long scroll down the page.

`leaveSession` (chunk 06) must close the zone as well, so a session ended or
discarded can never leave the zone up over no session at all.

### 7. Style

Enough for the zone to read as a place: the header row with its **×**, and a
heading sized like the tab's other `<h2>`s. Add it to the `/* Current session */`
section of [styles.css](../../frontend-web/src/styles.css). Ergonomics and the
full treatment are chunk 05.

## Done when

- An active session shows **one** full-width **Record new exercise** button and
  no dropdown.
- Tapping it replaces the started-at line, Completed exercises and End session
  with the zone. `<h1>Current session</h1>` and the nav bar are still there.
- The zone opens on the chooser with nothing under it.
- Picking a movement, typing 60 and 8, and tapping **Log set** logs the set
  exactly as it did before — one `PerformedExercise` on the first set, one
  `PerformedSet` each time (A6, A10) — and it appears in the zone's list.
- **Log exercise** closes the zone; the movement and its sets are in Completed
  exercises, which is on screen again.
- **Change exercise** returns to the chooser with the zone still open, and what
  was typed is cleared.
- **×** closes the zone from either state.
- Opening the zone again after arming a row's Delete finds it disarmed.
- Ending or discarding the session with the zone open leaves no zone on screen.
- Reloading with the zone open comes back to the session page with the button,
  and everything logged still logged (Z4, A10).
- `/training-sessions`, `/exercises-catelog` and `/settings` are untouched.

## Do not

- Rewrite `logSet`, `parseEntry`, `useSetRows`, `SetList`, `SetRow` or
  `releaseExercise`. Move and wrap; do not reimplement.
- Build the zone as a modal, a dialog, a portal or a fixed-position overlay
  (Z1). No backdrop, no z-index, no scroll lock, no focus trap.
- Add a route, a query parameter or a history entry for the zone (Z4).
- Handle Escape or browser Back (Z3).
- Persist `zoneOpen`, or the held exercise, to `localStorage` — 03.0 already
  ruled that out and A10 still stands.
- Show any history, last-time column or previous session (chunks 03 and 04).
- Prefill weight or reps (Z6).
- Leave a way to reach **End session**, **Completed exercises** or the
  stale-session line from inside the zone.
- Change what the two release buttons *mean*. Log exercise is still "that
  movement is done"; Change exercise is still "wrong exercise, take me back".
- Touch `main`, `nav`, `body` or `.button` in `styles.css`.

## What the user sees

Recording a movement stops being a form near the top of the page and becomes
somewhere to go.

- **One button, and it is the obvious thing to press.** The Current Session tab
  now has a single full-width **Record new exercise** button where the dropdown
  and its heading used to be. Nothing competes with it.
- **Tapping it gives the movement the whole screen.** The workout so far, the
  End session button and the started-at line step aside; the screen is about
  this one exercise until you leave. The app's nav bar stays where it is, so
  you are never stuck — you can walk out to another tab if you want to.
- **It asks one thing first.** An empty zone with a chooser in it: which
  movement? Nothing else is on screen to answer.
- **Then it is the recording screen you already knew.** The same name at the
  top, the same weight and reps boxes, the same **Log set**, the same list of
  sets building up underneath with Edit and Delete on each — moved, not changed.
  Nothing you learned about logging a set is now wrong.
- **Finishing a movement puts you back.** **Log exercise** closes the zone and
  returns you to the session, with what you just did sitting in Completed
  exercises. **Change exercise** keeps you in the zone and asks which movement
  again. The **×** in the corner leaves at any point.
- **Leaving costs nothing, ever.** Every set was saved the moment it was logged,
  so there is no such thing as losing work by closing the zone — the same as it
  has always been.
- **Ending the session is one step further away** than it was, and deliberately:
  you close the zone, and there it is at the bottom of the page.

What the user cannot do yet: see what they did last time. That is the point of
the zone and it arrives in chunk 03.
