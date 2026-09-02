# The Exercise Zone — build specs

Recording a movement stops being a section on a page and becomes a place you go.
One prominent button opens a screen that is about one exercise: what you are
about to do, and what you did the last three times you did it.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [Exercise history endpoint](01-backend-history.md) — `performed-exercises/history/`, serializer, tests | `backend/` | — |
| 02 | [The zone](02-the-zone.md) — the button, the takeover, the chooser inside it, the way out | `CurrentSession.jsx` | — |
| 03 | [Last time, beside this time](03-last-time.md) — the paired set list | `CurrentSession.jsx` | 01, 02 |
| 04 | [Earlier sessions](04-earlier-sessions.md) — the two before that, one line each | `CurrentSession.jsx` | 03 |
| 05 | [Styling](05-styling.md) — the zone as a place, the paired list at 375px | `styles.css` | 02–04 |

01 is the only backend chunk. It needs **no migration**: every column it reads
already exists, and the endpoint is a new way of asking about rows the app is
already writing.

02 is deliberately first among the frontend chunks and deliberately empty of
history. It moves the existing recording setup — the chooser, the weight and
reps boxes, Log set, Log exercise, Change exercise, the list of sets logged so
far — into the zone **unchanged**, and builds the way in and the way out around
it. If that lands wrong, nothing put inside the zone afterwards can save it. Only
once you can get in, record a set exactly as you could before, and get out, does
03 add the thing the zone exists for.

03 and 04 are separate because they fail differently. 03 is a layout that has to
survive a 375px screen with two columns of numbers and a pair of buttons in each
row; 04 is three lines of text that either name the right sessions or do not.

## The interaction, in one place

1. Mid-session, on the Current Session tab. 2. One tap on **Record new
exercise**. 3. The page becomes the zone — nav bar still there above it. 4. Pick
the movement. 5. The screen fills in: the boxes, and underneath them what you
did last time set for set, and the two sessions before that. 6. Log sets. 7.
**Log exercise** closes the zone and puts you back on the session, with the
movement in Completed exercises.

## What is actually new

Almost none of the recording machinery. Chunks 03.0–05 of
[current_session](../current_session/README.md) built all of it, and it moves
into the zone as it stands. Two things are genuinely new:

- **The zone as a place.** A single prominent button, and a screen that is about
  one movement and nothing else while it is open.
- **Your own history, at the moment you need it.** What you lifted last time,
  beside what you are lifting now, without leaving the workout to go and look.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **Pre-filling weight and reps from last time** (Z6). The history is there to
  read; every number logged is one the user typed. Decided, not deferred.
- **Progression suggestions, "add 2.5 kg", PR badges, volume or 1RM maths.** The
  zone shows what happened. It does not have an opinion about it.
- **Charts, trends or a graph of the movement over time.** Four sessions of
  numbers, as numbers.
- **Editing history.** Last time's sets are read-only in the zone. Fixing an old
  set is the session detail page's job, not this screen's.
- **Rest timers, plate maths, notes on a set.** Still not asked for.
- **`distance_m`, `duration_s`, `rpe`.** Unchanged from current_session: this
  tab logs weight and reps (A4).
- **A route or a URL for the zone** (Z4). It is a state of
  `/current-session`, not a destination. No deep link, no browser-history entry.
- **Reading the zone anywhere but Current Session.** The endpoint chunk 01 adds
  is general enough to feed an exercise-detail history page later; no chunk here
  builds one.
- **Caching or prefetching history for every catalogue exercise.** One request
  per exercise picked (Z5).
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the feature, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–05 are all in is the sum of the "What the user sees"
sections in those chunks: a Current Session tab whose main action is one
unmissable button, and behind it a screen that shows them what they did last
time, set for set, next to what they are doing now.
