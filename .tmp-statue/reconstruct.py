from pathlib import Path
import base64, json, math, traceback
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
from transformers import AutoImageProcessor, AutoModelForDepthEstimation
from scipy import ndimage
from skimage import measure, filters, morphology
from rembg import remove, new_session
import trimesh

ROOT=Path(__file__).resolve().parent
OUT=ROOT/"output"; OUT.mkdir(parents=True,exist_ok=True)
NAMES=("front","back","left","right")

# Decode bundled references and validate them.
for n in NAMES:
    p=ROOT/f"{n}.jpg"
    p.write_bytes(base64.b64decode((ROOT/f"{n}.b64").read_text().strip(), validate=True))
    im=Image.open(p); im.verify()
    im=Image.open(p).convert("RGB")
    if min(im.size)<100: raise RuntimeError(f"{n}: invalid image size {im.size}")

def photo_crop(im):
    a=np.asarray(im)
    # White padding was introduced only to make the multiview refs square.
    nonwhite=np.any(a<247,axis=2)
    ys,xs=np.where(nonwhite)
    if len(xs)<100: return im,(0,0,im.width,im.height)
    x0,x1=int(xs.min()),int(xs.max())+1
    y0,y1=int(ys.min()),int(ys.max())+1
    return im.crop((x0,y0,x1,y1)),(x0,y0,x1,y1)

images={}; crop_boxes={}
for n in NAMES:
    images[n],crop_boxes[n]=photo_crop(Image.open(ROOT/f"{n}.jpg").convert("RGB"))
    images[n].save(OUT/f"crop_{n}.png")

# Depth Anything V2 Large locally: no ZeroGPU quota and full float depth.
model_id="depth-anything/Depth-Anything-V2-Large-hf"
processor=AutoImageProcessor.from_pretrained(model_id)
model=AutoModelForDepthEstimation.from_pretrained(model_id)
model.eval()
torch.set_num_threads(max(2, min(4, torch.get_num_threads())))

depth={}
with torch.inference_mode():
    for n in NAMES:
        inp=processor(images=images[n],return_tensors="pt")
        pred=model(**inp).predicted_depth
        pred=F.interpolate(pred.unsqueeze(1),size=(images[n].height,images[n].width),
                           mode="bicubic",align_corners=False).squeeze().cpu().numpy().astype(np.float32)
        depth[n]=pred
        lo,hi=np.percentile(pred,[1,99])
        vis=np.clip((pred-lo)/(hi-lo+1e-8),0,1)
        Image.fromarray((vis*65535).astype(np.uint16),mode="I;16").save(OUT/f"depth_{n}_16.png")

# Mask from depth discontinuity relative to the border, reinforced by image foreground cues.
def make_mask(img,d):
    # High-quality general foreground matting.  These are clean studio renders, so
    # IS-Net gives substantially more reliable silhouettes than thresholding depth.
    mask_img = remove(img, session=SEG_SESSION, only_mask=True, post_process_mask=True)
    alpha = np.asarray(mask_img).astype(np.float32)
    if alpha.ndim == 3:
        alpha = alpha[..., 0]
    m = alpha > 40.0

    # Preserve intentional holes (especially the laurel wreath); only close tiny cracks.
    rad=max(1,int(min(m.shape)*0.003))
    m=morphology.binary_closing(m,morphology.disk(rad))
    m=morphology.remove_small_objects(m,min_size=max(12,int(m.size*0.00015)))

    # Keep several meaningful components because the pedestal or wreath can be detached
    # by one or two pixels at low resolution.
    lab,num=ndimage.label(m)
    if num:
        sizes=np.asarray(ndimage.sum(m,lab,range(1,num+1)))
        keep=np.zeros(num+1,bool)
        for idx in np.argsort(sizes)[::-1][:10]:
            if sizes[idx] >= max(10,0.0003*m.size):
                keep[idx+1]=1
        m=keep[lab]
    return m

