# 01 — The icons, and the manifest that names them

**Goal:** put `frontend-web/public/` on disk, with a manifest and a set of icons
in it, and prove that both homes serve them as the right kind of file. Nothing
links to any of it yet — that is chunk 02 — so this chunk is entirely additive
and the app is untouched.

Frontend assets only. No backend file, no `src/` file, no `index.html`.

## Read first

- [00-context.md](00-context.md) — the two homes, what Vite rewrites and what it
  does not, the catch-all landmine, assumptions P1–P4
- [frontend-web/vite.config.js](../../frontend-web/vite.config.js) — the `base`
  switch on line 9, which is the whole reason the paths below are shaped as they
  are
- [.gitignore](../../.gitignore) line 38 — `dist/` is ignored, so everything
  this chunk produces has to be a tracked file under `public/`

## Build

### 1. `frontend-web/tools/make-icons.py` — the generator

A one-off developer tool. It is **not** part of `npm run build`, not part of the
Heroku build, and not referenced by anything: it is committed so that whoever
changes the letterform later can regenerate all three PNGs the same way instead
of guessing at them (P3). It lives in `tools/` rather than `public/` because
anything in `public/` is published to the web with the app.

Run it with the **system** `python3`, which has Pillow 12.1.1. The project's
`.venv` does not have Pillow and must not get it — no line is added to
`backend/requirements.txt`.

Requirements on the script:

* A module docstring saying what it is, that it is run by hand and never by a
  build, and the exact command to run it.
* `INK = '#111111'`, `PAPER = '#ffffff'`.
* Font `/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf`, with
  `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` as a fallback if the
  first is not present. Liberation Sans is metrically identical to Arial, which
  is what makes the PNGs agree with the SVG master's font stack.
* Writes into `frontend-web/public/icons/`, resolved relative to the script's
  own location rather than the working directory.
* A clear message rather than a traceback if Pillow is missing — it is the one
  thing that will go wrong on another machine.

The drawing, which is verified to work and produces a well-centred glyph:

```python
def draw_g(size, cap_fraction):
    image = Image.new('RGB', (size, size), INK)
    draw = ImageDraw.Draw(image)
    # Binary-search the point size whose cap height is cap_fraction of the
    # canvas: 'G' has no descender, so its bounding box is its cap height, and
    # asking for that directly is steadier than guessing at a point size.
    target = size * cap_fraction
    low, high = 1, size * 2
    while low < high:
        mid = (low + high + 1) // 2
        font = ImageFont.truetype(FONT, mid)
        box = draw.textbbox((0, 0), 'G', font=font, anchor='lt')
        if (box[3] - box[1]) <= target:
            low = mid
        else:
            high = mid - 1
    font = ImageFont.truetype(FONT, low)
    box = draw.textbbox((0, 0), 'G', font=font, anchor='lt')
    width, height = box[2] - box[0], box[3] - box[1]
    draw.text(
        ((size - width) / 2 - box[0], (size - height) / 2 - box[1]),
        'G', font=font, fill=PAPER, anchor='lt',
    )
    return image
```

Three calls, and the fractions are the design:

| Output | Call | Why that fraction |
|---|---|---|
| `icons/icon-192.png` | `draw_g(192, 0.62)` | full-bleed; the `G` fills the tile the way a launcher icon should |
| `icons/icon-512.png` | `draw_g(512, 0.62)` | the same drawing at the size Chrome uses for the splash screen |
| `icons/icon-512-maskable.png` | `draw_g(512, 0.40)` | padded for Android's adaptive crop — see below |

Mode is **`RGB`, not `RGBA`**: a maskable icon must be fully opaque or the
launcher's crop shows through, and the ground is `#111111` everywhere anyway.

**Why 0.40 for the maskable one.** Android crops an adaptive icon to an
arbitrary shape and only guarantees the circle inscribed in the middle 80% —
radius `0.4 × 512 = 204.8px` from the centre. At `cap_fraction=0.40` the glyph
box is `224 × 204`, whose half-diagonal is `151px`: comfortably inside, with
room for the more aggressive squircle masks. At 0.62 the half-diagonal is
`235px` and the crop clips the letter, which is exactly the failure this
separate file exists to avoid.

### 2. `frontend-web/public/icons/icon.svg` — the master

512×512, `viewBox="0 0 512 512"`, a `#111111` rect filling it, and a white bold
`G` centred, with `font-family` naming Liberation Sans and Arial before a
generic `sans-serif` so it renders as the PNGs do. It is the editable source the
PNGs are regenerated from and **is not listed in the manifest** (P4).

