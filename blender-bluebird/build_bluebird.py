"""Build a self-contained, editable Bluebird Bakery 2D puppet and animation.
Run: blender --background --factory-startup --python build_bluebird.py
"""
import bpy, math, os, sys
from mathutils import Vector
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = '01 • Bakery animation'
character = bpy.data.collections.new('BLUEBIRD • articulated artwork')
scene.collection.children.link(character)
stage = bpy.data.collections.new('STAGE • preview only')
scene.collection.children.link(stage)
controls = bpy.data.collections.new('RIG • pose controls')
scene.collection.children.link(controls)

def srgb(v):
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4

def material(name, color):
    h = color.lstrip('#')
    rgb = [srgb(int(h[i:i+2],16)/255) for i in (0,2,4)]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb,1)
    m.use_nodes = True
    n=m.node_tree.nodes; n.clear()
    e=n.new('ShaderNodeEmission'); e.inputs[0].default_value=(*rgb,1)
    o=n.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(e.outputs[0],o.inputs[0])
    return m

palette = {k:material(k,c) for k,c in {
    'Blue':'#2F80C3','Deep blue':'#17649A','Light blue':'#5CA9DF',
    'Highlight blue':'#79BEED','Cream':'#FFF1D5','Peach':'#FFC88E',
    'Gold':'#F4B942','Gold shade':'#EBA322','Eye':'#15222B',
    'White':'#FFFFFF','Paper':'#FCF6EA','Ink':'#193F56',
    'Muted':'#66818A','Sand':'#E7DAC2','Wood':'#C9A578',
}.items()}

arm = bpy.data.armatures.new('Bluebird • cutout skeleton')
rig = bpy.data.objects.new('Bluebird_RIG',arm); controls.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bones={
 'root':((0,0,0),None), 'body':((0,1.3,0),'root'),
 'head':((.1,2.55,0),'body'), 'wing.front':((-.55,2.10,.25),'body'),
 'wing.back':((-.25,2.20,-.18),'body'), 'tail':((-.65,.70,-.1),'body'),
 'foot.front':((.20,.34,.1),'root'), 'foot.back':((-.18,.34,-.1),'root'),
 'eye.blink':((.63,3.03,.35),'head'),
}
for name,(head,parent) in bones.items():
    b=arm.edit_bones.new(name); b.head=head; b.tail=Vector(head)+Vector((0,.38,0))
    if parent: b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT'); rig.show_in_front=True
rig['Guide']='Pose Mode: root = travel; body = squash/tilt; wing.front/back = flap (Z rotation); eye.blink = Y scale.'
rig['Artwork']='Native mesh cutout reconstruction of the supplied Bluebird Bakery character sheet.'

def shape(name, pts, color, z=0, bone=None, collection=None):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='2D'; c.resolution_u=20; c.fill_mode='BOTH'
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(pts)-1)
    for p,xy in zip(s.bezier_points,pts):
        p.co=(*xy,0); p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
        if collection == stage and len(pts)==4:
            p.handle_left_type='VECTOR'; p.handle_right_type='VECTOR'
    s.use_cyclic_u=True
    ob=bpy.data.objects.new(name,c); (collection or character).objects.link(ob)
    ob.location.z=z; ob.data.materials.append(palette[color])
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH')
    if bone:
        group=ob.vertex_groups.new(name=bone); group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
        mod=ob.modifiers.new('Rigid cutout • '+bone,'ARMATURE'); mod.object=rig
    return ob

def ellipse(name,x,y,rx,ry,col,z,bone=None,collection=None,angle=0):
    pts=[]
    for i in range(16):
        a=2*math.pi*i/16; u=rx*math.cos(a); v=ry*math.sin(a)
        pts.append((x+u*math.cos(angle)-v*math.sin(angle),y+u*math.sin(angle)+v*math.cos(angle)))
    return shape(name,pts,col,z,bone,collection)

# The silhouette, eye, wing scallops, cream breast and three-feather tail follow the reference.
for i,(end,col) in enumerate([((-1.51,-.02),'Blue'),((-1.25,-.13),'Deep blue'),((-.98,-.10),'Light blue')]):
    ex,ey=end
    shape('Tail feather %d'%(i+1),[(-.55,.87),(-.86,.67),(ex-.10,ey+.16),(ex,ey),(ex+.20,ey+.05),(-.34,.69)],col,-.16+i*.01,'tail')

