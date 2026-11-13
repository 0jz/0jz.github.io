import os, UnityPy
from collections import defaultdict

D = r"C:\ULTRAKILL\ULTRAKILL_Data\StreamingAssets\aa\StandaloneWindows64"
env = UnityPy.load(os.path.join(D, "specialscenes_scenes_uk_construct.bundle"))

interesting = []
for o in env.objects:
    if o.type.name != "GameObject":
        continue
    g = o.read()
    mf = mr = None
    for c in g.m_Components:
        try:
            comp = c.read()
        except Exception:
            continue
        cn = type(comp).__name__
        if cn == "MeshFilter":
            mf = comp
        elif cn == "MeshRenderer":
            mr = comp
    if not mf:
        continue
    try:
        pid = mf.m_Mesh.path_id
        mesh = mf.m_Mesh.read()
    except Exception as e:
        interesting.append((g.m_Name, "ERR", str(e)[:80]))
        continue
    subs = mesh.m_SubMeshes or []
    aabbs = []
    for s in subs[:3]:
        box = s.localAABB
        c, e = box.m_Center, box.m_Extent
        aabbs.append((round(c.x, 1), round(c.y, 1), round(c.z, 1), round(e.x, 1), round(e.y, 1), round(e.z, 1)))
    interesting.append((g.m_Name, mesh.m_Name, pid, len(subs), aabbs))

for row in interesting:
    print(row)
print("COUNT", len(interesting))
