# frontend-web

The web client: a React single-page app, built by Vite, talking to the Django
backend's DRF API at `/api/v1/`.

Django serves no page content any more. It answers every non-API, non-admin URL
with the same `index.html` shell (`settings.views.spa`) and the app's router
takes it from there, which is why a reload or a deep link to
`/exercises-catelog/<uuid>` lands where it should.

## Running it

Two servers in development, so edits reload instantly:

```
cd backend && python manage.py runserver     # the API, on :8000
cd frontend-web && npm install && npm run dev  # the app, on :5173
```

Open <http://localhost:5173>. Vite proxies `/api` and `/admin` through to
Django, so the browser sees one origin and the session and CSRF cookies work
with nothing extra configured — no CORS, no tokens.

To run it the way it is served in production, build instead and use Django
alone on <http://localhost:8000>:

```
cd frontend-web && npm run build
```

`npm run build` writes `dist/`, which Django picks up in two places: the shell
at `dist/index.html`, and the hashed bundles through `STATICFILES_DIRS`. Vite
builds with `base: '/static/'` so those bundle URLs match `STATIC_URL`.

## Layout

```
public/               copied into dist/ verbatim: the manifest, the icons, sw.js
index.html            Vite's entry document
src/main.jsx          mounts <App> inside the router and the auth provider
src/App.jsx           the routes, and which of them need a session
src/api.js            the one door to /api/v1/: JSON, cookies, CSRF, pagination
src/auth.jsx          who is signed in, for the whole app
src/hooks.js          useLoad (fetch-on-mount) and useDocumentTitle
src/serviceWorker.js  registers public/sw.js — in built output only
src/components/       the nav, the auth gate, the loading/error line
src/pages/            one file per route
tools/                one-off scripts, run by hand; never built, never shipped
```

## Installing it

On Android, Chrome's ⋮ → Add to Home screen offers **Install** rather than
Create shortcut: the app gets its own icon and its own entry in the launcher,
and opens standalone with no address bar. Four things put that there, and
Chrome needs all four — `public/manifest.json` for the name, the icons and
`display: "standalone"`; the three PNGs and their SVG master in
`public/icons/`; the `<link rel="manifest">` and the paired light/dark
`theme-color` metas in `index.html`; and `public/sw.js`, registered by
`src/serviceWorker.js`. The worker hands every request straight to the network
and does nothing else. It caches nothing and there is no offline mode — it
exists only because Chrome will not offer to install an app that has no
registered fetch handler.

The paths are the part that repays care, because `public/` is served at `/` by
the dev server and at `/static/` by Django. Vite rewrites root-absolute URLs in
`index.html`, so the single `href="/manifest.json"` there is right in both
homes; it does not rewrite string literals in JavaScript, and it does not read
the contents of `public/` at all. So the manifest's icon `src` values are
relative — they resolve against wherever the manifest itself is being served
from — while its `start_url` and `scope` are the absolute `/`, because the app
lives at the root in both homes and never under `/static/`.

`backend/settings/urls.py` carries one route that exists for this feature
alone: it serves the built `sw.js` at `/sw.js`, above the SPA catch-all. A
service worker controls only the URLs at or below its own path, so the built
copy at `/static/sw.js` could never cover an app at `/`. With that route,
`/sw.js` is the correct path in development and in production alike, and the
registration is one string with nothing to branch on.

To check any of it after a change, build and serve it the production way —
`make run` cannot tell you anything here, because registration is deliberately
skipped in development and there is no `/static/` prefix to get wrong:

```
make serve
```

Then, on <http://localhost:8000>:

1. DevTools → Application → **Manifest** — the name, the icons and their
   previews all resolve, with nothing flagged.
2. DevTools → Application → **Service Workers** — `sw.js` is activated and its
   scope is `http://localhost:8000/`, not `http://localhost:8000/static/`.
3. On a phone, against the deployed URL: ⋮ → Add to Home screen says
   **Install**. Load the page once and reload first — the worker claims no
   clients, so the load that registers it is not yet controlled by it, and the
   offer appears on the second.

Unregister the worker from that same Service Workers panel when you are
finished. Registrations belong to the origin, so one left behind outlives the
`make serve` that created it.

The icons are generated rather than drawn by hand. `public/icons/icon.svg` is
the master; the three PNGs are the same letterform drawn again with Pillow
(there is no SVG rasteriser here), one of them padded so Android's
adaptive-icon crop cannot clip it. To redraw them after changing the master:

```
python3 frontend-web/tools/make-icons.py
```

That is the system `python3`, deliberately: the script needs Pillow, and the
project's `.venv` does not have it. An imaging library on the dyno to redraw an
icon that was drawn once is not a dependency this app is taking on. Nothing in
`npm run build` or the Heroku build runs the script.

## Authentication

The API authenticates with Django's session cookie, so the app needs three
calls, served by the backend's `accounts` app:

| Call | Does |
| --- | --- |
| `GET /api/v1/auth/session/` | who is signed in; also plants the CSRF cookie |
| `POST /api/v1/auth/login/` | exchanges credentials for a session |
| `POST /api/v1/auth/logout/` | ends it |

`src/api.js` reads the CSRF token from the cookie on every unsafe request
rather than caching it, because logging in rotates it.