SEG_SESSION = new_session("isnet-general-use")

masks={n:make_mask(images[n],depth[n]) for n in NAMES}
for n,m in masks.items():
    Image.fromarray((m*255).astype(np.uint8)).save(OUT/f"mask_{n}.png")

# Common orthographic pixel scale. This preserves cross-view proportions instead of
# independently stretching each silhouette.
def bbox(mask):
    ys,xs=np.where(mask)
    return xs.min(),ys.min(),xs.max(),ys.max()
bbs={n:bbox(masks[n]) for n in NAMES}
heights=np.array([b[3]-b[1]+1 for b in bbs.values()],float)
px_per_unit=float(np.median(heights)) # total visual height == 1 unit
scale=1.0/px_per_unit
z_bottoms={n:bbs[n][3] for n in NAMES}

def largest_run_center(mask):
    h,w=mask.shape
    y0,y1=bbox(mask)[1],bbox(mask)[3]
    vals=[]
    # pelvis/torso band avoids asymmetric raised arm.
    for y in range(int(y0+.35*(y1-y0)), int(y0+.68*(y1-y0))+1):
        row=mask[y]
        lab,num=ndimage.label(row)
        if not num: continue
        sizes=ndimage.sum(row,lab,range(1,num+1))
        k=int(np.argmax(sizes))+1
        xs=np.where(lab==k)[0]
        if len(xs): vals.append((xs[0]+xs[-1])/2)
    return float(np.median(vals)) if vals else (w-1)/2
centers={n:largest_run_center(masks[n]) for n in NAMES}

# Robust normalized relative depth in [0,1] for visible surfaces.
dn={}
for n in NAMES:
    vals=depth[n][masks[n]]
    lo,hi=np.percentile(vals,[2,98])
    x=np.clip((depth[n]-lo)/(hi-lo+1e-8),0,1)
    # Determine polarity from center-vs-border. If foreground is lower, invert.
    border=np.zeros_like(masks[n]); bw=max(3,int(min(border.shape)*.06))
    border[:bw]=1;border[-bw:]=1;border[:,:bw]=1;border[:,-bw:]=1
    fgmed=float(np.median(depth[n][masks[n]])); bgmed=float(np.median(depth[n][border]))
    if fgmed<bgmed: x=1-x
    dn[n]=x.astype(np.float32)

# Coordinate helpers: u pixel for canonical x/y and row for z.
def row_for_z(name,z):
    return np.rint(z_bottoms[name]-z/scale).astype(np.int32)
def u_for_x(name,x,mirror=False):
    s=-1 if mirror else 1
    return np.rint(centers[name]+s*x/scale).astype(np.int32)
def u_for_y(name,y,mirror=False):
    s=-1 if mirror else 1
    return np.rint(centers[name]+s*y/scale).astype(np.int32)

# Determine global object extents from pixel geometry.
front_half=max((bbs["front"][2]-centers["front"])*scale,(centers["front"]-bbs["front"][0])*scale)
back_half=max((bbs["back"][2]-centers["back"])*scale,(centers["back"]-bbs["back"][0])*scale)
xhalf=max(front_half,back_half)*1.03
left_half=max((bbs["left"][2]-centers["left"])*scale,(centers["left"]-bbs["left"][0])*scale)
right_half=max((bbs["right"][2]-centers["right"])*scale,(centers["right"]-bbs["right"][0])*scale)
yhalf=max(left_half,right_half)*1.03
zmax=max((z_bottoms[n]-bbs[n][1])*scale for n in NAMES)*1.01

