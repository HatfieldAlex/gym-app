# 05 — Styling

**Goal:** make the zone read as a place rather than a panel, and get two columns
of numbers plus Edit and Delete onto a 375px screen without a sideways scroll.

Last chunk. Do it once 02–04 are in, so the whole thing is there to size.

## Read first

- [styles.css](../../frontend-web/src/styles.css) — all of it, and the
  `/* Current session */` section in particular. It is the constraint, and its
  comments explain sizes that are not arbitrary.
- [current_session/07-styling.md](../current_session/07-styling.md) — every rule
  in it still applies. This chunk extends that work; it does not revisit it.
- `CurrentSession.jsx` as chunk 04 left it

## Build

CSS work. Change JSX only where a class name or an element is needed, and note
each such change.

### 1. Inherit, do not restate

44px minimum targets, 16px minimum type in any input, `.button--tap`,
`.button--major`, no hard-coded hexes, both schemes, no animations — all of that
is chunk 07 of current_session and all of it still holds. Do not re-derive it and
do not undo it.

### 2. The button

**Record new exercise** is now the primary action of the whole tab. It is
`.button--major` like Start and End, and it should read as the most important
thing on the session page — but it must not be mistaken for **End session**,
which is the same width at the other end of the page. They are told apart by
position and by what surrounds them, not by colour: nothing on this tab is red
except things that delete.

### 3. The zone as a place

It fills the page below the nav (Z1), so it should feel like it. A header row
with the movement's name and the **×** at its right; the name is the largest
thing in the zone. The **×** is a real target — 44px — but visually quiet: it is
the way out, not an action, and it sits far from Log set.

`main` stays `text-align: center` and `place-self: center` (00-context). The
zone left-aligns its own contents the way `.record-set` and
`.completed-exercises` already do, and sizes itself against the screen with the
`min-width: min(18rem, 100vw - 4rem)` / `max-width: calc(100vw - 4rem)` pair the
existing sections use — the comment above that rule explains why, and the reason
has not changed.

### 4. The paired list at 375px — the hard part

This is the chunk. One row now carries: a set number, last time's measures, this
session's measures, and Edit and Delete. That is more than fits comfortably in
23.4rem.

The row already knows how to cope: `ol.sets .set` is `flex-wrap: wrap` with a
`min-height`, put there for exactly this. So:

- Give the two measure cells a shared minimum width so they line up down the
  page as columns, the way `.set-measures` already does at `7rem` for one.
- Let **Edit** and **Delete** wrap to a second line within their row when the
  numbers need the width. A row that is two lines tall is fine; a page that
  scrolls sideways is not.
- The column headers must sit over the columns they name and stay over them when
  a row wraps.
- The two columns must be distinguishable at a glance without colour — a rule, a
  gap, or weight. Someone reading this mid-set has one hand and about a second.

Check it at 375px and at 320px. Below 375px the numbers win and the buttons wrap;
they never disappear.

### 5. Last time is quieter than this session

This session's column is what is being written; last time's is reference. Say so
with the tab's existing `opacity` idiom, not a new colour. The em dash for a
missing set should read as "nothing here", not as a value.

### 6. Earlier, quieter again

Smaller and dimmer than the paired list above it, so the three tiers — this
session, last time, earlier — step down in weight as they step back in time.

### 7. Keep it in one place

All of it goes in the `/* Current session */` section. No new top-level section,
no new file.

## Done when

- 375px wide, no horizontal scroll anywhere in the zone, in light and dark.
- 320px wide, still no horizontal scroll: the Edit/Delete pair wraps, the numbers
  stay on one line, nothing is clipped or hidden.
- The two measure columns line up down the page and are told apart without
  colour.
- The column headers stay over their columns when rows wrap.
- Focusing weight or reps on an iPhone does not zoom the page (still 16px+).
- Every button in the zone is 44px or more, except the deliberately small
  per-set Edit and Delete that chunk 07 sized that way on purpose.
- Logging five sets in a row never moves **Log set**.
- **Record new exercise** and **End session** are never on screen together, and
  neither is red.
- The other pages are pixel-identical: eyeball `/training-sessions`,
  `/exercises-catelog`, `/settings` and a session detail page before and after.

## Do not

- Restyle `.button`, `nav`, `main`, `body`, `.status` or anything else shared.
- Change `main`'s centring. Sections left-align themselves.
- Add a CSS framework, a component library, or CSS-in-JS.
- Add animations, transitions, or a slide-in for the zone.
- Use `position: fixed`, a backdrop or a `z-index` (Z1). If the zone needs one,
  chunk 02 built the wrong thing.
- Hard-code a hex. Everything is `currentColor` mixed with something, under
  `color-scheme: light dark`.
- Use colour to mean better or worse in the comparison. Red deletes; that is all
  it means on this tab.
- Hide the Edit/Delete pair, or shrink it below its current size, to win space.
  Wrap the row instead.
- Add a sticky bar, a floating button, or anything overlaying the list.

## What the user sees

Nothing new to do — the same zone, sized for using mid-set, one-handed, with
sweaty hands.

- **The way in is the biggest thing on the tab.** One full-width button, clearly
  the thing to press, and never confusable with the button that ends the workout
  at the other end of the page.
- **The zone reads as somewhere you are**, not a box on a page: the movement's
  name at the top, a quiet **×** in the corner, and the whole screen beneath it.
- **Two columns of numbers that fit a phone.** Last time and this time line up
  down the page and stay readable at arm's length. On a narrow screen the Edit
  and Delete buttons drop to their own line rather than squeezing the numbers or
  pushing the page sideways.
- **Three tiers, stepping back.** This session is loudest, last time is quieter,
  the two earlier sessions quieter still — so a glance lands on now.
- **Nothing is colour-coded into a judgement.** Red still means only that
  something deletes.
- **The rest of the app is untouched.** Every other page looks exactly as it did.
