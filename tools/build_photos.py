"""
Builds the site's photo set from the full-size originals.

  site/photos/original/<source>   ->   site/photos/<name>-<width>.webp   (one per width)
                                       site/photos/<name>.jpg             (fallback, 1200px)

Never upscales: a width larger than the original is skipped, so the two 1024px
bread shots only get the sizes they can honestly fill. Prints the width/height
and the srcset string for each photo, ready to paste into the markup.

Run:  python tools/build_photos.py
"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "site", "photos", "original")
OUT = os.path.join(ROOT, "site", "photos")

WIDTHS = (640, 1200, 2000)
FALLBACK_WIDTH = 1200
WEBP_QUALITY = 76
JPEG_QUALITY = 80

# original file -> name used on the site
PHOTOS = {
    "about-01.jpg": "cinnamon-rolls",
    "about-02.jpg": "shaping-croissants",
    "home-croissant.jpg": "croissant-cruffin",
    "home-oven-loaves.jpg": "oven-loaves",
    "menu-01.jpg": "rolling-chocolate",
    "menu-02.jpg": "rack-loaves",
    "menu-03.jpg": "avocado-toast",
    "menu-04.jpg": "croissant-sando",
    "menu-05.jpg": "latte-doma",
    "menu-07.jpg": "croissant-latte",
}


def resized(im, width):
    height = round(im.height * width / im.width)
    return im.resize((width, height), Image.LANCZOS)


def main():
    total = 0
    for source, name in PHOTOS.items():
        im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, source))).convert("RGB")
        widths = [w for w in WIDTHS if w <= im.width] or [im.width]
        if im.width < WIDTHS[-1] and im.width not in widths:
            widths.append(im.width)          # keep the native size as the top rung

        srcset = []
        for w in widths:
            path = os.path.join(OUT, f"{name}-{w}.webp")
            resized(im, w).save(path, "WEBP", quality=WEBP_QUALITY, method=6)
            total += os.path.getsize(path)
            srcset.append(f"photos/{name}-{w}.webp {w}w")

        fb = min(FALLBACK_WIDTH, im.width)
        fallback = resized(im, fb)
        fallback.save(os.path.join(OUT, f"{name}.jpg"), quality=JPEG_QUALITY,
                      optimize=True, progressive=True)

        print(f"{name}: width={fallback.width} height={fallback.height}")
        print(f"  srcset=\"{', '.join(srcset)}\"")
    print(f"\nwebp total: {total / 1024:.0f} KB")


if __name__ == "__main__":
    main()
