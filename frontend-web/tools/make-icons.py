#!/usr/bin/env python3
"""Regenerate the PWA icon PNGs in frontend-web/public/icons/.

A one-off developer tool. It is not part of `npm run build`, not part of the
Heroku build, and nothing at runtime imports or invokes it. It is committed so
that whoever changes the letterform later can regenerate all three PNGs the
same way they were made the first time, instead of guessing at them.

The design master is `frontend-web/public/icons/icon.svg`; this script draws
the same white bold 'G' on the same #111111 ground with Pillow, because there
is no SVG rasteriser on this machine.

Run it by hand, with the SYSTEM python3 — the project's .venv has no Pillow
and must not get one:

    python3 frontend-web/tools/make-icons.py

The three PNGs it writes are tracked in git; rerunning it should leave
`git status` clean.
"""

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit(
        "error: Pillow is not installed for this interpreter.\n"
        "       Run this script with the SYSTEM python3, which has Pillow.\n"
        "       Do NOT install Pillow into the project's .venv or add it to\n"
        "       backend/requirements.txt.\n"
        "       On Debian/Ubuntu the system package is python3-pil."
    )

INK = '#111111'
PAPER = '#ffffff'

# Liberation Sans is metrically identical to Arial, which is what makes these
# PNGs agree with the SVG master's font stack. DejaVu Sans Bold is the
# fallback if Liberation is not installed.
FONT_CANDIDATES = (
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
)

FONT = next((path for path in FONT_CANDIDATES if Path(path).exists()), None)
if FONT is None:
    sys.exit(
        'error: no bold sans font found. Looked for:\n  '
        + '\n  '.join(FONT_CANDIDATES)
    )

# Resolved from the script's own location rather than the working directory,
# so the script can be run from anywhere.
OUT_DIR = Path(__file__).resolve().parent.parent / 'public' / 'icons'


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


# Mode is RGB, not RGBA: a maskable icon must be fully opaque or the launcher's
# crop shows through, and the ground is #111111 everywhere anyway.
#
# 0.62 is full-bleed — the 'G' fills the tile the way a launcher icon should.
# 0.40 is padded for Android's adaptive crop, which only guarantees the circle
# inscribed in the middle 80% (radius 0.4 x 512 = 204.8px from the centre). At
# 0.40 the glyph box is 224 x 204, whose half-diagonal is 151px: comfortably
# inside, with room for the more aggressive squircle masks. At 0.62 the
# half-diagonal is 235px and the crop clips the letter.
ICONS = (
    ('icon-192.png', 192, 0.62),
    ('icon-512.png', 512, 0.62),
    ('icon-512-maskable.png', 512, 0.40),
)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, size, cap_fraction in ICONS:
        path = OUT_DIR / name
        draw_g(size, cap_fraction).save(path)
        print(f'wrote {path}')


if __name__ == '__main__':
    main()
