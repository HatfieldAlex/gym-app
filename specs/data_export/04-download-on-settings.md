# 04 — Download your data

**Goal:** the button. A "Download your data" section on Settings that hands the
zip to the browser, and the `api.download()` helper that carries it.

Needs chunk 02. Frontend only — `api.js`, `Settings.jsx` and `styles.css`. **No
backend file changes**, and no tests: the project has no frontend test runner,
so this chunk is checked by hand with `make run`.

## Read first

- [00-context.md](00-context.md) — E3a (why the `Accept` header is what it is)
  and the zip filename
- [frontend-web/src/api.js](../../frontend-web/src/api.js) — **the reason this
  chunk exists.** `request()` does `await response.json()` unconditionally, so
  every existing helper would throw on a zip
- [frontend-web/src/pages/Settings.jsx](../../frontend-web/src/pages/Settings.jsx)
  — the Log out button is the pattern to copy exactly: local `busy` / `failed`
  state, a `disabled` button with a changed label, and a
  `<p className="status" data-state="error">` underneath
- The `/* Your notes */` section at the bottom of
  [styles.css](../../frontend-web/src/styles.css) — `.notes-section` is the
  model for a new block on this page

## Build

### 1. `api.download(path)` in `api.js`

A fourth kind of request beside `get`, `post`, `patch`, `delete` and `list`,
exported on the `api` object. Its own function rather than a flag on
`request()`: the whole point is the part `request()` does unconditionally.

```js
/** A file the API hands back whole: the body is bytes, not JSON. */
async function download(path) { … }
```

- `fetch(ROOT + path, { headers: { Accept: 'application/zip, application/json' }, credentials: 'same-origin' })`.
  A GET, so no CSRF token — the session cookie is the whole story, and
  `credentials: 'same-origin'` is what sends it, exactly as `request()` does.
  Both media types are named because DRF negotiates before the view runs and
  renders JSON only; asking for the zip alone is a 406 (E3a).
- **Not ok** → read the body as JSON (`.catch(() => null)`, as `request()` does)
  and `throw new ApiError(response.status, data)`, so a caller's `catch` sees the
  same error type and the same `.detail` as every other call in the app.
- **Ok** → `await response.blob()`, and the filename out of
  `Content-Disposition`. One regex on `filename="([^"]+)"` is enough, and it is
  enough because the server's filename is plain ASCII by construction (chunk 01
  reduces the username for exactly this reason). Fall back to a constant if the
  header is missing or unparseable — a download with no name is better than a
  thrown error.
- Returns `{ blob, filename }`. **It does not touch the DOM.** `api.js` is "the
  single door between frontend-web and the backend" — a module that saves files
  is a different job, and keeping it out is what stops the next download growing
  a second opinion about anchors.

Give it a comment saying why it exists at all: `request()` parses every body as
JSON, and this one is not.

### 2. The section in `Settings.jsx`

A new component in the same file, beside `LoggedNotes`, rendered **between the
Log out button and `<LoggedNotes />`** — an account action belongs with the
other account action, and the list of notes reads last.

```jsx
<section className="export-section">
  <h2>Download your data</h2>
  <p className="export-summary">
    A zip of everything you can see in the app: one CSV per table, and{' '}
    <code>workouts.csv</code> with a row for every set you have logged.
  </p>
  <button className="button" type="button" onClick={…} disabled={busy}>
    {busy ? 'Preparing…' : 'Download'}
  </button>
  {failed && (
    <p className="status" data-state="error">
      Could not prepare your download. Please try again.
    </p>
  )}
</section>
```

That wording is decided, not a suggestion — the heading, the sentence, the two
button labels and the error line. The sentence says "everything you can see"
rather than "everything of yours" because a superuser gets every athlete's rows
and the frontend has no way to know which it is talking to: `auth/session/`
returns `authenticated` and `username` and nothing else, and adding a field to
it would mean changing an existing endpoint, which is out of scope.

The handler mirrors `handleLogOut` — `setBusy(true)`, `setFailed(false)`, a
`try` / `catch` that logs the error and sets `failed`, and `setBusy(false)` in a
`finally` (unlike Log out, this page is still standing afterwards, so busy has
to come back off on success too):

```js
const { blob, filename } = await api.download('export/')
const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
link.download = filename
document.body.append(link)
link.click()
link.remove()
setTimeout(() => URL.revokeObjectURL(url), 0)
```