# Row envelope from the opposite silhouette: used to resolve monocular-depth scale/offset.
def row_interval(name, z, axis_center, mirror=False):
    rr=int(round(z_bottoms[name]-z/scale))
    m=masks[name]
    if rr<0 or rr>=m.shape[0]: return None
    xs=np.where(m[rr])[0]
    if len(xs)==0: return None
    # Map the full silhouette row; projection masks later prevent impossible bridges.
    a=(xs.min()-centers[name])*scale
    b=(xs.max()-centers[name])*scale
    if mirror: a,b=-b,-a
    return (float(min(a,b)),float(max(a,b)))

# Sample a depth-derived front/back/side surface at a projected pixel.
def sample_surface(name,u,r,z,kind):
    m=masks[name]; d=dn[name]
    if r<0 or r>=m.shape[0] or u<0 or u>=m.shape[1] or not m[r,u]:
        return None
    q=float(d[r,u])
    if kind in ("front","back"):
        # y-range comes from the two side silhouettes.
        ints=[row_interval("left",z,centers["left"],False),row_interval("right",z,centers["right"],True)]
        ints=[v for v in ints if v is not None]
        if not ints: return None
        ymin=np.median([v[0] for v in ints]); ymax=np.median([v[1] for v in ints])
        if kind=="front": raw=ymin+q*(ymax-ymin)
        else: raw=ymax-q*(ymax-ymin)
        # Blend toward the expected outer side to damp depth hallucinations.
        outer=ymax if kind=="front" else ymin
        return .72*raw+.28*outer
    else:
        ints=[row_interval("front",z,centers["front"],False),row_interval("back",z,centers["back"],True)]
        ints=[v for v in ints if v is not None]
        if not ints: return None
        xmin=np.median([v[0] for v in ints]); xmax=np.median([v[1] for v in ints])
        if kind=="left": raw=xmax-q*(xmax-xmin); outer=xmin
        else: raw=xmin+q*(xmax-xmin); outer=xmax
        return .72*raw+.28*outer

# Robust soft visual hull first.  The four AI-generated views are not perfectly
# geometrically consistent, so requiring all four silhouettes erases real parts
# (notably the raised arm).  A 3-of-4 consensus preserves them while still being
# strongly constrained by the references.
GRID=320
xs=np.linspace(-xhalf,xhalf,GRID,dtype=np.float32)
ys=np.linspace(-yhalf,yhalf,GRID,dtype=np.float32)
zs=np.linspace(0,zmax,GRID,dtype=np.float32)
occ=np.zeros((GRID,GRID,GRID),dtype=np.uint8)  # z,y,x

for iz,z in enumerate(zs):
    rf=int(round(z_bottoms["front"]-z/scale)); rb=int(round(z_bottoms["back"]-z/scale))
    rl=int(round(z_bottoms["left"]-z/scale)); rr=int(round(z_bottoms["right"]-z/scale))
    if min(rf,rb,rl,rr)<0: continue
    if rf>=masks["front"].shape[0] or rb>=masks["back"].shape[0] or rl>=masks["left"].shape[0] or rr>=masks["right"].shape[0]: continue
    uf=np.clip(np.rint(centers["front"]+xs/scale).astype(int),0,masks["front"].shape[1]-1)
    ub=np.clip(np.rint(centers["back"]-xs/scale).astype(int),0,masks["back"].shape[1]-1)
    ul=np.clip(np.rint(centers["left"]+ys/scale).astype(int),0,masks["left"].shape[1]-1)
    ur=np.clip(np.rint(centers["right"]-ys/scale).astype(int),0,masks["right"].shape[1]-1)
    mf=masks["front"][rf,uf].astype(np.uint8)
    mb=masks["back"][rb,ub].astype(np.uint8)
    ml=masks["left"][rl,ul].astype(np.uint8)
    mr=masks["right"][rr,ur].astype(np.uint8)
    votes=mf[None,:]+mb[None,:]+ml[:,None]+mr[:,None]
    occ[iz]=(votes>=3)

# Close sub-voxel cracks but do not globally fill cavities: the laurel center
# must remain open.
occ=ndimage.binary_closing(occ,structure=ndimage.generate_binary_structure(3,1),iterations=1)
if occ.sum()<10000:
    raise RuntimeError(f"Visual hull failed: only {int(occ.sum())} occupied voxels")

