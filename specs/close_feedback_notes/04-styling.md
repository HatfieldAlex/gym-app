# 04 — Ergonomics

**Goal:** make clearing the list down comfortable with a thumb. Everything
already works; this is the chunk that decides whether it gets used.

Needs chunks 02 and 03. Almost entirely
[styles.css](../../frontend-web/src/styles.css); touch `Settings.jsx` only where
a class name or an attribute is needed for a rule to hang on.

## Read first

- The `/* Your notes */` section of
  [styles.css](../../frontend-web/src/styles.css) as chunks 02 and 03 left it,
  and the `/* Download your data */` section beside it — the two share the
  `h2` rule and must keep sharing it
- `.set-action` and `.set-action[data-armed]` in the same file — the armed
  treatment being echoed, and the comment saying why *those* are deliberately
  small
- `.button` and `.button--tap` (`min-height: 44px`) — the thumb-target size the
  app already has a name for
- [specs/feedback/06-styling.md](../feedback/06-styling.md) and
  [specs/current_session/07-styling.md](../current_session/07-styling.md) — the
  same job on the neighbouring features; stay consistent rather than inventing
  a third style
- [00-context.md](00-context.md) — C9, C13

## Build

1. **The × and the ↺ are thumb targets** — at least 44×44 CSS pixels of tappable
   area each (C13). This is the one place the notes list deliberately parts
   company with `.set-action`, which is small on purpose because a set row is
   read mid-set. **Leave a comment saying why the two differ**, next to the
   rule: what protects an accidental close here is the arming, not the size.
   Do not edit the `.set-action` rules to match.

2. **Arming must not move anything.** `×` and `Sure?` are wildly different
   widths: give the control a `min-width` that fits `Sure?` so the row does not
   jump, reflow or resize under the thumb between the two taps — the same
   problem `.set-action`'s transparent border solves at a smaller scale.

3. **The armed state is unmistakable and matches the app's.** Echo
   `.set-action[data-armed]` — boxed, `color-mix(in srgb, red 65%, currentColor)`,
   full opacity — written as its own rule in the notes section rather than by
   extending the set row's selector list, because the two sections keep their
   own rules. It must read as a different thing from the tap that armed it, and
   not by colour alone.

4. **The row holds together.** Body and meta on the left, the control at the
   end, top-aligned with the first line of the body — a paragraph-long note
   wraps beside it, not under it, and never behind it. At 375px the row still
   fits with no sideways scroll and no control pushed off the edge. The
   `.note + .note` separator and the list's `max-width: 30rem` stay as they are.

5. **A closed note reads as closed** — hang it on the `data-closed` attribute
   chunk 02 put on the `<li>`. Quieter than an open one (a little less opacity
   is enough), with the **Closed** word in the meta line carrying its weight;
   still perfectly readable, in both schemes, and not by colour alone. Its ↺
   stays at full strength — it is the one thing on that row you might tap.

6. **The toggle is quiet and reachable.** Under the heading, above the list,
   left-aligned with them; 44px tall; in the caption register of
   `.export-summary` rather than competing with the `<h2>`. Make
   `aria-pressed="true"` visible in the styling, the way the feedback marker's
   `aria-expanded` is, so **Hide closed** reads as on. Do not reuse `.button` —
   this is not a primary action; it is a view switch.

7. **Both schemes, no hex.** `currentColor`, `color-mix` and the system
   keywords only. Check the armed ×, the closed row and the pressed toggle in
   light and dark.

8. **Focus is visible** on the ×, the ↺ and the toggle — the arming depends on
   `onBlur`, so where the keyboard is has to be obvious.

9. **No motion.** A row that disappears when a note is closed does not need an
   animation, and one that has to play before the next tap is slower than one
   that does not. If anything is added it is under 150ms and inside
   `@media (prefers-reduced-motion: no-preference)`.

## Done when

- On a 375px viewport: × and ↺ are easy to hit with a thumb, the row does not
  wrap oddly, and nothing scrolls sideways — including a note with a long
  unbroken `/exercises/<uuid>` path in its meta line.
- Tapping × to arm it moves nothing: the row, the notes above and below, and the
  page scroll position are all exactly where they were.
- The armed **Sure?** is obviously armed in both light and dark, and reads as
  such with colour removed.
- A three-paragraph note wraps beside its control, never under or behind it.
- A closed note is visibly quieter than an open one, still legible in both
  schemes, and its ↺ is not dimmed with it.
- **Show closed** / **Hide closed** is 44px tall, sits under the heading without
  competing with it, and looks pressed when it is on.
- Tabbing through the section shows focus on every control.
- No hex colour, no new dependency, no new file.
- `make build` succeeds and the page looks the same built as it does in dev.

## Do not

- Restyle `.set-action`, `.button`, `.status`, the nav, the feedback panel, or
  any other page's section.
- Add an icon font, a CSS framework, an animation library or a web font. `×` and
  `↺` are characters.
- Give the × a fixed position, a floating treatment, or a hover-only appearance
   — it has to be visible and hittable on a touch screen that has no hover.
- Colour-code the × red at rest. It is red when it is armed; before that it is
  as quiet as everything else in the row.
- Add a count, a badge or a dot anywhere.
- Change the wording, the markup's meaning, or any behaviour from chunks 02
  and 03.

## What the user sees

**The last chunk, and the one that makes the list worth clearing.** Everything
already worked; now it is comfortable.

- **The × and the ↺ are big enough to hit with a thumb**, unlike the small Edit
  and Delete on a set row — that difference is deliberate, and it is the arming
  that keeps a close from happening by accident.
- **Arming moves nothing.** `×` and `Sure?` occupy the same space, so the second
  tap lands where the first one did.
- **Armed looks armed**, in the same red-and-boxed language the set rows already
  use, in both light and dark.
- **A closed note recedes** without becoming unreadable, and its ↺ stays bright.
- **The toggle looks like a view switch, not a button that does something**, and
  looks pressed while closed notes are showing.
- **Nothing animates.** A note closes and it is gone; the next tap is available
  immediately.
