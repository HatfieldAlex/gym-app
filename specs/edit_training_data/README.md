# Editing training data — build specs

A block in your log points at the wrong movement. Today the only way to fix that
is Django admin, because the app refuses every write to a finished record and
means it. This adds one door: a section at the bottom of Settings, a warning that
is always on screen, a two-tap gate, and a deliberately plain editor behind it.

The same iteration **closes a hole** — an ended session can currently be
`DELETE`d outright, cascading everything in it, with no gate at all — and adds no
delete of its own. The net effect on what the API permits is a tightening.

Four chunks. Two backend, two frontend, and no migration in any of them.

## How to use these

Read **[AGREED.md](AGREED.md)** first — it is the human's, it is signed off, and
it outranks everything else here.

Then feed **[00-context.md](00-context.md) + exactly one numbered chunk** per
prompt. Nothing else is needed: each chunk names the files to read, states its
own "done when", and lists what it must not touch.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [The override, and the guard the session never got](01-the-override-and-the-session-guard.md) — `X-Edit-Closed-Record: 1` on `perform_update` only, `ClosedIsFinalMixin` onto `TrainingSessionViewSet`, one new test class | `backend/observations/views.py`, `tests.py` | — |
| 02 | [The last thirty blocks](02-the-recent-blocks.md) — `GET performed-exercises/recent/`, a bare array of logged blocks newest first, one new serializer and one new test class | `backend/observations/views.py`, `serializers.py`, `tests.py` | — |
| 03 | [The warning, the gate, and what is behind it](03-the-gate-and-the-list.md) — `Confirm` extracted, an in-memory gate context, the nav indicator, the Settings section and the read-only list | new `components/Confirm.jsx`, new `src/editing.jsx`, `main.jsx`, `Nav.jsx`, `Settings.jsx`, `styles.css` | 02 |
| 04 | [The plain editor](04-the-plain-editor.md) — `api.correct`, a row that opens, three fieldsets of raw columns, one PATCH per changed row | `api.js`, `Settings.jsx`, `styles.css` | 01, 03 |

**01 and 02 are the only chunks with tests** — they are the only contracts here
that cannot be checked from a screen. 03 and 04 are frontend and there is no test
runner, so each says exactly what to click and what should happen.

## Why this order

**Both backend chunks first, and they are independent of each other.** 01 is a
rule change and 02 is a new read; neither imports the other, and either could be
built first. They are numbered in the order they matter: 01 is the one that
changes what the API will do, and it is the one worth reviewing carefully, so it
goes at the top where it will be read.

**01 lands as a pure tightening.** Nothing sends the header yet, so the only
observable change in the whole chunk is that an ended session can no longer be
deleted or patched. That is a chunk worth having on its own even if the rest of
the iteration were abandoned — which is the test of a good split, applied to the
riskiest thing here.

**02 before 03**, because 03's list has nothing to show without it. It is the
only hard dependency between a backend chunk and a frontend one.

**03 before 04, and 03 deliberately stops short of a tap target.** The gate and
the list are one reviewable thing: a warning you cannot miss, two taps, an
indicator, and thirty rows of your own training. The editor is a second thing.
Splitting them there means the review of "is the warning strong enough, is the
gate right, does the list show the right blocks" happens **before** anything can
write, and the chunk that can write arrives with those three already settled.
Built the other way round, the first reviewable state would already be able to
rewrite the log.

**No styling chunk, and that is deliberate.** Every other frontend iteration in
this repo ends with one, because the feature had grown a layout that needed
resolving across four screens. This one touches one section of one page, and the
editor's whole design brief is *plain* (C4) — there is no polish pass to do, and
adding one would invite exactly the tidying the brief rules out. Each frontend
chunk carries its own handful of rules at the bottom of `styles.css` instead.

## The three things this will go wrong on

Repeated in every chunk that goes near them, and worth reading once here:

1. **The override unlocks `PATCH` and nothing else.** `perform_destroy` never
   reads the header, and neither does the create half in
   `serializers.py:_require_open`. That asymmetry is what turns AGREED's "nothing
   is ever removed" from a promise about the UI into a rule on the server. A
   chunk that "tidies" it by handling all three verbs the same way has removed
   the only thing stopping this feature deleting a workout.
2. **The twelve tests that pin the closed rule are not edited.** Nine in
   `ClosedIsFinalTests` (tests.py:546) and three in `PerformedSetAPITests`
   (508, 525, 534). New behaviour gets new classes. If one of those twelve has to
   change to make a chunk pass, the chunk is wrong, not the test.
3. **`TrainingSessionDetail.jsx` is not modified at all**, and `CurrentSession.jsx`
   receives exactly one edit in the whole iteration — `Confirm` moving out of it
   into `components/`, unchanged. Looking back at what you have done and
   mechanically rewriting it are two different acts on two different screens, and
   that separation is the shape of the feature rather than a detail of it
   (AGREED).

## Deliberately out of scope

From AGREED, listed so they do not creep in:

- **Any delete**, anywhere, on any row, in the UI or in the API.
- **The catalogue.** No rename, no `bar_kg`/`sides` change, no second write to
  `exercises/`. Those change how every past set of a movement reads, which is the
  whole reason they were locked.
- **Any persistence of the gate**: no user-settings model, no migration, no
  `localStorage`, no server-side flag.
- **Any audit trail**: no audit model, no `modified_at`, no extra CSV.
  `dataexport/` and its 40 tests are untouched.
- `PerformedRep`, which has no serializer, no viewset and no route, and gains
  none.
- Edit controls on `TrainingSessionDetail` or in `CurrentSession`'s "Completed
  exercises".
- Pagination, filtering or searching the list of blocks. Thirty, newest first.
- `frontend-mobile/` — an empty directory, untouched.

## What the user sees

Nothing directly — this is an index for whoever is building, not a build step.

What the human ends up with once 01–04 are all in: at the bottom of Settings, a
section headed **Edit training data** whose warning is on screen before anything
is tapped. Turning editing on takes two taps and lights a quiet `Editing on` in
the nav. Behind it are the last thirty blocks they have logged, newest first;
tapping one opens a plain form of raw fields, where the movement is a dropdown
of the catalogue and every set's numbers are exactly as stored. Correct it, Save,
and the session page and the export both say the new thing.

Turn it off, reload, log out, or walk away for fifteen minutes, and the app is
back to refusing every write to a finished record — as it does for every request
that does not carry the header, including, from now on, the request that could
have deleted a whole ended workout.
