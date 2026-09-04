# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## The intent

"Your notes" on Settings is a list that only grows. Every thought filed from the
💡 panel lands in it and stays there for good, because the one way to mark a
note dealt with is the Django admin, on a laptop, later. The list is where notes
go to be forgotten.

**This iteration gives a note an open/closed state that the writer can set from
the app.** Not a new one: the `FeedbackNote` model has carried
`resolved_at` — "null means the note is still outstanding" — since the day it
was written, and the admin's **Mark selected notes resolved** already writes it.
This iteration surfaces that same column.

So closing a note in the app and resolving it in admin triage are **one act on
one column**, visible in both places, in either direction. There is no second
notion of "dealt with" anywhere in this feature, and building one would be the
main way to get this wrong.

Nothing is deleted. A closed note is still in the database, still in the CSV
export, still in the admin, and one tap from being open again.

## The reversal, stated head-on

Two things already written down say the opposite of this iteration. They are
being overturned on purpose, by the human, and the old files are **left as they
were** — this section is the record.

- **[feedback/00-context.md](../feedback/00-context.md), assumption B2** —
  "there is no status the writer sees; triage — reading, resolving, deleting —
  happens in the Django admin."
- **[feedback/05-logged-notes.md](../feedback/05-logged-notes.md), step 6** —
  "Read-only. No edit, no delete, no resolve, no filter, no search."

**What is overturned:** the writer sees the status and sets it, on the list, on
their phone. That is C1 and C2 below, and the whole of chunks 02 and 03.

**What survives untouched:** the rest of B2, which is about *capture*. A note is
still free text plus context the app fills in itself. There is still no title,
no severity, no assignee, no reply, no notification, and no editing a note's
body or kind from anywhere but the admin. **No chunk here touches
`FeedbackMarker.jsx` or the composer**; the way a thought gets into the database
is exactly as it was.

A builder who reads the old files and this one at the same time should come away
with: capture was right and is unchanged; the read-only list was the part that
did not survive contact with a list forty notes long.

## The stack

Unchanged from [feedback/00-context.md](../feedback/00-context.md) — Django 6.1
+ DRF over SQLite in `backend/`, a plain React + Vite SPA in `frontend-web/`,
session-cookie auth, every viewset scoped to `self.request.user`. Read that
file's **The stack** and **Existing conventions** sections; they are not
repeated here and they still apply, in particular:

- fetch with `useLoad`, render `<Status state={state} error={error} />`;
  a *mutation* keeps its own `busy` / `failed` state and never goes through
  `useLoad`;
- every request through `api` in
  [api.js](../../frontend-web/src/api.js) — never a bare `fetch`;
- one styles section per page or component, at the bottom of
  [styles.css](../../frontend-web/src/styles.css); `currentColor` and
  `color-mix` only, no hex;
- comments say *why*, sparsely.

`make test` runs the Django suite; `make run` brings both servers up. There is
**no frontend test framework** — Vite and nothing else — so the backend chunk
carries tests and the frontend chunks are checked on screen.

## What already exists — read it before changing it

