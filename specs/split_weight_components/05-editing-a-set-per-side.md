# 05 — Correcting a logged set, in the same one box

**Goal:** the row you tap **Edit** on opens the same form you logged it with. The
stored total is divided back for editing and multiplied up again on save.

Needs chunk 04. Frontend only, `CurrentSession.jsx` only.

> **This chunk rests on AGREED 9, which is an agent's assumption** — flagged to
> the human and not contradicted, but not something they asked for. It is the
> smallest chunk here and the cheapest to drop: nothing after it depends on it,
> and without it a logged set is corrected by typing its total, as today.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx): the
  edit form nested in `SetRow` at **96–130**; `useSetRows` at 285–406, and
  inside it `entry` at **298**, `edit` at **315–322** (the seeding, and the
  `String(Number(…))` at **318** that reads `"60.00"` back as `60`), and `save`
  at 330–348 with its comment about sending only the two fields this screen owns
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

2. **`useSetRows` has to know which movement a row belongs to.** One hook serves
   both lists (it is created once, at line 566, and passed to the zone's list and
   to Completed exercises), so the two open rows it can be asked about may be
   different exercises with different loadings.

   `edit(row, set, loading)` takes the loading and keeps it in state beside
   `weight` and `reps`; `entry` at line 298 becomes
   `parseEntry(weight, reps, loadingOfOpenRow)`. `SetRow` already has its
   `loading` prop from chunk 03.0 — pass it at the `rows.edit(row, set)` call on
   line 138.

   `cancel` and `close` drop it with the rest of the row's state.

3. **Seeding, in `edit`.** Where line 318 reads
   `String(Number(set.weight_kg))`, it now seeds the per-side value when the row
   is showing one — `perSide(set.weight_kg, loading)` — and the total otherwise.
   A null `weight_kg` still seeds `''`: a bodyweight set is edited as a
   bodyweight set (W9), and clearing the box still makes a set bodyweight, which
   is what the `placeholder="—"` and the comment at 109–110 already promise.

   `perSide` gives back an exact string, so a set stored as `107.55` on a
   `20 / 2` movement seeds `43.775` and saves back to `107.55` untouched. A set
   that opens and is saved without being changed must store exactly what it
   stored before — that is the check that proves the two halves of the arithmetic
   are inverses.

4. **Saving.** `save` at 338 is unchanged in shape: it still PATCHes
   `performed-sets/<id>/` with `entry` and nothing else. `entry` now carries the
   multiplied-up total, because `parseEntry` does that work (chunk 04). No new
   field, no `bar_kg`, no per-side value in the body.

5. **The two boxes in the row keep their labels.** They are `aria-label`s
   (`"Weight (kg)"` at line 104) because a visible label per box would push the
   row onto a second line at phone width — the comment at 93–95 says so. When the
   row is editing a per-side value that label reads `"Weight per side (kg)"`, for
   the same reason the visible one does in the zone: the number means something
   different and a screen reader is the only thing that will say which.

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
- Editing works the same in both lists — the zone's list and Completed exercises
  — including on two different movements one after the other, with no leakage of
  one row's loading into the next.
- Delete, the arming behaviour, the failure line and the numbering are untouched.

## Do not

- Send anything but `weight_kg` and `reps` in the PATCH (line 336–337's comment
  is still true).
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
