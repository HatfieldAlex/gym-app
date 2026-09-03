# split-weight-components — the agreed description

Output of stage ① GRILL. Every decision below was put to the human and answered
by them. Nothing here is an agent's assumption unless it says so.

## The problem

Mid-set you have to add up the bar and both sides yourself, then type the total.
The number you actually think in — what goes on *one* side, the number you
increment week to week — is never the number you enter.

## The change

An `ExerciseDefinition` gains two numbers describing how it is loaded: a **bar
weight** and a **side count**. You then only ever type the weight going on one
side, and the app does the arithmetic.

    total = bar_kg + sides × per_side

## Decisions

1. **Loading lives on `ExerciseDefinition`**, as two plain numbers — `bar_kg`
   and `sides` (1 or 2). No enum, no named types, no "three kinds of exercise"
   in the model. Deadlift is `20 × 2`, EZ curl `7.5 × 2`, lat pulldown `0 × 1`.
   Odd kit (trap bar, Smith machine carriage) needs no special case — it is just
   a different `bar_kg`.

2. **Set once, then fixed forever.** The add-exercise form asks for both. There
   is **no edit path**: the catalogue's 405 on update stays, and no PATCH
   endpoint is built. A 25 kg trap bar is a *different catalogue entry*, not a
   changed deadlift. This is what makes retrospective reinterpretation
   structurally impossible rather than merely discouraged.

3. **`PerformedSet` gains nothing.** `weight_kg` remains the sole material
   record: the total actually lifted. No components are stored beside it —
   storing them would bias any later analysis, because they are an assumption
   rather than a measurement. Per-side is *derived* for display:
   `(weight_kg − bar_kg) / sides`. That derivation is stable forever precisely
   because decision 2 means the config can never move.

4. **The migration touches no observation.** Not one `PerformedSet.weight_kg` is
   read or written. This is a hard fence: the human's words were "so long as the
   weights associated in the actual observations aren't changed, then it doesn't
   really matter".

5. **Existing catalogue rows start unset, and are set once on first use.**
   The two new columns are nullable. A row with no config behaves exactly as
   today — one box, type the total. The first time such an exercise is held in
   the exercise zone, it asks for bar and sides, then locks. "No edit" still
   holds: a value only ever goes unknown → known, never known → different.
   The migration backfills only what is genuinely knowable (see below); it does
   not guess, because prod's catalogue is not visible from here and a wrong
   guess would be permanent.

6. **Entry is one box.** You type the weight going on one side — or the only
   side. The bar weight and side count sit beside it as fixed, non-editable
   context, and the total is computed live:

       DEADLIFT
         20 + 2 × [ 60 ]  = 140 kg
         reps       [  8 ]

   A `0 × 1` exercise shows a plain box exactly as today.

7. **The same expression is shown back**, on every screen where a set is read:
   the zone set list, the "last time" column, the Earlier lines, and the session
   detail table.

       20 + 2 × 60 = 140 kg × 8

   A single-sided set collapses to plain `50 kg × 12` rather than the silly
   `0 + 1 × 50 = 50`.

8. **Both export CSVs are unchanged.** They stay the pure material record —
   bare totals, existing column order, existing tests passing untouched.

9. **Editing a logged set uses the same one-box per-side form.** The stored
   total is divided back for editing and re-multiplied on save.
   *(Agent assumption, flagged to the human and not contradicted.)*

10. **Dumbbells are `0 × 2`.** Two 30 kg dumbbells records 60. The human was
    shown the consequence — existing dumbbell rows recorded 24 and 10 will
    display as `0 + 2 × 12 = 24 kg`, implying 12 kg bells, which is false — and
    chose to accept it. Do not silently "fix" this; it is a made decision.

## Backfill

Only the genuinely knowable. Everything else stays NULL and is asked for once.

| exercises | bar_kg | sides |
|---|---|---|
| squats, front squat, deadlift, romanian deadlift, bench press, overhead press, barbell row, barbell curl, hip thrust | 20 | 2 |
| incline dumbbell press, dumbbell lateral raise | 0 | 2 |
| seated cable row, lat pulldown, cable tricep pushdown, face pull | 0 | 1 |
| leg press | 0 | 1 |
| the 16 bodyweight / cardio / mobility rows (pull ups, dips, hanging leg raise, outdoor run, treadmill run, rowing machine, stationary bike, assault bike, jump rope, plank, couch stretch, pigeon pose, 90/90 hip switch, world greatest stretch, thoracic spine opener, shoulder dislocates) | 0 | 1 |
| **seated calf raise, walking lunge** | **NULL** | **NULL** |
| **any name the migration does not recognise** | **NULL** | **NULL** |

Match on name case-insensitively, consistent with the catalogue's existing
`Lower('name')` unique constraint.

## Explicitly out of scope

* Plate math ("to make 100, put 2×20 + 1×10 on each side"). Explicitly refused.
* A plate picker instead of a number box.
* lb units. kg only, as today.
* Any user-settings / user-preference model.
* Editing loading config once set, and any bulk correction of past totals.
* PR, volume, 1RM or chart work of any kind. None exists in the app today.
* Changing the two export CSVs.

## Done when

The human can do this by hand:

1. Add "Trap bar deadlift" with bar 25, sides 2.
2. In the zone it reads `25 + 2 × [ ] = `. Type 60 → it shows `145 kg`.
3. Log it. The row reads `25 + 2 × 60 = 145 kg × 8`.
4. Switch to lat pulldown: a plain box. Type 50 → the row reads `50 kg × 12`.
5. Hold seated calf raise (unset): it asks for bar and sides once, then logs.
6. Reload the page. Everything above reads the same.
7. Old sets still read exactly as they did, and the export is byte-identical
   for them.
