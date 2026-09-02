# 04 — Adding one mid-workout

**Goal:** the movement you are about to do is not in the dropdown. Add it from
the dropdown, and start recording it — without leaving the session, reloading
anything, or touching what is already logged.

Needs chunks 02 and 03.5. Frontend only, `CurrentSession.jsx` (plus a small,
named refactor of the component chunk 03.0 built). This is the chunk the feature
exists for (N10).

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) —
  especially the `exercises` load, `heldId` / `held`, the `<select>` in the
  **Record new exercise** section, and `releaseExercise`
- `AddExerciseForm.jsx` and `ExerciseCatalogue.jsx` as chunk 03.5 left them
- [specs/current_session/00-context.md](../current_session/00-context.md),
  assumption A10 — holding an exercise is a client-side act
- [00-context.md](00-context.md), assumptions N10, N11

## Build

1. **The catalogue becomes page state.** `exercises` comes straight off
   `useLoad` today, and `held` is found by searching it — so a movement added
   here has nowhere to land. Do to it exactly what the page already does to
   `session`: a `useState(null)` seeded by a `useEffect` when the load is ready,
   and every read (`held`, the `<option>` list) from that state instead. The
   `useLoad` call and its `catalogueState` stay where they are; the failed-load
   message is unchanged.

2. **One place that inserts by name.** Chunk 03.0 put the name-ordered insert in
   `ExerciseCatalogue.jsx`; this chunk needs the same thing. Lift it to a named
   export beside the form — `export function insertByName(list, exercise)` in
   `AddExerciseForm.jsx` — and use it from both pages. It is three lines, and
   the alternative is two lists that drift in how they order themselves.

3. **A way to add, in the dropdown.** A final option after the catalogue:

   ```jsx
   <option value={ADD_NEW}>+ Add a new exercise…</option>
   ```

   with `const ADD_NEW = 'new'` at module level. The `onChange` branches on it —
   `setAdding(true)` for the sentinel, `setHeldId(value)` for everything else.
   **Never let the sentinel reach `heldId`**: every id in that state is a
   catalogue UUID, and the day it is not, `held` silently becomes `null` and the
   section shows the dropdown again with no explanation.

   In the dropdown because that is where the user is when they discover the
   problem: the list is open, the movement is not in it. Anywhere else on the
   page is somewhere to go looking.

4. **The form replaces the dropdown while it is open.** `adding` swaps the
   `<select>` for `<AddExerciseForm onAdded={…} onDuplicate={…} onCancel={…} />`.
   Same three states the section already has one of at a time — dropdown, adding,
   holding — and never two at once. `onCancel` sets `adding` back to false and
   returns the dropdown, on its empty option: this is the way out of a mis-tap,
   the same job **Change exercise** does one state along.

5. **Adding it starts recording it (N10).** `onAdded(created)`:

   - `setCatalogue((list) => insertByName(list, created))` — it is in the
     dropdown from now on, for the rest of the session, with no re-fetch (N11).
   - `setHeldId(created.id)` and `setAdding(false)` — the section goes straight
     to "Recording Front squat", with an empty set list and the weight and reps
     boxes ready.

   No `PerformedExercise` is created and nothing is written to the session: a
   hold is client-side (A10), and the first set is still what creates the block.
   The new movement is a catalogue row and a held id, and that is all.

6. **A duplicate holds the one that exists.** `onDuplicate(existing)`: hold
   `existing.id` — inserting it into `catalogue` first if it is not already
   there, which happens when the page was loaded before someone else added it.
   This is the opposite of what chunk 03.5 told the catalogue *page* to do, and
   for a reason worth a comment: there, the list is a table being read, and the
   row is already in it; here, the list is what `held` is looked up in, so a
   movement about to be recorded has to be in it or the section cannot show it.

   Then say so, quietly, in the held block: a `.status` line under the name —
   "Bench press was already in the catalogue." Not an error, and gone the moment
   the exercise is released. Mid-workout the useful information is that
   recording has started against the movement they meant; the reason their name
   did not create a row is a footnote.

7. **The note is cleared with the hold.** Add the clearing to
   `releaseExercise`, beside `setWeight('')` and `rows.close('held')` — the note
   belongs to the movement being held, like everything else that function drops.
   Also clear `adding` there, so **Change exercise** never returns to a
   half-typed add form.

