#!/usr/bin/env python3
"""Generates Android app icon + splash screen assets for MK Connect.

Run once (or whenever the brand mark changes) with:
    python3 scripts/generate-android-assets.py

Requires Pillow (`pip install Pillow`). Not part of the app's runtime
dependencies — this is a one-off asset-generation tool, matching the same
"MK" monogram used by the web app's app/icon.tsx.
"""

import os

from PIL import Image, ImageDraw, ImageFont

BRAND_BLUE = (30, 64, 175)  # #1e40af — matches app/icon.tsx and capacitor.config.ts
WHITE = (255, 255, 255)

ROOT = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res")


def find_bold_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_monogram(size: int, bg=BRAND_BLUE, fg=WHITE, corner_ratio: float | None = None) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if corner_ratio is None:
        draw.rectangle([0, 0, size, size], fill=bg)
    else:
        draw.rounded_rectangle([0, 0, size, size], radius=int(size * corner_ratio), fill=bg)

    font = find_bold_font(int(size * 0.42))
    text = "MK"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]), text, font=font, fill=fg)
    return img


def save(img: Image.Image, *parts: str) -> None:
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("wrote", path)


# --- Legacy launcher icons (pre-Android 8 / API < 26), square + round ---
LEGACY_SIZES = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
for folder, px in LEGACY_SIZES.items():
    icon = draw_monogram(px, corner_ratio=0.18)
    save(icon, folder, "ic_launcher.png")
    save(icon, folder, "ic_launcher_round.png")

# --- Adaptive icon layers (API 26+): foreground has transparent bg + a
# safe-zone-scaled monogram, background is a flat brand-color fill.  ---
ADAPTIVE_SIZES = {"mipmap-mdpi": 108, "mipmap-hdpi": 162, "mipmap-xhdpi": 216, "mipmap-xxhdpi": 324, "mipmap-xxxhdpi": 432}
for folder, px in ADAPTIVE_SIZES.items():
    fg = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fg)
    font = find_bold_font(int(px * 0.30))  # smaller: adaptive icons crop ~33% off each edge
    text = "MK"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((px - tw) / 2 - bbox[0], (px - th) / 2 - bbox[1]), text, font=font, fill=WHITE)
    save(fg, folder, "ic_launcher_foreground.png")

    bg = Image.new("RGBA", (px, px), BRAND_BLUE + (255,))
    save(bg, folder, "ic_launcher_background.png")

# --- Splash screen (single flat asset; capacitor.config.ts sets
# backgroundColor + CENTER_CROP, this just needs to be a large, roughly
# square image so it centers cleanly on any aspect ratio). ---
splash = draw_monogram(960, corner_ratio=0.12)
save(splash, "drawable", "splash.png")

print("Done.")
