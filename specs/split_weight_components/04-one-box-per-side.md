# 04 — One box: typing the weight for one side

**Goal:** the number the user types stops being the number they had to work out.
`20 + 2 × [ 60 ] = 140 kg` — the bar and the side count sit beside the box as
fixed context, the box takes one side, and the total is computed live and sent.

Needs chunk 03.0 for `sets.js`. Frontend only, and only the **log-set** form in
the zone. Correcting a set already logged is chunk 05.

> **This chunk was written once against the old zone and is being rebuilt.**
> `main`'s `3c0cab3` restructured `CurrentSession.jsx` underneath it: the log
> form is no longer a `<form>`, the weight box is no longer a plain box, and the
> movement being recorded is no longer a catalogue row. The two constraints that
> follow from that are step 3 and step 6, and neither is optional — between them
> they are the whole difference between this chunk and its first draft.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx): the
  `.log-set` **`<div>`** at **1133–1239** and the weight input inside it at
  **1136–1151**; the reps input at 1155–1164; the restored note at 1172–1176 and
  the buttons at 1198–1226; `openExercise` and `openSets` at **612–617**;
  `weight`, `reps` and `entry` at 684–686; `restored` at 692; the draft effect at
  702–709 and **`typeWeight` at 719–723**; `parseEntry` at **316–324**; `logSet`
  at **770–802**, in particular its comment at 763–766 about not being a submit
  handler and at 788–795 about what survives a successful log
- `frontend-web/src/sets.js` as chunk 03.0 left it — and note that the merge did
  not touch it, so `entryPrefix` (269) and `totalFrom` (294) are already in it
  from this chunk's first pass. Check them against step 1 rather than writing
  them again.
- [exercise_lifecycle/06](../exercise_lifecycle/06-half-typed-sets-come-back.md)
  — E10, the draft, which is the thing step 3 exists to protect
- [00-context.md](00-context.md), **"Taking a set"** — that table is this
  chunk's specification
- Assumptions W5, W9

## Build

1. **The inverse arithmetic lives in `sets.js`.** `totalFrom(typedPerSide, loading)`
   — the exact opposite of `perSide`, and it lives beside it so the two can never
   drift:

   - Not configured, or `bar_kg` 0 with `sides` 1: the typed value **is** the
     total, passed through as the string it was typed as. Today's behaviour,
     unchanged, and it is the reason this function has a fast path rather than a
     special case.
   - Otherwise: `bar_kg + sides × typed`, done in integer thousandths
     (`Math.round(Number(value) * 1000)`, the same scale `perSide` works in), and
     formatted back as a string with exactly **two** decimals — `"140.00"`. Never
     a JavaScript number: the column is a
     `DecimalField(max_digits=6, decimal_places=2)` and a float is how a rounding
     error gets written down.
   - Returns `null` when the typed value cannot make a total: blank (which is
     bodyweight and handled by the caller), half-typed, or **producing a total
     that is not an exact multiple of 0.01** — that is all the column can hold,
     so it is "not a set yet" exactly as a trailing `.` is today.

     Test the **total**, never the typed value: `43.775` per side on a `20 / 2`
     movement makes exactly `107.55` and is perfectly good, and chunk 05 needs it
     to be, because that is the number it will seed a box with when that set is
     edited. And the test belongs to the computed path alone — the fast path
     above passes the typed string through untouched, exactly as today, so a
     plain box's behaviour is not changed by this chunk in any way.

2. **`parseEntry` takes the loading, and the loading comes off the open block.**
   `parseEntry(weight, reps, loading)`, with its reps rule and its blank-weight
   rule **unchanged**:

   - reps still whole and ≥ 1, or it is not a set;
   - a blank box is still `{ weight_kg: null }` — a bodyweight set, not the bar
     (W9). Say so in the comment, because on a movement with a 20 kg bar the
     temptation to read blank as "just the bar" is real and it would invent a
     set the user did not log;
   - anything typed goes through `totalFrom`, and a `null` from it means the
     entry is not a set yet.

   The log form's call at line 686 becomes
   `parseEntry(weight, reps, loadingOf(openExercise))`. **`loadingOf`, off the
   open `PerformedExercise` — not a catalogue lookup.** The block carries
   `exercise_bar_kg` and `exercise_sides` itself (chunk 02), in the same request
   that told the page an exercise was open, and it carries them when
   `exercises/` never loaded. 00-context's "Where the derivation lives" argues
   this in full; the short version is that `3c0cab3` deleted the lookup on
   purpose and this chunk does not bring it back.

   The edit form is chunk 05's call site and is not touched here.

