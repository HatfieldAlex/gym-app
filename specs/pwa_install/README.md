# Installable on a phone — build specs

Chrome's *Add to Home screen* dialog, on Android, currently offers **Create
shortcut**: a bookmark with a screenshot for an icon that opens back inside the
browser. This feature makes it offer **Install** — the app's own icon in the
launcher, its own splash screen, its own window in the app switcher, and no
address bar.

Four things get there, and Chrome needs all four: a manifest, icons, a
`<link rel="manifest">` in the shell, and a registered service worker with a
fetch handler. The worker caches nothing and does nothing; it is a toll gate,
not a feature.

Split into chunks small enough to hand to an AI one at a time.

## How to use these

Feed **[00-context.md](00-context.md) + exactly one numbered chunk** per prompt.
Nothing else is needed: each chunk names the files to read, states its own "done
when", and lists what it must not touch.

Build them in order. Each one leaves the app in a working, checkable state, so a
chunk that comes out wrong can be redone without unpicking the ones after it.

| # | Chunk | Touches | Depends on |
|---|-------|---------|------------|
| 01 | [The icons, and the manifest](01-icons-and-manifest.md) — `public/`, an SVG master, three PNGs, the manifest, the one-off generator | `frontend-web/public/`, `frontend-web/tools/` | — |
| 02 | [Telling the browser](02-shell-link-and-theme-colour.md) — the manifest link and the paired light/dark `theme-color` metas | `frontend-web/index.html` | 01 |
| 03 | [The worker, and its scope](03-service-worker-and-scope.md) — `sw.js`, the registration, the one Django route above the catch-all | `public/sw.js`, `src/serviceWorker.js`, `src/main.jsx`, `backend/settings/urls.py` | 01, 02 |
| 04 | [Saying so](04-docs.md) — the layout block, and how to re-test installability | `frontend-web/README.md` | 01–03 |

**No chunk has a migration and no chunk adds a test.** The feature adds no model
and no column, so [docs/schema.dbml](../../backend/docs/schema.dbml) must come
out of all four byte-identical; and `make test` must read **130 tests, passing**
after every one of them. `backend/settings/tests.py` is not edited — chunk 03 is
the only backend chunk, and the route it adds is `/sw.js`, which appears in
none of the paths those tests assert on.

## Why this order

**01 first because assets come before references to them.** It is also the only
chunk with anything to design — a letterform, three sizes, and a padded variant
sized to Android's adaptive-icon crop — and the only one that produces binary
files, which are the awkward thing to re-do later. It links to nothing and is
linked from nothing, so it can be got wrong and fixed in isolation: the check is
four URLs and what they return.

**02 and 03 are separate on purpose, and the gap between them is the point.**
Both are needed before Chrome offers Install, so it is tempting to land them
together. Don't. With 02 in and 03 out, the phone is in a specific, checkable
state — Chrome has read the manifest, DevTools shows the name and the icons,
and the menu still says *Create shortcut*. That is the "before" picture, and it
is the only way to know that 03's worker is what flipped it rather than
something in 02 having quietly failed. Landed as one chunk, a broken manifest
and a broken worker are indistinguishable: the menu says the same thing it said
at the start.

02 is also, on its own, the one visible change in the whole feature — the
address bar takes the app's colour — so it is worth being able to look at.

**03 is not split further**, though it spans both halves of the project. The
worker, the path it is served at and the call that registers it are one
mechanism; a chunk that added `public/sw.js` without registering it could only
be reviewed by confirming a file exists, which is not a review.

**04 last, because it describes what happened.** Written before 03, it would
document a plan.

## The one thing to get right

**A worker controls only the URLs at or below its own path.** In production the
built `sw.js` lands in `dist/` and is served at `/static/sw.js` — scope
`/static/`, which can never reach the app at `/`. In development it is at
`/sw.js` and is already fine. So the two homes disagree, and the production one
is the broken one.

