# 08 — Ergonomics: everything got longer

**Goal:** the expression fits. `20 + 2 × 60 = 140 kg × 8` is more than twice the
string `140 kg × 8` was, and it lands in the two narrowest places in the app —
the paired set columns and a table cell on a phone. Plus thumb targets on the
new controls.

Needs chunks 03.0–07. **`styles.css` only**, plus the class names and `data-`
hooks the chunks before it left; if a chunk needs its markup changed to be
styled, that is a note back to that chunk, not a rewrite here.

> **This chunk was written once against the old zone and is being re-run.**
> `3c0cab3` rebuilt the block this chunk restyles. Every line number below has
> moved, and three things now live *inside* the log form that were not there
> when this was first written: the weight box carries `data-restored`, a
> `.restored-note` line stands under the boxes, and `.log-set-actions` keeps a
> fixed band open above itself so Log set does not walk up under the thumb when
> that line clears. Those are `main`'s and they are load-bearing. This chunk
> restyles around them; it does not restyle them.
>
> Chunks 04 and 07 were rebuilt against the same markup before this one. What
> they left — the prefix · box · live-total row, the shared `Worked` wrapper,
> the question panel and its three buttons — is what this chunk is sizing.

## Read first

- [styles.css](../../frontend-web/src/styles.css), these blocks and their
  comments, which say what each measurement is for:
  - the add form and the two loading fields at **78–165** — the shared field
    recipe at 95–116, and the two widths those fields carry into both rooms
    they stand in at **143–156**
  - the detail page's `.sets` table at **186–219**, and the reason its cap is a
    `vw` measure rather than `100%` at 191–213
  - the set rows at **287–352**: `.set-measures`'s `min-width: 7rem` at
    **305–307**, `.set-action` at 310–337, `.edit-set` at **338–350** and the
    16px note at **341–343**
  - the zone at **392–435**, the comparison's header at 437–469
  - the paired columns at **471–552**, including the "311px of phone" comment at
    **471** and last time's two opacities at 539–549
  - the question panel at **572–608**
  - the log form at **609–647**, the working-and-answer rules both it and the
    rows wear at **649–686**, and then the block this chunk must leave alone:
    the shared error line at 688–694, the shared button row at 695–705,
    `data-restored` at **706–721**, `.restored-note` at **722–745** and the
    band it reserves at **746–753**
  - the primary tap at 754–761, `.log-exercise`/`.skip-loading` at 762–786 and
    `.change-exercise` at 788–805
- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx):
  `WeightEntry` at **409–462**, which is prefix · box · total and where
  `data-restored` is put on the box; `AskLoading` at **522–612**, whose actions
  row holds Save, the skip and the way out, with `closeError` under them; the
  log form at **1759–1869**, where the restored line sits **immediately** before
  `.log-set-actions`
- [Worked.jsx](../../frontend-web/src/components/Worked.jsx) — the one wrapper
  that draws working-then-answer in all four places it appears
- [00-context.md](00-context.md) — the display rules, so you know which strings
  actually occur
- The app on a phone-width viewport, with `make dummy-data` loaded

## Build

1. **The paired columns are the hard case.** Last time and This session, side by
   side, each now potentially holding `20 + 2 × 62.5 = 145 kg × 8`, with Edit and
   Delete after them, in 311px. The existing comments at 471–552 are the record
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
   at 539, and `.earlier-sessions` a step quieter again at 562 — is the whole
   treatment. Three tiers already exist; this is the same idea inside one string.

   Do it with opacity or `color-mix` on `currentColor`, never a hex literal
   (styles.css has none, and the app is `color-scheme: light dark`).

   **Opacity multiplies.** A step inside an already-quiet cell is not the same
   step it is on the page: last time's column is `.7`, so a `.65` working inside
   it is `.455` of the page's ink. Compute what each nesting actually lands at
   and keep body-sized text at 4.5:1 or better; a quiet tier that cannot be read
   at arm's length in a gym is not a tier, it is a bug.

3. **The zone's one line.** `20 + 2 ×` · the box · `= 140 kg` on one line, the
   box no wider than the number it holds needs, the whole row wrapping rather
   than overflowing at 375px. The box keeps at least 16px of type — below that,
   focusing a number input zooms the page on iOS, which is what the comment at
   341–343 is about and it applies here just as much. The context text is not
   tappable and must not look it.

   The rest of the form comes with it: the Reps box, which drops under the
   expression at phone width rather than squeezing it, and the restored line and
   the button row below them, which are `main`'s and are covered under **Do
   not**.

4. **The new controls get thumbs.** The Sides `<select>` and the Bar box in
   `LoadingFields`, and Save, `.skip-loading` and `.change-exercise` on the
   question panel, follow the rule already stated at 225–230 and 384–390:
   thumb-sized where the form is used one-handed with sweaty hands — in the
   zone — and ordinary size on the catalogue page, which is used sitting down.
   The `.button--tap` treatment already exists; reuse it rather than inventing a
   size. The set row's Edit and Delete are the one deliberate exception, and the
   comment at 310–314 says why.

