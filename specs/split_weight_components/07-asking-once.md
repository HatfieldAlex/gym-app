# 07 — Asking once, for a movement that has never said

**Goal:** the last unset movements are answered. Open one in the zone and it
asks how it is loaded, once. Answer it and it is a configured movement from then
on, for everybody, forever.

Needs chunk 02 for the `loading/` action, chunk 04 for the per-side form that
appears the moment the question is answered, and chunk 06 for the shared fields.
Frontend only.

> **The three things this chunk is built around.** From AGREED 5: a value only
> ever goes **unknown → known**, never known → different (W6). From the build:
> the question **is skippable** in one tap (W10). And from `main`'s lifecycle
> rework: the question is asked **only into a block with no sets in it** (W12) —
> without that third rule the first two stop holding, because an open exercise
> now survives a reload and a skip is deliberately stored nowhere.
>
> An unanswered movement must never stand between a person and their workout.
> The whole point of this feature is not having to think in the gym.

> **This chunk was written once against the old zone and is being rebuilt.**
> `3c0cab3` changed the ground under all of it: choosing a movement now writes a
> `PerformedExercise` **before** the question can be asked, the zone's loading no
> longer comes from `catalogue` (so the old re-render mechanism does not work at
> all), and the way out of an exercise is an asynchronous request rather than a
> local `releaseExercise()`.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx):
  `openExercise` and `openSets` at **612–617**; the zone at **1103–1398** and
  inside it the open-exercise branch at **1117**, the `.log-set` block at
  1133–1239 and its buttons at 1198–1226; `openExerciseRow` at **820–848**;
  **`closeExerciseRow` at 864–910**, with `closing`/`closeError` at 644–645;
  `cancelChoosing` at 950–954; the `alreadyThere` line at 1123–1125, which is the
  register a quiet note is said in; the catalogue in page state at 580 and
  600–603, and the one place it is read, at 1353–1357
- [exercise_lifecycle/02](../exercise_lifecycle/02-the-exercise-is-a-row.md) —
  E2 and E5, which are why the question now stands after a write
- `frontend-web/src/components/LoadingFields.jsx` as chunk 06 left it, and
  `sets.js`'s `loadingOf` (104)
- [api.js](../../frontend-web/src/api.js) lines 10–26 — `ApiError.status` and
  `.data`, which is how the 409 is told apart
- [00-context.md](00-context.md); assumptions W1, W6, W7, W10, **W12**

## Build

1. **A fourth state for the zone**, and it is a state *of the open exercise*
   rather than a fourth sibling of dropdown / adding / open: the heading is still
   the movement's name, the address is still `/current-session/exercise`, the
   history below is still there. What it replaces is the `.log-set` block.

   ```js
   const asking =
     openExercise !== null &&
     !loadingKnown(loadingOf(openExercise)) &&
     openSets.length === 0 &&
     !loadingSkipped
   ```

   Four clauses, and each is load-bearing:

   - **`loadingOf(openExercise)`, not a catalogue row.** The block carries
     `exercise_bar_kg` and `exercise_sides` itself (chunk 02) and carries them
     when `exercises/` never loaded. `3c0cab3` deleted the catalogue lookup this
     page used to do; do not bring it back, here least of all — a zone that asks
     "how is this loaded?" because the *catalogue* failed to arrive would be
     soliciting a permanent answer on the strength of a network error.
   - **`loadingKnown`** is the W1 test — both columns non-null, and it tests both
     even though the database forbids one without the other, because a reader
     that tests one renders `undefined` the day the other goes missing. Keep it
     local to this page rather than importing `sets.js`'s private version: that
     one is on the way to deciding how a set *reads*, and this is a different
     question — whether there is anything to ask the user. Nothing here formats,
     divides or multiplies; all of that stays in `sets.js`.
   - **`openSets.length === 0`** is W12, and it is new. A block that already has
     a set in it has answered this question the other way. Without this clause,
     every reload of an exercise somebody skipped puts the question back in front
     of them with their own sets on the screen behind it — which is precisely the
     wall W10 exists to forbid, re-erected by the one thing the last iteration
     went to trouble to make survive.
   - **`loadingSkipped`** is the skip, below.

