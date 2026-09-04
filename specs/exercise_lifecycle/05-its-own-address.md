# 05 — The exercise gets its own address

**Goal:** the zone stops being a boolean and becomes a place:
`/current-session/exercise`. The back gesture is a real step, a reload lands
where the user was, and while an exercise is open, backing out puts them
straight back in (E9).

Frontend only: `App.jsx` and `CurrentSession.jsx`, plus one line of a backend
test. Needs chunk 02.

This overturns **Z4** and changes **Z3**; read both rows in
[00-context.md](00-context.md) before starting, because their reasoning is good
and it is only the conclusion that has moved.

## Read first

- [App.jsx](../../frontend-web/src/App.jsx) — the route table, and the
  `/exercises-catelog/:exerciseId` pair for how a nested route is written here
- [CurrentSession.jsx](../../frontend-web/src/pages/CurrentSession.jsx) — the
  `choosing` / `openExercise` state chunk 02 left
- [Nav.jsx](../../frontend-web/src/components/Nav.jsx) — `<NavLink>` to
  `/current-session`, which must stay highlighted at the child address
- [backend/settings/tests.py](../../backend/settings/tests.py) —
  `SpaRoutingTests.test_every_app_route_resolves_to_the_shell`
- [00-context.md](00-context.md) — E9, and Z1 and Z2, which stand

## Build

### 1. One route, two addresses, one component

In `App.jsx`, the `/current-session` route becomes a prefix match:

```jsx
<Route path="/current-session/*" element={<Private><CurrentSession /></Private>} />
```

**One `<Route>`, not two.** Two routes rendering `<CurrentSession />` would
unmount and remount it on every step between the list and the exercise, which
throws away `session` and re-fetches `current/` — a spinner between every set
block. One route, and the component reads the address.

Inside `CurrentSession`, `useLocation()` and `useNavigate()`:

```js
const atExercise = useMatch('/current-session/exercise') !== null
```

The zone renders when `atExercise`; the session page renders when not. The
`choosing` boolean from chunk 02 goes — the address is now what it said.

Django's catch-all already serves any path to the SPA shell, so no backend route
is needed. Add `'/current-session/exercise'` to the list in
`SpaRoutingTests.test_every_app_route_resolves_to_the_shell` so a future change
to `settings/urls.py` cannot quietly break a deep link into it.

### 2. The moves

| From | The act | Goes to | How |
|------|---------|---------|-----|
| session page | **Record new exercise** | the exercise address | `navigate` (push) |
| chooser | **Cancel** | the session page | `navigate` (push) |
| chooser | picking a movement | stays | it is already there |
| open, no sets | **Change exercise** | stays, on the chooser | it is already there |
| open, with sets | **Log exercise** | the session page | `navigate` **after** the close request succeeds |

**Log exercise** navigates on success only. A failed close leaves the user in
the exercise with the error line and the retry, exactly as chunk 02 built it.

### 3. The two redirects

Both run only once the session load is `ready`, so nothing bounces before the
answer is known, and both use **`replace`** so the bounce does not pile up
history entries.

- **At `/current-session` with an open exercise** → `/current-session/exercise`.
  This is E9's whole point: while an exercise is open, that is where you are.
  It covers the back gesture, the nav link, a bookmark, and a reload.
- **At `/current-session/exercise` with no session at all** → `/current-session`.
  The session was ended, discarded, or there never was one. There is nothing to
  record into, so the address means nothing.

There is deliberately **no** third redirect. `/current-session/exercise` with a
session and nothing open is a legitimate landing: it is the chooser, and a
reload while choosing should come back to the chooser rather than throwing the
user out to the list.

Guard against a loop: the first redirect fires only when `openExercise !== null`
and the second only when `session === null`, and the two conditions cannot both
be true. Render `<Navigate replace />` from the render body rather than
navigating from an effect, so React Router settles it in one pass.

### 4. What the back gesture does now

- **From the exercise with nothing open** (the chooser): Back lands on
  `/current-session`, and stays. Nothing was opened, so nothing pins them.
- **From the exercise with something open**: Back lands on `/current-session`
  and is replaced straight back to `/current-session/exercise`. The user sees a
  flicker at most and is where they were.

Two consequences, both intended, both worth a comment in the code:

- Because the bounce **replaces**, a second Back from an open exercise leaves
  the Current Session tab entirely — to whatever page they were on before it.
  That is the correct shape: the exercise pins them to the tab, not to the
  browser.
- Tapping **Current session** in the nav while an exercise is open lands them
  back in the exercise, so **End session** is unreachable — the same rule the
  API keeps (E4), shown rather than explained.

Escape and tap-outside are still not handled (Z3's surviving half). There is no
outside; Z1 stands.

## Done when

- With a session running and nothing open, `/current-session` shows the session
  page and `/current-session/exercise` shows the chooser.
- **Record new exercise** puts `/current-session/exercise` in the address bar.
- Picking a movement keeps that address; the exercise opens under it.
- Reloading at that address comes back into the same exercise, with its sets.
- Back from an open exercise returns to it. Back twice leaves the tab.
- Back from the chooser, with nothing opened, reaches the session page and stays.
- **Log exercise** returns to `/current-session` with the block in Completed
  exercises. A failed close does not navigate.
- **Cancel** on the chooser returns to `/current-session`.
- Tapping **Current session** in the nav with an exercise open lands inside the
  exercise; **End session** cannot be reached.
- Ending or discarding the session from the session page stays on
  `/current-session`; typing `/current-session/exercise` afterwards bounces back.
- The **Current session** nav link is highlighted at both addresses.
- Navigating between the two does not re-fetch `current/` — the page does not
  flash its loading state.
- A hard reload of `/current-session/exercise` serves the app, not a 404
  (`make test` covers this).
- `make test` passes.

## Do not

- Register two `<Route>`s for `CurrentSession`, or move the zone into its own
  page component. It shares `session`, `catalogue` and `rows` with the list, and
  splitting them means fetching twice.
- Put an id in the address. There is one open exercise per session (E3), so
  `/current-session/exercise/<id>` would add a second source of truth and a
  "what if that is not the open one" case that cannot happen.
- Add a query parameter, a hash, or `state` on the navigation.
- Redirect from `/current-session/exercise` when a session exists and nothing is
  open. That is the chooser.
- Navigate from a `useEffect`. Render `<Navigate replace />`.
- Redirect before the session load is `ready`.
- Handle Escape, tap-outside, `beforeunload` or `visibilitychange`.
- Change the nav bar, add a link to the exercise address, or add a breadcrumb.
- Change the tab title per address — `useDocumentTitle('Current session — Gym
  App')` stays as it is.
- Touch any other route, or `settings/urls.py`.

## What the user sees

The exercise becomes somewhere they went, not something the app is showing them.

- **The address bar says where they are.** `/current-session/exercise` while
  recording, `/current-session` on the workout. Reloading, or opening the link
  again later, comes back to the same screen.
- **Back is a real step.** From the chooser, it takes them out to the workout.
- **And it will not take them out of an exercise.** While a movement is open,
  backing out lands them right back in it. So does the **Current session** nav
  link. There is one way out of an exercise and it is the button that says what
  it does — which is also why **End session** cannot be reached until they use
  it.
- **The workout is either open or it is not, all the way down.** The session was
  already like this; now the exercise inside it is too. In the gym: all in on
  the movement, then out of it, then all out of the session.

What is still missing: a half-typed weight is lost on reload. That is chunk 06,
and it is the last of the "it submits without me realising" list.
