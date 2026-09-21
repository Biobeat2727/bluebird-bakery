import bpy, json
from pathlib import Path
out=Path(bpy.data.filepath).parent
rig=bpy.data.objects['Bluebird_RIG']
assert len(rig.pose.bones)==9
assert rig.animation_data.action is not None
assert len([i for i in bpy.data.images if i.packed_file])>=2
scene=bpy.data.scenes['02 • Transparent character']
assert scene.render.film_transparent
assert scene.render.image_settings.color_mode=='RGBA'
assert len(scene.collection.children)==2
assert scene.frame_end==192 and scene.render.fps==24
bpy.context.window.scene=scene
scene.frame_set(83)
scene.render.filepath=str(out/'Bluebird_transparent.png')
bpy.ops.render.render(write_still=True)
report={'blend_reopened':True,'controls':list(rig.pose.bones.keys()),'meshes':len([o for o in bpy.data.objects if o.type=='MESH']),'packed_reference_images':len([i for i in bpy.data.images if i.packed_file]),'scenes':list(bpy.data.scenes.keys()),'frames':192,'fps':24,'transparent_render_verified':True}
(out/'validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
