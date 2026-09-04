# 03 — Open by default, and Show closed

**Goal:** the list becomes what is still outstanding. Closed notes drop out of
it, and a **Show closed** toggle brings them back where they belong.

Needs chunk 02 — it is what makes a note closed in the first place, and ↺ is
what keeps hiding one from being a trap. Frontend only, and almost all of it in
`LoggedNotes`.

## Read first

- [Settings.jsx](../../frontend-web/src/pages/Settings.jsx) as chunk 02 left it
- [TrainingSessions.jsx](../../frontend-web/src/pages/TrainingSessions.jsx) —
  the app's plain list page and its empty state, for the register the new empty
  states have to match
- [00-context.md](00-context.md) — C6, C10, C11

## Build

### 1. The filter

One `showClosed` state in `LoggedNotes`, `false` on mount, held only for as long
as the page is (no `localStorage`, no URL parameter, no memory across visits).

The list renders `notes` filtered to `resolved_at === null`, unless `showClosed`,
in which case it renders all of them. Filter, never sort: the API's order is the
order, and a closed note un-hidden reappears in the position it always had
(C10). Nothing here fetches — every note is already loaded (C6).

### 2. The toggle

A `<button type="button">` above the list, under the **Your notes** heading,
reading **Show closed** when closed notes are hidden and **Hide closed** when
they are not, with `aria-pressed={showClosed}`.

It renders **only when the loaded list holds at least one closed note** (C11).
On a fresh account, and until something has been closed, there is nothing to
reveal and no control.

That means the toggle appears the moment the first note is closed — including
the moment the user closes it, one row below. That is the answer to "where did
it go", and it is why the toggle sits above the list rather than beneath it:
appearing there moves nothing under the thumb that just tapped.

No count, no "(3)", no badge. The toggle says what it does and nothing about
how much there is.

### 3. Closing, now that closed notes are hidden

Nothing about the act changes. When the server confirms a close and `showClosed`
is false, that note simply leaves the list — no animation, no gap left behind,
no "closed" line where it was, no undo prompt. The ↺ behind the toggle is the
undo (C5), and the toggle appearing is the signpost.

The armed/busy/failure state from chunk 02 must not be left pointing at a note
that is no longer rendered: clear `armed` and `busy` on success, as 02 already
does. A failure leaves the note on screen, so its message still has somewhere to
go.

### 4. The three empty states

The section must never look broken, and there are three ways for it to be empty
now:

| When | What it says |
|------|--------------|
| no notes at all | **"No notes yet."** — unchanged, and the toggle is absent |
| notes exist, all of them closed, closed hidden | **"Nothing open."**, with the toggle right there above it |
| showing closed and there are none | cannot happen — the toggle only exists when there is at least one |

Both messages are `<p className="status">`, in place of the list, as the empty
state already is. Keep the flat register of "No notes yet."; this is not a
congratulation.

## Done when

Signed in, on Settings:

- With several notes, some closed in chunk 02: only the open ones are listed,
  newest first, and none of the closed ones is anywhere on screen.
- **Show closed** sits under the heading. Tapping it brings the closed ones
  back, interleaved in date order exactly where they were, each labelled
  **Closed** with its ↺. The button now reads **Hide closed**.
- Tapping it again hides them. The open notes never move, in either direction.
- With nothing closed, there is no toggle at all.
- Closing a note while closed are hidden: it leaves the list on the server's
  answer, and the toggle appears if it was not there. **Show closed** finds it,
  and ↺ puts it back in the list.
- Closing the last open note leaves **"Nothing open."** and the toggle.
- On a brand-new account with no notes: **"No notes yet."**, no toggle, nothing
  that looks broken.
- Reloading the page always comes back to open-only, whatever the toggle was
  set to.
- With the backend stopped, the section still shows the standard error line and
  the buttons above it still work.
- Nothing sideways-scrolls at 375px.

## Do not

- Filter on the server, or add a query parameter to the list request (C6).
- Refetch, or reload the list when the toggle flips — everything is already in
  memory.
- Sort, group, or put closed notes in a section of their own (C10).
- Persist the toggle in `localStorage`, the URL, or anything else.
- Put a count, a badge or a dot on the toggle, on the heading, or on the 💡
  marker in the nav.
- Animate the removal, or leave a placeholder where a closed note was.
- Add an undo prompt, a toast or a snackbar. ↺ is the undo.
- Hide anything a user cannot get back to.
- Touch the backend, `FeedbackMarker.jsx`, `Nav.jsx`, or any other page.

## What the user sees

**The list finally gets shorter.** "Your notes" now shows what is still
outstanding: close a note and it goes, and the list is one shorter than it was.
That is the whole iteration, arriving.

Nothing is lost, and it is obvious that nothing is lost — **Show closed**
appears under the heading the moment there is anything behind it, brings every
closed note back in its own place in the list, and each one still has its ↺.

With everything dealt with, the section reads **"Nothing open."** instead of
going blank, and the toggle beside it says where the rest went. With nothing
ever written, it still reads "No notes yet." and shows no controls at all.
