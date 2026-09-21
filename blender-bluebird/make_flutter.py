"""Create a livelier website-descent variant from the original Blender puppet."""
import bpy, math, json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Bluebird_Bakery_2D.blend'))
scene=bpy.data.scenes['01 • Bakery animation']
alpha=bpy.data.scenes['02 • Transparent character']
bpy.context.window.scene=scene
rig=bpy.data.objects['Bluebird_RIG']
rig.animation_data_clear()
for p in rig.pose.bones:
    p.location=(0,0,0); p.rotation_euler=(0,0,0); p.scale=(1,1,1)
stage=bpy.data.collections['STAGE • preview only']
for o in list(stage.objects):
    if o.name.startswith('Perch') or o.name=='Sequence note': bpy.data.objects.remove(o,do_unlink=True)
bpy.data.objects['Subtitle'].data.body='A LIVELY LITTLE VISITOR FOR EVERY PAGE.'
bpy.data.objects['Edition'].data.body='FLUTTER STUDY     02'

def rect(name,x,y,w,h,mat):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(x,y,-.65),(x+w,y,-.65),(x+w,y-h,-.65),(x,y-h,-.65)],[],[(0,1,2,3)])
    ob=bpy.data.objects.new(name,mesh); stage.objects.link(ob); mesh.materials.append(bpy.data.materials[mat]); return ob
def text(name,body,x,y,size,mat):
    c=bpy.data.curves.new(name,'FONT'); c.body=body; c.size=size
    ob=bpy.data.objects.new(name,c); stage.objects.link(ob); ob.location=(x,y,-.4); c.materials.append(bpy.data.materials[mat]); return ob
for i,(x,y,w,h,label,caption) in enumerate([
    (-5.75,-.30,3.15,1.40,'Fresh from the oven','HANDMADE EVERY MORNING'),
    (-1.65,-1.25,3.15,1.30,'Our daily menu','FIND YOUR NEW FAVORITE'),
    (2.50,-2.30,3.15,.96,'Order a little joy','BAKED FOR YOU'),
]):
    rect('Website element %d'%i,x,y,w,h,'Cream')
    rect('Landing edge %d'%i,x,y,w,.035,'Wood')
    text('Element heading %d'%i,label,x+.18,y-.38,.23,'Ink')
    text('Element caption %d'%i,caption,x+.18,y-.65,.10,'Muted')
    if i<2:
        rect('Content line %d'%i,x+.18,y-.86,w-.7,.025,'Sand')
        rect('Content line short %d'%i,x+.18,y-1.01,w-1.4,.025,'Sand')

def key(name,f,loc=None,rot=None,scale=None):
    p=rig.pose.bones[name]
    for prop,val in [('location',loc),('rotation_euler',None if rot is None else (0,0,math.radians(rot))),('scale',scale)]:
        if val is not None:
            setattr(p,prop,val); p.keyframe_insert(prop,frame=f,group=name)

def smooth(t): return t*t*(3-2*t)
def travel(f):
    knots=[(1,-4.1,-.245),(29,-4.1,-.245),(38,-3.85,-.04),(49,-3.20,-.06),
           (63,-1.85,-.48),(76,-.42,-.77),(82,-.20,-.81),(91,-.20,-1.195),
           (116,-.20,-1.195),(125,.10,-.94),(143,1.37,-1.17),(159,2.92,-1.73),
           (169,3.85,-1.83),(176,3.90,-1.84),(185,3.90,-2.245),(240,3.90,-2.245)]
    for a,b in zip(knots,knots[1:]):
        if a[0]<=f<=b[0]:
            t=smooth((f-a[0])/(b[0]-a[0])); return a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
    return knots[-1][1:]

# Root: descending hops with a tiny wing-driven bob and a brief landing hover.
for f in range(1,241):
    x,y=travel(f)
    active=33<=f<=86 or 120<=f<=180
    if active: y+=.035*math.sin((f-33)*math.tau/6)
    key('root',f,loc=(x,y,0),scale=(.55,.55,.55))

for f,r,sx,sy in [(1,0,1,1),(16,-2,1,1),(25,0,1,1),(30,-7,1.13,.83),
    (36,-9,.95,1.07),(45,-13,1,1),(68,-7,1,1),(79,8,.98,1.03),(86,5,1,1),
    (91,-2,1.16,.81),(96,2,.96,1.06),(103,0,1,1),(113,0,1,1),(118,-7,1.13,.83),
    (124,-11,.95,1.07),(143,-14,1,1),(163,-5,1,1),(172,8,.98,1.03),(180,4,1,1),
    (185,-2,1.16,.81),(190,3,.96,1.06),(198,0,1,1),(211,-2,1,1),(224,0,1,1),(240,0,1,1)]:
    key('body',f,rot=r,scale=(sx,sy,1))

