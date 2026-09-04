# 03 — The service worker, the one Django line, and the registration

**Goal:** the chunk the feature exists for. A worker that does nothing, served
where its scope can cover the whole app, registered from the built bundle only.
When this lands, Chrome's *Add to Home screen* dialog says **Install**.

Four small edits across both halves of the project, and they are one mechanism:
the worker, the path it is served at, and the call that registers it. Splitting
them would leave a chunk whose only reviewable statement is "a file exists".

## Read first

- [00-context.md](00-context.md), all of it, and especially **"The service
  worker's scope, and the one Django line"** — the decision, the rejected
  alternative and why it was rejected — plus assumptions P6, P7, P8
- [backend/settings/urls.py](../../backend/settings/urls.py) — all 25 lines,
  and the comment on the catch-all
- [backend/settings/views.py](../../backend/settings/views.py) — **read, do not
  edit**. It is the precedent: reading a fixed file out of
  `settings.FRONTEND_WEB_DIST` and handing it back is already how the shell is
  served in production, which is also the proof that `dist/` is readable on the
  dyno at runtime
- [backend/settings/tests.py](../../backend/settings/tests.py) — **read, do not
  edit**. `SpaRoutingTests` lists every path that must still resolve to `spa`;
  `/sw.js` is not among them, which is why this chunk needs no test change
- [frontend-web/src/main.jsx](../../frontend-web/src/main.jsx) — 19 lines

## Build

### 1. `frontend-web/public/sw.js`

```js
// A pass-through service worker: it caches nothing, stores nothing, and changes
// no response. It exists because Chrome will not offer to install a web app
// without a registered worker that handles fetch.
//
// Keep it this way. A worker that answers from a cache can serve a stale app to
// a phone with no obvious way to clear it, and this app is online-only by
// design — there is nothing useful to do with a workout log that cannot reach
// the API.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
```

No `install` handler, no `activate` handler, no `skipWaiting()`, no
`clients.claim()` (P7). The visible consequence is in "Done when": the first
load registers the worker but is not yet controlled by it, so **Install appears
on the second load**.

### 2. `frontend-web/src/serviceWorker.js` — new file

```js
// Registering the pass-through worker in public/sw.js.
//
// The path is /sw.js in both homes, and deliberately so. A worker controls only
// URLs at or below its own path, and the built copy lives at /static/sw.js,
// whose scope could never reach the app at /. Vite serves public/ at the root
// in development; Django serves the same built file at /sw.js from a route
// above the SPA catch-all (backend/settings/urls.py). Vite rewrites
// root-absolute URLs in index.html, but not string literals in JavaScript, so
// this one path is right in both places with nothing to branch on.
export function registerServiceWorker() {
  // Development is left alone: the dev server's HMR client has no business
  // behind a service worker, and one registered against localhost outlives the
  // code that registered it -- it has to be unregistered by hand afterwards.
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  // After load, so registering never competes with the first paint or with the
  // app's first request for data.
  window.addEventListener('load', () => {
    // A script at /sw.js already implies this scope. Saying it anyway makes a
    // moved file fail loudly rather than quietly registering a narrower one.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Losing the worker costs the install prompt and nothing else, so it must
      // never reach the user or surface as an unhandled rejection. Chrome logs
      // the real reason to the console by itself.
    })
  })
}
```

`import.meta.env.PROD` is replaced at build time and the guard is then removed
as dead code — verified: the built bundle contains the registration with no
conditional around it, and the development bundle contains nothing at all.

### 3. `frontend-web/src/main.jsx`

One import beside the others, and one call **after** `createRoot(...).render(...)`
so nothing defers the mount:

```js
import { registerServiceWorker } from './serviceWorker.js'
```

```js
registerServiceWorker()
```

Nothing else in the file changes.

### 4. `backend/settings/urls.py` — the one additive route

Two imports and one `urlpatterns` entry, placed **above the catch-all**:

```python
from django.conf import settings
from django.views.static import serve
```

```python
    # The service worker, at the root rather than under /static/: a worker
    # controls only the URLs at or below its own path, and the app is at /.
    # Vite serves the same file at /sw.js in development, so the registration
    # in frontend-web/src/serviceWorker.js needs one path and no branch. Above
    # the catch-all, or it would be answered with the SPA shell.
    re_path(
        r'^sw\.js$',
        serve,
        {'document_root': settings.FRONTEND_WEB_DIST, 'path': 'sw.js'},
        name='service-worker',
    ),
```

Four things about this line:

* **`django.views.static.serve` is safe here.** Its documented warning is about
  serving a *user-supplied* path; `path` is a literal in the extra-options dict
  and the regex matches nothing else, so there is no input to traverse with. It
  is also the same function `django.contrib.staticfiles` delegates to, which is
  what serves every bundle in the app under `make serve` already.
* **`settings.FRONTEND_WEB_DIST`, not `STATIC_ROOT`.** `dist/` is what exists on
  the dyno at runtime — the Node buildpack builds it and the root
  `package.json`'s build script deletes only `frontend-web/node_modules`, never
  `dist/`. `settings.views.spa` reads `index.html` from the same directory in
  production today, which is the proof.
* **It works under both `DEBUG` settings**, unlike anything routed through
  WhiteNoise. Verified: `/sw.js` returns the file with
  `Content-Type: text/javascript` with `DEBUG` on and off alike.
* **A missing `dist/sw.js` is a clean 404**, not the shell — `serve` raises
  `Http404` and the request never reaches the catch-all. That is the right
  answer for a frontend that has not been built, and the `.catch()` in the
  registration is what makes it harmless.

## Done when

### Under `make run` — nothing registers, and that is the pass

- <http://localhost:5173> works exactly as before, HMR included.
- DevTools → Application → **Service Workers is empty**, and
  `navigator.serviceWorker.controller` is `null` in the console (P6).
