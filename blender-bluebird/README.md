# Bluebird Bakery — Blender 2D character

## Lively website flutter variant

**Bluebird_Bakery_Flutter.blend** and **Bluebird_Bakery_Flutter_preview.mp4** contain the updated 10-second animation: two descending hops onto sample website elements, four wingbeats per second, offset wings, small flight bobs, hovering brakes, springy landings, head tilts, and a closing double blink. The original version below is preserved.

The cards illustrate landing targets; this does not integrate the character into the website. Retarget the `root` location keys to change the path. Contact frames are 91 and 185. Scene 02 provides transparent rendering. Run `make_flutter.py` with Blender to recreate this variant from the original `.blend`.

Open **Bluebird_Bakery_2D.blend** in Blender 5.2 or newer and press Space to play.

- **01 • Bakery animation:** eight-second presentation, 192 frames at 24 fps, 1280 × 720.
- **02 • Transparent character:** the same animation without the background, text, or perches. Render Animation exports transparent RGBA PNG frames.
- **Bluebird_Bakery_preview.mp4:** ready-to-watch video with the cream background.

The character is a native mesh cutout reconstruction of the supplied mockup, with its blue / cream / gold colors and scalloped wings. It is an editable interpretation, not an exact raster tracing. Original reference images are packed into the Blender file and accessible from the Image Editor.

## Editing

Select `Bluebird_RIG`, switch to Pose Mode, and use the Dope Sheet or Action Editor to adjust keyframes. Enable viewport overlays to see the bones.

| Control | Purpose |
| --- | --- |
| root | Move and scale the complete character |
| body | Body lean and squash/stretch |
| head | Head tilt, including beak and eye |
| wing.front / wing.back | Z rotation for wingbeats; scale for wing extension |
| tail | Tail follow-through |
| foot.front / foot.back | Foot tuck and landing pose |
| eye.blink | Y scale for the blink |

Each artwork mesh is named and rigidly weighted to its control bone. Edit the meshes or materials directly to refine the artwork. The timeline labels perch, blink, crouch, takeoff, flight, approach, contact, and settle. Playback restarts at the first perch; the flight is not a seamless loop.

## Rebuild

`build_bluebird.py` recreates the project from native geometry and the reference images in the parent project. Run with Blender's background Python runner. Add `-- --stills --animation` to also render review poses and the full PNG sequence. Rebuilding replaces the generated `.blend`; save manual edits under another filename first.
