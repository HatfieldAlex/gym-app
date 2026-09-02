# Adding an exercise to the catalogue — build specs

A way to put a movement into the shared exercise catalogue from inside the app —
from the catalogue page, and from the dropdown in the middle of a workout. Split
into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [Owner and a name that cannot be said twice](01-backend-model.md) — `created_by`, case-insensitive uniqueness, admin, migration | `backend/catalog/` | — |
| 02 | [The create endpoint](02-backend-api.md) — normalising, stamping, the duplicate's answer, tests | `backend/catalog/` | 01 |
| 03.0 | [Add an exercise, on the catalogue page](03.0-add-on-catalogue-page.md) — the shared form, the list updating in place | new component, `ExerciseCatalogue.jsx`, `styles.css` | 02 |
| 03.5 | ["That one is already here"](03.5-already-in-the-catalogue.md) — the duplicate answered with the entry that exists | `AddExerciseForm.jsx`, `ExerciseCatalogue.jsx` | 02, 03.0 |
| 04 | [Adding one mid-workout](04-add-mid-workout.md) — the dropdown's last option, and recording it straight away | `CurrentSession.jsx`, `styles.css` | 02, 03.5 |
| 05 | [Ergonomics](05-styling.md) — thumb targets, both schemes, both homes | `styles.css` | 03.0–04 |

01 is the only chunk with a migration, and 02 the only one with tests — it is
the only contract that cannot be checked from the screen. Everything from 03.0
on is frontend and visible.

The order of the frontend chunks is deliberate. 03.0 builds the form where it is
easy to look at, on a page whose whole job is the catalogue, and treats a
duplicate as an ordinary failure. 03.5 then does the duplicate properly — it is
the one outcome with a designed answer rather than a message, and it fails in
its own way, quietly and invisibly, if it is built as an afterthought inside a
bigger chunk. Only then does 04 put the form somewhere a mistake costs the user
their workout.

04 is the chunk the feature exists for. The other four are what make it safe to
build.

## The interaction, in one place

**On the catalogue page:** 1. A name. 2. Add. 3. It is in the list, in
alphabetical order, and in the catalogue for everyone.

**Mid-workout:** 1. Open the exercise dropdown. 2. Today's movement is not in
it. 3. Tap **+ Add a new exercise…**, type the name, Add. 4. The section says
"Recording Front squat" and the weight and reps boxes are ready. Nothing
navigated, nothing reloaded, every set already logged still sitting below.

Ask for something already in the catalogue and, in both places, the app answers
with the entry that exists — a link to it on the catalogue page, and mid-workout
by simply starting to record against it.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **Editing, renaming, deleting or retiring a catalogue entry from the app**
  (N2). `PerformedExercise.exercise_definition` is `PROTECT`ed and history shows
  these names, so both are curation decisions and both stay in the Django admin.
- **Anything on an entry but its name** (N3) — no muscle group, equipment,
  category, description, aliases or images. The model has one meaningful column
  and every screen reads only that.
- **A per-user or private catalogue** (N1). One shared list; what anyone adds,
  everyone sees.
- **Moderation, approval queues, or a permission beyond "signed in"** (N7).
- **Merging duplicates, or suggesting near-names** ("Bench press 2"). The
  duplicate answer points at the entry that exists and stops there.
- **Fuzzy matching, search-as-you-type or a typeahead in the dropdown.** The
  duplicate check is exact after case and whitespace are normalised (N4); a
  catalogue big enough to need searching is a different chunk.
- **Bulk import, seeding, or a starter list of movements.**
- **Showing who added an entry anywhere in the app** (N6). `created_by` is
  recorded for the admin and never rendered.
- **Renaming the misspelled `/exercises-catelog` route** (N12).
- **Offline or queued adds** (N8). One POST, when Add is tapped.
- **`frontend-mobile/`.** Empty directory, untouched.

## What the user sees

Nothing directly. This is an index for whoever is building the feature, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–05 are all in is the sum of the "What the user sees"
sections in those chunks: a catalogue that can be added to from the page that
lists it and from the dropdown that needs it, that answers "it is already there"
by handing over the entry instead of an error, that never ends up holding
`Bench press` twice in two spellings — and, mid-workout, an unknown movement
that goes from missing to being recorded in one tap, without the workout
noticing.
