# 04 — Saying so, in the place someone would look

**Goal:** [frontend-web/README.md](../../frontend-web/README.md) gains `public/`
in its layout block and a short section on how to check installability again
after a change. Nothing else, anywhere.

One file. No code.

## Read first

- [frontend-web/README.md](../../frontend-web/README.md) — all 60 lines; the
  Layout block is lines 35–46 and the voice to match is the whole file's
- [00-context.md](00-context.md) — the two homes, and the scope-and-serving
  story, which is what the new section is compressing into a paragraph
- The three chunks that landed, for what actually exists to describe:
  [01](01-icons-and-manifest.md), [02](02-shell-link-and-theme-colour.md),
  [03](03-service-worker-and-scope.md)

## Build

### 1. The layout block

Three lines added to the existing fenced block, in the order things are reached:
`public/` above `index.html`, `src/serviceWorker.js` beside the other `src/`
files, `tools/` at the foot. Something close to:

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

`src/serviceWorker.js` is longer than anything already in the block, so the
description column moves right. **Re-pad every line** — a block with one row out
of alignment is worse than the widening.

### 2. A section on installability

After **Layout** and before **Authentication**. Two or three short paragraphs
plus a checklist, in the README's existing register — plain, specific, no
marketing. It has to carry four facts, because they are the four a future reader
will otherwise have to rediscover:

* **What is there.** `public/manifest.json`, three PNGs and an SVG master in
  `public/icons/`, `public/sw.js`, and the `<link rel="manifest">` plus the
  paired light/dark `theme-color` metas in `index.html`. The worker caches
  nothing; it exists only because Chrome requires a fetch handler before it will
  offer to install.
* **The path split.** `public/` is served at `/` by the dev server and at
  `/static/` by Django, so the manifest's icon `src` values are relative and its
  `start_url` / `scope` are absolute `/`. Vite rewrites the `href` in
  `index.html` and does not rewrite string literals in JS.
* **Why Django has a `/sw.js` route.** One entry in `backend/settings/urls.py`,
  above the catch-all: a worker only controls URLs at or below its own path, so
  the built copy at `/static/sw.js` could not cover the app at `/`. Name the
  file so a reader can go and look.
* **How to re-test it**, which is the section's reason to exist:

  ```
  make serve
  ```

  then, on <http://localhost:8000>:

  1. DevTools → Application → **Manifest** — name, icons and their previews all
     resolve.
  2. DevTools → Application → **Service Workers** — `sw.js` activated, scope
     `http://localhost:8000/` and not `/static/`.
  3. On a phone, against the deployed URL: ⋮ → Add to Home screen says
     **Install**, not Create shortcut. Load once and reload — the first load
     registers the worker and is not yet controlled by it.

  Worth one line: `make run` cannot check any of this, because registration is
  skipped in development on purpose and there is no `/static/` prefix to get
  wrong.

  And one line on unregistering the worker from that same DevTools panel when
  finished, so it does not survive into the next `make serve`.

### 3. How to regenerate the icons

Two or three lines, either inside that section or right after it:

```
python3 frontend-web/tools/make-icons.py
```

Run with the **system** `python3` — it needs Pillow, which the project's
`.venv` deliberately does not have, because an imaging library on the dyno to
redraw an icon that was drawn once is not a dependency this app is taking on.
`public/icons/icon.svg` is the master; the three PNGs are generated from the
same drawing, one of them padded for Android's adaptive-icon crop.

## Done when

- `frontend-web/README.md` is the only changed file — `git diff --stat` shows
  one line of output.
- The layout block lists `public/`, `src/serviceWorker.js` and `tools/`, and
  every description in it starts in the same column.
- Every path, filename and command named in the new prose exists. Check each
  one; a README that names `manifest.webmanifest` or `src/pwa.js` is worse than
  no README.
- The `make serve` recipe in it, followed literally from a clean checkout,
  reaches an activated worker at scope `/`.
- `make test` — **130 tests, passing**, trivially: no code changed.
- `make run` and `make serve` both still come up.

## Do not

- Change any code, in either half of the project.
- Touch [README.md](../../README.md) at the repository root,
  [docs/deploying.md](../../docs/deploying.md),
  [root-files/](../../root-files), `CLAUDE.md` or `iteration-flow.md`. The
  agreed description names `frontend-web/README.md` and nothing else.
- Add a new documentation file. This goes in the README that already exists.
- Write a PWA tutorial. What the reader needs is what *this* repository does and
  why, and where to look.
- Document caching, offline behaviour or an update strategy. There is none, and
  describing one invites somebody to build it.
- Rewrite the sections already in the file.

## What the user sees

**Nothing.** No code changes and no screen changes; `make test` is green for the
same reason it would be if nothing had happened.

What changes is for the next person to open `frontend-web/`: the layout block
stops having an undocumented directory in it, and the two facts that are
genuinely surprising about this feature — that `public/` is served from two
different prefixes, and that Django has a route whose only job is to widen a
service worker's scope — are written down beside the code instead of living in a
spec directory nobody will think to open.