2. **What stands there instead of the boxes** — a `<section>` with:

   - a heading, in the register of the rest of the zone: *How is this loaded?*
   - **one sentence** saying why it is being asked — *"The app does not know how
     this one loads yet."* That the answer is permanent is said under the boxes
     by `LoadingFields`' own note, in the same words the add form uses, which is
     the entire reason that note lives in the shared component. Twice on one
     panel is nagging, and this panel must not nag.
   - `<LoadingFields>`, from chunk 06 — the same two questions in the same words
     as the add form, because they are the same two questions. Pass `disabled`
     while the save is in flight: there is no name box here to keep live beside
     them, and an answer changed mid-request would be an answer nobody stored.
   - a **Save** button, disabled until `loadingAnswered(...)` and while the
     request is in flight, reading `Saving…` while it is.
   - the **skip** (step 3) and the **way out** (step 4).

   **Keep it a `<form>` with an `onSubmit`, and let Enter save.** Lifecycle E11
   took Enter away from the *log* form because Enter there logged a set nobody
   meant to log; there is no set here, and the inline edit form in a set row kept
   its Enter for the same reason. Enter in the Bar (kg) box submitting an answer
   the button beside it would submit is not the failure E11 is about.

3. **The skip** (W10). One tap of *"Not sure — just log the total"* drops
   straight into the ordinary plain-total box, which works exactly as it does
   today. It is a `type="button"`, not a submit: nothing is sent, nothing is
   stored, and there is nothing to go wrong with it.

   `loadingSkipped` is one boolean belonging to this block. It stores
   **nothing** — no flag, no dismissal record, no persistence of any kind. The
   catalogue row stays unanswered and the movement is asked about again the next
   time it is *opened*, which under E2/E7 means the next block. It is not asked
   again within the block, either by tapping about or by reloading: the skip
   holds until the block is closed, and after a set is logged W12 holds instead.
   AGREED 5's "asks, then locks" governs what an *answer* does; it does not
   require the question to be a wall, and a skip writes no value, so W6 is
   untouched.

4. **The way out is `closeExerciseRow`, and it is a request now.** The panel
   carries one **Change exercise** button — `onClick={closeExerciseRow}`, the
   same handler and the same `.change-exercise` treatment the log form's wears.
   This is not optional: without it a mis-pick is a movement the user cannot get
   out of, and there is never a state with an exercise open and no visible way
   back.

   Three things follow from it being a request rather than the old local
   `releaseExercise()`:

   - it is disabled while `closing` and while the answer is saving, and reads
     `Changing…` while it is closing;
   - `closeError` gets a line, in the same place and the same wording the log
     form gives it. A close that did not go through must leave the panel exactly
     as it was, with the typed answer still in it;
   - it always takes the 204 path, because W12 means the block is empty: the row
     is deleted as though the movement had never been picked (E5), and the user
     lands back on the chooser without leaving `/current-session/exercise`. There
     is no "Log exercise" wording to render here and no branch to write for it.

5. **The history block below stays.** Last time, the comparison and the Earlier
   lines are read-only and already render correctly for an unset movement (chunk
   03.0 for the arithmetic, `loadingOf(performed)` per row for the loading).
   Leave them where they are: the user is standing in front of the machine
   looking at what they did last time, and that is the most useful thing on the
   screen while they work out what the bar weighs.

6. **The request.**
   `api.post('exercises/' + openExercise.exercise_definition + '/loading/', { bar_kg, sides })`
   — the catalogue id off the block, `bar_kg` as the string it was typed as so a
   decimal column never sees a float, `sides` as `Number(...)` off a control that
   can only hold `"1"` or `"2"` (chunk 02, step 2).

   - **200** — the entry, configured. Fold it in (step 7).
   - **409** — somebody answered it first, in another tab or on another phone,
     and the body carries `exercise` (chunk 02). That is an answer, not a
     failure: fold it in exactly as a 200 would be and carry on. Say it as
     quietly as `alreadyThere` is said at 1123–1125, or say nothing. Under no
     circumstances retry, overwrite, or offer to.
   - **Anything else** — a line under the button, in the wording the zone already
     uses for a failed log ("Could not save that. Please try again."), with the
     typed answers still in the boxes and the skip still sitting there for
     somebody who would rather not have this conversation twice. `console.error`
     the error, as every other mutation on this page does.

