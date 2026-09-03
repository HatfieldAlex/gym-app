# 08 — Ergonomics: everything got longer

**Goal:** the expression fits. `20 + 2 × 60 = 140 kg × 8` is more than twice the
string `140 kg × 8` was, and it lands in the two narrowest places in the app —
the paired set columns and a table cell on a phone. Plus thumb targets on the two
new controls.

Needs chunks 03.0–07. **`styles.css` only**, plus the class names and `data-`
hooks the chunks before it left; if a chunk needs its markup changed to be
styled, that is a note back to that chunk, not a rewrite here.

## Read first

- [styles.css](../../frontend-web/src/styles.css), these blocks and their
  comments, which say what each measurement is for: the set rows at **145–265**
  (`.set-measures`'s `min-width: 7rem` at **218–220**, `.set-action` at 223–242,
  `.edit-set` at **251–262** and the 16px note at 254–256); the paired columns at
  **386–431**, including the "311px of phone" comment at 386; the zone at
  293–345; `.log-set` at **453–467** and `.log-set-actions` at 471–477; the add
  form at **57–118**; the detail page's `.sets` table at **135–143**
- [00-context.md](00-context.md) — the display rules, so you know which strings
  actually occur
- The app on a phone-width viewport, with `make dummy-data` loaded

## Build

1. **The paired columns are the hard case.** Last time and This session, side by
   side, each now potentially holding `20 + 2 × 62.5 = 145 kg × 8`, with Edit and
   Delete after them, in 311px. The existing comments at 386–431 are the record
   of how that was fought for once; do not undo them.

   Solutions in order of preference: let the expression wrap **within** its cell
   rather than widening the row; drop `.set-measures`'s `min-width` to what the
   longest realistic string needs at the smaller of the two type sizes; size the
   two columns off the content rather than a fixed floor. What must not happen:
   the row scrolling sideways, the numbers of the two columns failing to line up
   with each other, or Edit and Delete leaving the screen.

2. **The expression reads as one thing, and its total reads as the answer.** The
   bar and the multiplier are context; `= 140 kg` is the number the eye is
   looking for on a re-read. A small amount of contrast between them — the
   working a step quieter, as `.set-last` is a step quieter than `.set-measures`
   at 424–428, and `.earlier-sessions` a step quieter again at 439 — is the whole
   treatment. Three tiers already exist; this is the same idea inside one string.

   Do it with opacity or `color-mix` on `currentColor`, never a hex literal
   (styles.css has none, and the app is `color-scheme: light dark`).

3. **The zone's one line.** `20 + 2 ×` · the box · `= 140 kg` on one line, the
   box no wider than the number it holds needs, the whole row wrapping rather
   than overflowing at 375px. The box keeps at least 16px of type — below that,
   focusing a number input zooms the page on iOS, which is what the comment at
   254–256 is about and it applies here just as much. The context text is not
   tappable and must not look it.

4. **The two new controls get thumbs.** The Sides `<select>` and the Bar box in
   `LoadingFields`, and the Save button on the ask-once panel, follow the rule
   already stated at 285–292 and 149–154: thumb-sized where the form is used
   one-handed with sweaty hands — in the zone — and ordinary size on the
   catalogue page, which is used sitting down. The `.button--tap` treatment
   already exists; reuse it rather than inventing a size.

5. **The ask-once panel** sits in the zone's column, aligned with the log form it
   replaces, with its one sentence quiet (the register of `.last-time-note` at
   372) and its heading matched to the zone's other headings (191–194). It should
   look like the zone asking a question, not like an error.

6. **The detail page's table cell.** `20 + 2 × 45 = 110` in a `Weight (kg)`
   column next to `Reps`. If the table overflows a phone, give it a scroll
   container of its own rather than letting the page scroll sideways — the page
   body must never scroll horizontally. Check a session with five exercises of
   different kinds in it.

7. **Both schemes, both homes.** Light and dark, and both the phone width and
   the desktop the app also runs on. Nothing here is worth a media query the app
   does not already have.

## Done when

At 375px and at a desktop width, in light and in dark:

- A paired set row shows both columns' expressions, aligned with each other, with
  Edit and Delete still on screen and still tappable, and nothing scrolling
  sideways.
- The longest realistic string —
  `20 + 2 × 62.5 = 145 kg × 12` in the narrower of the two columns — is legible
  and does not push anything off the row.
- In the zone, `20 + 2 × [ 60 ] = 140 kg` sits on one line at 375px, the box is
  focusable without the page zooming, and the label above it is readable.
- The total is visibly the answer rather than one more number in a string.
- The add form's three fields lay out without squashing the name box, on both
  pages it stands on.
- The ask-once panel reads as a question, with a Save button a thumb finds, and
  Change exercise still visibly available.
- A session detail table with a barbell movement in it fits, or scrolls within
  itself; the page does not.
- A bodyweight row (`8 reps`), a collapsed row (`50 kg × 12`) and an unset row
  all still look exactly as they did before this iteration started.

## Do not

- Change any JSX, any string, any rule from 00-context, or which screen shows
  what. This chunk is `styles.css`.
- Introduce a hex colour, a palette, or a colour that does not come from
  `currentColor` / `color-mix`.
- Undo the measurements the comments at 218–220, 254–256 and 386–431 explain.
  If one has to go, replace its comment with the new reason.
- Shrink type below 16px on anything the user types into (254–256).
- Let the page scroll horizontally at any width.
- Touch anything under `backend/`.

## What the user sees

**It fits, and it reads.**

The comparison that is the point of the zone — last week's set beside this
week's, both now showing their working — sits in two columns on a phone with
Edit and Delete still where the thumb expects them. In each expression the
working is quiet and the total is not, so a glance still lands on `= 140 kg`
while a proper look tells you what was on the bar.

The three-field add form and the question the zone asks about a new movement are
both sized for a hand holding a phone in a gym, and a past session's table fits
on the screen it is read on.