3. **`WeightEntry`, and the two things it must not swallow.** The weight row
   becomes a component — the prefix, the box and the live total are one idea and
   the log form should not grow three branches — but **it does not get to own a
   bare `<input>` with an `onChange` of its own invention.** Main's weight box is
   not a plain box any more. It carries:

   - `data-restored={restored ? '' : undefined}` — the marker saying this number
     came back from the browser rather than off the keyboard (lifecycle E10);
   - `onChange={(event) => typeWeight(event.target.value)}` — **not** `setWeight`.
     `typeWeight` sets the box, clears `restored`, and mirrors both boxes into
     `localStorage` on the keystroke itself.

   A `WeightEntry` that hardcodes `onChange={(event) => onChange(...)}` and is
   handed `setWeight` compiles, renders, looks right and quietly deletes the
   draft feature: nothing is written while the user types, nothing comes back
   after a reload, and there is no error anywhere to notice. Two lines of this
   chunk against a whole chunk of the last iteration. So the contract is:

   ```jsx
   function WeightEntry({ loading, value, restored, onChange })
   ```

   | Prop | What it is | What the page passes |
   |---|---|---|
   | `loading` | `{ bar_kg, sides }` — the shape `sets.js` takes | `loadingOf(openExercise)` |
   | `value` | the string in the box | `weight` |
   | `restored` | whether that string came back from storage | `restored` |
   | `onChange` | called with the typed **string**, not an event | **`typeWeight`** |

   `WeightEntry` owns the box's *shape* — its `id`, its keypad, its placeholder,
   the label's words, what stands to its left and what stands to its right — and
   owns **none** of its behaviour. Every prop above that is behaviour is handed
   in, so there is no second copy of the draft rule and no way for the two to
   disagree.

   The rejected alternative, so nobody reinvents it: passing the `<input>` in as
   a child. The component's entire job is deciding what goes *around* the box, so
   handing it a box it may not shape inverts it — and the caller would then own
   an `id`, an `inputMode` and a `placeholder` that are this component's
   business. One more prop is cheaper than an inverted component.

   The reps box is not this component's and does not change: it keeps its own
   `data-restored` and its own `typeReps`.

4. **Three shapes, and `entryPrefix` decides between them** (00-context,
   "Taking a set"), so this form and the lines its sets are read back on can
   never disagree about which movements have an expression:

   | The open exercise | What stands there |
   |---|---|
   | not configured | today's row exactly: label `Weight (kg)`, one box, nothing around it |
   | `bar_kg` 0, `sides` 1 | today's row exactly — there is nothing to add and nothing to multiply (AGREED 6) |
   | `sides` 2 | label `Weight per side (kg)`, then `20 + 2 ×` · the box · `= 140 kg` |
   | `sides` 1, `bar_kg` > 0 | label `Weight per side (kg)`, then `25 +` · the box · `= 85 kg` (W8 — no `1 ×`) |

   The context around the box is **plain text in spans, not inputs**: the bar and
   the side count are the movement's, they are fixed at the moment it was added,
   and there is no editing them from here or anywhere (AGREED 2). Nothing
   focusable, nothing that looks tappable.

   Keep the visible `<label htmlFor="set-weight">` and the box's `id` — it is how
   every other box on this page is labelled and it is what a screen reader reads.
   Only its text changes, and only in the two expression shapes.

5. **The total, live.** The `= 140 kg` is recomputed from what is in the box on
   every keystroke, off `totalFrom`. When the box is blank or half-typed there is
   no total, so the right-hand side is **empty** — no `= 0 kg`, no `= —`, no
   guess. A blank box still logs a bodyweight set exactly as it does today (W9);
   it just has nothing to show for it.

6. **Nothing about how a set is submitted changes, and that is a rule rather
   than an observation.** The lifecycle iteration took Enter away deliberately
   (E11: "it submits without you realising"), and this chunk is exactly the sort
   of edit that would hand it back without meaning to:

   - the boxes stay inside `<div className="log-set">`. **Do not** wrap the
     weight row, the two rows, or the block in a `<form>` — not to get Enter, not
     for semantics, not because a `<p>` inside a `<div>` looks unfinished;
   - Log set stays `type="button"` with `onClick={logSet}`. There is no `<form>`
     for a `type="submit"` to submit to, so a submit button here would be a
     button that does nothing at all;
   - `logSet` keeps its empty parameter list and its `preventDefault`-free body.

   Otherwise `logSet` is not touched. It already sends `...entry`, so the
   computed total travels the same path the typed total did; the POST, the
   `session` update, `setRestored(false)` and the error line are all unchanged.
   What was typed still survives a successful log — and now it survives as a
   per-side number, which is the one most likely to be right for the next set.

7. **Style: enough to lay the row out on one line and no more.** The prefix, the
   box and the suffix on one line, the box narrower than it is today because it
   now holds a smaller number, wrapping rather than overflowing at 375px.
   `.log-set p` is `display: inline-grid` (styles.css:458), which is the layout
   the plain label-over-box row wants and not the one the expression row wants,
   so `.per-side` has to say what it is instead of inheriting it.

   Two things in that block are load-bearing and are not yours to move:
   `.log-set-actions` reserves a 2.3rem band for the restored line so Log set
   does not walk up under the thumb when the first keystroke clears it, and
   `.log-set .restored-note + .log-set-actions` (523) closes that band when the
   line is really there. It is an **adjacent-sibling** selector: put anything
   between the restored note and the buttons and the band silently doubles.

   Thumb targets, the 16px minimum on the box (the reason `.log-set input` is
   sized as it is at styles.css:463) and everything else ergonomic is chunk 08.

