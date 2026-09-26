from gradio_client import Client, handle_file
from pathlib import Path
import json, os, shutil, time, traceback
import trimesh

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
OUT.mkdir(parents=True, exist_ok=True)

client = Client("tencent/Hunyuan3D-2mv")
try:
    api = client.view_api(return_format="dict")
    (OUT / "api.json").write_text(json.dumps(api, indent=2, default=str))
except Exception as e:
    (OUT / "api_error.txt").write_text(repr(e))

args = [
    None,  # caption
    None,  # single image
    handle_file(str(ROOT / "front.jpg")),
    handle_file(str(ROOT / "back.jpg")),
    handle_file(str(ROOT / "left.jpg")),
    handle_file(str(ROOT / "right.jpg")),
    30,    # steps
    7.5,   # guidance
    20260926, # seed
    384,   # high-resolution octree decode
    True,  # remove background
    200000,
    False,
]

last = None
for api_name in ["/shape_generation", "shape_generation"]:
    try:
        print("Trying", api_name, flush=True)
        result = client.predict(*args, api_name=api_name)
        last = result
        break
    except Exception as e:
        print("FAILED", api_name, repr(e), flush=True)
        traceback.print_exc()
if last is None:
    raise RuntimeError("Hunyuan3D multiview generation failed")

(OUT / "result_repr.txt").write_text(repr(last))

mesh_ref = last[0] if isinstance(last, (tuple, list)) else last
if isinstance(mesh_ref, dict):
    mesh_path = mesh_ref.get("path") or mesh_ref.get("name")
elif hasattr(mesh_ref, "path"):
    mesh_path = mesh_ref.path
else:
    mesh_path = str(mesh_ref)

print("Mesh returned:", mesh_path, flush=True)
if not mesh_path or not Path(mesh_path).exists():
    raise FileNotFoundError(f"Returned mesh not found: {mesh_path!r}")

raw = OUT / ("raw" + Path(mesh_path).suffix.lower())
shutil.copy2(mesh_path, raw)

loaded = trimesh.load(mesh_path, force="scene", process=False)
if isinstance(loaded, trimesh.Scene):
    geoms = [g.copy() for g in loaded.geometry.values() if hasattr(g, "vertices") and len(g.vertices)]
    if not geoms:
        raise RuntimeError("No geometry in generated scene")
    mesh = trimesh.util.concatenate(geoms)
else:
    mesh = loaded.copy()

mesh.remove_unreferenced_vertices()
try:
    mesh.merge_vertices()
except Exception:
    pass
try:
    trimesh.repair.fix_normals(mesh, multibody=True)
except Exception:
    pass

# Center on ground while preserving generated proportions.
bounds = mesh.bounds
mesh.apply_translation(-mesh.centroid)
bounds = mesh.bounds
mesh.apply_translation([0, 0, -bounds[0,2]])

# Keep a high-density geometry export.  No aggressive decimation: fidelity first.
mesh.export(OUT / "statue_final.glb")
mesh.export(OUT / "statue_final.obj")
mesh.export(OUT / "statue_final.ply")

meta = {
    "vertices": int(len(mesh.vertices)),
    "faces": int(len(mesh.faces)),
    "watertight": bool(mesh.is_watertight),
    "bounds": mesh.bounds.tolist(),
    "source": "tencent/Hunyuan3D-2mv",
    "steps": 30,
    "guidance_scale": 7.5,
    "seed": 20260926,
    "octree_resolution": 384,
}
(OUT / "metadata.json").write_text(json.dumps(meta, indent=2))
print(json.dumps(meta, indent=2), flush=True)
