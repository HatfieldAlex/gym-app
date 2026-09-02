# 03 — Last time, beside this time

**Goal:** underneath the form, the sets of the last session you did this
movement, lined up set for set against the ones you are logging now.

Needs chunks 01 and 02. This is the thing the zone exists for.

## Read first

- `CurrentSession.jsx` as chunk 02 left it — especially `SetRow`, `SetList` and
  `setSummary`
- [01-backend-history.md](01-backend-history.md) — the response shape
- [00-context.md](00-context.md) — Z5, Z6, Z7, and the **Vocabulary** section:
  "this session", "last time" and "earlier" mean specific things below

## Build

### 1. Fetch it when the movement is picked

One `useLoad`, keyed on the held exercise (Z5):

```
api.get('performed-exercises/history/'
        + `?exercise_definition=${heldId}`
        + `&exclude_session=${session.id}`
        + '&limit=3')
```

`exclude_session` is not optional here. Without it the running workout is its own
"last time" the moment a second set goes in, and the two columns show the same
numbers twice.

With no exercise held there is nothing to ask, so the loader resolves `null`
rather than firing a request. It refetches when the held exercise changes and at
no other time — **not** after logging a set. The endpoint's answer cannot have
changed: the only new sets are this session's, and those are excluded from it and
already on screen from `session` state.

The response is a bare array, newest first. **Last time** is element `[0]`;
elements `[1]` and `[2]` are chunk 04's problem — ignore them here.

### 2. Where it goes

**Below** the weight and reps boxes and **below** Log set — never above them.
Reason, and it is not aesthetic: logging is one glance and one tap, and this
block sits between the boxes and the growing list without ever moving, so the
fifth set is logged from exactly where the first was. The same rule chunk 07 of
current_session set for the held list applies to everything under the form.

It replaces the plain `SetList` of held sets that chunk 02 moved in. Same sets,
same rows, same Edit and Delete — now with a column beside them.

### 3. The paired list

**One row per set number**, not two lists side by side. Set 3 is one row that
happens to know two things:

```
                Last time        This session
                12 Aug
     1          60 kg x 8        60 kg x 8      Edit  Delete
     2          60 kg x 8        60 kg x 8      Edit  Delete
     3          62.5 kg x 6      —
```

- The row count is `max(lastTime.length, thisSession.length)` — whichever ran
  longer. A set number with no counterpart shows an em dash on that side.
- Rows run past last time when you out-set it, and past this session when you
  have not caught up yet. Both are information: "one more to go" is the second
  most useful thing this screen says.
- Two column headers, and the date under "Last time" — the block is meaningless
  without knowing when last time was.
- A set reads through `setSummary` on both sides. One phrasing, one function; a
  bodyweight set still says "8 reps" in either column.

### 4. This session's column keeps its controls; last time's has none

Edit and Delete stay exactly where they are — on this session's sets, doing what
`useSetRows` already does. **Last time's sets are read-only in the zone.** No
edit, no delete, no tap target at all. Fixing a set from a previous workout is
the session detail page's job; a screen for logging is not a screen for
rewriting history, and a mis-tap here would silently alter a finished session.

Reuse `SetRow` — give it an optional prop for the last-time cell rather than
writing a second row component. It is still the row that renders Completed
exercises below, which passes nothing and is unaffected.

### 5. The three states before there is a comparison

All three are ordinary, and none of them is an error:

- **Loading.** Quiet, and it must not move the form or the boxes. Reserve the
  space or say a word; do not push Log set down the screen when the response
  lands.
- **Never done before.** `[]` from the endpoint. Say so plainly — *"First time —
  nothing recorded for this exercise yet."* — and render this session's sets on
  their own, in one column. A first workout is not a failure to have a history.
- **The request failed.** A short line in place of the block, in the house style
  (`<p className="status" data-state="error">`). **Logging must still work.**
  History is a nicety; the form above it is the feature. A failed fetch never
  disables Log set, never blanks the zone, and never touches `<Status>`, which
  speaks for the session load.

### 6. Style

Enough for two columns to read as two columns and for the headers to sit over
them. The 375px problem — two sets of numbers plus Edit and Delete across a
phone — is chunk 05's, and it is the hard part of chunk 05. Do not solve it
here, and do not make it worse by adding a third column.

## Done when

- Picking a movement trained before shows, under the form, its previous
  session's sets dated and lined up against this session's.
- Picking a movement fires **one** request. Logging five sets fires none.
- Sets logged now appear in the right-hand column immediately, as they do today.
- Row 4 appears with an em dash on the left when this session goes one set past
  last time; the last row has an em dash on the right when it has not caught up.
- Last time's sets have no Edit and no Delete; this session's have both, and
  both still work.
- A movement never trained before says so and shows one column.
- With the history endpoint returning 500, the zone still logs sets normally and
  shows one short error line.
- The current session never appears as its own "last time", even after several
  sets.
- A movement trained in a **backdated** session that was *typed* most recently
  is not shown as last time unless it was also *trained* most recently.
- Completed exercises below is unchanged — no extra column there.

## Do not

- Refetch history after logging, editing or deleting a set (Z5).
- Omit `exclude_session`.
- Make last time's sets editable, deletable or tappable.
- Prefill weight or reps from them (Z6).
- Compute anything: no deltas, no "+2.5 kg", no arrows, no colour for better or
  worse, no totals, no volume, no PR marker. Two columns of numbers and the
  reader's own judgement.
- Show sessions `[1]` and `[2]` from the response (chunk 04).
- Write a second row component, a second `setSummary`, or a second way to say
  "60 kg x 8".
- Put the block above Log set, or let it move the form when it loads.
- Let a failed history fetch disable logging or reach `<Status>`.

## What the user sees

The zone starts earning the screen it took.

- **You can see what you did last time, without leaving the workout.** Pick a
  movement and underneath the boxes are last session's sets, dated, next to the
  ones you are logging now.
- **They line up set for set.** Set 2 sits beside set 2. You are looking at one
  row and one question: did I match it?
- **It tells you how far through you are.** Three sets last time and two so far
  today, and the third row is sitting there with a dash in it. Go past last time
  and the extra rows keep coming.
- **Last time cannot be touched.** The Edit and Delete you know are on today's
  sets only. Nothing on this screen can change a workout you have already
  finished.
- **The form never moves.** The comparison is underneath the boxes, so Log set is
  in the same place for the fifth set as for the first, whether or not you have
  a history.
- **A first go says so.** "First time — nothing recorded for this exercise yet",
  and the screen gets on with letting you record one.
- **If the history will not load, you still train.** One quiet line where the
  comparison would be, and every box and button above it works exactly as
  normal.
- **No opinions.** The app shows you the numbers. It does not tell you what to
  lift, congratulate you, or mark anything red.

What the user cannot see yet: anything before last time. The two sessions behind
it arrive in chunk 04.
