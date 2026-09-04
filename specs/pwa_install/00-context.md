# Shared context

Pair this with one numbered chunk. It is background, not a task: build nothing
from this file alone.

## What is being built

**An app you can install.** Today, opening the Heroku URL on an Android phone
and tapping Chrome's ⋮ → *Add to Home screen* offers **Create shortcut** — a
bookmark with a screenshot for an icon, which opens back inside Chrome, address
bar and all. This feature makes the same dialog offer **Install** instead: the
app gets its own icon, its own entry in the launcher and the app switcher, and
opens standalone with no browser chrome.

Four things put together get there, and Chrome needs all four:

1. a **web app manifest** — the name, the icons, `display: "standalone"`;
2. **icons** at 192 and 512, plus a padded 512 marked `maskable` so Android's
   adaptive-icon crop does not eat the letterform;
3. a **`<link rel="manifest">`** in the shell, so Chrome finds it, plus paired
   light/dark `<meta name="theme-color">` tags so the status bar keeps following
   the system theme;
4. a **registered service worker with a fetch handler**. It does nothing —
   `fetch(event.request)` and no more. There is no caching and no offline mode.
   It exists because Chrome will not offer Install without one.

Nothing about the app itself changes: not a screen, not a style, not a route,
not an endpoint. Every one of these chunks is additive, and a user who never
installs anything sees exactly what they saw before.

## The two homes, and why they disagree

This is the thing to understand before touching a file. The same frontend is
served two completely different ways, and a PWA is precisely the kind of feature
that works in one and silently fails in the other.

| | `make run` (development) | `make serve` and Heroku (production shape) |
|---|---|---|
| Who serves the app | Vite dev server, `:5173` | Django, `:8000` / the dyno |
| Vite `base` | `/` | `/static/` ([vite.config.js:9](../../frontend-web/vite.config.js)) |
| Where `public/` lands | served live at the **root** | copied into `dist/`, served at **`/static/`** |
| Who serves `/static/` | nobody — there is no such prefix | `runserver`'s staticfiles handler locally, WhiteNoise on Heroku |
| Django's role | the API and the admin only, proxied through Vite | everything |

So a file called `public/manifest.json` is at `/manifest.json` in development
and at `/static/manifest.json` in production. Any path written down anywhere in
this feature has to be right in **both**, and the two halves of the answer are
different:

* **`index.html` is processed by Vite**, so a root-absolute `href` in it is
  rewritten with the base at build time. Verified: `href="/manifest.json"` in
  the source comes out of `vite build` as `href="/static/manifest.json"`.
  This is what makes chunk 02 a single line that is correct in both homes.
* **JavaScript string literals are not**, so `register('/sw.js')` stays
  `'/sw.js'` in the bundle. Verified in the built output.
* **Files inside `public/` are not processed at all** — they are copied byte for
  byte. So the manifest's own contents are never rewritten, which is why its
  icon `src` values must be **relative** (they resolve against wherever the
  manifest itself is being served from) and `start_url` / `scope` must be
  **absolute `/`** (the app lives at the root in both homes, never at
  `/static/`).

### The catch-all landmine

[settings/urls.py:24](../../backend/settings/urls.py) ends in:

```python
re_path(r'^.*$', spa, name='spa'),
```

In production **any** root-level URL that is not `/api/`, `/admin/` or
`/static/…` returns `index.html` with **HTTP 200**. It does not 404. So:

```
$ curl -s http://localhost:8000/manifest.json | head -1
<!DOCTYPE html>
```

— two hundred, and HTML. Development, where Vite would honestly 404, is the
more forgiving of the two.

**Consequence for every chunk: `200` is not a check.** Every verification step
below asserts on the `Content-Type` header or on the first bytes of the body,
never on the status code alone. A builder who checks status codes will report
this feature working when it is not.

## Where the files go