| What | Where, today |
|------|--------------|
| The column, `null` = open | [feedback/models.py](../../backend/feedback/models.py) `resolved_at` |
| The admin's `is_open` tick, `mark_resolved`, `mark_unresolved` | [feedback/admin.py](../../backend/feedback/admin.py) |
| The five public fields; `resolved_at` absent both ways | [feedback/serializers.py](../../backend/feedback/serializers.py) |
| Create + list, scoped to the requester, no detail route | [feedback/views.py](../../backend/feedback/views.py) |
| `tables/feedback_notes.csv`, `resolved_at` already its last column | [dataexport/export.py](../../backend/dataexport/export.py) `FEEDBACK_NOTES_HEADER` |
| The list on Settings: `LoggedNotes()`, `Note({ note })` | [Settings.jsx](../../frontend-web/src/pages/Settings.jsx) |
| `.notes-section`, `.notes`, `.note`, `.note-body`, `.note-meta` | [styles.css](../../frontend-web/src/styles.css), the `/* Your notes */` section |
| The arm/disarm pattern being copied | [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — the Delete button in `SetRow`, and the `pointerdown` effect in `useSetRows` |
| Loading into page state, then mutating that state | `CurrentSession.jsx` — `useLoad` → `useEffect` → `setSession` |

Because the column, the admin and the export column all exist already, **this
iteration adds no migration and no model change.** `makemigrations --check` must
stay quiet, and `docs/schema.dbml` must not move.

## The interaction, in one place

1. Sitting down, out of the gym, on **Settings**. 2. "Your notes" lists what is
still open, newest first. 3. A note has been dealt with: tap its **×**. 4. The
× becomes **Sure?**; anything else touched puts it back. 5. Tap again — the note
closes and drops out of the list. 6. **Show closed** brings the closed ones
back, each labelled and carrying a **↺**. 7. One tap on ↺ and it is open again,
back in the list, no confirmation asked.

## Decisions

The chunks build as though all of these were true, and cite them by number. To
overturn one: rewrite its row, then `grep` the chunks for its number and follow
through.

| # | Decision | Why it holds |
|---|----------|--------------|
| C1 | `resolved_at` is the only bit. `null` is open, a timestamp is closed, and it is the same column the admin's **Mark resolved** writes. Closing in the app and resolving in the admin are one act. | The column exists and already means exactly this. A second "dismissed by the writer" column would mean triaging every note twice and two answers that can disagree. |
| C2 | The writer sees and sets that status. **This reverses B2 and step 6 of [feedback/05](../feedback/05-logged-notes.md)** — see the section above. The rest of B2 stands: capture is untouched, and body and kind are still unwritable from the app. | The list only grows, and the machine that can clear it down is not the one in the gym. Clearing down is the one triage act worth having on the phone; reading, editing and deleting stay the admin's. |
| C3 | Closing and reopening are named detail actions: `POST /api/v1/feedback-notes/<id>/close/` and `POST /api/v1/feedback-notes/<id>/reopen/`, both `@action(detail=True, methods=['post'])`. Not a PATCH, not a DELETE, no query parameter. | It is the shape every other state change in this app already uses — `training-sessions/<id>/end/`, `performed-exercises/<id>/end/`, `exercises/<id>/loading/`. It also keeps body and kind unwritable, and the router builds `/feedback-notes/<pk>/close/` **without** building `/feedback-notes/<pk>/` — verified against the real router — so `test_no_route_exists_for_editing_or_deleting_a_note` passes untouched. |
| C4 | Both actions answer **200** with the serialized note, and a repeat is a no-op: closing a closed note leaves `resolved_at` exactly where it was and still answers 200. Reopening an open one likewise. | Deliberately unlike `end/`'s 400-on-repeat. A session's `ended_at` is a measurement, and moving it would lose data; a note's `resolved_at` is a flag, and the admin can flip it under a list the app is already showing. The user asked for the note to be closed and it is closed — a red error line for that outcome is a lie. The first close time is still never overwritten. |
| C5 | Nothing is ever deleted, by any chunk, at any layer. Closing is not a soft delete and reopening is not an undelete. | The note is the record that the thought was captured (feedback/05). Real deletion stays the admin's, exactly as before. |
| C6 | `GET feedback-notes/` still returns **every** note, open and closed, newest first, and gains no filter, no search and no query parameter. Which notes are on screen is the client's business. | One request, one list, and the toggle in chunk 03 is instant because everything is already there. It also keeps the old spec's "no query parameters on the list" intact. |
| C7 | The loaded list becomes the section's own state — `useLoad` → `useEffect` → `useState`, the move `CurrentSession` already makes with `session` — and the server's answer to a close or a reopen replaces that one note in it. Nothing refetches. | `useLoad` returns no setter, and re-running it puts the whole section back to "Loading…" — so clearing down five notes would flash the section five times. |
| C8 | A note changes on screen when the server has answered, never before. On failure it stays exactly as it was, with an error line under it. | The same rule the set rows keep (A9 in the current-session specs): nothing on screen claims something the database has not agreed to. |
| C9 | Closing is armed and then confirmed on the row itself — **×** becomes **Sure?**, and a touch anywhere else disarms it. Reopening is a single tap with no confirmation. | Asymmetric on purpose: closing takes a note off the screen, reopening puts it back and breaks nothing. The arm/disarm is `SetRow`'s, copied — a native `window.confirm()` appears nowhere in this app and is a modal the page cannot style, place or dismiss. |
| C10 | Order is the API's, always: newest first across open and closed together. Showing closed notes un-hides rows where they already belong; it does not group, section or re-sort. | The list has one order and it is the server's (feedback/05 step 3). A list that re-arranges itself when a toggle flips is a different list, and the reader loses their place in it. |
| C11 | Open is the default view. The **Show closed** toggle appears only when the loaded list actually holds a closed note. | The list's job is what is still outstanding. On a fresh account, and for as long as nothing has been closed, a control that reveals nothing is furniture. |
| C12 | One act, one note. No bulk close, no "close all", no multi-select. | Forty notes closed by one tap is the act you cannot check before making, and undoing it is forty taps. Bulk is what the admin's checkbox column is already for. |
| C13 | The note's × and ↺ are real thumb targets — 44px — unlike `.set-action`'s deliberately small Edit and Delete. | A set row is read mid-set with the controls kept hard to hit by accident; the notes list is read sitting down and its whole point is clearing down quickly. What protects the accidental tap here is C9's arming, not a small button. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it produces
no code and no screen of its own. Every visible change lives in a numbered
chunk.