5. **The question panel** sits in the zone's column, aligned with the log form it
   replaces, with its one sentence quiet (the register of `.last-time-note` at
   457) and its heading matched to the zone's other headings (410–418). It should
   look like the zone asking a question, not like an error.

   Its two fields are the add form's two fields and want the add form's two
   widths — a four-character box that stays four characters wide, and a menu
   whose longest option is a sentence taking the slack. Its three buttons wrap
   across 375px; its `closeError` line lands under them in the log form's
   register, in the same place and the same words.

6. **The detail page's table cell.** `20 + 2 × 45 = 110` in a `Weight (kg)`
   column next to `Reps`. If the table overflows a phone, give it a scroll
   container of its own rather than letting the page scroll sideways — the page
   body must never scroll horizontally. Check a session with five exercises of
   different kinds in it.

   A percentage cap will not do it. Every box between that table and the page is
   sized by what it holds, so a `max-width: 100%` has no definite width to be a
   percentage of at the moment it is needed and is ignored: `main` grows to the
   table's full width and the page goes sideways with nothing left for the table
   to scroll. The cap has to be absolute — a `vw` measure, less `main`'s own
   padding, which is exactly what `.record-set` and its neighbours do at 231–250.

7. **Both schemes, both homes.** Light and dark, and both the phone width and
   the desktop the app also runs on. Nothing here is worth a media query the app
   does not already have.

8. **One rule where there is one thing.** The merge left the log form and the
   question panel each carrying their own copy of measurements that are about the
   same thing in the same place — the gap over an error line, how wide a bar box
   is. Where two rules say the same thing, say it once; where they have drifted,
   the drift is the bug. This does **not** extend to rules that only look alike:
   the band under **Do not** is one form's and not the other's, and merging it
   into the shared row would put a two-line gap on a panel with nothing to put
   in it.

## Done when

At 375px and at a desktop width, in light and in dark:

- A paired set row shows both columns' expressions, aligned with each other, with
  Edit and Delete still on screen and still tappable, and nothing scrolling
  sideways.
- The longest realistic string —
  `20 + 2 × 62.5 = 145 kg × 12` in the narrower of the two columns — is legible
  and does not push anything off the row.
- Last time's working is readable, not grey: the two nested opacities compute to
  4.5:1 or better against the page.
- In the zone, `20 + 2 × [ 60 ] = 140 kg` sits on one line at 375px, the box is
  focusable without the page zooming, and the label above it is readable.
- The total is visibly the answer rather than one more number in a string.
- The add form's three fields lay out without squashing the name box, on both
  pages it stands on.
- The question panel reads as a question, with a Save button a thumb finds, a
  Bar box that is not a phone-wide box for four characters, the skip plainly
  offered, and Change exercise still visibly available.
- A restored draft comes back marked, its line under the boxes, and Log set is
  in the same place on the screen as it is with no draft.
- A session detail table with a barbell movement in it fits, or scrolls within
  itself; the page does not, at any width.
- A bodyweight row (`8 reps`), a collapsed row (`50 kg × 12`) and an unset row
  all still look exactly as they did before this iteration started.

## Do not

- Change any JSX, any string, any rule from 00-context, or which screen shows
  what. This chunk is `styles.css`, plus a `className` where one is genuinely
  missing.
- Break anything `main` put in the log form. Three things, and each of them
  fails silently rather than visibly:
  - `.log-set input[data-restored]` (706–721) — the mark on a box holding a
    number the user did not type. `box-sizing: border-box` on the box is what
    keeps the 2px dashed edge from resizing it; do not take it away.
  - `.log-set .restored-note` (722–745) — `width: 0; min-width: 100%` is what
    keeps a long sentence out of the zone's width calculation. Without it the
    zone grows by a couple of rem the moment a draft comes back.
  - `.log-set-actions { margin-top: 2.3rem }` and
    `.log-set .restored-note + .log-set-actions { margin-top: 0 }` (746–753) —
    the band that keeps Log set in one place. It is an **adjacent-sibling** pair:
    nothing may be inserted between that line and that row, and the band must
    stay on `.log-set-actions` alone. `.ask-loading-actions` shares the flex row
    at 695–705 and must **not** inherit the band — the question panel has no
    draft to come back to, so the gap would be kept for something that never
    arrives.
- Introduce a hex colour, a palette, or a colour that does not come from
  `currentColor` / `color-mix`.
- Undo the measurements the comments at 305–307, 341–343 and 471–552 explain.
  If one has to go, replace its comment with the new reason.
- Shrink type below 16px on anything the user types into (341–343).
- Let the page scroll horizontally at any width.
- Restyle anything this feature did not touch. A rule that is the same in `main`
  and on this branch is not this chunk's to change.
- Touch anything under `backend/`.

## What the user sees

**It fits, and it reads.**

The comparison that is the point of the zone — last week's set beside this
week's, both now showing their working — sits in two columns on a phone with
Edit and Delete still where the thumb expects them. In each expression the
working is quiet and the total is not, so a glance still lands on `= 140 kg`
while a proper look tells you what was on the bar — and quiet still means
readable, including in last time's column where two quiet things sit inside one
another.

The three-field add form and the question the zone asks about a new movement are
both sized for a hand holding a phone in a gym; the question asks for a bar
weight in a box the size of a bar weight. A draft that came back is marked, says
so, and does not move the button under the thumb. And a past session's table fits
on the screen it is read on, or scrolls on its own, while the page behind it
stays still.