```
frontend-web/public/manifest.json              chunk 01
frontend-web/public/icons/icon.svg             chunk 01  the master
frontend-web/public/icons/icon-192.png         chunk 01
frontend-web/public/icons/icon-512.png         chunk 01
frontend-web/public/icons/icon-512-maskable.png chunk 01
frontend-web/public/sw.js                      chunk 03
frontend-web/tools/make-icons.py               chunk 01  a one-off, never built
```

`frontend-web/public/` **does not exist yet**. `public` is Vite's default
`publicDir`, so creating it needs no change to
[vite.config.js](../../frontend-web/vite.config.js) — and none is made (P1).

`frontend-web/tools/` is outside `public/` and outside `src/`, so Vite neither
copies it nor bundles it. That is the whole reason it is not in `public/`: a
generator script in `public/` would be published to the web with the app.

`dist/` is gitignored ([.gitignore:38](../../.gitignore)). **Every asset this
feature adds must be a tracked source file that the build copies**, or it exists
on one laptop and nowhere else.

## The service worker's scope, and the one Django line

A service worker controls only URLs **at or below its own path**. In production
the built copy lands in `dist/` and is served at `/static/sw.js` — scope
`/static/`, which can never reach the app at `/`. In development it is at
`/sw.js` and the scope is already right. The two homes disagree, and the
production one is the broken one.

**The decision: Django serves the worker at `/sw.js` from a route above the
catch-all.** One `urlpatterns` entry in
[settings/urls.py](../../backend/settings/urls.py), reading the built file
straight off disk exactly as `settings.views.spa` already reads `index.html`.
`/sw.js` is then the correct path in **both** homes — Vite serves it there in
development, Django serves it there in production — so the registration is one
unconditional string with no environment branching. See chunk 03 for the line.

**The alternative, rejected:** keep the worker at `/static/sw.js` and widen its
scope with a `Service-Worker-Allowed: /` response header, registering with
`{ scope: '/' }`. It cannot work here, for a reason that is specific to this
project and was verified rather than assumed:

* the header would have to come from WhiteNoise, and
  [settings.py](../../backend/settings/settings.py) adds WhiteNoise to
  `MIDDLEWARE` **only when `DEBUG` is false**;
* `make serve` sets no environment, so `DJANGO_DEBUG` is unset, so `DEBUG` is
  `True` — confirmed: under `make serve` the middleware list contains no
  WhiteNoise at all, and `/static/` is served by `runserver`'s own staticfiles
  handler, which cannot add headers;
* and `make serve` cannot simply be run with `DJANGO_DEBUG=False` to fix it,
  because that switches on the hardening block at the foot of settings —
  `SECURE_SSL_REDIRECT = True` — and `http://localhost:8000` becomes an
  infinite redirect.

So the header approach would work on Heroku and nowhere else, leaving the one
piece of this feature that is hardest to get right verifiable only by deploying.
It stays written down here as the fallback if the route is ever a problem, and
nothing more.

### WhiteNoise does not know `.webmanifest`

The manifest is called **`manifest.json`**, not `manifest.webmanifest` (P2), and
that is a deliberate correction to an assumption made earlier in this iteration.

WhiteNoise does not use Python's `mimetypes`; it ships its own table, and that
table has no `.webmanifest` entry. Reproduce it:

```
$ ./.venv/bin/python -c "from whitenoise.media_types import MediaTypes; \
    print(MediaTypes().get_type('manifest.webmanifest'), MediaTypes().get_type('manifest.json'))"
application/octet-stream application/json
```

A `.webmanifest` would therefore be served as `application/octet-stream` **on
Heroku only** — correct under `make run`, correct under `make serve`, wrong in
the one place the human actually tests. `.json` is in both tables and needs no
configuration anywhere. Chrome accepts a manifest served as `application/json`.

