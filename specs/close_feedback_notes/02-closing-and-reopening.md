# 02 — Closing and reopening from the list

**Goal:** "Your notes" stops being a read-only record. An open note carries an
**×** that closes it after a confirming second tap; a closed note is labelled and
carries a **↺** that reopens it in one. Every note is still on screen — hiding
the closed ones is chunk 03.

Needs chunk 01. Frontend only: `Settings.jsx`, plus the minimum in `styles.css`
to keep the section from looking broken. **No backend file changes.**

Nothing here touches capture. `FeedbackMarker.jsx` and the composer are not
opened (C2).

## Read first

- [Settings.jsx](../../frontend-web/src/pages/Settings.jsx) — `LoggedNotes()`
  and `Note({ note })` are the whole surface area of this chunk
- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — three
  things, and read all three before writing anything:
  - `SetRow`'s Delete button: `data-armed`, the label swapping to `Sure?`,
    `onBlur` disarming
  - `useSetRows`: `armed` / `busy` / `failure` state, `remove` arming on the
    first call and acting on the second, `disarm`, and the `pointerdown`
    effect that disarms when anything else is touched — with the comment
    saying why blur alone is not enough on a phone
  - `CurrentSession()` itself: `useLoad` → `useEffect` → `setSession`, the load
    becoming the page's own state (C7)
- [hooks.js](../../frontend-web/src/hooks.js) — `useLoad` returns
  `{ state, data, error }` and **no setter**; that is the constraint C7 answers
- [api.js](../../frontend-web/src/api.js) — `api.post`, and `ApiError`
- [styles.css](../../frontend-web/src/styles.css) — the `/* Your notes */`
  section, and `.set-action` / `.set-action[data-armed]` for the visual language
- [00-context.md](00-context.md) — C4, C5, C7, C8, C9, C12, C13

## Build

### 1. The list becomes the section's state (C7)

`LoggedNotes` keeps its `useLoad`, and copies the result into its own state the
way `CurrentSession` does:

```
const { state, data, error } = useLoad(() => api.list('feedback-notes/'))
const [notes, setNotes] = useState(null)
useEffect(() => { if (state === 'ready') setNotes(data) }, [state, data])
```

Render the list from `notes`, gated on `notes !== null` rather than on `state`
— `<Status>` still gets `state` and `error` and is unchanged. No second `loaded`
flag is needed here: nothing on this page redirects on the gap between the two,
which is the only reason `CurrentSession` has one.

**Do not** re-run `useLoad` after a mutation, by bumping a dep or any other
route: it resets to `state: 'loading'` and blanks the whole section on every
tap.

When a close or a reopen succeeds, the server answers with the note (chunk 01),
and that answer **replaces** that note in `notes` — matched on `id`, in place,
same position. Nothing is re-sorted and nothing is removed from the array
(C5, C10).

### 2. The acts

Both are `api.post` with no body:

```
api.post(`feedback-notes/${note.id}/close/`)
api.post(`feedback-notes/${note.id}/reopen/`)
```

Neither is optimistic (C8): the note is what the server last said it was. While
one request is in flight, hold that note's id in a `busy` state and **disable
every ×/↺ in the section** while it is set — one act at a time, as `useSetRows`
disables every row's buttons off one `busy` flag. On success, clear `busy` and
`armed`, and replace the note. On failure, `console.error` and leave the note
exactly as it was, with a message under it.

### 3. Arming the × (C9)

Copy `SetRow` / `useSetRows`, do not reinvent it:

- one `armed` state on `LoggedNotes` holding a note id or `null` — one row armed
  at a time, and arming a second disarms the first for free;
- the × button carries `data-armed={armed === note.id ? '' : undefined}` and
  reads `×` unarmed, `Sure?` armed;
- first tap arms and clears any failure message; second tap on the same button
  sends the POST;