wing=[(-.40,2.18),(-.82,2.23),(-1.15,1.98),(-1.58,1.44),(-1.62,1.22),(-1.47,1.16),(-1.04,1.45),(-1.23,1.10),(-1.14,.98),(-.88,1.06),(-.57,1.37),(-.48,1.15),(-.30,1.19),(-.15,1.61)]
shape('Far wing',[(x+.18,y+.14) for x,y in wing],'Deep blue',-.22,'wing.back')

for label,x,z in [('back',-.19,-.08),('front',.24,.12)]:
    bone='foot.'+label
    shape('Leg '+label,[(x-.09,.51),(x+.09,.50),(x+.13,.14),(x-.08,.13)],'Gold shade',z,bone)
    shape('Foot '+label,[(x-.08,.20),(x+.16,.21),(x+.39,.13),(x+.43,.04),(x+.29,.015),(x+.13,.065),(x+.20,-.015),(x+.09,-.05),(x-.05,.025),(x-.22,.01),(x-.24,.09)],'Gold',z+.01,bone)

shape('Body silhouette',[(-.92,2.49),(-.78,2.84),(-.34,3.12),(.30,3.02),(.82,2.64),(1.03,2.09),(1.08,1.46),(.91,.92),(.51,.48),(-.02,.35),(-.61,.46),(-1.04,.85),(-1.15,1.39)],'Blue',0,'body')
shape('Warm breast',[(.76,2.33),(1.04,2.03),(1.05,1.43),(.84,.89),(.40,.48),(-.08,.39),(-.62,.55),(-.27,.73),(.25,1.20),(.49,1.81)],'Peach',.03,'body')
shape('Cream belly',[(.61,1.91),(.94,1.64),(.87,1.12),(.55,.68),(.03,.45),(-.56,.52),(-.77,.65),(-.33,.73),(.07,1.07),(.29,1.63)],'Cream',.04,'body')
shape('Round head',[(-.87,2.40),(-.98,2.93),(-.82,3.51),(-.39,3.88),(.15,3.99),(.69,3.84),(1.02,3.47),(1.10,3.04),(.88,2.63),(.45,2.42),(-.17,2.34)],'Blue',.06,'head')
ellipse('Crown sheen',.36,3.70,.31,.12,'Light blue',.07,'head',angle=-.42)
ellipse('Head glint',-.65,3.49,.22,.08,'Light blue',.071,'head',angle=.85)
shape('Beak lower',[(1.00,3.08),(1.28,3.04),(1.53,2.88),(1.34,2.73),(1.06,2.69),(.97,2.83)],'Gold shade',.20,'head')
shape('Beak upper',[(1.01,3.15),(1.19,3.12),(1.53,2.88),(1.28,2.86),(.97,2.91)],'Gold',.21,'head')
ellipse('Eye white',.58,3.12,.31,.38,'White',.30,'eye.blink')
ellipse('Eye dark rim',.68,3.12,.255,.315,'Eye',.31,'eye.blink')
ellipse('Eye soft blue',.70,3.10,.185,.245,'Ink',.32,'eye.blink')
ellipse('Eye pupil',.72,3.12,.169,.22,'Eye',.33,'eye.blink')
ellipse('Eye sparkle',.64,3.27,.067,.070,'White',.34,'eye.blink')

shape('Near wing shadow',[(x+.045,y-.085) for x,y in wing],'Deep blue',.23,'wing.front')
shape('Near wing',wing,'Light blue',.25,'wing.front')
shape('Wing upper wash',[(-.40,2.14),(-.81,2.14),(-1.11,1.89),(-1.32,1.54),(-.98,1.72),(-.75,1.65),(-.43,1.76)],'Blue',.26,'wing.front')
ellipse('Wing glint',-.97,1.90,.24,.08,'Highlight blue',.27,'wing.front',angle=.80)

def text(name,body,x,y,size,color,font=None):
    c=bpy.data.curves.new(name,'FONT'); c.body=body; c.size=size
    if font: c.font=font
    ob=bpy.data.objects.new(name,c); stage.objects.link(ob); ob.location=(x,y,-.3)
    c.materials.append(palette[color]); return ob

