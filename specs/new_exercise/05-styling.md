# 05 — Ergonomics: one box, two places

**Goal:** the add form is comfortable to use in both places it appears — sitting
at a desk on the catalogue page, and one-handed with sweaty hands halfway
through a session — without looking like two different forms or like a different
app.

Last chunk. Do it once 03.0–04 are all in, so both of its homes are there to
size it in.

## Read first

- [frontend-web/src/styles.css](../../frontend-web/src/styles.css) — all of it;
  it is short, and the existing look is the constraint. In particular the
  `/* Exercise catalogue */`, `/* Current session */` and `.log-set` blocks, and
  `.button` / `.change-exercise` for the two button weights already in use
- `AddExerciseForm.jsx`, `ExerciseCatalogue.jsx` and `CurrentSession.jsx` as
  chunks 03.0–04 left them
- [specs/current_session/07-styling.md](../current_session/07-styling.md) — the
  sizing rules the session page already follows; this chunk does not contradict
  them

## Build

CSS work, in the `/* Add an exercise */` section chunk 03.0 opened plus the
placement lines chunk 04 put in `/* Current session */`. Change JSX only where a
class name is genuinely needed, and note each such change.

1. **One component, two sizes, one look.** The form keeps the same structure and
   wording in both places; what differs is the room around it. Do this with the
   section it is in — `.add-exercise` on the catalogue page,
   `.record-set .add-exercise` in the session — rather than with a `variant`
   prop. Layout belongs to where a thing is standing, and the component already
   has three props doing real work.

2. **Thumb sizing inside a session.** In the session, Add is at least 44px tall
   with generous horizontal padding, and the box is the same height as it — this
   is the mid-workout case that chunk 07 of the current-session specs sized
   everything else for. It should read as the sibling of `Log set`, not as
   something borrowed from another page. On the catalogue page it can sit at the
   ordinary `.button` size.

3. **Add is the primary, Cancel is not.** Add uses `.button`; Cancel follows
   `.change-exercise` — outlined, unfilled, quieter, never red. It throws nothing
   away, and there is no destructive control anywhere in this feature (N2), so
   nothing here is ever styled as a warning.

4. **The box.** `font: inherit`, at least 16px so iOS Safari does not zoom on
   focus, and wide enough for a real name — `Romanian deadlift (single leg)` is
   30 characters. Full width of its container on a narrow screen, capped on a
   wide one so it does not stretch across a desktop catalogue page. `type="text"`
   with `autoComplete="off"`, `autoCapitalize="sentences"` and
   `spellCheck={false}`: movement names are not dictionary words and a red
   underline under `Zercher` is noise.

5. **Box and button on one line where there is room**, stacking on a narrow
   screen — a flex row with `flex-wrap` and a gap, not a media query. The label
   stays above the box, as `.log-set` does it.

6. **The three answers sit in one place.** "Added Front squat.", the duplicate
   line and the failure line all appear directly under the form, in the same
   spot, one at a time. Reserve nothing and animate nothing: they replace each
   other, and the page under them may move by a line. What must not happen is
   the answer appearing somewhere the eye is not — it belongs under the button
   that was just tapped, exactly as the log-set failure does.

7. **Colour.** `:root` sets `color-scheme: light dark` and every existing colour
   is `currentColor` mixed with something. Stay in that system — no hex
   literals — and check both schemes. The duplicate line is neutral `.status`
   (03.5); only the failure line is `data-state="error"`.

8. **Narrow screens.** 375px wide with no horizontal scrolling on either page.
   Note that `main` is `text-align: center` with `place-self: center`, and the
   list pages work around it with `text-align: left; display: inline-block` —
   follow that pattern rather than changing `main`.

## Done when

- Both pages work at 375px with no horizontal scroll, in light and dark.
- Focusing the name box on an iPhone does not zoom the page.
- In a session, Add is at least 44px tall and reads as a sibling of `Log set`;
  Cancel is visibly quieter and is not red.
- On the catalogue page the form sits at the ordinary page size, below the
  table, without stretching the box across the whole width on a desktop.
- The answer to a tap — added, already there, or failed — always appears in the
  same place under the form.
- The rest of the app looks exactly as it did: eyeball `/training-sessions`,
  `/settings`, and a session mid-workout, before and after.
- `styles.css` has no hex colour and no new media query beyond what step 5 did
  without one.

## Do not

- Add a CSS framework, a component library, or CSS-in-JS.
- Restyle `.button`, `.status`, `nav`, `main`, `body` or anything else shared.
- Add a `variant` / `size` prop to `AddExerciseForm` (step 1).
- Add animations, transitions or a spinner; `Adding…` on the button is the
  whole loading state.
- Make the form sticky, floating, or an overlay in either place.
- Change any wording — the sentences are chunks 03.0, 03.5 and 04's.

## What the user sees

The same two forms, now sized for where each of them stands.

- **Mid-workout it is thumb-sized.** The box and the Add button are as big as
  everything else on the session page, on one line, and Add sits where Log set
  sits — the hand does not have to learn a new place.
- **On the catalogue page it is a page form**, ordinary sized, below the list,
  not stretched across a desktop screen.
- **Typing a name is not fought.** No autocorrect popup, no red spell-check
  underline under `Zercher`, no zoom when the box is focused on a phone.
- **Cancel never looks dangerous.** It is outlined and quiet; nothing in this
  feature deletes anything, and nothing in it is red except a request that
  actually failed.
- **The answer is always in the same spot**, under the button just tapped —
  whether it added, already existed, or did not go through.
- **It works on a 375px phone**, in light and dark, and the rest of the app looks
  exactly as it did.
