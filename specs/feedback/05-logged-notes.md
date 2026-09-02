# 05 — Reading them back

**Goal:** somewhere in the app to see what you have logged, so filing a note
feels like putting it somewhere rather than dropping it down a hole.

Needs chunk 02 (the list endpoint). Independent of chunks 03.x and 04 — it can
be built before or after them, and shows whatever exists.

Deliberately not part of the capture flow: this is a page you visit on purpose,
later, out of the gym. Nothing here is reachable from the panel.

## Read first

- [Settings.jsx](../../frontend-web/src/pages/Settings.jsx) — the page this
  lands on
- [TrainingSessions.jsx](../../frontend-web/src/pages/TrainingSessions.jsx) —
  the project's list-page shape: `useLoad`, `<Status>`, an empty state
- [hooks.js](../../frontend-web/src/hooks.js), [api.js](../../frontend-web/src/api.js)

## Build

1. **A section on Settings**, below the Log out button, headed **Your notes**.
   Settings is where the account-level odds and ends live and it is currently
   one button; this belongs there rather than on a route of its own.

2. **Load with `useLoad`** and `api.list('feedback-notes/')` — `api.list`, not
   `api.get`, so a paginated response is flattened the way every other list page
   does it. Render `<Status state={state} error={error} />` for waiting and
   failed; the list only when ready.

3. **One note is one row**: its body, and under or beside it the date and the
   kind, and the page path when there is one. The API already returns them
   newest first (chunk 01's `Meta.ordering`) — **sort nothing**. Format the date
   the way the training-session pages already do rather than inventing a second
   format.

4. **Empty state.** "No notes yet." in the `.status` register, in place of the
   list. This is the common case for a while and must not look broken.

5. **Long bodies stay readable.** A note is free text and can be a paragraph:
   let it wrap, and do not let it stretch the page or scroll sideways at 375px.

6. **Read-only.** No edit, no delete, no resolve, no filter, no search. A note
   is dealt with in the admin (B2); this is a record that the thought was
   captured, not a tracker.

7. Style it in the `/* Feedback marker and panel */` section, or a sibling
   `/* Your notes */` one next to it — one place, either way.

## Done when

- Settings shows **Your notes** under Log out, listing notes newest first with
  body, date, kind and path.
- With none logged, the heading is still there with "No notes yet." under it.
- With the backend stopped, the section shows the standard error line and the
  Log out button above it still works.
- A note logged from the panel appears here after a refresh.
- Another user's notes never appear (chunk 02 scopes this server-side; confirm
  by logging in as a second user).
- A three-paragraph note wraps and reads fine at 375px wide.

## Do not

- Add a `/feedback` or `/notes` route, or a nav link (B4 — the marker is the
  feature's only entry point in the top row).
- Link to this from the panel, or open it after sending.
- Add editing, deleting, resolving, filtering, searching, sorting controls, or
  a count badge on the marker.
- Poll for new notes, or refresh the list on any interval.

## What the user sees

**Settings gains a "Your notes" section**: everything logged, newest first, each
with the date it was written, whether it was an idea or a bug, and the screen it
came from.

It changes nothing about capture — the panel does not link here, and nothing
sends you here after a note is sent. What it changes is trust: after logging a
thought and forgetting it, there is somewhere to confirm it was kept. Before
anything is logged the section says "No notes yet." and looks deliberate rather
than broken.

Notes cannot be edited or deleted from here.
