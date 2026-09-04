# 04 — Correcting what the old specs say

**Goal:** the two places that still say ending an empty session is allowed stop
saying it. One code comment is rewritten; one old spec gets a pointer to this
iteration, with its original reasoning left intact as history.

Needs 01 and 03 — this chunk describes what happened, and written earlier it
would describe a plan. (There is no chunk 02: it was cut from this iteration.
See 00-context, "What was cut, and why".)

**No code. No behaviour. No test.** Two files, one of them inside a `{/* … */}`.

## Read first

- [frontend-web/src/pages/CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx)
  — the comment above the `.end-session` section, `:2142-2147`, and `endSession`
  (`:1592-1608`) just above it
- [current_session/06-end-and-discard.md](../current_session/06-end-and-discard.md)
  — the whole file, and item 4 (`:30-32`), the "Done when" bullet (`:55`) and
  the "What the user sees" line (`:87`) in particular
- [00-context.md](00-context.md) — "What this iteration REVERSES", which is the
  authority on what is being corrected and what is being preserved

## Build

### 1. The comment in `CurrentSession.jsx`

It currently reads:

> *Outside Completed exercises and at the very bottom of the page, a long
> scroll clear of Log set: this is the one tap that closes the workout, and it
> should take deliberate reaching for. Ending an empty session is allowed and
> needs no special case — it lands in history with no exercises, which the list
> and detail pages already render.*

The first sentence is still true and stays. The second is now false in every
clause. Replace it with something that says three things:

- ending a session with nothing logged **deletes it** — `end/` answers 204
  rather than a session (S3);
- **there is still no special case here**, which is the point: `api.js` turns a
  204 into `null`, `endSession` never reads the response, and `leaveSession()`
  runs either way, so this file needed no change when the rule changed;
- and the question the user is asked is **deliberately identical** whether or
  not anything was logged.

A draft to work from, which may be reworded but must not lose any of the three:

```jsx
{/* Outside Completed exercises and at the very bottom of the page, a
    long scroll clear of Log set: this is the one tap that closes the
    workout, and it should take deliberate reaching for. Ending a
    session with nothing logged in it deletes it rather than filing it
    — end/ answers 204 — and this file still needs no special case for
    that: the response is never read and leaveSession() runs either
    way. The question is deliberately the same either way too; a
    workout you did not start is not worth different wording. */}
```

Nothing else in this file moves. Not the JSX, not `endSession`, not
`leaveSession`, not a string, not a class name, not the surrounding whitespace.

### 2. The pointer in `current_session/06-end-and-discard.md`

Add a short note near the top — after the `**Goal:**` line and the "Needs chunk
03.8" line, before "## Read first" — as a blockquote, so it reads as an
annotation on the file rather than part of it:

```markdown
> **Superseded in one respect.** Item 4 below, its matching "Done when" bullet
> and its "What the user sees" line say that ending an empty session is allowed
> and files it in history. That is no longer true: `end/` on a session with no
> exercises deletes it and answers 204. See
> [no_empty_sessions](../no_empty_sessions/README.md). Everything else in this
> file still stands, and the original wording is left below as the record of
> what was agreed at the time.
```

**Leave every word of the original in place.** Do not edit item 4, do not strike
it through, do not amend the two bullets, do not renumber anything. The file is
the record of a decision that was made and later reversed, and both halves of
that are worth being able to read.

### 3. Nothing else says it

```
grep -rn "empty session" --include=*.md --include=*.jsx . \
  | grep -v node_modules | grep -v '/\.venv/' | grep -v specs/no_empty_sessions
```

finds these two files and no others — `specs/no_empty_sessions/` is excluded
because it is this iteration talking about itself. Run it, and if a third file
has appeared since, correct it the same way and say so at hand-back.
`README.md`, `frontend-web/README.md`, `docs/` and `backend/docs/schema.dbml`
carry no claim about this and are not opened.

## Done when

- The comment above `.end-session` describes what the app now does.
- `06-end-and-discard.md` opens with the superseded note and is otherwise
  byte-identical to what it was.
- The grep above finds no remaining claim that an empty session lands in
  history.
- `make test` passes and still reads **182 tests**.
- `make run` renders identically to before this chunk — the diff contains no
  executable JavaScript.
- `git diff` touches exactly two files.

## Do not

- Change any code, any test, any string that renders, or any file under
  `backend/`.
- Rewrite, delete, strike through or "fix" the original text in
  `06-end-and-discard.md`. It is history.
- Annotate any other spec directory. Nothing in `exercise_lifecycle`,
  `exercise_zone`, `new_exercise`, `feedback`, `data_export`,
  `split_weight_components` or `pwa_install` claims anything about empty
  sessions.
- Reflow, reindent or tidy comments and prose that this chunk is not about.
- Add a `CHANGELOG`, a migration note, or documentation of the new rule anywhere
  beyond the two edits above. `specs/no_empty_sessions/` is that documentation.

## What the user sees

**Nothing at all.** No screen, no string, no request, no byte of rendered
output; the whole of the frontend diff is inside a comment.

What the *next reader* sees is the point. Until this chunk, the most
authoritative-looking statement about ending an empty session — a comment
sitting directly above the End session button — described behaviour the app no
longer has, and the spec it was drawn from said the same thing three times over.
After it, the code says what the code does, and the old spec says what was
decided then and where to read what was decided instead.