### 3. `frontend-web/public/manifest.json`

Exactly this, and nothing more (P2):

```json
{
  "name": "Gym App",
  "short_name": "Gym",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#111111",
  "background_color": "#111111",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Two things in there are load-bearing and are the single easiest mistake in this
chunk to make. Files in `public/` are copied byte for byte and Vite rewrites
nothing inside them, so:

* **`src` values are relative** — `icons/icon-192.png`, with no leading slash.
  A manifest's icon URLs resolve against the manifest's own URL, so relative
  gives `/icons/icon-192.png` in development and `/static/icons/icon-192.png` in
  production, both correct. A leading slash would give `/icons/…` in production,
  where nothing is served and the catch-all answers with HTML.
* **`start_url` and `scope` are absolute `/`** — the app is at the root in both
  homes and never at `/static/`. Relative values would resolve to `/static/` in
  production and the installed app would launch into the static directory.

`"purpose": "any"` is the default and is written out anyway, so the contrast
with the maskable entry reads at a glance.

## Done when

**Under `make run`** — all three of these, headers and body:

```
curl -sS -o /dev/null -D - http://localhost:5173/manifest.json
    → Content-Type: application/json

curl -sS http://localhost:5173/manifest.json
    → the JSON above, byte for byte

curl -sS -o /dev/null -D - http://localhost:5173/icons/icon-192.png
    → Content-Type: image/png
```

and the same `Content-Type: image/png` for `icon-512.png` and
`icon-512-maskable.png`.

**Under `make serve`** — the built copies, at the `/static/` prefix:

```
curl -sS -o /dev/null -D - http://localhost:8000/static/manifest.json
    → Content-Type: application/json

curl -sS -o /dev/null -D - http://localhost:8000/static/icons/icon-512-maskable.png
    → Content-Type: image/png
```

and the landmine, demonstrated rather than trusted:

```
curl -sS http://localhost:8000/manifest.json | head -1
    → <!DOCTYPE html>
```

That is a **200 carrying HTML** — the catch-all, doing exactly what it is
supposed to. It is the proof that a status code proves nothing here, and the
reason chunk 02's `href` must never be a bare root path in the built output.

**On disk, after `make build`:**

```
ls frontend-web/dist/manifest.json frontend-web/dist/icons/
```

all four files present, copied unchanged from `public/`.

**And:**

- `git status --short --untracked-files=all` lists exactly six new files —
  the manifest, four in `public/icons/`, the generator — and nothing modified.
- The three PNGs open at 192×192, 512×512 and 512×512, opaque, white `G` on
  `#111111`, and the maskable one's letter sits well inside the middle 80% of
  the square.
- `python3 frontend-web/tools/make-icons.py` reruns clean and reproduces the
  three PNGs identically (`git status` still clean afterwards).
- `make test` — **130 tests, passing.** This chunk touches no Python, so the
  number and the result are both unchanged.

## Do not

- Touch `frontend-web/index.html`. Nothing references the manifest yet, and it
  stays that way until chunk 02 — that is what makes this chunk separately
  reviewable.
- Touch `vite.config.js` (P1), `package.json`, or add any dependency to either
  half of the project.
- Add Pillow to `backend/requirements.txt`, or run the generator with `.venv`'s
  python (P3).
- Put the generator in `frontend-web/public/` or in `bin/` — `public/` publishes
  it to the web, and `bin/` is the Heroku deploy contract.
- Write the PNGs into `dist/`. `dist/` is gitignored and rebuilt from scratch;
  the tracked copies live in `public/icons/`.
- Add a favicon, an `apple-touch-icon`, or any icon size beyond the three (P9).
- Add manifest fields beyond the nine above — no `description`, `id`, `lang`,
  `orientation`, `screenshots`, `shortcuts`, `categories`, `display_override`.
- Give the icon `src` values a leading slash, or make `start_url` / `scope`
  relative. Both directions are wrong, in opposite homes.
- Rename the manifest to `manifest.webmanifest` (P2 — read the reasoning in
  00-context before deciding this is a nicety worth having).

## What the user sees

**Nothing at all.** No screen changes, nothing is linked from anywhere, and a
browser is never told these files exist. The app under `make run` and
`make serve` is pixel-for-pixel what it was.

What lands is the material: an icon of the app, and a document describing what
the app is called and how it should open. Chunk 02 is what shows either of them
to a browser.