If the human would rather have `manifest.webmanifest` and its registered
`application/manifest+json`, the whole change is: rename the file, update the
one `href` in `index.html`, and add
`WHITENOISE_MIMETYPES = {'.webmanifest': 'application/manifest+json'}` to
`settings.py` — accepting that the line only takes effect when `DEBUG` is false
and so cannot be verified without deploying.

## `settings/tests.py` keeps passing, untouched

The SPA-shell tests in
[backend/settings/tests.py](../../backend/settings/tests.py) are the tripwire on
this feature and **no chunk edits them**. Two things they assert, and what each
one does and does not forbid:

* **`SpaShellTests` — the shell is a static file.** `setUp` writes its *own*
  three-line `index.html` into a temporary directory and patches
  `settings.views.INDEX_HTML` at it; the tests then assert that what Django
  returns is byte-identical to that fixture and does not vary between an
  anonymous and an authenticated request. They never read the real
  `frontend-web/index.html`. **So chunk 02 may change `index.html` freely** —
  what must not change is that Django hands the file back verbatim, and no
  chunk touches [settings/views.py](../../backend/settings/views.py).
* **`SpaRoutingTests` — the catch-all covers the app's routes without covering
  the API's.** It resolves `/`, `/login`, `/exercises-catelog/`,
  `/training-sessions/`, `/settings/`, `/nothing/here` to `spa`, and
  `/api/v1/…` and `/admin/` to something else. `/sw.js` is in neither list, so
  chunk 03's route needs no change here either.

**Baseline: 130 tests, all passing.** Every chunk leaves it at 130 and green.
No chunk adds a test: this feature adds no Python behaviour worth one, and
`settings/tests.py` is out of scope.

No chunk adds a migration, so
[backend/docs/schema.dbml](../../backend/docs/schema.dbml) comes out of all four
byte-identical.

## Colours

There is no hex colour anywhere in the app's stylesheet and this feature does
not add one to it. [styles.css:1](../../frontend-web/src/styles.css) is
`:root { color-scheme: light dark; }`, `body` sets no background, and the whole
824-line sheet works in `currentColor`, `Canvas` and `color-mix()`. The ground
under the app is therefore the user agent's `Canvas` for the active scheme.

The three hex values this feature introduces live in the manifest and in
`index.html`, never in CSS:

| Where | Value | Is |
|---|---|---|
| manifest `theme_color`, `background_color`; the icons' ground | `#111111` | the brand ink, chosen by the human. It is the splash-screen colour of the installed app. |
| `<meta name="theme-color" media="(prefers-color-scheme: light)">` | `#ffffff` | `Canvas` in light |
| `<meta name="theme-color" media="(prefers-color-scheme: dark)">` | `#111111` | the same brand ink (P5) |

## How to verify

Three commands, and every chunk names which of them it needs.

```
make run      # Vite :5173 + Django :8000 — the development home
make serve    # vite build, then Django alone on :8000 — the production shape
make test     # 130 tests
```

**`make serve` is not optional for this feature.** It is the only local way to
exercise the `/static/` paths, the built `index.html` and the catch-all — that
is, everything that can differ between a laptop and the dyno.

Header checks are written as a GET that discards the body, because some of these
URLs answer HEAD differently from GET and the body is what Chrome reads:

```
curl -sS -o /dev/null -D - http://localhost:5173/manifest.json
```

## Assumptions

The chunks build as though all of these were true, and cite them by number. None
is established by the agreed description: they are the questions it leaves open,
answered the most likely way so the build has firm ground. To overturn one,
rewrite its row and `grep` the chunks for its number.