- `onBlur` disarms that row;
- a `useEffect` on `armed` adds a `document` `pointerdown` listener that clears
  `armed` unless the event's target is inside `[data-armed]`, and removes it
  again. Copy the guard exactly — `event.target.closest?.('[data-armed]')` — so
  the second tap of the armed button itself is not eaten by the listener, and a
  tap on any other control (including another row's ↺) disarms first and then
  does its own job.

The `×` is `×` (U+00D7 multiplication sign), not the letter x.

**It must not be a bare glyph to a screen reader.** Give the button an
`aria-label` that says what it does — "Close this note" unarmed, and when armed
something that says a second tap confirms it. The visible text is still `×` /
`Sure?`.

### 4. Reopening (C9)

A closed note's control is `↺` (U+21BA), one tap, no arming, no confirmation:
reopening breaks nothing and puts back exactly what was there. Same
`aria-label` treatment — "Reopen this note".

An open note shows only the ×; a closed note shows only the ↺. Never both.

### 5. A closed note says so

`Note` now reads `note.resolved_at`. When it is set:

- the meta line gains the word **Closed**, in the same `·`-separated run as the
  date, the kind and the path — last, after the path;
- the `<li>` carries a `data-closed` attribute for chunk 04 to hang a rule on.

**Do not** render *when* it was closed. The meta line already carries one date
and a second one earns nothing; `resolved_at` is a flag being shown, not a
history being told.

### 6. Failure

Under the note it happened to, in the register the app already uses —
`<p className="status" data-state="error">` — with the page's own wording, not
the API's `detail`:

- "Could not close that note. Please try again."
- "Could not reopen that note. Please try again."

One failure at a time is enough: hold the failing note's id and its message, as
`useSetRows` holds `failure`. Clear it when that row is armed again or when
anything succeeds. A failed close leaves the row armed, so a retry is one tap —
the same thing `useSetRows.remove` does.

### 7. `Note` keeps its shape

`Note` stays a display component and `LoggedNotes` owns every piece of state.
Hand it **one** object prop bundling the acts and the flags — the way `SetRow`
takes `rows` — rather than five separate props. A `Note` that reaches for
`api` itself has gone wrong.

### 8. The minimum styling

In the `/* Your notes */` section only: enough for the row to hold a control
without looking broken — the body and meta on the left, the control at the end
of the row, aligned with the first line of the body, not under it. The
thumb-target sizing, the armed treatment and the closed-note treatment are
chunk 04's, and **04 may rewrite whatever this chunk writes**, so keep it to a
few lines and do not polish here.

## Done when

Signed in, on Settings, with a handful of notes logged:

- Every open note shows an × at the end of its row; the row's text still wraps
  and reads normally at 375px, with no sideways scroll.
- One tap on × turns it into **Sure?** and nothing else happens. The note is
  still there after a reload.
- Tapping anywhere else — another note, the heading, the Download button, blank
  space — puts it back to ×. So does tabbing away.
- A second tap on **Sure?** closes it: the row stays where it is, its meta line
  now ends with **Closed**, and its control is now **↺**.
- Reloading the page: the note is still closed, still where it was, still
  labelled.
- One tap on ↺ reopens it — no confirmation — and the × is back.
- Two notes: arming one, then tapping the other's ×, arms the second and disarms
  the first. Only ever one **Sure?** on screen.
- With the backend stopped: tapping **Sure?** leaves the note open, on screen,
  unchanged, with "Could not close that note. Please try again." under it —
  and Log out and Download above still work.
- The list never blanks to "Loading…" after a tap.
- The order never changes. Closing the third note of five leaves it third.
- In `/admin/feedback/feedbacknote/`, a note closed here shows its **open** tick
  off; **Mark selected notes unresolved** there, reload Settings, and it is open
  again with its × back (C1).
- A second user's notes are still nowhere on this page.

## Do not

- Use `window.confirm()`, `alert()`, or a modal, for either act (C9).
- Delete anything, or call `api.delete` (C5).
- Make the change optimistically, or leave a note on screen in a state the
  server has not confirmed (C8).
- Filter the list, hide anything, or add the Show closed toggle — that is
  chunk 03, and hiding a closed note here would strand it before ↺ exists.
- Re-sort, group or move a note when its state changes (C10).
- Add a "close all", a select-many, or any act that touches more than one note
  (C12).
- Add an undo, a snackbar, a toast or a countdown. ↺ is the undo.
- Refetch the list, poll it, or reload the page after an act.
- Edit a note's body or kind, or add a control that could (C2).
- Touch `FeedbackMarker.jsx`, `Nav.jsx`, the composer, `hooks.js` (`useLoad`
  gains no setter), `api.js`, or any backend file.
- Restyle `.set-action`, the nav, `.button` or another page's section.

## What the user sees

**"Your notes" becomes something you can act on.** Every note still listed,
newest first, exactly as before — but each open one now ends with an **×**.

Tapping it does not close the note; it asks. The × becomes **Sure?**, and
touching anything at all puts it back — so the tap that closes a note is always
the second one, deliberately, on the row you are looking at. No dialog appears
over the page and nothing has to be dismissed.

A closed note stays in the list for now, its meta line ending in **Closed**, and
its × replaced by a **↺** that puts it straight back with one tap and no
questions.

What has not changed: nothing can be edited, nothing is deleted, and the 💡
panel that files notes in the first place is untouched.

The list is still every note you have ever written. Chunk 03 is the one that
shortens it.
