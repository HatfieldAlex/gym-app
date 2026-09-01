# Current Session — build specs

The "Current Session" tab, split into chunks small enough to hand to an AI one at
a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [Backend session lifecycle](01-backend-lifecycle.md) — `started_at`/`ended_at`, `current/`, `end/` | `backend/` | — |
| 02.0 | [Page states](02.0-page-states.md) — empty vs. active, Start, resume, the two sections | `CurrentSession.jsx` | 01 |
| 02.1 | [Live list](02.1-live-list.md) — "Completed exercises": what has been logged so far | `CurrentSession.jsx` | 02.0 |
| 03.0 | [Pick and hold an exercise](03.0-pick-exercise.md) — the catalogue dropdown, and holding what it chose | `CurrentSession.jsx` | 02.1 |
| 03.2 | [The sets of the held exercise](03.2-sets-of-held-exercise.md) — them listed under its name | `CurrentSession.jsx` | 03.0 |
| 03.5 | [Log a set](03.5-log-set.md) — weight, reps, validation, the two requests | `CurrentSession.jsx` | 03.2 |
| 03.8 | [Log exercise](03.8-log-exercise.md) — the second button: done with this movement | `CurrentSession.jsx` | 03.5 |
| 05 | [Edit and delete a set](05-edit-delete-set.md) | `CurrentSession.jsx` | 03.8 |
| 06 | [End and discard](06-end-and-discard.md) | `CurrentSession.jsx` | 03.8 |
| 07 | [Thumb-friendly styling](07-styling.md) | `styles.css` | 02.0–06 |

01 is the only backend chunk and the only one that needs a migration. Everything
from 02.0 on edits the same page but touches separate parts of it; 05 and 06 are
independent of each other.

An active session is two sections, top to bottom: **Record new exercise**
(chunks 03.0–03.8) and **Completed exercises** (the ordered list of what has
been trained, chunk 02.1). Chunk 02.0 puts both headings up before either is
filled in, so each later chunk owns one section and nothing moves once it is
placed.

The list comes before the form on purpose. Built the other way round, 03.5's
writes would have nowhere to show, and the only way to check them would be a
`curl` — so the list is built first against seeded data, and every chunk after
it has a visible symptom when it goes wrong. Same reason 03 is four chunks:
choosing, showing, writing and finishing each fail in their own way, and only
the third of them is hard.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **Rest timers, plate maths, PR detection, notes on a set.** Not asked for.
- **`distance_m`, `duration_s`, `rpe`.** The model has them and the session
  detail page already renders them; this tab logs weight and reps only for now.
  Adding the other three is a clean chunk 08 later.
- **Pounds.** Weights are stored and shown in kg — see assumption A3.
- **`PerformedRep`.** The model exists but has no serializer, viewset or route.
  Nothing here creates one.
- **Prescriptions.** `PerformedExercise.exercise_prescription` stays null; the
  `protocols` app is a bare primary key so far.
- **Offline / queued writes.** Every action is a request; see assumption A7.
- **Retrospective entry.** Chunk 01 gives a session a writable `started_at` and
  lets a create supply `ended_at`, so a workout can be typed in after the fact —
  but no chunk here builds a screen for it, and the two existing history pages
  (`TrainingSessions.jsx`, `TrainingSessionDetail.jsx`) still label a session with
  `created_at`. That reads correctly for anything logged live, which is everything
  these chunks produce. Swapping those labels to `started_at` belongs with the
  chunk that adds the entry screen.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the tab, not a build
step of its own — it adds no code and changes no screen. What the user ends up
with once 01–07 are all in is the sum of the "What the user sees" sections in
those chunks: a **Current Session** tab that starts a workout with one tap,
logs a set at a time, shows what has been done so far, lets a wrong set be
fixed or removed, and ends the workout into history — usable one-handed on a
phone.
