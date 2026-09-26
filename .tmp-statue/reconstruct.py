from gradio_client import Client, handle_file
from pathlib import Path
import base64, itertools, json, math, shutil, traceback
import numpy as np
from PIL import Image
import trimesh

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------- References ----------------
for name in ("front", "back", "left", "right"):
    b64_path = ROOT / f"{name}.b64"
    img_path = ROOT / f"{name}.jpg"
    if b64_path.exists():
        img_path.write_bytes(base64.b64decode(b64_path.read_text().strip()))
    if not img_path.exists():
        raise FileNotFoundError(img_path)

# ---------------- Depth Anything V2 (official Space, ViT-L) ----------------
depths = {}
try:
    dclient = Client("depth-anything/Depth-Anything-V2")
    try:
        (OUT / "depth_api.json").write_text(json.dumps(dclient.view_api(return_format="dict"), indent=2, default=str))
    except Exception:
        pass
    for name in ("front", "back", "left", "right"):
        res = None
        for api_name in ("/on_submit", "/predict", None):
            try:
                kwargs = {"api_name": api_name} if api_name else {}
                res = dclient.predict(handle_file(str(ROOT / f"{name}.jpg")), **kwargs)
                break
            except Exception:
                traceback.print_exc()
        if res is None:
            raise RuntimeError(f"Depth Anything failed for {name}")
        # on_submit returns slider, gray file, raw 16-bit disparity file.
        raw_ref = res[2] if isinstance(res, (tuple, list)) and len(res) >= 3 else res[-1]
        raw_path = raw_ref.get("path") if isinstance(raw_ref, dict) else getattr(raw_ref, "path", str(raw_ref))
        raw_path = Path(raw_path)
        dst = OUT / f"depth_{name}_raw.png"
        shutil.copy2(raw_path, dst)
        depths[name] = np.array(Image.open(dst)).astype(np.float32)
except Exception as e:
    (OUT / "depth_error.txt").write_text(traceback.format_exc())
    depths = {}

# ---------------- Hunyuan3D-2mv candidates ----------------
hclient = Client("tencent/Hunyuan3D-2mv")
try:
    (OUT / "hunyuan_api.json").write_text(json.dumps(hclient.view_api(return_format="dict"), indent=2, default=str))
except Exception:
    pass

def extract_mesh_path(result):
    ref = result[0] if isinstance(result, (tuple, list)) else result
    if isinstance(ref, dict):
        p = ref.get("path") or ref.get("name")
    else:
        p = getattr(ref, "path", str(ref))
    if not p or not Path(p).exists():
        raise FileNotFoundError(f"Mesh output missing: {p!r}")
    return Path(p)

def load_mesh(path):
    obj = trimesh.load(path, force="scene", process=False)
    if isinstance(obj, trimesh.Scene):
        geoms = [g.copy() for g in obj.geometry.values() if hasattr(g, "vertices") and len(g.vertices)]
        if not geoms:
            raise RuntimeError("No geometry in scene")
        m = trimesh.util.concatenate(geoms)
    else:
        m = obj.copy()
    m.remove_unreferenced_vertices()
    try: m.merge_vertices()
    except Exception: pass
    try: trimesh.repair.fix_normals(m, multibody=True)
    except Exception: pass
    return m

seeds = [20260926, 314159, 271828]
candidates = []
for idx, seed in enumerate(seeds):
    result = None
    # Start high-fidelity. If the Zero GPU rejects the expensive decode, fall back once.
    settings = [(30, 384), (24, 256)]
    for steps, octree in settings:
        args = [
            None, None,
            handle_file(str(ROOT / "front.jpg")),
            handle_file(str(ROOT / "back.jpg")),
            handle_file(str(ROOT / "left.jpg")),
            handle_file(str(ROOT / "right.jpg")),
            steps, 7.5, seed, octree, True, 200000, False
        ]
        for api_name in ("/shape_generation", "shape_generation"):
            try:
                result = hclient.predict(*args, api_name=api_name)
                break
            except Exception:
                traceback.print_exc()
        if result is not None:
            break
    if result is None:
        continue
    mp = extract_mesh_path(result)
    raw = OUT / f"candidate_{idx}_{seed}{mp.suffix.lower()}"
    shutil.copy2(mp, raw)
    mesh = load_mesh(mp)
    candidates.append({"seed": seed, "steps": steps, "octree": octree, "path": raw, "mesh": mesh})
    # Two successful high-quality candidates are enough to compare; avoid unnecessary Zero quota.
    if len(candidates) >= 2:
        break

if not candidates:
    raise RuntimeError("No Hunyuan3D candidate could be generated")

# ---------------- Multi-view depth-consistency scoring ----------------
# Hunyuan output can use an arbitrary axis convention.  We search all proper axis-aligned
# rotations and score the visible vertex depth against Depth Anything V2 disparity.
def proper_rotations():
    mats = []
    eye = np.eye(3)
    for perm in itertools.permutations(range(3)):
        P = eye[:, perm]
        for signs in itertools.product((-1, 1), repeat=3):
            R = P @ np.diag(signs)
            if np.linalg.det(R) > 0.5:
                mats.append(R)
    return mats

ROTS = proper_rotations()

