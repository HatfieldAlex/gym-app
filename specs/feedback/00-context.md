# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## What is being built

A way to get a thought out of your head and into the database without leaving
the page you are on.

The shape of the interaction, which every chunk serves:

1. You are mid-workout on some screen, using the app normally.
2. You notice something — an idea, an annoyance, a bug.
3. You tap one marker in the top row.
4. A small panel appears **over** the page. Nothing navigates, nothing reloads,
   nothing you were doing is lost. It can be dismissed with a tap or Esc.
5. You type the thought and send it.
6. The panel closes and you are exactly where you were.

Everything in these chunks is in service of step 4 costing nothing. A feature
that captures the thought but breaks the flow of the workout has failed, even if
the note lands in the database.

## The stack

- **Backend** `backend/` — Django 6.1 + DRF, SQLite. Apps are top-level
  packages under `backend/` (`accounts`, `catalog`, `protocols`,
  `observations`), listed in `INSTALLED_APPS` in
  [settings.py](../../backend/settings/settings.py). Routes are registered in
  [api_urls.py](../../backend/settings/api_urls.py) under `/api/v1/`. Auth is a
  session cookie; every viewset scopes its queryset to `self.request.user`.
- **Frontend** `frontend-web/` — React + Vite SPA, plain JSX, no UI library, no
  state library, no TypeScript. Django serves the built `index.html` for every
  non-API route.
- `make run` brings both up: the API on :8000, the app on
  <http://localhost:5173>. `make migrate` and `make test` are the other two you
  will want.
- [docs/schema.dbml](../../backend/docs/schema.dbml) is **generated** from the
  models after every `manage.py migrate` by the `schemadocs` app. Never hand-edit
  it; run the migration and commit what it wrote.

## Where the feature lives

- The top row is the existing `<nav>` in
  [Nav.jsx](../../frontend-web/src/components/Nav.jsx) — a flex row of
  `NavLink`s, rendered by [App.jsx](../../frontend-web/src/App.jsx) **outside**
  `<Routes>` and only when signed in. Two consequences the chunks lean on: the
  marker is on every signed-in screen without a route of its own, and anything
  it holds in state survives navigation, because navigating re-renders `<main>`
  and not the nav above it.
- The new backend code is a **new app**, `backend/feedback/`. Nothing in
  `observations/`, `catalog/`, `protocols/` or `accounts/` changes in any chunk.

## Existing conventions — follow them

Read [Settings.jsx](../../frontend-web/src/pages/Settings.jsx) (a small page
that POSTs and handles its own pending/failed states) and
[catalog/](../../backend/catalog/) (the smallest complete app: model,
serializer, viewset, admin) before writing anything. In short:

- Fetch with `useLoad` from [hooks.js](../../frontend-web/src/hooks.js); render
  `<Status state={state} error={error} />` for the waiting and failed cases. A
  *mutation* does not use `useLoad` — it keeps its own `busy` / `failed` state,
  as `Settings.jsx` does.
- All requests go through `api` in [api.js](../../frontend-web/src/api.js) —
  `api.get/post/patch/delete` and `api.list`. Never call `fetch` directly. A 204
  comes back as `null`; a non-2xx throws `ApiError` with `.status` and
  `.detail`.
- Semantic HTML with a handful of class names; styles live in one section per
  page or component at the bottom of
  [styles.css](../../frontend-web/src/styles.css). There is a `.button` class
  already, and `.status` / `.status[data-state="error"]` for messages.
- Colours come from `currentColor` and `color-mix`, never from hex literals —
  the app is `color-scheme: light dark` and has no palette.
- Comments explain *why*, not *what*, and are sparse. Match that.

## Assumptions

The chunks build as though all of these were true, and cite them by number. None
of them is established: they are the questions the request leaves open, answered
the most likely way so the build has firm ground. Anything wrong here is wrong in
every chunk that leans on it, so this is the first table to argue with and the
cheapest thing to change.

To overturn one: rewrite its row, then `grep` the chunks for its number and
follow through.

| # | Assumption | Why it holds |
|---|------------|--------------|
| B1 | A note belongs to whoever wrote it. `user` is stamped from `request.user` on the server and is never a field a client can send, exactly as `TrainingSession` does it. | Same auth model as everything else in the app; ownership is never a client-supplied filter. |
| B2 | Capture is one-way and takes a beat. A note is free text plus a little context the app fills in itself; there is no title, no severity, no assignee, no reply, no status the writer sees. Triage — reading, resolving, deleting — happens in the Django admin. | The point is to stop thinking about the thought. Anything that has to be filled in is a reason to hesitate, and hesitating mid-set is exactly the cost the feature exists to avoid. |
| B3 | The marker sits in the existing `<nav>`, at the end of the row, and appears on every signed-in screen. | The nav is the only element on every screen, it is already the top row, and it is already conditional on being signed in. |
| B4 | The panel is markup inside the page, not a route and not a modal. Opening and closing changes no URL, unmounts no page, and traps no focus. Back never means "close the panel". | Step 4. A route would remount the page underneath and put the panel in history, so Back after sending would reopen it. Trapped focus is a dead end on a phone. |
| B5 | Sending is one POST, made when Send is tapped. Nothing is queued and nothing is stored locally beyond the current draft. | Matches how every other write in the app works (A7 in the current-session specs). |
| B6 | The draft survives everything except a successful send — closing the panel, reopening it, navigating to another page. It is cleared only when the note has actually landed. | A closed panel that ate the sentence is worse than no panel. B3 makes this free: the state lives above `<Routes>` and never unmounts. |
| B7 | Signed-out visitors cannot file notes, and the login screen has no marker. | The nav already renders only when signed in, and a note with no owner has nowhere to go under B1. |
| B8 | Text only. No screenshots, no attachments, no console logs, no automatic browser or device fingerprint. | Nothing in the app has an upload path, and B2 says a note is a sentence, not a bug report form. |
| B9 | One note is small: 2000 characters is the cap, enforced by the serializer. | A note this long is a document, not a passing thought; the cap exists to bound the column, not to discipline the writer. |
| B10 | The note's `kind` (idea / bug / other) is a convenience, not a decision the writer has to make. It defaults to *idea* and sending without touching it is normal. | A required choice is a stall. The column exists so the admin list can be filtered later. |

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it describes
the stack, the interaction and the assumptions, and produces no code and no
screen of its own. Every visible change lives in a numbered chunk.