| # | Assumption | Why it holds |
|---|---|---|
| P1 | `frontend-web/public/` is created and `vite.config.js` is not touched. | `public` is Vite's default `publicDir`. Verified: a `public/` tree beside this project's own `vite.config.js` is copied into `dist/` root and served at `/` in dev with no config change. |
| P2 | The manifest is `manifest.json`, served as `application/json`. | WhiteNoise's media-type table has no `.webmanifest`, so that extension is `application/octet-stream` on Heroku and only on Heroku. See above; the escape hatch is written out there. |
| P3 | The three PNGs are generated once by a committed script run with the **system** `python3` and its Pillow, and both the script and its output are tracked. | There is no ImageMagick, `rsvg-convert` or Inkscape on this machine, and `.venv` has no Pillow. Adding Pillow to `backend/requirements.txt` would put an imaging library on the dyno to render an icon that was rendered months earlier — dependency creep, and out of scope. |
| P4 | The SVG is the design master and is **not** listed in the manifest's `icons`. It ships to `dist/` unreferenced. | The agreed description names three manifest icon entries and a source SVG separately. Keeping the master beside the PNGs is what makes "regenerate the icons" a real instruction rather than a wish. It is under a kilobyte. |
| P5 | The dark `theme-color` is `#111111`, the brand ink — not `#121212`, which is what Chrome actually renders `Canvas` as in dark mode. | `#111111` is the only dark this feature owns, and it is already the manifest's `theme_color` and the icons' ground. Chrome's `Canvas` is a user-agent value that is not ours to hard-code and can change. The seam is one step in each channel. |
| P6 | Registration is skipped in development (`import.meta.env.PROD` is false) and happens only in built output. | Vite's HMR client has no business behind a service worker, and a worker registered against `localhost:5173` outlives the code that registered it — it has to be unregistered by hand from DevTools. `make serve` builds, so `make serve` still exercises registration in full. |
| P7 | The worker is the fetch handler and nothing else — no `install`, no `activate`, no `skipWaiting()`, no `clients.claim()`. | The agreed description says so in as many words. The visible consequence is that the first page load registers the worker but is not yet controlled by it, so **Install appears on the second load or after a reload**. Chunk 03 says this out loud so it is not mistaken for a failure. |
| P8 | The registration lives in a new `frontend-web/src/serviceWorker.js`, called from `main.jsx`. | Registration needs four sentences of explanation about paths and homes; `main.jsx` is nineteen lines whose job is mounting the app. The module keeps the reasoning next to the code it justifies and costs `main.jsx` one import and one call. |
| P9 | No favicon, no `apple-touch-icon`, no `<link rel="icon">`. | The agreed description lists exactly what goes into `index.html`: the manifest link and the two `theme-color` metas. A favicon is a different, easy iteration and is not this one. |

## Deliberately out of scope

Not in any chunk, listed so they do not creep in. This is the agreed fence:

- **`vite-plugin-pwa`, Workbox, or any new dependency** in
  `frontend-web/package.json` or `backend/requirements.txt`. The manifest and
  the worker are two hand-written files.
- **Offline caching, precaching, an offline page, background sync, push
  notifications.** The worker's fetch handler calls `fetch(event.request)` and
  stops.
- **Any change to `vite.config.js`**, including its base switching.
- **`backend/settings/views.py` and `backend/settings/tests.py`.** The SPA shell
  stays a byte-identical static file and its tests keep passing as written.
- **`Procfile`, `bin/post_compile`, `requirements.txt`, `package.json`,
  `.python-version`** — the Heroku deploy contract is untouched.
- **Any visual or functional change to the app itself.** No new screen, no new
  route, no new component, no CSS. `styles.css` is not opened.
- **A custom install prompt** — no `beforeinstallprompt` handler, no "Add to
  home screen" button in the UI. Chrome's own menu is the whole interface.
- **iOS/Safari support**, `apple-mobile-web-app-*` metas, splash screens.
  Android Chrome is the target.
- **Manifest fields beyond the nine the description names** — no
  `description`, `categories`, `screenshots`, `shortcuts`, `orientation`,
  `id`, `lang`, `dir`, `display_override`.
- **A favicon** (P9).

## What the user sees

Nothing. This file is background handed to whoever builds a chunk; it produces
no code and no screen of its own. Every visible change lives in a numbered
chunk.