7. **How the answer re-renders the zone — and it is not what the first draft of
   this chunk said.** That draft swapped the row in the page's `catalogue` state
   and let `held = catalogue.find(...)` do the rest. There is no such derivation
   any more, and the catalogue is names now: nothing on this page reads `bar_kg`
   or `sides` off it. Swapping a catalogue row would change nothing on screen at
   all, and the failure would be silent — the panel would simply sit there after
   a successful save.

   The zone reads `loadingOf(openExercise)`, so **the answer is folded into
   `session`**, onto the performed-exercise rows, as the two fields the
   serializer names:

   ```js
   function foldLoading(answered) {
     setSession((current) => ({
       ...current,
       performed_exercises: current.performed_exercises.map((performed) =>
         performed.exercise_definition === answered.id
           ? { ...performed, exercise_bar_kg: answered.bar_kg, exercise_sides: answered.sides }
           : performed,
       ),
     }))
     …
   }
   ```

   - **Every block of that movement in the session, not just the open one.** The
     predicate is the movement, because a session may hold two blocks of the same
     one (E7): skip it in the first block, log some sets, close it, pick it up
     again, answer it — and the completed block down in Completed exercises has
     to start reading `20 + 2 × 60 = 140 kg × 8` too. Matching only
     `openExercise.id` would leave one list on the page disagreeing with the
     other about the same movement until a reload. The same `.map`, a different
     `===`.
   - `answered` is an `ExerciseDefinitionSerializer` row — `bar_kg` a decimal
     string, `sides` a number — and the two fields it feeds are the ones
     `loadingOf` reads. That is the whole re-render: `asking` goes false on the
     next render, and the log form arrives with chunk 04's per-side box already
     knowing what to do with what is typed into it.
   - **Also put the answered row into `catalogue`**, in one line, for hygiene
     rather than for effect: it is the page's other copy of the same movement and
     leaving it stale is a lie the next reader will trip over. Say in the comment
     that it is not the mechanism, so nobody deletes the fold above it thinking
     one of the two is redundant.
   - Nothing is navigated and `exercises/` is not read again — the response *is*
     the row (N11).

8. **What answering does and does not touch.** By the time the question is asked
   a `PerformedExercise` already exists: choosing the movement created it (E2),
   which is the whole of what the lifecycle iteration changed here. So say the
   guarantee in its true form — **answering creates nothing further**. No second
   block, no set, no `ended_at`, and not one request to `performed-exercises/`,
   `performed-sets/` or `training-sessions/`. One request goes out and it is the
   `loading/` one; what it changes is a catalogue row, and it changes for
   everybody. The fold in step 7 writes only to this page's own `session` state —
   it is the page catching its copies up with the answer it just got back, not a
   second write to anything.

9. **State hygiene.** The typed-but-unsent answer, the failure, the quiet
   raced-someone note and `loadingSkipped` all belong to this block, and the
   place a block's state is dropped is now **`closeExerciseRow`** (864–910),
   beside the weight and reps boxes, the drafts and `rows.close('held')`.
   `releaseExercise` is gone; `cancelChoosing` has nothing to clear, because the
   panel only exists once an exercise is open.

10. **Style: enough to stand the panel up** in the zone's column, matching the
    `.log-set` block it replaces. Chunk 08 is the ergonomics.

## Done when

With `make dummy-data` run — **seated calf raise** and **walking lunge** are the
two movements AGREED deliberately left unset:

- Opening **seated calf raise** in the zone shows *How is this loaded?*, the two
  fields, Save, the skip and Change exercise — and no weight or reps box.
- **Change exercise** goes back to the chooser with nothing written: `make shell`
  shows no `PerformedExercise` left behind, and the catalogue row is still unset.
- Answering bar `0`, sides `1` and saving: the panel is replaced, in place, by
  the ordinary log form — one plain box labelled **Weight (kg)** — and a set can
  be logged straight away, with no reload and no second request.
