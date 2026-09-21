"""Normalise the Bluebird raster frames into a registered, web-sized sprite set.

The source artwork is never redrawn - each frame is only cropped, uniformly
scaled and re-padded onto a shared canvas so that a single <img> can swap
frames without the bird jumping in size or position.

Registration model
------------------
* scale  - each frame is scaled so the bird is the same size in every frame.
           Scale is estimated from three pose-invariant features (eye sclera,
           pupil, beak); the median of the available ratios is used.
* anchor - the eye centre is pinned to a fixed point on the shared canvas, so
           the head stays steady and the wings articulate around it.
* feet   - for frames with visible feet we also record the foot contact line
           relative to the anchor, so the controller can sit the bird on a
           perch rather than float it.

Outputs sandbox/frames/*.webp and sandbox/frames/registration.json.
"""
import json
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "svg-bluebird-animation", "bluebird-transparent-renders")
OUT = os.path.join(ROOT, "sandbox", "frames")

# Source file -> stable frame id used by the animation code.
FRAMES = [
    ("1-idle.png",              "idle"),
    ("2-blink.png",             "blink"),
    ("3-takeoff-crouch.png",    "crouch"),
    ("4-wings up.png",          "wings-up"),
    ("5-wings mid.png",         "wings-mid"),
    ("6-wings down.png",        "wings-down"),
    ("7-flight glide.png",      "glide"),
    ("8-landing approach.png",  "approach"),
    ("9-landing impact.png",    "impact"),
    ("10-landing settle.png",   "settle"),
    ("11-perch again.png",      "perch"),
]

# Frames whose pupil reading is the closed eyelid rather than a pupil.
NO_EYE = {"blink"}
# Frames where the "feet" blob is a tucked-up foot, not a contact point.
NO_CONTACT = {"glide"}

OUT_HEIGHT = 512          # final canvas height in px
PAD = 0.06                # fraction of canvas kept as breathing room


def load_metrics():
    with open(os.path.join(HERE, "frame-metrics.json")) as fh:
        raw = json.load(fh)
    return {m["file"]: m for m in raw}


def scale_factors(metrics):
    """Median-of-ratios scale estimate per frame, normalised to the median bird."""
    keys = ["sclera", "pupil", "beak"]
    cols = {}
    for k in keys:
        vals = {}
        for src, fid in FRAMES:
            m = metrics[src]
            if k in ("sclera", "pupil") and fid in NO_EYE:
                continue
            if m.get(k):
                vals[fid] = m[k]["eq_diam"]
        med = float(np.median(list(vals.values())))
        cols[k] = {fid: med / v for fid, v in vals.items()}

    out = {}
    for _, fid in FRAMES:
        ratios = [cols[k][fid] for k in keys if fid in cols[k]]
        out[fid] = float(np.median(ratios))
    return out


def eye_point(metrics, src, fid, idle_offset):
    """Eye centre in source pixels; inferred from the beak when the eye is shut."""
    m = metrics[src]
    if m.get("sclera") and fid not in NO_EYE:
        return m["sclera"]["cx"], m["sclera"]["cy"]
    beak = m["beak"]
    dx, dy = idle_offset
    return beak["cx"] + dx * beak["eq_diam"], beak["cy"] + dy * beak["eq_diam"]


def main():
    metrics = load_metrics()
    scales = scale_factors(metrics)

    # beak -> eye offset measured on 1-idle, in beak-diameter units
    im_ = metrics["1-idle.png"]
    idle_offset = ((im_["sclera"]["cx"] - im_["beak"]["cx"]) / im_["beak"]["eq_diam"],
                   (im_["sclera"]["cy"] - im_["beak"]["cy"]) / im_["beak"]["eq_diam"])

    # Pass 1: scale every frame and record its extent relative to the eye.
    staged = []
    for src, fid in FRAMES:
        im = Image.open(os.path.join(SRC, src)).convert("RGBA")
        k = scales[fid]
        ex, ey = eye_point(metrics, src, fid, idle_offset)
        nw, nh = max(1, round(im.width * k)), max(1, round(im.height * k))
        im = im.resize((nw, nh), Image.LANCZOS)
        ex, ey = ex * k, ey * k

        bbox = im.getbbox()
        m = metrics[src]
        foot = None
        if m["foot_contact_y"] is not None and fid not in NO_CONTACT:
            foot = m["foot_contact_y"] * k - ey
        staged.append(dict(fid=fid, im=im, ex=ex, ey=ey, bbox=bbox, foot=foot,
                           scale=k, src=src))

    # Pass 2: shared canvas large enough for every frame, eye at a fixed point.
    left = max(s["ex"] - s["bbox"][0] for s in staged)
    right = max(s["bbox"][2] - s["ex"] for s in staged)
    top = max(s["ey"] - s["bbox"][1] for s in staged)
    bottom = max(s["bbox"][3] - s["ey"] for s in staged)

    cw, ch = left + right, top + bottom
    padx, pady = cw * PAD, ch * PAD
    cw, ch = round(cw + 2 * padx), round(ch + 2 * pady)
    ax, ay = left + padx, top + pady          # anchor (eye) on the shared canvas

    final_scale = OUT_HEIGHT / ch
    fw, fht = round(cw * final_scale), OUT_HEIGHT

    os.makedirs(OUT, exist_ok=True)
    reg = dict(
        canvas=dict(width=fw, height=fht),
        anchor=dict(x=round(ax * final_scale, 2), y=round(ay * final_scale, 2)),
        note="anchor is the bird's eye; footOffsetY is measured down from the anchor",
        frames={},
    )

    for s in staged:
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(s["im"], (round(ax - s["ex"]), round(ay - s["ey"])))
        canvas = canvas.resize((fw, fht), Image.LANCZOS)
        path = os.path.join(OUT, f'{s["fid"]}.webp')
        canvas.save(path, "WEBP", quality=92, method=6)
        reg["frames"][s["fid"]] = dict(
            file=f'{s["fid"]}.webp',
            source=s["src"],
            sourceScale=round(s["scale"], 4),
            footOffsetY=round(s["foot"] * final_scale, 1) if s["foot"] is not None else None,
            nudge=dict(x=0, y=0),      # hand-tunable in the sandbox
        )

    with open(os.path.join(OUT, "registration.json"), "w") as fh:
        json.dump(reg, fh, indent=2)

    print(f"canvas {fw}x{fht}  anchor ({reg['anchor']['x']}, {reg['anchor']['y']})")
    print(f'{"frame":10s}{"scale":>8s}{"footY":>8s}{"kb":>7s}')
    total = 0
    for _, fid in FRAMES:
        f = reg["frames"][fid]
        kb = os.path.getsize(os.path.join(OUT, f["file"])) / 1024
        total += kb
        fy = f'{f["footOffsetY"]:8.1f}' if f["footOffsetY"] is not None else f'{"-":>8s}'
        print(f'{fid:10s}{f["sourceScale"]:8.3f}{fy}{kb:7.0f}')
    print(f'{"total":10s}{"":8s}{"":8s}{total:7.0f} kB')


if __name__ == "__main__":
    main()
