# 06 — Ending and discarding a session

**Goal:** close out a finished workout, and get rid of one that was left running
by mistake.

Needs chunk 03.8. Independent of chunk 05.

> **Superseded in one respect.** Item 4 below, its matching "Done when" bullet
> and its "What the user sees" line say that ending an empty session is allowed
> and files it in history. That is no longer true: `end/` on a session with no
> exercises deletes it and answers 204. See
> [no_empty_sessions](../no_empty_sessions/README.md). Everything else in this
> file still stands, and the original wording is left below as the record of
> what was agreed at the time.

## Read first

- `CurrentSession.jsx` as chunk 03.8 left it
- Chunk [01](01-backend-lifecycle.md) — the `end/` action and what `DELETE` on a
  session does

## Build

1. **End session** — a large button at the bottom of the active session, after
   the "Completed exercises" section and outside it, well clear of `Log set`.

2. **Confirm in place.** Tapping it reveals "End this session?" with **Confirm**
   and **Cancel** in its place; Cancel puts the button back. Not a
   `window.confirm` — a blocking native dialog mid-workout is easy to dismiss by
   accident and cannot be styled to a thumb.

3. **Confirm** sends `POST training-sessions/{id}/end/`, then sets `session` to
   `null`, which returns the tab to the empty Start state from chunk 02.0. The
   backend stamps `ended_at`, so the session is now in history with its start
   time, end time and every set already attached — there is nothing further to
   write, and nothing to clear locally (A7).

4. **Ending an empty session** (nothing logged) is allowed and needs no special
   case; it simply lands in history with no exercises, which the sessions list
   and detail page already render.

5. **Discard.** A session resumed from a previous day is usually one the user
   forgot to end. When the open session's `started_at` is not today, show a
   quiet line above the "Record new exercise" section — "Started on 14 Aug. Still training?" — offering
   **Discard**, with the same two-tap confirmation. Discard sends
   `DELETE training-sessions/{id}/`, which cascades to its exercises and sets,
   then returns to the empty state. Word it so it is unmistakably different from
   End: discarding throws the workout away, ending keeps it.

6. Discard is deliberately *not* offered on a session started today — ending is
   the right action for those, and a destructive button next to a constructive
   one, tapped one-handed, is a bad trade.

7. Both requests: disable while in flight, and on failure keep the session on
   screen with a short message. A failed end must never blank the page.

## Done when

- End → Confirm returns the tab to the Start state, and the session appears on
  `/training-sessions` with its sets under `/training-sessions/{id}`.
- The ended session has a non-null `ended_at`; `current/` returns 204 after.
- Cancel leaves the session running and everything logged intact.
- Ending a session with no sets logged works and produces an empty session in
  history.
- With the session's `started_at` backdated in the database, the "started on…"
  line and Discard appear; on a session started today they do not.
- Discard removes the session and its sets entirely — `/training-sessions` no
  longer lists it — and the tab returns to Start.
- A failed end (backend stopped) leaves the active session on screen.

## Do not

- Ask for a session name, notes or a rating on the way out.
- Write `ended_at` from the client — the `end/` action stamps it server-side.
- Navigate away after ending; the tab stays put and shows the Start state.
- Offer Discard on a session started today.

## What the user sees

The workout can be finished — and one left running by mistake can be thrown
away.

- **A large End session button sits at the bottom of the page**, below the list
  of completed exercises and well clear of Log set, so it is not tapped by
  accident while working through sets.
- **Ending takes two taps.** The button is replaced in place by "End this
  session?" with **Confirm** and **Cancel**. Cancel puts the button back and the
  workout carries on untouched, with everything logged still there. No blocking
  browser pop-up appears.
- **Confirming returns the tab to the Start session screen**, ready for the next
  workout. The page does not navigate anywhere.
- **The finished workout is in history immediately** — it appears on
  `/training-sessions` with its start time, its end time and every set attached,
  viewable in full on its detail page.
- **Ending a workout with nothing logged is allowed** and produces an empty
  session in history; there is no nagging about it.
- **A session left running from a previous day says so.** A quiet line appears
  above the form — "Started on 14 Aug. Still training?" — offering **Discard**,
  again on two taps. Discarding deletes that workout and everything logged in it
  outright and returns to the Start screen. The wording makes clear that this
  throws the workout away, where End keeps it.
- **Discard is not offered on a workout started today.** Mid-session, the only
  way out is End, so a destructive button never sits next to a constructive one
  under the same thumb.
- **A failed end leaves the workout on screen** with a short message. The page
  never blanks and nothing logged is lost.

The user is never asked to name the session, rate it, or write notes on the way
out.