fontpath=Path('C:/Windows/Fonts/georgia.ttf')
font=bpy.data.fonts.load(str(fontpath)) if fontpath.exists() else None
text('Brand name','Bluebird Bakery',-6.0,2.73,.68,'Ink',font)
text('Subtitle','A LITTLE JOY, FRESH EVERY DAY.',-5.96,2.27,.145,'Muted')
text('Sequence note','PERCH   /   TAKE FLIGHT   /   COME HOME',-5.96,-3.15,.14,'Muted')
text('Edition','CHARACTER STUDY     01',3.41,3.02,.13,'Muted')
for x in (-4.0,3.55):
    ellipse('Perch base',x,-2.24,.86,.11,'Wood',-.4,collection=stage)
    ellipse('Perch top',x,-2.17,.86,.09,'Sand',-.35,collection=stage)
    shape('Perch stem',[(x-.045,-2.28),(x+.045,-2.28),(x+.045,-2.72),(x-.045,-2.72)],'Sand',-.5,collection=stage)

# Eight seconds, 24 fps. Keyed holds, anticipation, alternating wingbeats and landing overshoot.
scene.frame_start=1; scene.frame_end=192; scene.render.fps=24
poses=rig.pose.bones
for p in poses: p.rotation_mode='XYZ'

def key(name,frame,loc=None,rot=None,scale=None):
    p=poses[name]
    if loc is not None: p.location=loc; p.keyframe_insert('location',frame=frame,group=name)
    if rot is not None: p.rotation_euler=(0,0,math.radians(rot)); p.keyframe_insert('rotation_euler',frame=frame,group=name)
    if scale is not None: p.scale=scale; p.keyframe_insert('scale',frame=frame,group=name)

for f,x,y in [(1,-4,-2.11),(25,-4,-2.11),(36,-4,-2.11),(44,-3.55,-1.50),(62,-2.30,-1.03),(83,-.75,-.95),(105,.93,-1.03),(124,2.30,-1.22),(139,3.35,-1.73),(147,3.55,-2.11),(156,3.55,-2.11),(192,3.55,-2.11)]:
    key('root',f,(x,y,0),scale=(.79,.79,.79))
for f,rot,sx,sy in [(1,0,1,1),(24,0,1,1),(35,-7,1.10,.85),(43,-12,.96,1.05),(62,-10,1,1),(100,-7,1,1),(125,3,1,1),(140,7,1,1),(147,-3,1.10,.85),(155,2,.97,1.04),(166,0,1,1),(192,0,1,1)]:
    key('body',f,rot=rot,scale=(sx,sy,1))
for f,r in [(1,0),(24,0),(35,5),(44,9),(115,6),(137,-4),(147,4),(160,0),(192,0)]: key('head',f,rot=r)
wingkeys=[(1,0),(25,0),(35,12),(43,-118)]
for start in (43,59,75,91,107):
    wingkeys += [(start,-118),(start+4,-62),(start+8,18),(start+12,-52)]
wingkeys += [(123,-83),(133,-112),(142,-66),(149,-30),(158,0),(192,0)]
for f,r in sorted(set(wingkeys)):
    key('wing.front',f,rot=r)
    key('wing.back',f,rot=r*.87-8)
for name in ('wing.front','wing.back'):
    for f,sx,sy in [(1,1,1),(30,1,1),(43,1.55,1.45),(123,1.55,1.45),(142,1.4,1.3),(158,1,1),(192,1,1)]:
        key(name,f,scale=(sx,sy,1))
for f,r in [(1,0),(28,0),(35,8),(44,-16),(70,-8),(100,-13),(124,-6),(140,10),(149,15),(161,0),(192,0)]: key('tail',f,rot=r)
for name in ('foot.front','foot.back'):
    for f,r,sy in [(1,0,1),(36,0,1),(49,35,.65),(123,35,.65),(140,-8,1),(150,0,1),(192,0,1)]:
        key(name,f,rot=r,scale=(1,sy,1))
