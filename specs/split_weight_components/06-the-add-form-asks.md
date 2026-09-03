# 06 — Adding an exercise asks how it is loaded

**Goal:** a movement goes into the catalogue with its loading already on it. The
shared add form gains two fields, in both the places it stands, and they are
answered once — because after this there is no changing them (AGREED 2).

Needs chunk 02. Frontend only, one shared component plus the two pages that use
it.

## Read first

- [components/AddExerciseForm.jsx](../../frontend-web/src/components/AddExerciseForm.jsx)
  — all of it, especially the docstring's account of the three outcomes and the
  division of labour ("the form owns failure, the caller owns success")
- [ExerciseCatalogue.jsx](../../frontend-web/src/pages/ExerciseCatalogue.jsx) —
  `handleAdded` / `handleDuplicate`, and the `onInput` on the section that
  clears the last confirmation
- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) lines
  639–675 — `holdCreated` and `holdExisting`, the other caller
- [styles.css](../../frontend-web/src/styles.css) lines 57–118 — the
  `/* Add an exercise */` section, and `.add-exercise-field` at 94
- [00-context.md](00-context.md); assumptions W5, W7

## Build

1. **Two fields, as one shared component.**
   `frontend-web/src/components/LoadingFields.jsx` owns both boxes, their
   wording, and the one rule that says whether they have been answered. It is a
   component and not two inline `<p>`s because **chunk 07 asks the identical
   question in the zone**, and two copies would drift in wording, in validation
   and in what counts as answered — the same reasoning that made
   `AddExerciseForm` shared in the first place (new_exercise 03.0, step 1).

   Keep it dumb: `value` (`{ bar_kg, sides }`), `onChange`, `disabled`, and an
   exported `loadingAnswered(value)` predicate its two callers both use to decide
   whether their button is live. It owns no request and no failure.

   What stands in it, after the name in this chunk's form:

   - **Bar (kg)** — a number box. `type="number"`, `inputMode="decimal"`,
     `step="any"`, `min="0"`, and no default value.
   - **Sides** — a `<select>` with an unchosen first option and exactly two
     answers (W5, AGREED 1): one and two. Word them so the answer is obvious
     without a manual — *"One — a stack, a sled or a machine"* and *"Two — a bar,
     or a pair of dumbbells"* or wording as good.

   **Neither gets a default**, and that is a decision rather than an oversight:
   under AGREED 2 this answer is permanent, and a defaulted `0` or a defaulted
   `2` is a wrong answer that nobody typed and nobody can take back. Make the
   user say it. Comment that reasoning in the component, because "sensible
   defaults" is exactly what the next reader will try to add.

2. **Add is off until all three are answered.** The existing `empty` check on the
   name grows to include `loadingAnswered(...)`: a bar that is not a number ≥ 0 with at most
   two decimals, or a side count still unchosen, keeps the button disabled. The
   name is still sent exactly as typed and normalised only on the server (N9,
   from the new_exercise specs) — this chunk adds no client-side rewriting of
   anything.

3. **One POST, as today.** `api.post('exercises/', { name, bar_kg, sides })`,
   with `bar_kg` sent as the string that was typed and `sides` as a number. The
   three outcomes are the three that already exist and their handling does not
   change: `onAdded`, `onDuplicate`, or a failure the form keeps with everything
   still typed in it.

4. **A duplicate discards what was typed about the loading, and says nothing
   about it.** The entry that already exists has its own loading — or has none
   yet, in which case chunk 07 asks about it the first time it is held. Either
   way, the answer to "that movement is already here" is the movement that is
   here (N5), not an argument about how it is loaded. Do not attempt to apply the
   typed bar and sides to the existing row: that would be an edit, through the
   back door, of a value AGREED 2 fixes forever.

5. **A success clears all three**, and focus goes back to the name box exactly as
   it does today — the shape of somebody adding three movements in a row.

6. **Both callers keep working unchanged.** `ExerciseCatalogue`'s `handleAdded`
   inserts the created row (which now carries `bar_kg` and `sides`) into its
   list; `CurrentSession`'s `holdCreated` puts it in the catalogue copy and holds
   it — and because it arrives configured, the zone's form is already the
   per-side form from chunk 04, with no question asked. That is the whole point
   of doing this chunk before chunk 07.

7. **Style: enough to lay three fields out.** Its own small
   `/* How a movement is loaded */` block in
   [styles.css](../../frontend-web/src/styles.css) rather than lines inside
   `/* Add an exercise */`, because the component is shared and chunk 07 stands
   it somewhere else entirely.

   The `/* Add an exercise */` section is already a
   flex-wrapped row (styles.css:82–106) with the name box taking the slack; the
   bar box and the select are narrow and sit beside it, wrapping onto a second
   line before they squash. `.add-exercise-field` is the class the name box's
   wrapper already uses — reuse it rather than inventing a second one. The rest
   is chunk 08.

## Done when

- On `/exercises-catelog`, **Add an exercise** has three fields: Name, Bar (kg),
  Sides. **Add** stays disabled until all three are answered.
- Adding `Trap bar deadlift`, bar `25`, sides `2` puts it in the table and, in
  `make shell`, the row has `bar_kg == Decimal('25.00')` and `sides == 2`.
- Adding `Chest press machine`, bar `0`, sides `1` stores `0.00 / 1` — an
  answered movement, not an unset one.
- A negative bar, a bar with three decimals, or an unchosen side count all keep
  Add disabled; nothing is sent.
- Adding a name already in the catalogue still answers with the entry that
  exists, in both places, and still says so in the same words — and the existing
  row's `bar_kg` and `sides` are **unchanged** in the database.
- Mid-workout: the dropdown's **+ Add a new exercise…** opens the same three
  fields; adding `Trap bar deadlift` there holds it immediately and the zone
  shows `25 + 2 × [   ] =` without asking anything further.
- A failed request still keeps everything typed, including the bar and the sides.
- The catalogue table, its count line, the "Added X." line and the duplicate line
  are all unchanged.

## Do not

- Default either field to anything (step 1).
- Send the typed loading anywhere when the answer was a duplicate (step 4).
- Offer a third side count, a "not sure" option, or a free-text side count (W5).
  A "not sure" is a different feature — it is what chunk 07 exists to ask, later,
  once — and adding it here would put unset rows back into the catalogue by
  design.
- Add a way to change the loading of an entry that already has one, anywhere
  (AGREED 2).
- Add `bar_kg`/`sides` columns to the catalogue table, or a loading line to
  `ExerciseDetail.jsx`. Nothing in AGREED asks for it; the zone shows a
  movement's loading where a movement's loading is needed, and the admin shows
  it to whoever curates.
- Trim, collapse or case-fix the name in the client (N9).
- Re-fetch `exercises/` after an add (N11).
- Change anything under `backend/`.

## What the user sees

**Adding a movement now asks the one thing the app needs in order to do the
arithmetic for it.**

Three boxes instead of one: the name, the weight of the bar — `20` for a
barbell, `25` for the trap bar, `0` for a stack or a pair of dumbbells — and
whether the weight goes on one side or two. Add stays dead until all three are
answered, because this answer is permanent: a different bar is a different entry
in the catalogue, so there is no coming back to change it.

The payoff is immediate mid-workout. Add **Trap bar deadlift** from the dropdown
with bar `25` and sides `2`, and the zone is already showing
`25 + 2 × [   ] =` — the movement is recorded, configured and ready in one pass,
without leaving the session.

Ask for something already in the catalogue and nothing changes: you are handed
the entry that exists, exactly as before, and whatever loading it already has is
left alone.
