# 02 — Telling the browser: the manifest link, and the status bar

**Goal:** three lines in `frontend-web/index.html`. One tells Chrome where the
manifest is; two tell it what colour the status bar should be in each system
theme. After this chunk Chrome recognises the app's manifest — and still offers
only *Create shortcut*, because there is no service worker yet. That gap is
deliberate and is what makes chunk 03 provable.

One file. No new file, no backend file, no `src/` file.

## Read first

- [frontend-web/index.html](../../frontend-web/index.html) — all twelve lines
- [00-context.md](00-context.md) — "The two homes", and in particular that
  `index.html` **is** processed by Vite while files in `public/` are not; and
  the `settings/tests.py` section, which is why editing this file is safe
- [frontend-web/src/styles.css](../../frontend-web/src/styles.css) line 1 —
  `color-scheme: light dark`, and no `background` on `body`: the ground under
  the app is the user agent's `Canvas`, which is why the light/dark pair exists

## Build

Into the `<head>`, after the viewport meta and before the `<title>`:

```html
    <link rel="manifest" href="/manifest.json" />

    <!-- The manifest's theme_color is one colour; the status bar should follow
         the system theme like the rest of the app does (styles.css sets
         color-scheme: light dark and paints no background of its own). A
         media-qualified pair overrides the manifest per-document, in the
         browser and in the installed app alike. -->
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111" />
```

Match the file's existing two-space indentation and its self-closing `/>` style.

### The `href`, which is the whole chunk

`href="/manifest.json"` — **root-absolute, no leading dot, no `/static/`**.

Vite processes `index.html` and rewrites root-absolute asset URLs with the build
base. Verified against this project's own `vite.config.js`: the source line
above comes out of `vite build` as

```html
<link rel="manifest" href="/static/manifest.json" />
```

so the one line is correct in both homes, and no environment branching is
needed. The two alternatives are both wrong:

* **`href="manifest.json"`** (relative) resolves against the *current page*, and
  the SPA has deep routes — on `/training-sessions/` it would ask for
  `/training-sessions/manifest.json`, which the catch-all answers with the shell
  itself. 200, HTML, no manifest, no error in the console you would notice.
* **`href="/static/manifest.json"`** is right in production and dead in
  development, where there is no `/static/` prefix at all.

`theme-color` metas carry no URL and are rewritten by nothing.

### Why `#111111` and not `#121212`

The dark value is the brand ink, the same one in the manifest and under the
icons (P5). Chrome renders `Canvas` in dark mode as `#121212`, so there is a
one-step-per-channel seam between the status bar and the page. Matching Chrome's
number exactly would mean hard-coding a user-agent implementation detail that is
not ours and can change; the ink is ours. If the human dislikes the seam, this
is a one-character edit.

### Nothing else goes in this file

No favicon, no `apple-touch-icon`, no `apple-mobile-web-app-*`, no
`<meta name="description">` (P9). The agreed description names the manifest link
and the theme-color pair, and that is the entire diff.

## Done when

**Under `make run`:**

- <http://localhost:5173> loads and looks exactly as it did.
- View source: the three lines are there with `href="/manifest.json"`.
- DevTools → Application → Manifest shows **Gym App**, short name **Gym**,
  `start_url` `/`, display `standalone`, and all three icons resolving — with a
  rendered preview, not a broken-image box. That last part is the real check:
  it proves chunk 01's relative `src` values resolve from where the manifest is
  actually served.

**Under `make serve`:**

```
grep -o 'rel="manifest" href="[^"]*"' frontend-web/dist/index.html
    → rel="manifest" href="/static/manifest.json"
```

That grep is the point of the chunk. Then, with the server up:

```
curl -sS -o /dev/null -D - http://localhost:8000/static/manifest.json
    → Content-Type: application/json
```

and DevTools → Application → Manifest on <http://localhost:8000> again shows the
name, the icons and their previews.

**In Chrome on Android, against the Heroku URL after a deploy** — the state this
chunk deliberately stops at:

- ⋮ → *Add to Home screen* still says **Create shortcut**, not Install. Chrome
  has the manifest and is missing the service worker. Chunk 03 supplies it.
- The address bar picks up the theme colour: white in light mode, `#111111` in
  dark. Flipping the system theme flips it.

**And:**

- `make test` — **130 tests, passing.** No Python changed. In particular
  `settings/tests.py` is untouched and unaffected: its `SpaShellTests` write
  their own three-line `index.html` into a temp directory and patch
  `settings.views.INDEX_HTML` at it, so they never read this file. What those
  tests protect is that Django returns the shell *verbatim* — which is still
  exactly what [settings/views.py](../../backend/settings/views.py) does, and
  that file is not opened by any chunk.
- `git diff --stat` shows one file, `frontend-web/index.html`, and nothing else.

## Do not

- Write `href="manifest.json"` or `href="/static/manifest.json"`.
- Touch [backend/settings/views.py](../../backend/settings/views.py) or
  [backend/settings/tests.py](../../backend/settings/tests.py).
- Touch `vite.config.js`, or add a plugin to rewrite anything.
- Add a favicon, `apple-touch-icon`, `apple-mobile-web-app-capable`, or any
  other head tag (P9).
- Add a `<meta name="theme-color">` without a `media` attribute "as a fallback".
  A bare one wins over the pair in browsers that support `media`, which defeats
  the whole point of the pair; browsers that do not support `media` simply fall
  back to the manifest's `theme_color`, which is the right answer anyway.
- Register a service worker here, or add `beforeinstallprompt` handling, or any
  JavaScript at all. Chunk 03, and never a custom install button.
- Change `<title>`, the viewport meta, `lang`, or the `<script type="module">`
  line.

## What the user sees

On a phone in Chrome, **the address bar takes the app's colour** — white in
light mode, near-black in dark — instead of Chrome's own grey, and it changes
with the system theme. That is the only visible change, and it is visible only
on mobile Chrome; on a desktop browser nothing looks different.

Underneath, Chrome now knows the app is called Gym App, that it wants to open
standalone, and what its icon is. It just will not offer to install it yet.
