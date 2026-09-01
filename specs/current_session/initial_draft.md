# Build prompt: "Current Session" tab

Build a "Current Session" tab for logging a workout in progress.

## States

The tab has two states: no active session, and active session.

**No active session:** the tab is mostly empty except for one large, prominent "Start Session" button.

**Active session:** show the exercise logging form, the live list of everything logged so far, and a large "End Session" button at the bottom.

## Logging flow

1. A dropdown to pick an exercise from [existing exercise list / library].
2. Once an exercise is selected, reveal number inputs for weight and reps. Weight unit is [kg/lb]. Sets are logged one at a time — one row per set — rather than entering "3 sets" as a number.
3. A "Log Set" button saves that entry and immediately adds it to the list below. After logging, keep the exercise selected and keep the weight and reps pre-filled with the previous values, so logging a second set of the same thing is one tap. Only the exercise dropdown resets if the user changes it manually.

## Live list

Everything logged in this session appears below the form, grouped by exercise, in the order the exercises were first started. Under each exercise heading, list its sets numbered 1, 2, 3... with weight and reps. Each row can be edited or deleted (swipe or a small menu — nothing that takes up space).

## Ending

The "End Session" button asks for confirmation, then writes the session to history with start time, end time, and all logged sets, and returns the tab to the empty "Start Session" state.

## Requirements

- The active session must survive a page refresh, app backgrounding, or navigating to another tab and back. Persist it to [local storage / your DB] on every change, not just at the end.
- If a session is left running and the app is reopened, resume it rather than starting fresh, and let the user discard it if they forgot to end it.
- Don't allow logging a set with no exercise selected or an empty reps field.
- Buttons should be thumb-sized — this is used mid-workout, one-handed, probably sweaty.

Stack: [your stack]. Match the existing styling of the other tabs.
## What the user sees

Nothing on its own. This is the original request the numbered chunks were
written from, kept for reference — building it is 01–07, and the user-facing
result is described at the bottom of each of those.
