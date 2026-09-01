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
index.html          Vite's entry document
src/main.jsx        mounts <App> inside the router and the auth provider
src/App.jsx         the routes, and which of them need a session
src/api.js          the one door to /api/v1/: JSON, cookies, CSRF, pagination
src/auth.jsx        who is signed in, for the whole app
src/hooks.js        useLoad (fetch-on-mount) and useDocumentTitle
src/components/     the nav, the auth gate, the loading/error line
src/pages/          one file per route
```

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
