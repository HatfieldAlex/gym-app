# 04 — What the note carries

**Goal:** the note records *where* it was written and *what kind* of thing it is
— without adding a step to writing it.

Needs chunk 03.5. Frontend only: both columns already exist (chunk 01) and the
serializer already accepts both (chunk 02).

The rule this chunk is under: neither of these may become something the user has
to fill in (B2, B10). One is filled in by the app, the other is one optional tap
with a working default.

## Read first

- `FeedbackMarker.jsx` as chunk 03.5 left it
- [App.jsx](../../frontend-web/src/App.jsx) — the route paths, which is what
  gets recorded
- `react-router-dom`'s `useLocation`, already a dependency

## Build

1. **The page path, captured on open.** Read `useLocation().pathname` and, when
   the panel opens, snapshot it into state. Send it as `page_path`.

   On open, not on send: the thought belongs to the screen it arrived on. The
   panel survives navigation (B6), so a note started on Current session and sent
   two pages later still says Current session — which is the one the note is
   about.

2. **Show what was captured, quietly.** One small line in the panel — "on
   /current-session" — in the `.status` register, not a field. It is there so the
   writer can see the note is already anchored and does not need to type "on the
   current session page". It is **not editable and has no clear button**.

3. **Truncate to the column.** `page_path` is `max_length=200` (chunk 01). A
   route in this app is far shorter, but a stray long path must not turn a 201
   into a 400: cut it to 200 characters before sending.

4. **Kind: three buttons, one already chosen.** A small row of three —
   **Idea** / **Bug** / **Other** — above or below the textarea, rendered as a
   radio group (`role="radiogroup"` with a group label, or three
   `<input type="radio">` in a `<fieldset>`; either, but it must be reachable
   and announced). **Idea** is selected when the panel opens, and sending
   without touching the row is the normal path (B10).

   Selecting one changes only the selection: it must not submit, close the
   panel, clear the draft, or move focus out of the textarea.

5. **The request grows by two fields** — `api.post('feedback-notes/', { body,
   kind, page_path })`. Nothing else about sending changes.

6. **Both reset with the draft, and only then.** A successful send returns the
   panel to *Idea* and re-snapshots the path on next open. A failed send keeps
   the chosen kind alongside the kept draft, so a retry sends what was meant.

## Done when

- Written on `/current-session`, the note arrives with `page_path:
  "/current-session"`; written on a session detail page, it carries that
  session's full path including the id.
- The panel shows the captured path, and there is no way to type over it.
- Opening the panel on Home, navigating to Training sessions, then sending,
  records `/` — the screen the thought arrived on.
- Sending without touching the kind row stores `idea`; tapping **Bug** first
  stores `bug`; the admin's kind filter (chunk 01) separates them.
- Tapping a kind does not submit the note, close the panel, or take focus out of
  the textarea — a note can be typed, tagged, and sent without the cursor ever
  leaving the box.
- After a successful send, reopening the panel shows an empty box, *Idea*
  selected, and the path of wherever you are now.
- After a failed send, the panel still shows the chosen kind and the typed text.
- The kind row is reachable and operable with the keyboard, and each option is
  announced with a name.

## Do not

- Add a fourth kind, a severity, a priority, or free-text tags (B2).
- Make kind required, or leave it unselected on open.
- Let the path be edited, cleared, or opted out of.
- Capture anything else automatically — no user agent, no screen size, no
  console log, no screenshot, no timings (B8).
- Send the full `window.location.href`. An in-app path is what is wanted; a
  full URL adds the host for nothing.
- Re-snapshot the path on every render, or on send.

## What the user sees

**The note starts knowing more than the user typed, and asks for nothing extra.**

- **A quiet line in the panel says where you are** — "on /current-session" — so
  there is no need to type "on the current session page". It is information, not
  a field: nothing to fill in and nothing to check.
- **Three small buttons — Idea, Bug, Other — with Idea already chosen.** Tapping
  one is optional and takes a moment; ignoring the row entirely is the normal
  way to use the panel, and does the right thing.
- **Tagging never interrupts typing.** Tap **Bug** mid-sentence and the cursor
  stays in the box; nothing submits, nothing closes.
- **Opening on one screen and sending on another still credits the first.** The
  note remembers where the thought arrived, not where you happened to be
  standing when you finished typing it.
- **After a send, everything resets to the easy default**; after a failure,
  nothing you chose is thrown away.
