# 07 — Asking once, for a movement that has never said

**Goal:** the last unset movements are answered. Hold one in the zone and it
asks how it is loaded, once. Answer it and it is a configured movement from then
on, for everybody, forever.

Needs chunk 02 for the `loading/` action, chunk 04 for the per-side form that
appears the moment the question is answered, and chunk 06 for the shared fields.
Frontend only.

> **The two things this chunk is built around**, both from AGREED 5 and both
> worth reading before writing a line: a value only ever goes **unknown →
> known**, never known → different (W6); and the question **is skippable**
> (W10, as directed at build time). An unanswered movement must never stand
> between a person and their workout — the whole point of this feature is not
> having to think in the gym. A skip writes nothing, so W6 still holds.

## Read first

- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx): the zone
  at **828–1071**, and inside it the `held` branch at **847**, the log form at
  857–939, the actions at 896–931 — in particular **Change exercise** at 923–930
  and the comment at 891–894 saying there is never a state with an exercise held
  and no visible way back; the catalogue in page state at 485–488; `holdExisting`
  at 666–675, which already knows how to fold an entry the server handed back
  into that state
- `frontend-web/src/components/LoadingFields.jsx` as chunk 06 left it
- [api.js](../../frontend-web/src/api.js) lines 10–26 — `ApiError.status` and
  `.data`, which is how the 409 is told apart
- [00-context.md](00-context.md); assumptions W1, W6, W7, W10

## Build

1. **A fourth state for the zone.** It has three today — dropdown, adding,
   holding (the comment at 497–499) — and the fourth is *holding something
   unanswered*. It is a state of the **held** branch, not a fourth sibling: the
   heading is still the movement's name, the × still closes the zone, and what
   is replaced is the log form.

   The test is the one from 00-context: unset means either `bar_kg` or `sides` is
   null on the held catalogue row (W1).

2. **What stands there instead of the boxes** — a `<section>` with:

   - a heading, in the register of the rest of the zone: *How is this loaded?*
   - **one sentence** saying why it is being asked and that it is asked once —
     something like *"Asked once, and then fixed: a different bar is a different
     exercise."* It is the only warning the user gets before a permanent answer,
     so it says the permanent part.
   - `<LoadingFields>`, from chunk 06 — the same two questions in the same words
     as the add form, because they are the same two questions.
   - a **Save** button, disabled until `loadingAnswered(...)` and while the
     request is in flight, reading `Saving…` while it is.
   - **Change exercise**, calling `releaseExercise` exactly as the log form's
     does. This is not optional: without it, a mis-tap on the dropdown is a
     movement the user cannot get out of without closing the zone. The invariant
     at 891–894 holds in this state too.

3. **The skip** (W10, directed at build time — this reverses what an earlier
   draft of this chunk said). One tap of *"Not sure — just log the total"*
   drops straight into the ordinary plain-total box, which works exactly as it
   does today. It stores **nothing**: no flag, no dismissal record, no
   persistence of any kind. The exercise stays unset and is asked about again
   the next time it is held — but not again within the same hold, which would
   be nagging. AGREED 5's "asks, then locks" governs what happens when the
   question is *answered*; it does not require the question to be a wall.

4. **The history block below stays.** Last time, the comparison and the Earlier
   lines are read-only and already render correctly for an unset movement
   (chunk 03.0). Leave them where they are: the user is standing in front of the
   machine looking at what they did last time, and that is the most useful thing
   on the screen while they work out what the bar weighs.

