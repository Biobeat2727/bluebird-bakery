"""
Measures where each Bluebird frame should be pinned horizontally, and writes it
into sandbox/frames/registration.json as `pivotX` (canvas px).

The frames are registered to the bird's eye, so the feet are in a different
place in every pose. The motion system pins the sprite by pivotX instead:

  grounded frames  -> centre of the feet (found by their orange), so the feet
                      stay planted on the perch through crouch/impact/settle
  airborne frames  -> centre of mass of the whole silhouette, so the body stays
                      centred on the flight path

pivotX is also the axis the sprite mirrors around when the bird turns, which is
what keeps a turn from throwing the body sideways.

build_frames.py rewrites registration.json, so run this again after it:

    python tools/build_frames.py
    python tools/measure_pivots.py
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = os.path.join(ROOT, "sandbox", "frames")
REG = os.path.join(FRAMES, "registration.json")

FEET_BAND = 60   # px: feet are the lowest orange; this keeps the beak out


def feet_centre(rgba):
    r, g, b, a = (rgba[:, :, i].astype(int) for i in range(4))
    orange = (a > 200) & (r > 200) & (g > 110) & (g < 215) & (b < 90)
    ys, xs = np.where(orange)
    low = ys > ys.max() - FEET_BAND
    return float(xs[low].mean())


def mass_centre(rgba):
    ys, xs = np.where(rgba[:, :, 3] > 40)
    return float(xs.mean())


def main():
    with open(REG) as fh:
        reg = json.load(fh)

    for fid, meta in reg["frames"].items():
        rgba = np.array(Image.open(os.path.join(FRAMES, meta["file"])).convert("RGBA"))
        grounded = meta.get("footOffsetY") is not None
        meta["pivotX"] = round(feet_centre(rgba) if grounded else mass_centre(rgba), 1)
        print(f"{fid:11s} {'feet' if grounded else 'mass'}  pivotX {meta['pivotX']}")

    reg["pivotNote"] = ("pivotX: feet centre for grounded frames, centre of mass for airborne "
                        "ones; written by tools/measure_pivots.py")
    with open(REG, "w") as fh:
        json.dump(reg, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