spacing=(zs[1]-zs[0],ys[1]-ys[0],xs[1]-xs[0])
verts,faces,normals,values=measure.marching_cubes(occ.astype(np.float32),level=.5,spacing=spacing)
verts[:,0]+=zs[0]; verts[:,1]+=ys[0]; verts[:,2]+=xs[0]
V=np.column_stack([verts[:,2],verts[:,1],verts[:,0]])  # Blender x,y,z
mesh=trimesh.Trimesh(vertices=V,faces=faces,process=True)
mesh.remove_unreferenced_vertices()
try: trimesh.repair.fix_normals(mesh,multibody=True)
except Exception: pass

# ---- Depth Anything relief refinement --------------------------------------
# DA-V2 is relative depth, not metric depth.  We therefore never use it as an
# absolute coordinate.  For every horizontal slice we normalize depth within
# the visible foreground, then use it only to indent the visual-hull surface
# from the silhouette-defined outer envelope.  This preserves exact contours
# while recovering face, chest, abs, back and limb relief.
def row_q(name, rr, uu):
    m=masks[name]; d=dn[name]
    rr=np.asarray(rr,dtype=np.int32); uu=np.asarray(uu,dtype=np.int32)
    out=np.ones(len(rr),dtype=np.float32)
    valid=(rr>=0)&(rr<m.shape[0])&(uu>=0)&(uu<m.shape[1])
    if not valid.any(): return out
    # Cache robust row ranges.
    cache={}
    for r in np.unique(rr[valid]):
        vals=d[r,m[r]]
        if len(vals)>=4:
            lo,hi=np.percentile(vals,[8,96])
        else:
            lo,hi=0.,1.
        cache[int(r)]=(float(lo),float(hi))
    ids=np.where(valid)[0]
    for i in ids:
        lo,hi=cache[int(rr[i])]
        out[i]=np.clip((d[rr[i],uu[i]]-lo)/(hi-lo+1e-6),0,1)
    return out

def env_side(zvals):
    ymin=np.empty(len(zvals),np.float32); ymax=np.empty(len(zvals),np.float32)
    for i,z in enumerate(zvals):
        ints=[row_interval("left",float(z),centers["left"],False),
              row_interval("right",float(z),centers["right"],True)]
        ints=[v for v in ints if v is not None]
        if ints:
            ymin[i]=np.median([v[0] for v in ints]); ymax[i]=np.median([v[1] for v in ints])
        else:
            ymin[i]=-yhalf; ymax[i]=yhalf
    return ymin,ymax

def env_fb(zvals):
    xmin=np.empty(len(zvals),np.float32); xmax=np.empty(len(zvals),np.float32)
    for i,z in enumerate(zvals):
        ints=[row_interval("front",float(z),centers["front"],False),
              row_interval("back",float(z),centers["back"],True)]
        ints=[v for v in ints if v is not None]
        if ints:
            xmin[i]=np.median([v[0] for v in ints]); xmax[i]=np.median([v[1] for v in ints])
        else:
            xmin[i]=-xhalf; xmax[i]=xhalf
    return xmin,xmax

