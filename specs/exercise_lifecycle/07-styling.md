# 07 — Styling the pieces that moved

**Goal:** the four things the chunks before this one changed on screen look
deliberate. Nothing else.

`frontend-web/src/styles.css` only, in its `/* Current session */` section.
Needs 02, 04 and 06.

This is a short chunk on purpose. The zone was styled by
[exercise_zone/05](../exercise_zone/05-styling.md) and it keeps that treatment
whole — it is the same section, still a takeover (Z1), still read down its left
edge, still 44px targets under a thumb. What changed is a control that left, a
control that arrived, a wait that is new, and a pair of boxes that can now come
back filled.

## Read first

- [styles.css](../../frontend-web/src/styles.css) — the `/* Current session */`
  section, especially `.exercise-zone`, `.zone-header`, `.zone-close`,
  `.log-set`, `.log-set-actions`, `.log-exercise`, `.change-exercise` and
  `ol.sets`
- [exercise_zone/05-styling.md](../exercise_zone/05-styling.md) — the reasoning
  behind what is already there, which this chunk does not relitigate
- [current_session/07-styling.md](../current_session/07-styling.md) — the 44px
  rule, the 375px target, and why `main` stays centred
- [00-context.md](00-context.md) — E10, and Z1 and Z2, which stand

## Build

### 1. The way out, now that there is one of it

`.log-set-actions` was written to wrap because *"three buttons do not fit across
375px"*. There are now two at most, and usually two: **Log set**, and whichever
of **Log exercise** / **Change exercise** applies. Update the rule and its
comment to say what is actually true. `.log-exercise` and `.change-exercise`
keep their quieter treatment — a movement is finished once and sets are logged
many times, and that hierarchy did not change.

`.zone-close` has no element left (chunk 02 removed the **×**). Delete the rule
and the `.zone-header`'s `justify-content: space-between` becomes whatever suits
a header that is now only a heading. The header rule under the name stays: it is
what makes the zone read as a place.

The chooser's **Cancel** is the quiet control on a screen with one loud one.
Give it `.change-exercise`'s weight rather than a third treatment — they are the
same size of act, one address apart.

### 2. The wait when an exercise opens

**Opening…** is new, and it is the moment the app is doing the thing this
iteration is about. It sits with the chooser, at `.status` weight, and the
`<select>` above it is visibly disabled while it shows. Nothing more: A9 says
the wait is uncovered, not that it is hidden, and a spinner or a skeleton would
be covering it.

### 3. A restored draft (E10)

`data-restored` on the two `.log-set input`s, and the line beside them.

It must read as *"these came back"* and not as *"something is wrong"* — Z6's
objection was silence, not the absence of an alarm. So: a marked edge or ground
on the two boxes, distinctly different from a fresh box at a glance, and quieter
than `[data-state="error"]`. Follow the file's existing idiom — every colour in
it is a `color-mix` of `currentColor`, and `[data-armed]` and `[data-none]` are
the two attribute hooks already doing this job. No new colour, no icon, no
animation.

The line itself is `.status` weight and wraps under the boxes rather than
pushing **Log set** down the screen: nothing that loads or restores may move Log
set, which is the rule the last-time block was built to (`exercise_zone/05`).

### 4. Completed exercises without its buttons

Chunk 04 took Edit and Delete off every set down there. `ol.sets .set` was laid
out for a row with a `.set-actions` group on the right; without it a set is a
number and a measure. Check it at 375px and tighten what is loose — a row that
was sized around buttons that are gone should not leave a column of empty space
where they were.

The zone's own list still has them. `ol.sets--paired` and the two-column sizing
are untouched.

## Done when

At 375px wide, in a real browser, with a session running:

- The zone header is a heading and a rule, with no gap where the **×** was.
- Log set and its one companion sit on one line without wrapping.
- **Opening…** appears under a visibly disabled chooser and moves nothing when
  it goes.
- A restored weight and reps are obviously not freshly typed at a glance, and
  the line beside them reads as information rather than as an error.
- Typing in a box returns it to an ordinary box with no layout shift.
- **Log set** is in the same place before and after the history loads, before
  and after a restore, and after five sets are logged.
- Completed exercises reads cleanly with no row actions, at 375px and on a
  desktop width.
- Nothing on `/`, `/training-sessions`, `/exercises-catelog` or `/settings`
  moved.
- Both colour schemes still work — the file is `color-scheme: light dark` and
  every colour a `color-mix` of `currentColor`.

## Do not

- Restyle the zone, the paired set list, the Earlier lines, or anything
  `exercise_zone/05` settled. This is not a second pass at it.
- Touch `main`, `nav`, `body`, `.button`, or any page's section but Current
  session's.
- Introduce a colour, a shadow, an icon, a font or an animation. Nothing in this
  file has any of them.
- Make the zone a fixed or floating layer (Z1).
- Add a `.zone-close` back under another name.
- Change any JSX. If a class or a `data-` attribute is missing, it belongs in
  the chunk that was supposed to add it.

## What the user sees

The screen stops carrying the outline of things that are no longer there.

- **One way out, sitting where it belongs.** No leftover `×` in the corner, no
  row of buttons that wraps to fit three.
- **The pause when an exercise opens looks like a pause**, not like a screen
  that failed to load.
- **A restored weight looks restored.** Different enough from a typed number to
  catch the eye on the way to **Log set**, quiet enough not to read as an error.
- **Log set never moves.** Not when the history loads, not when a draft comes
  back, not on the fifth set.
- **The completed list is a record.** Numbers, no controls, nothing inviting a
  tap that would not work.
