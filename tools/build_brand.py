"""
Builds the brand assets from the bakery's badge (site/photos/original/logo-badge.png),
which sits in the middle of a large empty canvas.

  site/brand/badge-{180,...,1080}.webp  the badge itself, cropped tight, for the page
  site/brand/badge.png                  PNG fallback (360px)
  site/favicon-32.png, favicon-192.png  browser tab / Android
  site/apple-touch-icon.png             iOS home screen (180px, opaque)
  site/share.png                        1200x630 link preview

Run:  python tools/build_brand.py
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "site", "photos", "original", "logo-badge.png")
SITE = os.path.join(ROOT, "site")
BRAND = os.path.join(SITE, "brand")

INK = (22, 38, 58)          # --ink in styles.css
PAD = 0.02                  # breathing room around the ring, as a fraction of its width


def cropped_badge():
    im = Image.open(SRC).convert("RGBA")
    px = np.array(im).astype(int)
    # The badge is whatever is neither transparent nor near-white.
    solid = (px[:, :, 3] > 40) & (px[:, :, :3].min(axis=2) < 235)
    ys, xs = np.where(solid)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0, y1 - y0)
    pad = round(side * PAD)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = side // 2 + pad
    badge = im.crop((cx - half, cy - half, cx + half, cy + half))

    # Anything outside the ring becomes transparent, so it sits on any ground.
    size = badge.width
    yy, xx = np.ogrid[:size, :size]
    r = np.hypot(xx - size / 2, yy - size / 2)
    a = np.array(badge)
    ring = size / 2 - pad + 1
    a[:, :, 3] = np.where(r <= ring, a[:, :, 3], 0)
    # soften the cut edge by one pixel
    edge = (r > ring - 1) & (r <= ring)
    a[:, :, 3] = np.where(edge, (a[:, :, 3] * (ring - r).clip(0, 1)).astype(np.uint8), a[:, :, 3])
    return Image.fromarray(a, "RGBA")


def on_ground(badge, size, ground, scale=0.86):
    canvas = Image.new("RGBA", size, ground + (255,))
    side = round(min(size) * scale)
    b = badge.resize((side, side), Image.LANCZOS)
    canvas.alpha_composite(b, ((size[0] - side) // 2, (size[1] - side) // 2))
    return canvas.convert("RGB")


def main():
    os.makedirs(BRAND, exist_ok=True)
    badge = cropped_badge()
    print("badge cropped to", badge.size)

    for w in (180, 360, 540, 720, 1080):
        badge.resize((w, w), Image.LANCZOS).save(os.path.join(BRAND, f"badge-{w}.webp"), "WEBP", quality=90, method=6)
    badge.resize((360, 360), Image.LANCZOS).save(os.path.join(BRAND, "badge.png"), optimize=True)

    badge.resize((32, 32), Image.LANCZOS).save(os.path.join(SITE, "favicon-32.png"), optimize=True)
    badge.resize((192, 192), Image.LANCZOS).save(os.path.join(SITE, "favicon-192.png"), optimize=True)
    on_ground(badge, (180, 180), (255, 255, 255), 0.9).save(os.path.join(SITE, "apple-touch-icon.png"), optimize=True)
    on_ground(badge, (1200, 630), INK, 0.8).save(os.path.join(SITE, "share.png"), optimize=True)

    for root, _, files in os.walk(SITE):
        for f in sorted(files):
            if f.startswith(("badge", "favicon", "apple-touch", "share")):
                p = os.path.join(root, f)
                print(f"{os.path.relpath(p, SITE):28s} {os.path.getsize(p) / 1024:6.0f} kB")


if __name__ == "__main__":
    main()
