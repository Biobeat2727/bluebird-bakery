"""
Normalises the turn-around renders onto the same canvas as the other frames.

build_frames.py scales and anchors a frame by measuring its eye, pupil and beak,
which cannot work for a bird facing the camera. It does not have to: the turn
renders share their source canvas with 1-idle.png (01-right-profile.png IS that
file, pixel for pixel), so they take idle's exact transform instead. The
transform is read back from the built idle.webp rather than recomputed, so the
turn frames always match whatever build_frames.py last produced.

Only three frames are built. 05/06/07 are exact mirrors of 03/02/01, and the
motion system mirrors the sprite itself, on the head-on frame where it cannot
be seen:

    perch > idle > turn-30 > turn-60 > turn-front > [mirror] > turn-60 > turn-30 > idle > perch

build_frames.py rewrites registration.json from scratch, so the order is:

    python tools/build_frames.py
    python tools/build_turn_frames.py
    python tools/measure_pivots.py
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDERS = os.path.join(ROOT, "svg-bluebird-animation")
IDLE_SRC = os.path.join(RENDERS, "bluebird-transparent-renders", "1-idle.png")
TURN_SRC = os.path.join(RENDERS, "turn-renders")
OUT = os.path.join(ROOT, "sandbox", "frames")
REG = os.path.join(OUT, "registration.json")

FRAMES = [
    ("02-turn-30deg.png", "turn-30"),
    ("03-turn-60deg.png", "turn-60"),
    ("04-turn-front.png", "turn-front"),
]


def alpha_bbox(im):
    ys, xs = np.where(np.array(im)[:, :, 3] > 40)
    return xs.min(), xs.max(), ys.min(), ys.max()


def feet_bottom(im):
    """Lowest row of the orange feet: the contact line, clear of the tail."""
    px = np.array(im).astype(int)
    r, g, b, a = (px[:, :, i] for i in range(4))
    ys, _ = np.where((a > 200) & (r > 200) & (g > 110) & (g < 215) & (b < 90))
    return int(ys.max())


def main():
    with open(REG) as fh:
        reg = json.load(fh)
    cw, ch = reg["canvas"]["width"], reg["canvas"]["height"]
    idle_meta = reg["frames"]["idle"]

    # idle's source -> canvas transform, recovered from the two bounding boxes
    sx0, sx1, sy0, sy1 = alpha_bbox(Image.open(IDLE_SRC).convert("RGBA"))
    wx0, wx1, wy0, wy1 = alpha_bbox(Image.open(os.path.join(OUT, idle_meta["file"])).convert("RGBA"))
    scale = ((wy1 - wy0) / (sy1 - sy0) + (wx1 - wx0) / (sx1 - sx0)) / 2
    ox, oy = wx0 - sx0 * scale, wy0 - sy0 * scale
    print(f"idle transform: scale {scale:.5f}, offset ({ox:.1f}, {oy:.1f})")

    for src, fid in FRAMES:
        im = Image.open(os.path.join(TURN_SRC, src)).convert("RGBA")
        small = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(small, (round(ox), round(oy)))

        x0, x1, y0, y1 = alpha_bbox(canvas)
        assert x0 > 0 and y0 > 0 and x1 < cw - 1 and y1 < ch - 1, f"{fid} is clipped by the canvas"

        canvas.save(os.path.join(OUT, f"{fid}.webp"), "WEBP", quality=92, method=6)
        reg["frames"][fid] = dict(
            file=f"{fid}.webp",
            source=f"turn-renders/{src}",
            sourceScale=idle_meta["sourceScale"],
            footOffsetY=round(feet_bottom(canvas) - reg["anchor"]["y"], 1),
            nudge=dict(x=0, y=0),
        )
        kb = os.path.getsize(os.path.join(OUT, f"{fid}.webp")) / 1024
        print(f"{fid:11s} bbox x {x0}-{x1} y {y0}-{y1}  footOffsetY {reg['frames'][fid]['footOffsetY']}  {kb:.0f} kB")

    with open(REG, "w") as fh:
        json.dump(reg, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
