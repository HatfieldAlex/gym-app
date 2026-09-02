# 06 — Ergonomics

**Goal:** make the panel feel like nothing. It should be quick to hit with a
thumb, quick to leave, and impossible to mistake for a page you have navigated
to.

Needs chunks 03.0–04. Almost entirely
[styles.css](../../frontend-web/src/styles.css); touch the components only where
a class name or an attribute is needed for a rule to hang on.

## Read first

- The `/* Feedback marker and panel */` section as the earlier chunks left it
- The top of [styles.css](../../frontend-web/src/styles.css) — `:root {
  color-scheme: light dark; }`, the `nav` flex row, `.button`, `.status`
- [specs/current_session/07-styling.md](../current_session/07-styling.md) — the
  same job for the other feature; keep the two consistent rather than inventing
  a second style

## Build

1. **The marker is a thumb target.** At least 44×44 CSS pixels of tappable area,
   sitting at the end of the nav row without pushing the links around or
   changing the nav's height. On a narrow screen the links already crowd the
   row — the marker must not be what makes it wrap or scroll. Give it a visible
   `:focus-visible` ring and a pressed/active state, and make `aria-expanded`
   visible in the styling (`nav .feedback-marker[aria-expanded="true"]`) so it
   reads as on while the panel is open.

2. **The panel is anchored, not centred.** It hangs from the marker, just below
   the nav, `position: absolute` inside a `position: relative` wrapper so the
   page below never reflows (chunk 03.0 required this; make sure the final rules
   keep it). Give it a `z-index` above page content, a solid `Canvas`
   background, a thin `color-mix` border, a small radius and a soft shadow — it
   must read as floating over the page, not as part of it.

3. **Two widths.** On a phone (under ~480px) it is effectively full width, inset
   a little from both edges, so the textarea is wide enough to type into. Above
   that it is a fixed, modest width — around 22rem — right-aligned to the
   marker. Never wider than the viewport, and never off the right edge.

4. **Nothing important is covered.** The nav stays visible and tappable above
   it. On a short screen (a phone in landscape) the panel must not run off the
   bottom: cap its height and let it scroll internally rather than growing.

5. **The textarea is the panel.** It is the biggest thing in it, at least three
   rows, full width, `font: inherit`, `resize: vertical` only, with a comfortable
   line height. Nothing above it should be big enough to compete — the heading
   is small, the kind row is small, the path line is smallest.

6. **The buttons.** Send is the primary and sits where a thumb reaches — the
   bottom-right of the panel; Close is quieter beside it. Both at least 44px
   tall. Reuse `.button` rather than defining a parallel button.

7. **The kind row is compact**, three small pills on one line at any width, the
   selected one clearly marked by more than colour alone (weight or a border),
   so it is legible in both schemes and to a colour-blind reader.

8. **Both colour schemes, no hex.** `currentColor`, `color-mix` and the system
   keywords (`Canvas`, `CanvasText`) only, as the rest of the file does. Check
   the panel in light and dark.

9. **Motion, if any, is small and optional.** At most a quick fade or a few
   pixels of movement on open — under 150ms — and wrapped in
   `@media (prefers-reduced-motion: no-preference)`. A panel that has to animate
   before it can be typed into is slower than one that just appears.

## Done when

- On a 375px-wide viewport: the nav still fits on one line, the marker is easy
  to hit with a thumb, and the panel opens full-width without sideways scroll.
- On a desktop width, the panel is a modest box hanging under the marker at the
  right, not a centred dialog and not full width.
- Opening and closing it never moves, scrolls or reflows the page underneath, at
  either width, mid-scroll.
- In landscape on a phone-sized viewport, the panel fits on screen; a long draft
  scrolls inside it and the buttons stay reachable.
- Light and dark both read correctly: the panel is opaque against page content,
  the border and the selected kind are visible in both.
- Keyboard focus is visible on the marker, the kind row, the textarea and both
  buttons.
- With reduced motion requested, the panel appears instantly.
- No hex colour and no new dependency has entered the file.

## Do not

- Add an icon font, a CSS framework, an animation library, or a web font.
- Restyle the nav links, `.button`, `.status`, or any other page's section.
- Introduce a backdrop, a blur layer, or a scroll lock (B4).
- Make the marker float over the page as a fixed bubble, or move it out of the
  nav.
- Add a badge, a dot, or a count on the marker.

## What the user sees

**The last chunk, and the one that decides whether the feature gets used.**
Everything already worked; now it is comfortable.

- **The 💡 is easy to hit with a thumb** without crowding the nav or making it
  wrap on a phone, and it visibly lights up while its panel is open.
- **The panel appears over the page, anchored under the marker** — full width on
  a phone, a small box on a desktop — and reads as floating, not as a screen you
  have arrived at. The workout behind it never moves.
- **The box you type into is the biggest thing in it.** The heading, the kind
  pills and the path line stay out of the way.
- **Send is where a thumb lands**, and both buttons are big enough to hit
  mid-set with sweaty hands.
- **It looks right in light and dark**, and every control shows where the
  keyboard is.
- **It appears immediately** — no animation to wait out, and none at all if the
  device asks for reduced motion.