## Done when

With `make dummy-data` run:

- Opening **deadlift** in the zone, the form reads `20 + 2 × [   ] =` with the
  label **Weight per side (kg)**. Typing `60` makes it read `= 140 kg` as the
  digits land.
- Tapping **Log set** with `60` and `8` logs a set that appears in the list below
  as `20 + 2 × 60 = 140 kg × 8`, and the boxes still hold `60` and `8`.
- The stored total is right: the same set on the session detail page, and in
  `make shell`, is `140.00` — not `60`, not `139.99`.
- **The draft still works, which is the check this chunk exists to not fail.**
  Type `62.5` and `8` into deadlift, reload the page: the app comes back inside
  the exercise with `62.5` and `8` in the boxes, both marked, the *Picked up
  where you left off* line under them — and the live total reading `= 145 kg`
  off the restored value. Type one more digit and the marking goes.
- **Enter does nothing.** In the per-side box and in the reps box, on a
  configured movement and on an unconfigured one. No set is logged, no page
  reloads.
- Opening **lat pulldown** (`0 / 1`), the form is one plain box labelled
  **Weight (kg)**, exactly as before. Typing `50` and logging gives `50 kg × 12`.
- Opening **seated calf raise** (unset), the form is one plain box and logging
  `45` stores `45.00` — unchanged behaviour for a movement nobody has answered.
- With the API's `exercises/` failing (block it in devtools), an open deadlift
  **still** reads `20 + 2 ×`: the zone's arithmetic does not come from the
  catalogue.
- Typing `62.5` per side on a `20 / 2` movement stores `145.00`.
- Typing `43.775` per side on deadlift stores exactly `107.55` — an ugly number
  that adds up is allowed.
- Typing `50.005` into **lat pulldown**'s plain box behaves exactly as it did
  before this chunk — the client does not start refusing what it used to send.
- Leaving the weight box empty and typing `8` reps still logs a bodyweight set —
  `8 reps` — on a barbell movement as much as on pull ups.
- **Change exercise** still clears both boxes and every draft key; **Log
  exercise** still appears in its place the moment a set is in the block; the
  reps box, the error lines and everything below the form are untouched.
- Nothing in the set lists changed: they read exactly as chunk 03.0 left them.

## Do not

- Hand `WeightEntry` `setWeight`, or let it build an `onChange` that does not go
  through `typeWeight`. Do not drop `data-restored` from the weight box (step 3).
- Put the log form back in a `<form>`, give Log set `type="submit"`, or give
  `logSet` an event parameter (step 6, lifecycle E11).
- Insert anything between the restored note and `.log-set-actions` (step 7).
- Look the open exercise up in `catalogue`, or read `bar_kg`/`sides` off a
  catalogue row anywhere on this page (step 2).
- Make the bar or the side count editable, or put a control beside them that
  looks like it might be (AGREED 2).
- Read a blank box as the bar's weight, or as zero (W9).
- Send a JavaScript number, or a total assembled with `+` on floats (step 1).
- Send `bar_kg`, `sides`, or a per-side value to `performed-sets/` — the total is
  the only thing stored, and `PerformedSetSerializer` was not changed for a
  reason (AGREED 3).
- Add a plate calculator, a plate picker, a `+2.5` stepper, or lb (AGREED, "out
  of scope").
- Touch the edit-a-set form nested in `SetRow` — that is chunk 05, and building
  half of it here means building it twice.
- Ask an unset movement how it is loaded — chunk 07. Here it simply keeps
  today's plain box.
- Change `Status.jsx`, `hooks.js` or `api.js`, or anything under `backend/`.

## What the user sees

**The number typed is the number thought in.**

Open deadlift and the form no longer asks for a total. It says `20 + 2 ×`, waits
for one side, and finishes the sentence itself: type `60` and `= 140 kg` appears
beside it before the set is logged. Nobody adds anything up mid-set, and nobody
mistypes the sum they did in their head between the rack and the phone.

The bar and the side count sit there as plain text, because they are facts about
the movement rather than fields — a 25 kg trap bar is a different entry in the
catalogue, not a deadlift with the number changed.

Everything the exercise already did, it still does. Enter still logs nothing.
A half-typed `62.5` still survives a locked phone and comes back marked as
restored, now with `= 145 kg` beside it. And a stack, a sled or a cable is still
one box with the whole weight in it: there is nothing to add and nothing to
double, so nothing is asked for. A movement the app has never been told about is
still one box too, exactly as it was — that is the last thing left, and it is
chunk 07.