# Four wingbeats per second (previous version: 1.5). Offset wings avoid a rigid paddle feel.
for name,offset in [('wing.front',0),('wing.back',.65)]:
    for f,r in [(1,0),(27,0),(30,15),(99,0),(114,0),(118,15),(195,0),(240,0)]: key(name,f,rot=r,scale=(1,1,1))
    for start,end in [(33,94),(121,188)]:
        for f in range(start,end+1):
            taper=min(1,(f-start+2)/5,(end-f+2)/9)
            pulse=math.cos((f-start-offset)*math.tau/6)
            angle=(-56-84*pulse)*taper
            key(name,f,rot=angle,scale=(1+.50*taper,1+.40*taper,1))

for name,offset in [('foot.front',0),('foot.back',2)]:
    for f,r,sy in [(1,0,1),(30,0,1),(39,40,.65),(76,40,.65),(87,-13,1),(94,0,1),
                   (117,0,1),(127,40,.65),(168,40,.65),(181,-13,1),(190,0,1),(240,0,1)]:
        key(name,f+offset,rot=r,scale=(1,sy,1))

for f,r in [(1,0),(13,-6),(22,3),(29,0),(38,10),(65,6),(80,-7),(91,5),(100,0),
            (106,-8),(115,0),(125,10),(160,5),(176,-6),(185,5),(197,0),(207,-8),(223,0),(240,0)]: key('head',f,rot=r)
for f in range(1,241,3):
    active=33<=f<=91 or 121<=f<=185
    r=(-7+8*math.sin((f-2)*math.tau/12)) if active else 3*math.sin(f*math.tau/36)
    key('tail',f,rot=r)
for f,v in [(1,1),(16,1),(18,.06),(20,1),(102,1),(104,.06),(106,1),(201,1),(203,.06),(205,1),(211,1),(213,.06),(215,1),(240,1)]: key('eye.blink',f,scale=(1,v,1))

action=rig.animation_data.action
action.name='Website descent • quick flutter + hover + two soft landings'
action.use_fake_user=True
# Dense oscillation and travel samples use linear interpolation; sparse pose keys retain soft easing.
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                if any(n in fc.data_path for n in ['"root"','"wing.front"','"wing.back"']):
                    for k in fc.keyframe_points: k.interpolation='LINEAR'

for s in [scene,alpha]:
    s.frame_end=240
    for marker in list(s.timeline_markers): s.timeline_markers.remove(marker)
    for name,f in [('Curious perch',1),('Anticipation',30),('Fast flutter',33),('Hover / brake',79),('Menu landing',91),('Head tilt',106),('Second takeoff',121),('Hover / brake',169),('Order button landing',185),('Double blink',203)]: s.timeline_markers.new(name,frame=f)
scene.render.filepath=str(OUT/'flutter-frames'/'flutter_')
alpha.render.filepath=str(OUT/'flutter-alpha'/'flutter_')
rig['Flutter notes']='4 wingbeats/sec; offset wings; two descending website-element hops; brief hovers; landing squash; double blink. Root travel can be retargeted to website layout.'
readme=bpy.data.texts.get('START HERE • Bluebird')
readme.clear(); readme.write('BLUEBIRD — LIVELY WEBSITE FLUTTER\n\n240 frames / 24 fps / 10 seconds.\nScene 01 shows two descending hops onto illustrative website elements.\nScene 02 exports the same character with transparency.\nNine bone controls; original artwork and references are preserved.\nWingbeats run at 4 Hz with an offset far wing. Root holds briefly before each landing.\nWebsite labels are staging examples, not changes to the live website.\nChange the root location keys to retarget the landings.\nThe original 8-second project remains in Bluebird_Bakery_2D.blend.\n')
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Bluebird_Bakery_Flutter.blend'))
for f in [1,42,79,91,136,169,185,215]:
    scene.frame_set(f); scene.render.filepath=str(OUT/('flutter_pose_%03d.png'%f)); bpy.ops.render.render(write_still=True)
scene.render.filepath=str(OUT/'flutter-frames'/'flutter_')
bpy.ops.render.render(animation=True)
print('FLUTTER COMPLETE')
