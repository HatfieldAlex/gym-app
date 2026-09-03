# 04 — One box: typing the weight for one side

**Goal:** the number the user types stops being the number they had to work out.
`20 + 2 × [ 60 ] = 140 kg` — the bar and the side count sit beside the box as
fixed context, the box takes one side, and the total is computed live and sent.

Needs chunk 03.0 for `sets.js`. Frontend only, and only the **log-set** form in
the zone. Correcting a set already logged is chunk 05.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx): the
  weight input at **859–871** and the reps input at 873–884; `parseEntry` at
  **223–231** and its comment about why the typed string is passed through
  untouched; the log form's state at 552–558 and `logSet` at 595–637, including
  the comment at 629–630 about what survives a successful log; `held` at **495**
- `frontend-web/src/sets.js` as chunk 03.0 left it
- [00-context.md](00-context.md), **"Taking a set"** — that table is this
  chunk's specification
- Assumptions W5, W9

## Build

1. **The inverse arithmetic joins `sets.js`.** `totalFrom(typedPerSide, loading)`
   — the exact opposite of `perSide`, and it lives beside it so the two can never
   drift:

   - Not configured, or `bar_kg` 0 with `sides` 1: the typed value **is** the
     total, passed through as the string it was typed as. Today's behaviour,
     unchanged, and it is the reason this function has a fast path rather than a
     special case.
   - Otherwise: `bar_kg + sides × typed`, done in integer thousandths
     (`Math.round(Number(value) * 1000)`, the same scale `perSide` works in), and
     formatted back as a string with exactly **two** decimals — `"140.00"`. Never a JavaScript number: the
     column is a `DecimalField(max_digits=6, decimal_places=2)` and a float is
     how a rounding error gets written down.
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

2. **`parseEntry` takes the loading.** `parseEntry(weight, reps, loading)`, with
   its reps rule and its blank-weight rule **unchanged**:

   - reps still whole and ≥ 1, or it is not a set;
   - a blank box is still `{ weight_kg: null }` — a bodyweight set, not the bar
     (W9). Say so in the comment, because on a movement with a 20 kg bar the
     temptation to read blank as "just the bar" is real and it would invent a
     set the user did not log;
   - anything typed goes through `totalFrom`, and a `null` from it means the
     entry is not a set yet.

   Both callers pass the held exercise: the log form at line 558 and, in chunk
   05, the edit form.

3. **The form's weight row, in three shapes** (00-context, "Taking a set"):

   | The held exercise | What stands there |
   |---|---|
   | not configured | today's row exactly: label `Weight (kg)`, one box, nothing around it |
   | `bar_kg` 0, `sides` 1 | today's row exactly — there is nothing to add and nothing to multiply (AGREED 6) |
   | `sides` 2 | label `Weight per side (kg)`, then `20 + 2 ×` · the box · `= 140 kg` |
   | `sides` 1, `bar_kg` > 0 | label `Weight per side (kg)`, then `25 +` · the box · `= 85 kg` (W8 — no `1 ×`) |

   The context around the box is **plain text in spans, not inputs**: the bar and
   the side count are the movement's, they are fixed at the moment it was added,
   and there is no editing them from here or anywhere (AGREED 2). Nothing
   focusable, nothing that looks tappable.

   Keep the visible `<label htmlFor="set-weight">` — it is how every other box on
   this page is labelled and it is what a screen reader reads. Only its text
   changes, and only in the two expression shapes.

4. **The total, live.** The `= 140 kg` is recomputed from what is in the box on
   every keystroke, off `totalFrom`. When the box is blank or half-typed there is
   no total, so the right-hand side is **empty** — no `= 0 kg`, no `= —`, no
   guess. A blank box still logs a bodyweight set exactly as it does today (W9);
   it just has nothing to show for it.

5. **The input keeps every attribute it has**: `type="number"`,
   `inputMode="decimal"` (the comment at 863 — plates come in halves, and that is
   even more true per side), `step="any"`, `min="0"`, `placeholder="—"`. It is
   still never required.

6. **`logSet` is not otherwise touched.** It already sends `...entry`, so the
   computed total travels the same path the typed total did; the two-request
   dance, the `session` update and the error line are all unchanged. What was
   typed still survives a successful log (the comment at 629–630) — and now it
   survives as a per-side number, which is the one most likely to be right for
   the next set.

7. **Style: enough to lay the row out on one line and no more.** The prefix, the
   box and the suffix on one line, the box narrower than it is today because it
   now holds a smaller number, wrapping rather than overflowing at 375px. Thumb
   targets, the 16px minimum on the box (the reason `.log-set input` is sized as
   it is at styles.css:459) and everything else ergonomic is chunk 08.

## Done when

With `make dummy-data` run:

- Holding **deadlift**, the form reads `20 + 2 × [   ] =` with the label
  **Weight per side (kg)**. Typing `60` makes it read `= 140 kg` as the digits
  land.
- Tapping **Log set** with `60` and `8` logs a set that appears in the list below
  as `20 + 2 × 60 = 140 kg × 8`, and the boxes still hold `60` and `8`.
- The stored total is right: the same set on the session detail page, and in
  `make shell`, is `140.00` — not `60`, not `139.99`.
- Holding **lat pulldown** (`0 / 1`), the form is one plain box labelled
  **Weight (kg)**, exactly as before. Typing `50` and logging gives `50 kg × 12`.
- Holding **seated calf raise** (unset), the form is one plain box and logging
  `45` stores `45.00` — unchanged behaviour for a movement nobody has answered.
- Typing `62.5` per side on a `20 / 2` movement stores `145.00`.
- Typing `43.775` per side on deadlift stores exactly `107.55` — an ugly number
  that adds up is allowed.
- Typing `50.005` into **lat pulldown**'s plain box behaves exactly as it did
  before this chunk — the client does not start refusing what it used to send.
- Leaving the weight box empty and typing `8` reps still logs a bodyweight set —
  `8 reps` — on a barbell movement as much as on pull ups.
- **Change exercise** still clears both boxes; the reps box, the buttons, the
  failure line and everything below the form are untouched.
- Nothing in the set lists changed: they read exactly as chunk 03.0 left them.

## Do not

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

Hold deadlift and the form no longer asks for a total. It says `20 + 2 ×`, waits
for one side, and finishes the sentence itself: type `60` and `= 140 kg` appears
beside it before the set is logged. Nobody adds anything up mid-set, and nobody
mistypes the sum they did in their head between the rack and the phone.

The bar and the side count sit there as plain text, because they are facts about
the movement rather than fields — a 25 kg trap bar is a different entry in the
catalogue, not a deadlift with the number changed.

A stack, a sled or a cable is still one box with the whole weight in it: there is
nothing to add and nothing to double, so nothing is asked for. A movement the app
has never been told about is still one box too, exactly as it was — that is the
last thing left, and it is chunk 07.
