# Local-only: pull V2 and a few PG3D guns into assets/arsenal. Game files stay on this machine.
import json, os, UnityPy
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
GUN_SRC = r"C:\Users\nikol\Melty\ultrakill-pixel-gun-3d-pc-edition\work\thumb\guns"
CAT = r"C:\Users\nikol\Melty\ultrakill-pixel-gun-3d-pc-edition\work\out\catalog.tsv"
IDS = [1403, 1003, 949, 1906, 1532, 1714, 1402, 1343, 1605]

os.makedirs(os.path.join(ROOT, "guns"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "v2"), exist_ok=True)

def slim_gun(wid):
    d = json.load(open(os.path.join(GUN_SRC, "g%d.json" % wid), encoding="utf-8"))
    parts = []
    for p in d["parts"]:
        if not p.get("tris"):
            continue
        tex = p.get("tex") or ""
        if tex:
            src = os.path.join(GUN_SRC, tex + ".png")
            if os.path.exists(src):
                im = Image.open(src).convert("RGBA")
                im.save(os.path.join(ROOT, "guns", tex + ".png"))
            else:
                tex = ""
        parts.append({
            "tex": tex,
            "pos": [round(float(x), 5) for x in p["pos"]],
            "uv": [round(float(x), 5) for x in p["uv"]],
            "color": [round(float(x), 4) for x in (p.get("color") or [1, 1, 1, 1])],
            "tris": [int(x) for x in p["tris"]],
        })
    json.dump({"name": d["name"], "parts": parts}, open(os.path.join(ROOT, "guns", "g%d.json" % wid), "w"), separators=(",", ":"))

names = {}
for line in open(CAT, encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    if p[0] == "gun" and int(p[1]) in IDS:
        names[int(p[1])] = (p[9], int(p[3]))
guns = []
for wid in IDS:
    slim_gun(wid)
    name, rar = names[wid]
    guns.append({"id": wid, "name": name, "rarity": rar, "file": "guns/g%d.json" % wid})
    print("gun", wid, name, rar)

# ---- V2, same path the v1 cover extract used ----
D = r"C:\ULTRAKILL\ULTRAKILL_Data\StreamingAssets\aa\StandaloneWindows64"
B = D + "/gameprefabs_assets_all.bundle"
A = D + "/assets_assets_assets"
extra = [A + "/" + f for f in os.listdir(A) if f.endswith(".bundle") and "audio" not in f and "music" not in f]
env = UnityPy.load(B, *extra)
from UnityPy.helpers.MeshHelper import MeshHandler

chosen = None
for o in env.objects:
    if o.type.name != "SkinnedMeshRenderer":
        continue
    d = o.read()
    if d.m_GameObject.read().m_Name != "v2_mdl":
        continue
    mats = []
    good = True
    for mref in d.m_Materials:
        try:
            mat = mref.read() if mref and mref.path_id else None
        except Exception:
            good = False
            break
        mats.append(mat)
    if not good or [m.m_Name for m in mats] != ["V2", "V2Wing", "RedArmV2"]:
        continue
    chosen = (d, mats)
    break
if not chosen:
    raise SystemExit("V2 renderer not found")
d, mats = chosen
mesh = d.m_Mesh.read()
if hasattr(mesh, "process_data"):
    mesh.process_data()
h = MeshHandler(mesh)
h.process()
tris = h.get_triangles()

def flat(rows):
    return [round(float(c), 5) for r in rows for c in r] if rows else []

out_mats = []
seen = {}
for mat in mats:
    tex_name = ""
    for name, te in mat.m_SavedProperties.m_TexEnvs:
        if name == "_MainTex" and te.m_Texture and te.m_Texture.path_id:
            t = te.m_Texture.read()
            raw = t.m_Name
            if raw not in seen:
                im = t.image.convert("RGBA")
                if max(im.size) > 1024:
                    im.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                fn = "".join(c if c.isalnum() or c in "-_" else "_" for c in raw) + ".png"
                im.save(os.path.join(ROOT, "v2", fn))
                seen[raw] = fn
                print("tex", raw, im.size)
            tex_name = seen[raw]
    out_mats.append({"name": mat.m_Name, "tex": tex_name})

result = {
    "name": "V2",
    "verts": flat(h.m_Vertices),
    "uv": flat(h.m_UV0),
    "tris": [[int(x) for t in sub for x in t] for sub in tris],
    "mats": out_mats,
}
json.dump(result, open(os.path.join(ROOT, "v2", "v2.json"), "w"), separators=(",", ":"))
print("v2 verts", len(result["verts"]) // 3, "subs", [len(t) // 3 for t in result["tris"]], "mats", out_mats)
json.dump({"v2": "v2/v2.json", "guns": guns}, open(os.path.join(ROOT, "manifest.json"), "w"), indent=2)
print("manifest", len(guns))