for f,v in [(1,1),(16,1),(18,.07),(20,1),(165,1),(168,.07),(171,1),(192,1)]: key('eye.blink',f,scale=(1,v,1))
for name,f in [('01 PERCH',1),('02 BLINK',18),('03 CROUCH',35),('04 TAKEOFF',43),('05 FLIGHT',59),('06 GLIDE / BRAKE',123),('07 APPROACH',139),('08 CONTACT',147),('09 SETTLE',158),('10 PERCH AGAIN',171)]: scene.timeline_markers.new(name,frame=f)
if rig.animation_data and rig.animation_data.action:
    rig.animation_data.action.name='Bluebird • perch, takeoff, flight, soft landing • 8 seconds'

camdata=bpy.data.cameras.new('Orthographic 2D camera'); cam=bpy.data.objects.new('Camera',camdata)
scene.collection.objects.link(cam); cam.location=(0,0,20); camdata.type='ORTHO'; camdata.ortho_scale=14; scene.camera=cam
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1280; scene.render.resolution_y=720; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=False
scene.world.color=(.8,.8,.8)
# Solid paper behind the artwork, with emission to ensure exact colors.
shape('Paper backdrop',[(-20,-12),(20,-12),(20,12),(-20,12)],'Paper',-2,collection=stage)
scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'
scene.view_settings.exposure=0; scene.view_settings.gamma=1
scene.render.image_settings.color_depth='8'
scene.render.fps=24
scene.render.filepath=str(OUT/'frames'/'bluebird_')
scene.render.use_file_extension=True
if hasattr(scene,'eevee'): scene.eevee.taa_render_samples=16

# A second scene shares the animated puppet, but omits all presentation elements.
alpha=bpy.data.scenes.new('02 • Transparent character')
alpha.collection.children.link(character); alpha.collection.children.link(controls)
alpha.collection.objects.link(cam); alpha.camera=cam
alpha.render.engine='BLENDER_EEVEE'; alpha.world=scene.world
alpha.render.resolution_x=1280; alpha.render.resolution_y=720; alpha.render.resolution_percentage=100
alpha.render.film_transparent=True; alpha.render.image_settings.file_format='PNG'; alpha.render.image_settings.color_mode='RGBA'
alpha.render.fps=24; alpha.frame_start=1; alpha.frame_end=192
alpha.view_settings.view_transform='Standard'; alpha.view_settings.look='None'
alpha.render.filepath=str(OUT/'transparent-frames'/'bluebird_')
for m in scene.timeline_markers: alpha.timeline_markers.new(m.name,frame=m.frame)

# Pack original reference sheets into the .blend for convenient comparison.
for name in ['Codex Image Aug 28, 2026, 11_24_26 PM.png','a_clean_high_resolution_vector_style_illustratio.png']:
    img=bpy.data.images.load(str(ROOT/'svg-bluebird-animation'/name)); img.use_fake_user=True; img.pack()
if font: font.pack()
readme=bpy.data.texts.new('START HERE • Bluebird')
readme.write('BLUEBIRD BAKERY — 2D CUTOUT ANIMATION\n\nScene 01: staged preview. Scene 02: transparent character export.\n192 frames / 24 fps / 8 seconds / 1280 x 720.\n\nSelect Bluebird_RIG, enter Pose Mode. Wings rotate around Z; eye.blink scales on Y.\nRoot controls travel and character size. Each named artwork mesh is rigid-weighted to one bone.\nDope Sheet / Action Editor contains the keyed animation. Timeline markers label the sequence.\nThe original character sheet and mockup are packed in Images for reference.\nThis is a native cutout reconstruction, not a pixel-exact tracing or Grease Pencil drawing.\n\nRender Scene 02 as RGBA PNG for compositing. MP4 preview has a cream background.\n')
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active=rig
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Bluebird_Bakery_2D.blend'))
if '--stills' in sys.argv:
    for frame in [1,35,43,67,123,147,171]:
        scene.frame_set(frame); scene.render.filepath=str(OUT/('pose_%03d.png'%frame)); bpy.ops.render.render(write_still=True)
if '--animation' in sys.argv:
    scene.render.filepath=str(OUT/'frames'/'bluebird_'); bpy.ops.render.render(animation=True)
print('BLUEBIRD BUILD COMPLETE')
