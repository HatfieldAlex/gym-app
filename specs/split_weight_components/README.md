# Splitting the weight into its components — build specs

You type what goes on **one side**; the app adds the bar and does the
multiplying. An `ExerciseDefinition` gains two numbers — `bar_kg` and `sides` —
and every screen that shows a set shows its working:
`20 + 2 × 60 = 140 kg × 8`. Nothing about what is stored changes: the total is
still the only thing written down.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Read **[AGREED.md](AGREED.md)** first — it is the human's, it is signed off, and
it outranks everything else here.

Then feed **[00-context.md](00-context.md) + exactly one numbered chunk** per
prompt. Nothing else is needed: each chunk names the files to read, states its
own "done when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [Two columns, and the backfill](01-backend-columns.md) — `bar_kg`, `sides`, both nullable, three constraints, the schema migration and the data migration | `backend/catalog/` | — |
| 02 | [The API carries the loading](02-backend-api.md) — the fields on the entry, the one-way `loading/` action, the mirror onto performed exercises, tests | `backend/catalog/`, `observations/serializers.py` | 01 |
| 03.0 | [The expression in the current session](03.0-the-expression-in-the-zone.md) — a new `sets.js`, and the zone's list, Last time and Earlier | new `src/sets.js`, `CurrentSession.jsx` | 02 |
| 03.5 | [The expression in session detail](03.5-the-expression-in-session-detail.md) — the fourth screen, in its one column | `TrainingSessionDetail.jsx`, `sets.js` | 02, 03.0 |
| 04 | [One box, per side](04-one-box-per-side.md) — the zone's log form, the live total, the multiplied-up send | `CurrentSession.jsx`, `sets.js`, `styles.css` | 03.0 |
| 05 | [Correcting a set](05-editing-a-set-per-side.md) — the stored total divided back for editing | `CurrentSession.jsx` | 04 |
| 06 | [Adding an exercise asks](06-the-add-form-asks.md) — two fields as a shared component, in both places the form stands | new `components/LoadingFields.jsx`, `AddExerciseForm.jsx`, `styles.css` | 02 |
| 07 | [Asking once](07-asking-once.md) — the zone's fourth state, for a movement nobody has answered | `CurrentSession.jsx`, `styles.css` | 02, 04, 06 |
| 08 | [Ergonomics](08-styling.md) — everything got longer; both schemes, both widths | `styles.css` | 03.0–07 |

**01 is the only chunk with a migration** and **02 the only one with tests** —
between them they are the only contracts here that cannot be checked from a
screen. Everything from 03.0 on is frontend and visible, and every one of those
chunks is checked by looking at it.

## Why this order

**Reading before typing.** 03.0 and 03.5 only *show* the arithmetic; the boxes
still take a total. That is deliberate: the derivation is the part most likely to
be wrong, it is the part that touches four screens, and after `make dummy-data`
there are already hundreds of backfilled sets to check it against — including the
awkward ones the rules exist for (a total below its own bar, a dumbbell press
that will read `0 + 2 × 12`, a movement left unset). Getting it wrong while
nothing has changed about entry is cheap. Getting it wrong underneath a new form
is not.

**03.0 before 03.5** because 03.0 builds `sets.js`, and 03.5 is one file and one
option on one function. They are one decision (AGREED 7) split at the point where
the second half stopped being small.

**04 before 05.** They are the same arithmetic in two forms, and 04's is the one
that matters: it is the feature. 05 rests on AGREED 9, which is an *agent's*
assumption rather than the human's — it is flagged as such in AGREED and again at
the top of the chunk — so it is deliberately downstream of everything and depends
on nothing. If the human does not want it, it comes out and nothing else moves.

**06 before 07**, and both after 04. 06 is the door for new movements and 07 is
the door for the ones already in the catalogue; 06 goes first because it builds
the two fields as a shared component that 07 then stands somewhere else, and
because it is by far the safer of the two — a page the user chose to visit,
rather than a question in front of a set they are about to log. Both come after
04 so that answering the question lands the user in a per-side form that already
works; built in the other order, 07's payoff would not be visible.

**Between 04 and 07 the app is honest, not half-built.** A movement nobody has
answered keeps today's single box and today's plain total. That is not a gap
waiting for 07 — it is AGREED 5's behaviour for an unset row, and it stays that
behaviour forever for anything 07 never gets asked about.

**08 last, and it is real work.** `20 + 2 × 62.5 = 145 kg × 12` is more than
twice the string that was there, and it goes into two columns on a 311px phone
beside two buttons. Doing it per chunk would mean doing it four times against
four half-finished layouts.

## The three things this will go wrong on

Repeated in every chunk that goes near them, and worth reading once here:

1. **The migration touches no observation.** Not one `PerformedSet.weight_kg` is
   read or written, by chunk 01 or anything after it (AGREED 4).
2. **The exports do not change, and neither do their tests.** `workouts.csv` and
   `tables/performed_sets.csv` keep their bare totals and their exact column
   order; `tables/exercise_definitions.csv` keeps its four columns (AGREED 8, and
   see W11 for the consequence, flagged for the human).
3. **Null is not zero.** `sides = 1, bar_kg = 0` is a movement somebody answered
   — a stack, a sled, a pair of dumbbells. `NULL` is a movement nobody has been
   asked about, and it behaves exactly as the app behaved yesterday.

## Four things AGREED.md left open

00-context answers them so the build has firm ground, marks each one ⚑, and says
what changing it would cost. They are the rows worth the human's eye at review:

- **W6** — an unset row is filled in through a one-way `loading/` action, since
  AGREED 2 keeps `PATCH` at 405 and AGREED 5 still wants unset rows answered.
- **W7** — the API accepts a create with no loading; the *form* is what requires
  it.
- **W8** — `sides` 1 with a bar reads `25 + 50 = 75 kg`; AGREED spells the
  collapse out only for `0 × 1`.
- **W10** — *resolved at build time, not still open.* The question in chunk 07
  **is** skippable in one tap; a skip stores nothing and the movement is asked
  about again next time. The first draft of the spec had no Skip, which would
  have let this feature stand between somebody and their workout.

## Deliberately out of scope

From AGREED, listed so they do not creep in: plate math and plate pickers; lb
units; any user-settings model; **editing a loading once set**, and any bulk
correction of past totals; PR, volume, 1RM or chart work; and any change to the
two export CSVs. Also not here: showing a movement's loading on the catalogue
page or the exercise detail page, and `frontend-mobile/` (an empty directory,
untouched).

## What the user sees

Nothing directly — this is an index for whoever is building, not a build step.
What the user ends up with once 01–08 are all in is AGREED's own walkthrough:
add a trap bar deadlift at `25 / 2`, type `60` into one box and watch it say
`145 kg`, log it, and read it back as `25 + 2 × 60 = 145 kg × 8` in the zone, in
Completed exercises, and on the session's page next week. A lat pulldown is still
one plain box and one plain `50 kg`. A movement nobody has answered asks once,
and then never again. And every set logged before any of this existed still says
exactly what it always said, in an export that is byte-identical.