RELIEF=0.34
BLEND=0.62
for _pass in range(2):
    V=np.asarray(mesh.vertices).copy()
    N=np.asarray(mesh.vertex_normals)
    z=V[:,2]
    ymin,ymax=env_side(z); xmin,xmax=env_fb(z)
    thick_y=np.maximum(ymax-ymin,1e-4); thick_x=np.maximum(xmax-xmin,1e-4)

    # Front camera at +Y.
    rr=np.rint(z_bottoms["front"]-z/scale).astype(int)
    uu=np.rint(centers["front"]+V[:,0]/scale).astype(int)
    q=row_q("front",rr,uu)
    tgt=ymax-RELIEF*(1-q)*thick_y
    vis=N[:,1]>0.18
    V[vis,1]=(1-BLEND)*V[vis,1]+BLEND*tgt[vis]

    # Back camera at -Y.
    rr=np.rint(z_bottoms["back"]-z/scale).astype(int)
    uu=np.rint(centers["back"]-V[:,0]/scale).astype(int)
    q=row_q("back",rr,uu)
    tgt=ymin+RELIEF*(1-q)*thick_y
    vis=N[:,1]<-0.18
    V[vis,1]=(1-BLEND)*V[vis,1]+BLEND*tgt[vis]

    # Left-side reference: camera at -X, image-right corresponds +Y.
    rr=np.rint(z_bottoms["left"]-z/scale).astype(int)
    uu=np.rint(centers["left"]+V[:,1]/scale).astype(int)
    q=row_q("left",rr,uu)
    tgt=xmin+RELIEF*(1-q)*thick_x
    vis=N[:,0]<-0.18
    V[vis,0]=(1-BLEND)*V[vis,0]+BLEND*tgt[vis]

    # Right-side reference: camera at +X, image-right corresponds -Y.
    rr=np.rint(z_bottoms["right"]-z/scale).astype(int)
    uu=np.rint(centers["right"]-V[:,1]/scale).astype(int)
    q=row_q("right",rr,uu)
    tgt=xmax-RELIEF*(1-q)*thick_x
    vis=N[:,0]>0.18
    V[vis,0]=(1-BLEND)*V[vis,0]+BLEND*tgt[vis]

    mesh.vertices=V
    try: trimesh.repair.fix_normals(mesh,multibody=True)
    except Exception: pass

# Very light Taubin smoothing: enough to remove voxel stair steps, deliberately
# too weak to erase facial or muscular relief.
try:
    trimesh.smoothing.filter_taubin(mesh,lamb=.36,nu=.37,iterations=3)
except Exception: pass

# Marble PBR.
try:
    mat=trimesh.visual.material.PBRMaterial(name="Carrara_Marble",baseColorFactor=[238,237,233,255],
                                            metallicFactor=0.,roughnessFactor=.32)
    mesh.visual=trimesh.visual.TextureVisuals(material=mat)
except Exception: pass

final=OUT/"STATUE_FINAL_ULTRAFIDEL.glb"
mesh.export(final)

# QA orthographic projections as PNGs (surface points), useful for automatic/visual checks.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
V=np.asarray(mesh.vertices)
views={
 "front":(V[:,0],V[:,2]),
 "back":(-V[:,0],V[:,2]),
 "left":(V[:,1],V[:,2]),
 "right":(-V[:,1],V[:,2]),
}
for n,(a,b) in views.items():
    fig=plt.figure(figsize=(4,6),dpi=160); ax=fig.add_subplot(111)
    ids=np.linspace(0,len(V)-1,min(len(V),120000)).astype(int)
    ax.scatter(a[ids],b[ids],s=.08,c="black",alpha=.5)
    ax.set_aspect("equal");ax.axis("off");fig.tight_layout(pad=0)
    fig.savefig(OUT/f"qa_{n}.png",bbox_inches="tight",pad_inches=0);plt.close(fig)

meta={
 "method":"Depth Anything V2 Large + four-view depth-informed volumetric carving",
 "grid":GRID,"vertices":int(len(mesh.vertices)),"faces":int(len(mesh.faces)),
 "watertight":bool(mesh.is_watertight),"bounds":mesh.bounds.tolist(),
 "input_sizes":{n:list(images[n].size) for n in NAMES},
 "crop_boxes":crop_boxes,"mask_pixels":{n:int(masks[n].sum()) for n in NAMES},
}
(OUT/"metadata.json").write_text(json.dumps(meta,indent=2))
print(json.dumps(meta,indent=2))
print(final)