def image_roi(arr):
    # Images include a white square frame. Find the actual photo rectangle.
    rgb = np.asarray(Image.open(arr).convert("RGB"))
    nonwhite = np.any(rgb < 245, axis=2)
    ys, xs = np.where(nonwhite)
    if len(xs) < 100:
        return (0, 0, rgb.shape[1]-1, rgb.shape[0]-1)
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))

ROIS = {n: image_roi(ROOT / f"{n}.jpg") for n in ("front","back","left","right")}

def rank_corr(a, b):
    if len(a) < 50: return -1.0
    # Fast Spearman approximation via double argsort ranks.
    ra = np.empty_like(a, dtype=np.float64); rb = np.empty_like(b, dtype=np.float64)
    ra[np.argsort(a)] = np.arange(len(a))
    rb[np.argsort(b)] = np.arange(len(b))
    ra -= ra.mean(); rb -= rb.mean()
    den = np.linalg.norm(ra) * np.linalg.norm(rb)
    return float(np.dot(ra, rb) / den) if den > 1e-9 else -1.0

def view_coords(v, view):
    X, Y, Z = v[:,0], v[:,1], v[:,2]  # canonical front-space: X horizontal, Y vertical, Z toward front
    if view == "front": return X, Y, Z
    if view == "back":  return -X, Y, -Z
    if view == "left":  return Z, Y, -X
    if view == "right": return -Z, Y, X
    raise ValueError(view)

def score_orientation(mesh, R):
    if not depths:
        return 0.0
    V = np.asarray(mesh.vertices)
    if len(V) > 80000:
        V = V[np.linspace(0, len(V)-1, 80000).astype(int)]
    V = V @ R
    scores = []
    for name in ("front","back","left","right"):
        D = depths.get(name)
        if D is None: continue
        sx, sy, sd = view_coords(V, name)
        x0,y0,x1,y1 = ROIS[name]
        # Fit projection to the actual photo rectangle.
        eps = 1e-9
        px = x0 + (sx - sx.min()) / (sx.max()-sx.min()+eps) * max(1, x1-x0)
        py = y1 - (sy - sy.min()) / (sy.max()-sy.min()+eps) * max(1, y1-y0)
        px = np.clip(np.rint(px).astype(int), 0, D.shape[1]-1)
        py = np.clip(np.rint(py).astype(int), 0, D.shape[0]-1)
        # Approximate a z-buffer: retain the closest vertex per coarse image cell.
        cell = 3
        key = (py//cell) * ((D.shape[1]+cell-1)//cell) + (px//cell)
        order = np.argsort(sd)[::-1]  # larger canonical depth = closer to camera
        _, first = np.unique(key[order], return_index=True)
        ids = order[first]
        if len(ids) > 12000:
            ids = ids[np.linspace(0, len(ids)-1, 12000).astype(int)]
        pred = D[py[ids], px[ids]].astype(np.float64)
        geom = sd[ids].astype(np.float64)
        # Depth Anything raw output is disparity-like: larger should generally mean nearer.
        scores.append(rank_corr(geom, pred))
    return float(np.mean(scores)) if scores else 0.0

best = None
score_rows = []
for c in candidates:
    local_best = (-999.0, None)
    for R in ROTS:
        s = score_orientation(c["mesh"], R)
        if s > local_best[0]:
            local_best = (s, R)
    row = {"seed": c["seed"], "steps": c["steps"], "octree": c["octree"], "depth_score": local_best[0]}
    score_rows.append(row)
    c["score"], c["R"] = local_best
    if best is None or c["score"] > best["score"]:
        best = c

mesh = best["mesh"].copy()
R = best["R"] if best["R"] is not None else np.eye(3)
# Canonical Blender coordinates: X horizontal, Y depth, Z vertical.
Vf = np.asarray(mesh.vertices) @ R
mesh.vertices = np.column_stack([Vf[:,0], Vf[:,2], Vf[:,1]])

# Clean without aggressive decimation; details and thin laurel leaves matter.
mesh.remove_unreferenced_vertices()
try: trimesh.repair.fix_normals(mesh, multibody=True)
except Exception: pass

# Center horizontally and put feet/base on Z=0.
b = mesh.bounds
center_xy = (b[0,:2] + b[1,:2]) / 2.0
mesh.apply_translation([-center_xy[0], -center_xy[1], -b[0,2]])

# White stone PBR material for immediate Blender usability.
try:
    mat = trimesh.visual.material.PBRMaterial(
        name="Carrara_Marble",
        baseColorFactor=[235, 233, 228, 255],
        metallicFactor=0.0,
        roughnessFactor=0.34
    )
    mesh.visual = trimesh.visual.TextureVisuals(material=mat)
except Exception:
    pass

final_glb = OUT / "STATUE_FINAL_ULTRAFIDEL.glb"
mesh.export(final_glb)

meta = {
    "vertices": int(len(mesh.vertices)),
    "faces": int(len(mesh.faces)),
    "watertight": bool(mesh.is_watertight),
    "bounds": mesh.bounds.tolist(),
    "source": "Tencent Hunyuan3D-2mv + Depth Anything V2 Large multiview selection",
    "selected_seed": int(best["seed"]),
    "selected_steps": int(best["steps"]),
    "selected_octree": int(best["octree"]),
    "selected_depth_score": float(best["score"]),
    "candidate_scores": score_rows,
    "depth_maps_available": bool(depths),
}
(OUT / "metadata.json").write_text(json.dumps(meta, indent=2))
print(json.dumps(meta, indent=2), flush=True)
print(final_glb, flush=True)