5. **The request.** `api.post('exercises/<id>/loading/', { bar_kg, sides })`
   (chunk 02, step 2).

   - **200** — the entry, configured. Replace that row in the page's `catalogue`
     state with the one that came back. `held` is derived from `catalogue`
     (line 495), so the zone re-renders as the ordinary holding state with the
     per-side form from chunk 04 already in it. Nothing is navigated, nothing is
     re-fetched, and nothing about the session is touched.
   - **409** — somebody answered it first, in another tab or on another phone;
     the body carries `exercise` (chunk 02). That is an answer, not a failure:
     fold that entry into `catalogue` exactly as a 200 would, and carry on. Say
     nothing, or say it as quietly as `alreadyThere` is said at line 853–855.
     Under no circumstances retry, overwrite, or offer to.
   - **Anything else** — a line under the button, in the wording the zone already
     uses for a failed log ("Could not save that. Please try again."), with the
     typed answers still in the boxes. `console.error` the error, as every other
     mutation on this page does.

6. **The answer belongs to the catalogue, not to the session.** No
   `PerformedExercise` is created, nothing is logged, and a movement answered and
   then let go of leaves the workout exactly as it was — a hold is still a
   client-side act (A10, from the current-session specs). The only thing that
   changed is a catalogue row, and it changed for everybody.

7. **State hygiene.** The typed-but-unsent answer belongs to this hold: clear it
   in `releaseExercise` (line 690–703), beside `alreadyThere` and the weight and
   reps boxes, so backing out and coming back does not present somebody else's
   half-typed answer.

8. **Style: enough to stand the panel up** in the zone's column, matching the
   `.log-set` block it replaces. Chunk 08 is the ergonomics.

## Done when

With `make dummy-data` run — **seated calf raise** and **walking lunge** are the
two movements AGREED deliberately left unset:

- Holding **seated calf raise** in the zone shows *How is this loaded?*, the two
  fields, a Save button and Change exercise — and no weight or reps box.
- **Change exercise** goes back to the dropdown with nothing written.
- Answering bar `0`, sides `1` and saving: the panel is replaced, in place, by
  the ordinary log form — one plain box labelled **Weight (kg)** — and a set can
  be logged straight away.
- Answering **walking lunge** with bar `20`, sides `2` gives `20 + 2 × [   ] =`
  instead.
- Letting go and holding the same movement again **does not ask again**, in this
  session or after a reload.
- In `make shell`, the catalogue row now carries the answer, and
  `POST /exercises/<that id>/loading/` again answers 409 with the stored values
  unchanged.
- Holding a movement that already has a loading — deadlift, lat pulldown, or one
  added through chunk 06 — never shows the panel at all.
- A failed save keeps the typed answer and says so; the movement stays unset.
- **No past set was changed.** Answering a movement changes how its sets are
  *expressed*, never what they record: a seated calf raise stored as `45.00`
  still stores `45.00`, and the export is byte-identical before and after.
  Answered `0 / 1` its old rows still read `45 kg × 12`; answered `20 / 2` they
  now read `20 + 2 × 12.5 = 45 kg × 12`. That is the derivation working as
  AGREED 3 describes it — stable forever, because the config can never move
  again.

## Do not

- Persist a skip in any form — a flag, a dismissal record, a "do not ask
  again". It is transient UI state and nothing else (W10).
- Repeat the question after it has been declined within the same hold.
- Repeat chunk 06's permanence sentence; the shared component already says it,
  and twice on one panel is nagging.
- Retry, overwrite or "reconcile" on a 409 (W6, AGREED 2).
- Ask about a movement that has one column set and not the other — that cannot
  exist (W1), and writing a branch for it invites somebody to make it exist.
- Ask anywhere but the zone. Not on the catalogue page, not on the exercise
  detail page, not in a banner.
- Create a `PerformedExercise`, log a set, or write anything to the session as a
  side effect of answering (step 6).
- Re-fetch `exercises/` after saving — the response is the row (N11).
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

It never asks twice. Not later in the session, not next week, not on another
phone — and if somebody else answered it first, the app quietly takes their
answer rather than arguing about it.

Everything already answered — every movement the migration recognised, and
everything added through the add form — skips the question entirely, which is
most of the catalogue. What is left is exactly the handful of movements where
the app genuinely did not know, and it asks about each of them once in the
thirty seconds before the first set.