The fix, in 03, is **one route in `backend/settings/urls.py`, above the
catch-all**, serving the built file at `/sw.js`. That makes `/sw.js` correct in
both homes, which in turn makes the registration a single unconditional string
with nothing to branch on. The alternative — a `Service-Worker-Allowed: /`
header from WhiteNoise — was investigated and rejected, because WhiteNoise is
only in `MIDDLEWARE` when `DEBUG` is false and `make serve` runs with `DEBUG`
true: it would have worked on Heroku and nowhere else, leaving the hardest part
of the feature checkable only by deploying. [00-context.md](00-context.md) has
the full reasoning and keeps it written down as the fallback.

The failure mode is what makes this worth a section: registering `/static/sw.js`
**succeeds**. There is no error, no warning and no console message. Chrome
simply never offers Install, and there is nothing to look at that says why.

## Why `200` proves nothing here

[settings/urls.py](../../backend/settings/urls.py) ends in
`re_path(r'^.*$', spa)`. In production any root-level URL that is not `/api/`,
`/admin/` or `/static/…` comes back as `index.html` with **HTTP 200**:

```
$ curl -s http://localhost:8000/manifest.json | head -1
<!DOCTYPE html>
```

Every verification step in every chunk therefore asserts on a `Content-Type`
header or on the first bytes of the body. Development, where Vite honestly
404s, is the more forgiving of the two homes — which is the wrong way round, and
is why **`make serve` is not optional** when checking this feature. It is the
only local way to exercise the `/static/` prefix, the built `index.html` and the
catch-all at once.

## Two corrections to what was assumed going in

Both were verified against this checkout while writing these specs, and both
change a file name or a decision. They are called out here so they are not read
as drift:

* **WhiteNoise does not know `.webmanifest`.** It ships its own media-type
  table rather than using Python's `mimetypes`, and that table has no entry for
  the extension — so a `manifest.webmanifest` would be served as
  `application/octet-stream` **on Heroku and only on Heroku**, which is the one
  environment this feature is tested in. The manifest is therefore
  `manifest.json`, which is in both tables and needs no configuration. The
  escape hatch, if the human wants the registered media type back, is in
  00-context.
* **`make serve` runs with `DEBUG = True`**, so WhiteNoise is not in
  `MIDDLEWARE` at all locally and `/static/` is served by `runserver`'s own
  staticfiles handler. This is what rules out the header approach to the service
  worker's scope, and it cannot be worked around by running `make serve` with
  `DJANGO_DEBUG=False` — that switches on `SECURE_SSL_REDIRECT` and turns
  `http://localhost:8000` into an infinite redirect.

## Deliberately out of scope

Not in any chunk, listed so they do not creep in:

- **`vite-plugin-pwa`, Workbox, or any new dependency** in
  `frontend-web/package.json` or `backend/requirements.txt`. Two hand-written
  files, and Pillow stays out of the `.venv`.
- **Offline caching**, precaching, an offline page, background sync, push. The
  fetch handler is `fetch(event.request)` and stops.
- **Any change to `vite.config.js`**, including its base switching. `public` is
  already Vite's default `publicDir`.
- **`backend/settings/views.py` and `backend/settings/tests.py`.** The SPA shell
  stays a byte-identical static file served verbatim, and its tests keep
  passing as written.
- **The Heroku deploy contract** — `Procfile`, `bin/post_compile`,
  `requirements.txt`, the root `package.json`, `.python-version`.
- **Any visual or functional change to the app.** No screen, no route, no
  component, no endpoint; `styles.css` is never opened, and stays free of hex
  colours.
- **A custom install prompt** — no `beforeinstallprompt`, no "Add to home
  screen" button. Chrome's own menu is the entire interface.
- **iOS and Safari**, `apple-mobile-web-app-*`, `apple-touch-icon`, splash
  screens. Android Chrome is the target.
- **Manifest fields beyond the nine named**, and **a favicon**.

## What the user sees

Nothing directly. This is an index for whoever is building the feature, not a
build step of its own — it adds no code and changes no screen. What the user
ends up with once 01–04 are in is the sum of the "What the user sees" sections
in those chunks: in Chrome on a phone, an address bar that takes the app's own
colour — and a ⋮ menu that offers to install the thing rather than bookmark it,
after which Gym App has an icon, a splash screen and a window of its own, and
not a strip of browser chrome anywhere.

Testing is the human's, on the deployed URL from their own phone, after they
deploy. Nothing about installability can be settled from a laptop.
