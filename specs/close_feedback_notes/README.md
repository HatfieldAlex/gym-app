# Closing feedback notes — build specs

"Your notes" on Settings gains an open/closed state, so the list can be cleared
down without leaving the app.

It surfaces the `resolved_at` column [the model already
has](../../backend/feedback/models.py) rather than inventing a second notion of
"dealt with": null means open, a timestamp means closed, and it is the **same**
column the Django admin's **Mark resolved** writes. Closing a note in the app
and resolving it in admin triage are one act, visible in both places, and the
CSV export does not move.

Nothing is deleted, by any chunk, at any layer.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [A note can be closed, and reopened](01-backend-close-and-reopen.md) — `resolved_at` readable, `close/` and `reopen/` actions, the tests | `backend/feedback/` | — |
| 02 | [Closing and reopening from the list](02-closing-and-reopening.md) — the × and its `Sure?`, the ↺, the **Closed** label, the list as page state | `Settings.jsx`, `styles.css` | 01 |
| 03 | [Open by default, and Show closed](03-open-by-default.md) — the filter, the toggle, the two empty states | `Settings.jsx` | 02 |
| 04 | [Ergonomics](04-styling.md) — thumb targets, the armed treatment, the closed row, both schemes | `styles.css` | 02, 03 |

01 is the only chunk with tests — it is the only contract that cannot be checked
from the screen. **No chunk has a migration:** the column, the admin's actions
and the export's `resolved_at` column all exist already, so
`makemigrations --check` must stay quiet from beginning to end and
`docs/schema.dbml` must not move.

## Why this order

**The API first (01), and it changes nothing anyone can see.** `resolved_at`
becomes readable and two named actions set it, while the frontend carries on
ignoring the extra field. It is checkable on its own with `curl` and the admin
side by side, which is the cheapest place to prove the thing this iteration
turns on: that the app's "close" and the admin's "resolve" are the same column
and not merely near each other.

**Then the acts, before the hiding (02, then 03).** This is the ordering the
directory turns on, and the tempting alternative is worse. Chunk 02 gives every
note a control — × on the open ones, ↺ on the closed — with *nothing hidden*, so
anything closed while reviewing it is one visible tap from being open again.
Only once reopening exists does 03 let a closed note leave the list. The other
way round — filter first, controls second — would need a closed note conjured in
the admin to have anything to look at, and would spend a chunk with a one-way
door in it.

02 is the largest chunk and does not split further. The arming, the ×, the ↺ and
the local list state are one idea — *a row's state can be changed from here* —
and any part of it alone strands the rest: arming with nothing to confirm,
a close with no way back, a local copy nothing writes to.

**04 last, and only styling.** Two things make it its own chunk rather than a
few lines folded into 02. It carries a deliberate departure — the note's
controls are 44px thumb targets while `.set-action`'s Edit and Delete next door
are deliberately small (C13) — and that is a judgement worth reviewing on its
own. And an armed control that resizes the row it lives in is a bug you only see
with a thumb on a phone, not in the chunk that wrote it.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **Real deletion.** Nothing leaves the database, ever (C5). Closing is not a
  soft delete; deleting a note is still the admin's, exactly as before.
- **Editing a note's body or kind** from the app, or any control that could. The
  actions write one column and nothing else (C3).
- **Bulk anything** — close all, select-many, "clear the lot" (C12). The admin's
  checkbox column already does that.
- **Severity, replies, notifications, assignees, due dates.** B2's capture half
  stands: a note is filed, not submitted to anyone.
- **A count badge, unread marker or nag on the 💡 marker**, or on the Settings
  nav link, or on the toggle. The marker means "log something", always.
- **Changing what `resolved_at` means in the admin**, or the admin at all.
  `is_open`, `mark_resolved` and `mark_unresolved` are untouched and keep
  working — from the other end of the same column.
- **The CSV export.** `tables/feedback_notes.csv` already carries `resolved_at`
  as its seventh column and neither the header nor the rows change.
- **Server-side filtering.** `GET feedback-notes/` still returns every note and
  gains no query parameter (C6); which ones are on screen is the client's.
- **Capture.** `FeedbackMarker.jsx`, the composer, the panel, the draft — no
  chunk opens any of them.
- **Remembering the toggle** across visits, in `localStorage` or the URL. The
  list opens on what is outstanding, every time.
- **`frontend-mobile/`.** Empty directory, untouched.

## What this reverses

Two decisions already written down say the opposite of this iteration, and are
being overturned on purpose: **B2** of
[feedback/00-context.md](../feedback/00-context.md) ("no status the writer
sees") and **step 6** of
[feedback/05-logged-notes.md](../feedback/05-logged-notes.md) ("Read-only. No
edit, no delete, no resolve, no filter, no search"). Those files are left as
they are; [00-context.md](00-context.md) carries the record of what is
overturned, what survives, and why. Read that section before deciding this
directory contradicts a live decision — it is deliberate, and the human made it.

## What the user sees

Nothing directly. This is an index for whoever is building the iteration, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–04 are all in is the sum of the "What the user sees"
sections in those chunks: a list of notes that is what is still outstanding
rather than everything ever written, cleared down a note at a time with a thumb,
with nothing thrown away and everything one tap from coming back.
