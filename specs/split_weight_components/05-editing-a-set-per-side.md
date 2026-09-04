# 05 — Correcting a logged set, in the same one box

**Goal:** the row you tap **Edit** on opens the same form you logged it with. The
stored total is divided back for editing and multiplied up again on save.

Needs chunk 04. Frontend only, `CurrentSession.jsx` only.

> **This chunk rests on AGREED 9, which is an agent's assumption** — flagged to
> the human and not contradicted, but not something they asked for. It is the
> smallest chunk here and the cheapest to drop: nothing after it depends on it,
> and without it a logged set is corrected by typing its total, as today.

> **Checked against `main`'s zone rework (`3c0cab3`) and it stands.** Unlike 04
> and 07, nothing in the mechanism below had to change: the edit form is still a
> `<form>` nested in `SetRow`, still seeded in `useSetRows.edit`, still saved
> with a PATCH carrying two fields. What changed is the line numbers, and one
> argument in step 2 that is now weaker than it was — said so where it stands
> rather than quietly left reading as though it were still true.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx): the
  edit form nested in `SetRow` at **187–221**, and the `rows === undefined`
  guards around it at 156 and 225; `useSetRows` at **386–507**, and inside it
  `entry` at **399**, `edit` at **416–423** (the seeding, and the
  `String(Number(…))` at **419** that reads `"60.00"` back as `60`), `save` at
  431–449 with its comment about sending only the two fields this screen owns,
  and `close` at 483–488; the hook created at **737** and handed to the zone's
  list at **1288**; `PerformedExercise` at **521–531**, which no longer takes it
- `frontend-web/src/sets.js` as chunk 04 left it — `perSide` and `totalFrom`
- [00-context.md](00-context.md), "The arithmetic, written out once"
- Assumption W9

## Build

1. **The rule that decides everything here: the box edits whatever the row
   shows.** If a row displays `20 + 2 × 60 = 140 kg`, its box holds `60`. If it
   displays a plain `50 kg` — a `0 / 1` movement, an unset movement, or a total
   below its own bar — its box holds `50`, exactly as today. Never a box whose
   number means something the row above it did not say.

   That single rule is what makes the negative and unset cases fall out for free
   rather than needing their own branches, and it is worth a comment saying so.

2. **`useSetRows` has to know which movement a row belongs to.**
   `edit(row, set, loading)` takes the loading and keeps it in state beside
   `weight` and `reps`; `entry` at line 399 becomes
   `parseEntry(weight, reps, loadingOfOpenRow)`. `SetRow` already has its
   `loading` prop from chunk 03.0 — pass it at the `rows.edit(row, set)` call on
   line 230. `cancel` and `close` drop it with the rest of the row's state.

   **The argument for carrying it *per row* is weaker than it was, and the
   mechanism stays anyway.** The first draft of this step said the hook serves
   two lists, so two rows open one after the other may be different movements
   with different loadings. That is no longer true: lifecycle chunk 04 took Edit
   and Delete off Completed exercises, `PerformedExercise` no longer takes
   `rows`, and the hook now serves exactly one list (created at 737, handed in at
   1288) — the zone's, which is one movement.

   So the honest version is: the loading could now be handed to the hook once
   instead of per row, and it is not, because the hook would then have to be told
   which exercise it is serving. Keeping it on `edit` costs one argument, keeps
   the hook ignorant of which list it is in — which is what let it serve two, and
   what would let it serve two again — and is where `perSideBox` in step 5 comes
   from. Do not take the loading out of `edit` in the name of simplification.

3. **Seeding, in `edit`.** Where line 419 reads
   `String(Number(set.weight_kg))`, it now seeds the per-side value when the row
   is showing one — `perSide(set.weight_kg, loading)` — and the total otherwise.
   A null `weight_kg` still seeds `''`: a bodyweight set is edited as a
   bodyweight set (W9), and clearing the box still makes a set bodyweight, which
   is what the `placeholder="—"` and the comment at 200–201 already promise.

   `perSide` gives back an exact string, so a set stored as `107.55` on a
   `20 / 2` movement seeds `43.775` and saves back to `107.55` untouched. A set
   that opens and is saved without being changed must store exactly what it
   stored before — that is the check that proves the two halves of the arithmetic
   are inverses.

