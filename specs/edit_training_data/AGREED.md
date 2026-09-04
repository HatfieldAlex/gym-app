# edit-training-data — the agreed description

Output of stage ① GRILL. Every decision below was put to the human and answered
by them. Nothing here is an agent's assumption unless it says so.

Name: `edit-training-data` (worktree + branch), `specs/edit_training_data/`.

## The problem

A logged exercise block points at the wrong exercise in the catalogue — the
human did flat bench, the record says incline. The app refuses every write to a
closed row, by design, so today there is no way to correct it short of Django
admin.

## What it does

A new **"Edit training data"** section on the Settings page. Its warning prose is
**always visible** — not hidden behind the toggle — saying in the app's own voice
that changing a record to something unrepresentative of what was actually done
will degrade the ability to read progress and impact from one's own history.

Accepting it **arms the gate**, using the two-tap `.confirm` idiom the app
already has rather than a new dialog. Once armed, Settings gains a list of the
most recently logged exercise blocks (`PerformedExercise`), newest first, so
today's mistake is the top row. Tapping one opens a **deliberately plain
editor** — labelled fields, a dropdown for which `ExerciseDefinition` the block
points at, and each set's numbers — that reads as a tool rather than as part of
the app proper. Save writes it back.

## What it does not do

**Nothing is ever removed:** not a set, not an exercise block, not a session.
Corrections only — no delete affordance anywhere, and the backend must not start
permitting DELETE.

**The catalogue is untouched.** The `catalog` app / `ExerciseDefinition` is not
edited: an exercise's name and its `bar_kg`/`sides` loading answer stay locked
exactly as they are today, because those change how every past set of that
exercise reads.

**The past-session screen (`TrainingSessionDetail`) is not modified at all** — it
keeps the energy of looking back at what you've done; mechanical modification
lives in Settings. `CurrentSession`'s "Completed exercises" list is likewise not
given edit controls.

## It also closes a hole

`TrainingSessionViewSet` never received the closed-guard its two siblings have,
so a signed-in request can currently **DELETE an ended session outright** —
cascading every exercise and set in it — with no gate and no warning, and can
PATCH its fields freely. This iteration puts it behind the same gate. **Net
effect is a tightening.**

## The gate

**Frontend-armed, held in memory only** (React context/state): it dies on
refresh, on log out, and after **15 minutes idle**. No user-settings model, no
migration, no `localStorage`, no persistence of any kind.

The backend keeps refusing closed rows by default and honours an **explicit
per-request override** — a header; the exact name is the spec's to decide and
state — that `ClosedIsFinalMixin` / `refuse_if_closed` recognises. Every edit is
therefore deliberate and greppable, and **the existing tests pinning the closed
rule must keep passing unchanged.**

## No audit trail

Edits overwrite silently. No audit model, no extra CSV, `dataexport` is not
touched.

## Scope boundary

Only the `observations` app is editable: `TrainingSession`, `PerformedExercise`,
`PerformedSet`. Session `started_at` and `type` are editable in the same plain
editor. `ended_at` stays read-only as it is today. `PerformedRep` is out of
scope.

## Assumptions agreed

* The list shows the **last 30 blocks**, no pagination.
* A **quiet indicator** shows while the gate is armed.