Two lines there are load-bearing and deserve a comment between them rather than a
comment each: the anchor is in the document before it is clicked (Firefox
ignores a click on a detached one), and the object URL is revoked on the next
tick rather than immediately (Safari cancels a save whose URL is revoked in the
same task).

Its own component, like `LoggedNotes`, so its `busy` and `failed` are its own
and a failed download leaves Log out and the notes list working.

### 3. The styles

A new commented section at the **bottom** of
[styles.css](../../frontend-web/src/styles.css), after `/* Your notes */`, in
the house shape — the comment says *why*, and the rules are few:

- `.export-section` matching `.notes-section`: `margin-top: 2.5rem;
  text-align: left;`, and an `h2` at `1.1rem` with `margin: 0`. Settings now has
  two `<h2>`s and they must be the same size; if that means lifting one rule to
  a shared selector rather than writing it twice, do that.
- `.export-summary` — quiet, small, and capped at the same `30rem` the notes
  list uses, so the line does not run the width of a desktop window. It sits
  above the button with a little space.
- The button is `.button` plus `.button--tap` (the existing 44px thumb target),
  so it can be hit one-handed like every other primary tap in the app.
- No hex colours: `currentColor` and `color-mix` only, and check both schemes.

## Done when

Checked by hand, `make run`, signed in, on Settings:

- **The section is there**, between Log out and Your notes: a heading, one line
  of explanation, and a Download button.
- **Tapping it downloads a zip** named
  `gym-app-export-<username>-<stamp>Z.zip`, and it opens. `workouts.csv` reads
  as a training log; `tables/` holds the eight raw files.
- **The button says `Preparing…` and is disabled while it works**, and goes back
  to `Download` afterwards — not stuck, not disabled forever.
- **A failure says so and recovers.** Stop the backend, or sign out in another
  tab first, then tap Download: the red line appears under the button, the
  button is usable again, and the rest of the page — Log out, Your notes — is
  untouched. Tapping again with the backend back up succeeds and the red line
  goes.

  Note: mistyping the path is **not** a usable failure test. `settings/urls.py`
  ends in the SPA catch-all, so `/api/v1/export-nope/` returns 200 with the HTML
  shell and `api.download()` hands that back as a blob named `download.zip`
  rather than failing. The two failures that do exercise this path are a dead
  backend (a network `TypeError`) and a 403 from being signed out.
- **A second download works**, and lands as a second file rather than replacing
  the first (the stamp is to the second).
- **At 375px** the section reads: the sentence wraps, nothing scrolls sideways,
  and the button is thumb-sized.
- **Light and dark** both read correctly.
- Nothing else on Settings changed: Log out still logs out, Your notes still
  lists notes.
- `npm run build` in `frontend-web/` completes with no new warning.

## Do not

- Use a bare `<a href="/api/v1/export/" download>`. It gives no busy state, no
  failure state, and takes the app out of its own error convention — and a 403
  through it navigates the tab to a JSON error page.
- Call `fetch` from `Settings.jsx`, or from anywhere but `api.js`. It is the
  house rule and it is the reason `api.download()` is in this chunk.
- Change `request()`, `list()` or any existing helper in `api.js`. `download` is
  added beside them and touches nothing they do.
- Add `useLoad` or `<Status>` here. This is a mutation-shaped action with its own
  `busy` / `failed`, exactly as Log out is; `<Status>` is for a read.
- Show a progress bar, a percentage, a spinner component, a toast, a modal, or a
  "your download is ready" state. The label change is the whole affordance.
- Render anything about the export afterwards — no file size, no row count, no
  history of previous downloads.
- Add a route, a nav link, or a page for this. It is a section on Settings.
- Add a library for saving files, parsing `Content-Disposition`, or zipping
  anything.
- Change any backend file, or add a frontend test file — there is no runner
  (out of scope by name).
- Touch `frontend-mobile/`. Empty directory, untouched.

## What the user sees

**The feature, finally.** On Settings, under Log out, a section headed
**Download your data** with one line saying what is in it and a **Download**
button.

Tapping it thinks for a moment — the button reads `Preparing…` — and then the
browser saves `gym-app-export-lifter-20260902-141133Z.zip`. Opening it: a
`workouts.csv` that reads as a training log, one line per set, oldest first,
with the movement named and the numbers as they were typed; and a `tables/`
folder holding the eight raw files that could put the database back together.

If it fails, it says so in the same red line every other failure in this app
uses, and the button is ready to try again.