4. **Saving.** `save` at 431 is unchanged in shape: it still PATCHes
   `performed-sets/<id>/` with `entry` and nothing else. `entry` now carries the
   multiplied-up total, because `parseEntry` does that work (chunk 04). No new
   field, no `bar_kg`, no per-side value in the body.

5. **The two boxes in the row keep their labels.** They are `aria-label`s
   (`"Weight (kg)"` at line 195) because a visible label per box would push the
   row onto a second line at phone width — the comment at 184–186 says so. When
   the row is editing a per-side value that label reads `"Weight per side (kg)"`,
   for the same reason the visible one does in the zone: the number means
   something different and a screen reader is the only thing that will say which.

   And the row's `<form onSubmit>` **stays a form**: Enter saves a correction,
   which is what it has always done. Lifecycle E11 took Enter away from the log
   form because Enter there logged a set nobody meant to log; the comment at
   1127–1132 names this form as the deliberate exception. Do not strip it.

6. **No expression inside the open row.** The `20 + 2 ×` context and the live
   total belong to the zone's log form, where there is a whole screen for them; a
   row being corrected in place has two narrow boxes, two buttons and 375px. The
   set's expression is on the row the moment Save closes it, which is where it
   was before Edit was tapped.

## Done when

- On a **deadlift** row reading `20 + 2 × 60 = 140 kg × 8`: tapping **Edit**
  opens a box holding `60`, not `140`.
- Changing it to `62.5` and saving makes the row read
  `20 + 2 × 62.5 = 145 kg × 8`, and the session detail page agrees.
- Opening a row and saving it **unchanged** leaves the stored total byte-identical
  — check a set with an uneven per side, such as one stored as `107.55`.
- On a **lat pulldown** row, Edit opens a box holding `50` and saving stores
  `50.00`: unchanged behaviour.
- On a row the app has no expression for — an unset movement, or a total below
  its own bar — Edit opens the total, and saving stores what was typed.
- On a **bodyweight** row, Edit opens an empty weight box, and saving with it
  still empty leaves the set bodyweight.
- Clearing a weighted row's box and saving makes it a bodyweight set, as it did
  before this chunk.
- **Editing exists in one list.** The zone's list has Edit and Delete; Completed
  exercises has neither, and this chunk does not put them back — lifecycle chunk
  04 removed them because every block down there is closed and the API refuses
  every write to a closed one.
- Delete, the arming behaviour, the failure line and the numbering are untouched.

## Do not

- Send anything but `weight_kg` and `reps` in the PATCH (the comment at 437–438
  is still true).
- Put Edit or Delete back on Completed exercises, or hand `rows` to
  `PerformedExercise`, in order to have somewhere else to test this.
- Take the `loading` argument off `edit` (step 2).
- Seed a per-side value into a row that is not showing one (step 1).
- Read an empty box as the bar's weight (W9).
- Put the expression, the live total or the fixed context inside the open row
  (step 6).
- Make the bar or the sides editable from a set (AGREED 2). A set is a record of
  what was lifted; the movement's loading is not a property of it.
- Touch the zone's log form, `logSet`, or `sets.js` beyond importing from it.
- Change anything under `backend/`, or `backend/dataexport/` least of all.

## What the user sees

**A set is corrected in the units it was logged in.**

Tap Edit on a deadlift row and the box holds `60` — the number that went on one
side — not `140`. Change it to `62.5`, save, and the row says
`20 + 2 × 62.5 = 145 kg × 8`. Nothing about a correction asks the user to do the
arithmetic the rest of the feature just took away from them.

Everything else about the row is where it was: two small boxes, Save and Cancel,
Delete still arming on the first tap. A stack, a bodyweight set, or a movement
the app knows nothing about all edit exactly as they did yesterday.
