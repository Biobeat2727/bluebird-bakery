"""Measure per-frame registration features for the Bluebird frame set.

Emits tools/frame-metrics.json. Read-only with respect to the source artwork.
"""
import json
import glob
import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = os.path.join(os.path.dirname(__file__), "..",
                   "svg-bluebird-animation", "bluebird-transparent-renders")


def masks(a):
    r, g, b, al = (a[..., i].astype(int) for i in range(4))
    solid = al > 200
    rgb = a[..., :3].astype(int)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    white = solid & (mn > 225) & ((mx - mn) < 22)
    yellow = solid & (r > 185) & (g > 120) & (g < 220) & (b < 95)
    dark = solid & ((0.299 * r + 0.587 * g + 0.114 * b) < 55)
    return solid, white, yellow, dark


def biggest(mask):
    lab, n = ndimage.label(mask)
    if n == 0:
        return None
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    i = int(np.argmax(sizes)) + 1
    area = float(sizes[i - 1])
    cy, cx = ndimage.center_of_mass(lab == i)
    ys, xs = np.nonzero(lab == i)
    return dict(area=area, cx=float(cx), cy=float(cy),
                eq_diam=float(2 * (area / np.pi) ** 0.5),
                x0=int(xs.min()), x1=int(xs.max()),
                y0=int(ys.min()), y1=int(ys.max()))


def analyse(path):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    solid, white, yellow, dark = masks(a)
    bbox = im.getbbox()
    ys, xs = np.nonzero(solid)
    body_top, body_bot = int(ys.min()), int(ys.max())
    span = body_bot - body_top

    sclera = biggest(white)
    pupil = biggest(dark)

    # Split yellow into beak (upper 55% of body) and feet (lower 45%).
    split = body_top + 0.55 * span
    grid_y = np.arange(a.shape[0])[:, None]
    beak = biggest(yellow & (grid_y < split))
    feet = biggest(yellow & (grid_y >= split))

    # Foot contact line: lowest row containing foot pixels.
    foot_mask = yellow & (grid_y >= split)
    foot_y = int(np.nonzero(foot_mask)[0].max()) if foot_mask.any() else None

    return dict(
        file=os.path.basename(path), width=im.width, height=im.height,
        bbox=list(bbox), body_top=body_top, body_bottom=body_bot,
        solid_px=int(solid.sum()),
        sclera=sclera, pupil=pupil, beak=beak, feet=feet,
        foot_contact_y=foot_y,
    )


def main():
    files = sorted(glob.glob(os.path.join(SRC, "*.png")),
                   key=lambda p: int(os.path.basename(p).split("-")[0]))
    out = [analyse(f) for f in files]
    dst = os.path.join(os.path.dirname(__file__), "frame-metrics.json")
    with open(dst, "w") as fh:
        json.dump(out, fh, indent=2)

    hdr = f'{"frame":24s}{"sclera":>8s}{"pupil":>8s}{"beak":>8s}{"feetA":>8s}{"footY":>7s}'
    print(hdr)
    for m in out:
        def d(k):
            return f'{m[k]["eq_diam"]:8.1f}' if m[k] else f'{"-":>8s}'
        fy = f'{m["foot_contact_y"]:7d}' if m["foot_contact_y"] else f'{"-":>7s}'
        print(f'{m["file"][:23]:24s}{d("sclera")}{d("pupil")}{d("beak")}{d("feet")}{fy}')
    print(f"\nwrote {dst}")


if __name__ == "__main__":
    main()
