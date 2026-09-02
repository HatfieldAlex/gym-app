# 04 — Earlier sessions

**Goal:** under the comparison, the two sessions before last time — one line
each. One session is a target; three is a direction.

Needs chunk 03. Small: no new request, no new state, no new component if the
row helper from 03 fits.

## Read first

- `CurrentSession.jsx` as chunk 03 left it
- [00-context.md](00-context.md) — Z7

## Build

### 1. The data is already here

Chunk 03's `useLoad` asked for three and used the first. Elements `[1]` and
`[2]` of the same response are this chunk. **No second request**, no second
`useLoad`, no change to the URL chunk 03 built.

### 2. One line each, newest first

Under the paired list, a short block headed **Earlier**:

```
Earlier
  5 Aug    60 kg x 8, 60 kg x 8, 60 kg x 7
 29 Jul    57.5 kg x 8, 57.5 kg x 8, 57.5 kg x 8
```

- Date on the left, the session's sets run together on the right, in performed
  order, comma-separated.
- Each set through `setSummary` — the same phrasing as everywhere else on the
  tab.
- One session per line, wrapping if it must. Not a table, not rows, not
  numbered: these are for the corner of the eye, not for reading against.
- Same date format as "Last time" uses, so three dates on one screen do not come
  in two styles.

### 3. When it is not there

- Fewer than two earlier sessions → show only the ones that exist.
- None at all — a movement done exactly once before — → **no "Earlier" heading**.
  An empty section under a full one reads as something failing to load.
- The whole history block already handles never-trained and failed-fetch in
  chunk 03. This chunk adds no new state of its own.

### 4. Quieter than what is above it

Visually subordinate to the comparison: smaller or dimmer, in the tab's existing
`opacity` idiom rather than a new colour. The paired list is what the user came
for; this is context behind it.

## Done when

- A movement trained four or more times shows Last time paired above, then two
  dated lines under **Earlier**, newest first.
- Trained exactly twice before → one line under **Earlier**.
- Trained exactly once before → the comparison, and **no Earlier heading at
  all**.
- Never trained → chunk 03's first-time line, and no Earlier heading.
- The network tab shows **one** history request per movement picked, unchanged
  from chunk 03.
- Nothing under Earlier is tappable, editable or deletable.
- A set with no weight reads "8 reps" here too.

## Do not

- Make a second request, or raise `limit` above 3 (Z7).
- Add "show more", pagination, or a way to reach the full history.
- Render an empty **Earlier** heading.
- Number the sets, or lay them out as rows or a table — one line per session.
- Make anything here tappable, or link out to the session detail page.
- Compute averages, trends, arrows, sparklines or a chart. Numbers, in order.
- Re-word a set: `setSummary`, the same as everywhere else.

## What the user sees

- **Two more sessions, one line each,** under the comparison: the date and what
  was lifted, run together.
- **It shows a direction, not just a target.** Last time is what to match; the
  two lines under it are whether you have been climbing, holding or sliding.
- **It stays out of the way.** Quieter than the comparison above it, one line per
  session, nothing to tap and nothing to open.
- **It is honest about being short.** Done a movement once before and there is no
  "Earlier" at all, rather than an empty heading suggesting something failed.