8. **Nothing else about the session moves.** No re-read of `current/`, no request
   but the one POST the form makes, no change to `session`, `performed_exercises`
   or any logged set. A user who adds a movement in the middle of a workout and
   then scrolls down finds **Completed exercises** exactly as they left it. This
   is the whole assumption (N10) — if any of it is not true, the chunk is wrong.

9. **A failed catalogue load has no add.** The `<select>` is already disabled
   when `catalogueState !== 'ready'`, and the add option lives inside it, so a
   catalogue that will not load offers no way in here. Leave it that way: the one
   request that failed is the one that says what already exists, and adding
   blind is how the list gets a second `Bench press`. The existing message stays
   as chunk 03.0 of the current-session specs wrote it.

10. **Style.** Whatever the form needs to sit inside the **Record new exercise**
    section goes in the `/* Current session */` section of
    [styles.css](../../frontend-web/src/styles.css), not in the shared
    `/* Add an exercise */` block — the component's own styling is chunk 03.0's
    and the ergonomics are chunk 05's. Keep it to placement.

## Done when

- In an active session with nothing held, the dropdown's last option is
  **+ Add a new exercise…**; choosing it replaces the dropdown with the box and
  an Add button.
- Typing a new name and tapping Add: the section says "Recording <name>", with
  "No sets logged yet." and the weight/reps form under it. No navigation, no
  reload.
- Logging a set against it works exactly as it does for any other movement — the
  set appears in the held block and in **Completed exercises**, and survives a
  refresh.
- After a refresh, the new movement is in the dropdown from the API, in name
  order.
- **Change exercise** and then the dropdown again: the movement just added is in
  the list without a re-fetch.
- Typing a name that already exists: the section starts recording *that* entry,
  with a quiet line saying it was already in the catalogue; the dropdown gains no
  second copy; letting go of the exercise clears the line.
- Cancel from the add form returns the dropdown on "Choose an exercise", with
  nothing added.
- Through all of the above, `GET training-sessions/current/` returns what it
  returned before the add — the session, its exercises and its sets are
  untouched — and **Completed exercises** on screen never flickers or re-orders.
- With the catalogue endpoint failing, the section shows its existing message
  and offers no add.
- `/exercises-catelog` still works as chunks 03.0 and 03.5 left it, now using the
  shared `insertByName`.

## Do not

- Let `ADD_NEW` reach `heldId` (step 3).
- Create a `PerformedExercise`, or write anything to the session, when an
  exercise is added or held (A10).
- Re-read `current/` or re-fetch `exercises/` after an add (N11).
- Navigate to `/exercises-catelog`, open a modal, or put the add behind a route.
  A route would remount the page under it and Back would mean "reopen the add
  form" (N10).
- Show the add form while an exercise is held — the section is about that
  movement.
- Duplicate the form, its wording, its validation or its request handling into
  `CurrentSession.jsx`. It is the component from 03.0, with three props.
- Add a second way in (a button beside the dropdown, a link in the nav, an
  entry on the Home page). One way in, where the problem is discovered.
- Touch the log-set form, the set rows, `Log exercise`, `Change exercise` or
  **Completed exercises** beyond the two lines step 7 adds to
  `releaseExercise`.

## What the user sees

The dropdown stops being a wall.

- **"+ Add a new exercise…" is the last thing in the list.** Open the dropdown
  mid-workout, find that today's movement is not there, and the way to fix it is
  the option already under your thumb.
- **The dropdown becomes a box.** One name, one tap.
- **And then you are recording it.** The section goes straight to "Recording
  Front squat", empty set list, weight and reps ready — the same state as
  choosing anything else from the dropdown. The detour that used to exist here
  (leave the app, open the admin, add the row, come back, find your place) is
  gone.
- **The session underneath is exactly as it was.** Nothing reloaded, nothing
  re-ordered, every set still logged, the timer since "Started 18:04" still
  reading what it read. Adding a movement to the catalogue costs the workout
  nothing.
- **A name that already exists starts recording that one**, with a quiet note
  saying so — no second copy in the list, and no trip to go and find it by hand.
- **A mis-tap is one tap back.** Cancel returns the dropdown with nothing added.
- **The new movement stays in the dropdown** for the rest of the session and
  every session after it — it is in the catalogue now, for everyone.
