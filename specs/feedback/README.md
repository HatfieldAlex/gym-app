# Feedback capture — build specs

A way to log an idea, an annoyance or a bug from wherever you are in the app,
without leaving the page. Split into chunks small enough to hand to an AI one at
a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [The note](01-backend-model.md) — new `feedback` app, `FeedbackNote`, admin, migration | `backend/` | — |
| 02 | [The endpoint](02-backend-api.md) — serializer, create + list viewset, route, tests | `backend/` | 01 |
| 03.0 | [The marker and the panel](03.0-marker-and-panel.md) — 💡 in the top row; opens, dismisses, empty | `Nav.jsx`, new component, `styles.css` | — |
| 03.5 | [The composer](03.5-composer.md) — textarea, Send, the POST, the three outcomes, the surviving draft | `FeedbackMarker.jsx` | 02, 03.0 |
| 04 | [What the note carries](04-what-the-note-carries.md) — the page it was written on, and idea / bug / other | `FeedbackMarker.jsx` | 03.5 |
| 05 | [Reading them back](05-logged-notes.md) — "Your notes" on Settings | `Settings.jsx` | 02 |
| 06 | [Ergonomics](06-styling.md) — thumb targets, anchoring, both schemes | `styles.css` | 03.0–04 |

01 is the only chunk with a migration, and 02 the only one with tests — it is
the only contract that cannot be checked from the screen. 03.0 depends on
neither backend chunk and can be built in parallel with them; 05 needs only 02
and can be built any time after it.

The order of the frontend chunks is deliberate. 03.0 builds the way *in* and the
way *out* with nothing inside, because that is the part the whole feature rests
on: if opening the panel costs the user their place in the workout, no form
inside it can make up for that. Only once it opens and dismisses cleanly does
03.5 put something in it worth sending. 04 then adds everything the note records
*without the user typing it*, which is a separate idea from the note itself and
fails in its own way — a tag row that steals focus or a captured path that turns
out to be the wrong page are both invisible while 03.5 is being built.

## The interaction, in one place

1. On a page, using the app normally. 2. An idea arrives. 3. One tap on the
marker. 4. A panel appears over the page — dismissible with Escape, a tap
outside, or the marker again. 5. Type it, Send. 6. Panel closes, and you are
exactly where you were.

Every chunk serves step 4 costing nothing. A note that lands in the database at
the price of the user's place in their workout is a failure, not a trade.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **A feedback page, route or nav link.** The panel is the entry point, and it
  changes no URL (B4). "Your notes" in chunk 05 is a section on Settings, not a
  destination the flow sends anyone to.
- **Editing, deleting or resolving a note from the app.** Triage is the Django
  admin (B2). Chunk 01 gives the admin the columns and the bulk actions for it.
- **Status, replies or notifications back to the writer.** A note is filed, not
  submitted to anyone.
- **Screenshots, attachments, console logs, user-agent or device capture** (B8).
  Chunk 04 records the in-app path and nothing else.
- **Offline queueing or a local draft store.** The draft survives closing,
  reopening and navigating because it lives above `<Routes>` (B6); it does not
  survive a page reload, and no chunk makes it (B5).
- **GitHub issues, email, Slack, webhooks.** Nothing leaves the database.
- **Voting, priorities, severities, tags, assignees, due dates.** `kind` is
  three options with a working default and is as far as this goes (B10).
- **A count badge, unread marker or nag on the icon.** The marker means "log
  something", always, and says nothing else.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the feature, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–06 are all in is the sum of the "What the user sees"
sections in those chunks: a 💡 at the end of the top row on every signed-in
screen that opens a small panel over whatever they are doing, takes a sentence,
tags it and remembers which screen it came from, sends it in one tap and gets
out of the way — with the half-written ones kept safe until they are sent, and
all of them listed under Settings afterwards.