- Answering **walking lunge** with bar `20`, sides `2` gives `20 + 2 × [   ] =`
  instead.
- **Enter** in the Bar (kg) box saves the answer; Enter in the weight box, once
  the log form is there, still does nothing (lifecycle E11).
- **Skip, then reload.** Tap *Not sure*, log a set, lock the phone, come back:
  the app lands back inside the exercise with the log form and the set, and
  **does not ask again** (W12). Tap *Not sure*, log nothing, reload: it asks
  again, because nothing was stored and nothing has happened yet.
- **Log exercise**, then pick the same unanswered movement again: it asks again,
  in the new block.
- **Two blocks, one answer.** In one session: open seated calf raise, skip, log a
  set, Log exercise; open it again and answer it `20 / 2`. The completed block in
  Completed exercises starts reading its expression immediately, with no reload.
- Letting go and opening the same movement again after answering **does not ask
  again**, in this session or after a reload.
- In `make shell`, the catalogue row now carries the answer, and
  `POST /exercises/<that id>/loading/` again answers 409 with the stored values
  unchanged.
- Opening a movement that already has a loading — deadlift, lat pulldown, or one
  added through chunk 06 — never shows the panel at all.
- A failed save keeps the typed answer and says so; the movement stays unset, and
  Change exercise still works.
- **No past set was changed.** Answering a movement changes how its sets are
  *expressed*, never what they record: a seated calf raise stored as `45.00`
  still stores `45.00`, and the export is byte-identical before and after.
  Answered `0 / 1` its old rows still read `45 kg × 12`; answered `20 / 2` they
  now read `20 + 2 × 12.5 = 45 kg × 12`. That is the derivation working as
  AGREED 3 describes it — stable forever, because the config can never move
  again.

## Do not

- Ask in a block that already has a set in it, or re-ask after a reload of a
  block somebody skipped (W12).
- Persist a skip in any form — a flag, a dismissal record, a "do not ask
  again". It is transient UI state and nothing else (W10).
- Fold the answer into `catalogue` **only** and expect the zone to notice; the
  zone reads `loadingOf(openExercise)` (step 7).
- Read the loading, or the movement's name, out of `catalogue` in the zone
  (step 1).
- Give the panel a way out that is not `closeExerciseRow`, or one that ignores
  `closing` and `closeError` (step 4).
- Strip the panel's `<form>` in the name of E11 (step 2).
- Repeat chunk 06's permanence sentence; the shared component already says it.
- Retry, overwrite or "reconcile" on a 409 (W6, AGREED 2).
- Ask about a movement that has one column set and not the other — that cannot
  exist (W1), and writing a branch for it invites somebody to make it exist.
- Ask anywhere but the zone. Not on the catalogue page, not on the exercise
  detail page, not in a banner.
- Log a set, open a second block, or write `ended_at` as a side effect of
  answering (step 8).
- Re-fetch `exercises/` or `training-sessions/current/` after saving — the
  response is the row (N11).
- Touch the log form, the edit form, `parseEntry` or `sets.js`.
- Change anything under `backend/`.

## What the user sees

**The gaps close themselves, one question at a time, in the place the question
comes up.**

Reach for seated calf raise — a movement nobody has ever told the app about —
and instead of the weight box the zone asks one thing: *How is this loaded?* Bar
weight, one side or two, Save. It says the answer is permanent, because it is.
Then the boxes appear, already knowing what to do with what you type, and the
set is logged.

And if you do not know, you say so, and log the total the way you always have.
The app learns nothing and asks again the next time you pick that movement up —
but not for the rest of the exercise you are in the middle of, and not again
when your phone locks and you come back to it. Somebody standing under a bar is
never asked the same question twice.

It never asks twice about an answer, either. Not later in the session, not next
week, not on another phone — and if somebody else answered it first, the app
quietly takes their answer rather than arguing about it. Everything already
answered skips the question entirely, which is most of the catalogue. What is
left is exactly the handful of movements where the app genuinely did not know,
and it asks about each of them once in the thirty seconds before the first set.