- The file is still served, by Vite, from the root:

  ```
  curl -sS -o /dev/null -D - http://localhost:5173/sw.js
      → Content-Type: text/javascript
  ```

- `curl -sS http://localhost:8000/sw.js` against the Django server may 404 if
  `dist/` has not been built. That is expected and means nothing: under
  `make run` the browser never talks to `:8000` for anything but `/api` and
  `/admin`.

### Under `make serve` — the whole mechanism

**The served file, and that it is the file and not the shell:**

```
curl -sS -o /dev/null -D - http://localhost:8000/sw.js
    → Content-Type: text/javascript

curl -sS http://localhost:8000/sw.js | head -1
    → // A pass-through service worker: it caches nothing, stores nothing, and
```

That second one is the check that matters. A `Content-Type` of
`text/html; charset=utf-8`, or a body starting `<!DOCTYPE html>`, means the
route is below the catch-all or missing, and the status code would be 200 either
way.

**The routing, from `make shell`:**

```python
>>> from django.urls import resolve
>>> resolve('/sw.js').url_name
'service-worker'
>>> resolve('/nothing/here').url_name
'spa'
>>> resolve('/api/v1/exercises/').url_name != 'service-worker'
True
```

**The bundle, which is where the path could silently go wrong:**

```
grep -c 'serviceWorker.register' frontend-web/dist/assets/*.js    → 1
grep -c '/static/sw' frontend-web/dist/assets/*.js                → 0
```

**In the browser at <http://localhost:8000>** — `localhost` counts as a secure
context, so no HTTPS is needed to test this locally:

- DevTools → Application → Service Workers shows **`sw.js` activated and
  running**, source `http://localhost:8000/sw.js`, **scope
  `http://localhost:8000/`** — the root, not `/static/`. A scope of `/static/`
  is the failure this whole chunk is built around.
- Reload. `navigator.serviceWorker.controller` is now non-null, the app loads
  and behaves exactly as before, and every request in the Network tab still
  returns real data.
- **Then unregister it** from that same panel before moving on. A worker
  registered against `localhost:8000` survives every later `make serve` and
  will outlive this branch otherwise.

### Under `make test`

- **130 tests, passing** — the same 130 as before. `settings/tests.py` is not
  edited and does not need to be: `SpaRoutingTests` asserts about `/`,
  `/login`, `/exercises-catelog/`, `/training-sessions/`, `/settings/` and
  `/nothing/here`, none of which is `/sw.js`, and `SpaShellTests` patches
  `settings.views.INDEX_HTML` at its own fixture and never touches this route.
- `python manage.py check` reports no issues.
- `git diff --stat` shows exactly two modified files (`main.jsx`, `urls.py`) and
  two new ones (`public/sw.js`, `src/serviceWorker.js`).

### On the phone, after the human deploys — the actual point

- <https://gym-app-prod-5289d471fd73.herokuapp.com/> in Android Chrome.
- **Load it, then reload once.** The first load registers the worker; because
  there is no `clients.claim()`, the page that registered it is not controlled
  by it, and Chrome's install criteria are met from the next navigation onward
  (P7). A missing Install option on the very first load is not a failure.
- ⋮ → **Add to Home screen** now offers **Install**.
- Installing puts a black tile with a white **G** on the home screen, cropped to
  the launcher's own shape with the letter intact and no clipped edge.
- Opening it launches on a `#111111` splash with the icon, then the app with **no
  address bar and no browser chrome**, in its own entry in the app switcher.

## Do not

- Add caching, a cache name, `caches.open`, precaching, an offline fallback
  page, `skipWaiting()`, `clients.claim()`, `install`/`activate` handlers,
  background sync or push. The worker is the fetch handler and nothing else
  (P7).
- Add `vite-plugin-pwa`, `workbox-*` or any dependency to
  `frontend-web/package.json`.
- Register the worker in development, or delete the `import.meta.env.PROD`
  guard (P6).
- Register `/static/sw.js`, or compute the path from `import.meta.env.BASE_URL`.
  The whole design is that `/sw.js` is correct in both homes; deriving it from
  the base gives `/static/sw.js` in production, which is the bug this chunk
  exists to prevent and which fails *silently* — registration succeeds with a
  scope of `/static/` and Chrome simply never offers Install.
- Let a failed registration reach the user: no `throw`, no error state, no
  `<Status>`, no bare promise without a `.catch()`.
- Add a `Service-Worker-Allowed` header, `WHITENOISE_ADD_HEADERS_FUNCTION`, or
  any WhiteNoise configuration. 00-context has the reasoning; the short version
  is that WhiteNoise is not in `MIDDLEWARE` under `make serve` at all.
- Move the route below the catch-all, or add it to
  [api_urls.py](../../backend/settings/api_urls.py) — it is not an API route.
- Touch [settings/views.py](../../backend/settings/views.py) or
  [settings/tests.py](../../backend/settings/tests.py).
- Touch `Procfile`, `bin/post_compile`, `requirements.txt`, the root
  `package.json` or `.python-version`.
- Add a `beforeinstallprompt` listener or any install button in the UI.
- Change anything the user can see: no component, no page, no `styles.css`.

## What the user sees

**In the app: nothing.** Every screen, every style and every request is what it
was. The worker passes fetches straight through and holds nothing.

**Around the app: everything this feature was for.** On Android Chrome the ⋮
menu stops offering a bookmark and offers to install the thing — and once it is
installed, Gym App is an app: its own black-and-white icon in the launcher, its
own splash screen, its own window in the app switcher, and not a strip of
browser chrome anywhere. The address bar is gone, which on a phone held
one-handed in a gym is most of the screen this app was missing.
