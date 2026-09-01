# 05 — Editing and deleting a set

**Goal:** fix or remove a set that was logged wrong, without leaving the tab.

Needs chunk 03.8. Independent of chunk 06 — either order.

## Read first

- `CurrentSession.jsx` as chunk 03.8 left it
- [observations/views.py](../../backend/observations/views.py) — `PerformedSetViewSet` is a `ModelViewSet`, so PATCH and DELETE already exist and are already scoped to the owner

## Build

1. Each set row gets two small controls at its right-hand end: **Edit** and
   **Delete**. Buttons, not swipe (A8) — this runs in desktop browsers too.
   They must not push the row's numbers out of alignment or wrap it onto a
   second line.

2. **Edit** turns that one row into weight and reps inputs, seeded with the
   current values, plus Save and Cancel. Only one row is editable at a time;
   opening a second closes the first. Cancel restores the original values and
   changes nothing server-side.

3. **Save** sends `PATCH performed-sets/{id}/` with only `weight_kg` and `reps`,
   and replaces that set in `session` state with the response. The same rules as
   logging: reps required and positive, weight may be cleared to null (A5), Save
   disabled while invalid or in flight.

4. **Delete** removes the row after a confirmation — one tap arms it, the second
   deletes, and moving away or acting elsewhere disarms it. Nothing mid-workout
   should be one careless tap from gone, and nothing here should be a blocking
   `window.confirm`. Then `DELETE performed-sets/{id}/` and drop it from state.

5. **Renumbering.** Deleting set 2 of 4 leaves three sets numbered 1, 2, 3 —
   numbering is position in the array (chunk 02.1), so this happens by itself.
   Verify it; do not add an index field.

6. **An exercise whose last set is deleted** keeps its now-empty
   `PerformedExercise` and stays on the page under its heading, showing the same
   quiet empty line chunk 02.1 uses. Do not delete the parent behind the user's
   back. (The user can still log into it again — chunk 03.5 will reuse it.)

7. Failures leave the row exactly as it was, with a short message. No optimistic
   removal (A9): the row goes when the DELETE succeeds, not before.

## Done when

- Editing a set's reps and saving updates the row, and the change survives a
  refresh.
- Clearing the weight on an existing set saves `null` and the row reads as
  bodyweight.
- Saving with reps emptied is not possible.
- Cancel after typing leaves the stored set untouched.
- One tap on Delete does not delete; the second does, and the set is gone after
  a refresh.
- Deleting the middle set of three renumbers the remaining two to 1 and 2.
- Deleting every set of an exercise leaves the heading with its empty line, and
  logging that exercise again adds to the same block.
- Opening Edit on a second row closes the first without saving it.

## Do not

- Add a swipe gesture, a drag handle or a context menu.
- Add reordering, or moving a set between exercises.
- Allow editing which exercise a set belongs to.
- Add backend endpoints — PATCH and DELETE on `performed-sets/` are enough.
- Refetch `training-sessions/current/` after a write.

## What the user sees

A set logged wrong can be fixed or thrown away without leaving the tab.

- **Every set row gains two small buttons at its right-hand end** — **Edit** and
  **Delete**. The row stays on one line and the numbers stay lined up.
- **Edit turns that row into its own little form**, with the weight and reps
  already filled in as they were, plus **Save** and **Cancel**. The rest of the
  list is untouched around it.
- **Only one row is open at a time.** Opening Edit on another set closes the
  first one, discarding whatever was typed there — nothing is half-saved behind
  the user's back.
- **Cancel puts the row back as it was**, and the stored set is unchanged.
- **Save applies the correction immediately**, and it survives a refresh. Reps
  must still be present and positive; the weight can be cleared, which turns the
  set into a bodyweight one.
- **Delete takes two taps.** The first tap arms it — the second removes the set.
  Tapping elsewhere or moving away disarms it, so nothing mid-workout is one
  careless tap from gone. There is no blocking browser pop-up.
- **The remaining sets renumber themselves.** Delete the middle of three and what
  is left reads 1 and 2.
- **Deleting an exercise's last set does not delete the exercise.** Its heading
  stays with "No sets logged yet." under it, and logging that movement again
  adds back into the same block rather than starting a second one.
- **A failure changes nothing on screen** but a short message: the row stays
  exactly as it was, and a set only disappears once the deletion has actually
  gone through.

There is no reordering, no moving a set to a different exercise, and no changing
which exercise a set belongs to.
