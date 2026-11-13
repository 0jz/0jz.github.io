"""Export the ULTRAKILL sandbox (nearby plaza + the lake) and projectile meshes.

Reads the local install only. Writes gitignored files under assets/arsenal.
"""
import json
import os
from collections import defaultdict

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = r"C:\ULTRAKILL\ULTRAKILL_Data\StreamingAssets\aa\StandaloneWindows64"
SKIP = ("tree", "leaf", "trunk", "rustle", "particle", "canvas", "text mesh", "trigger", "decal", "audio")


def mul(a, b):
    c = [[0.0] * 4 for _ in range(4)]
    for i in range(4):
        for j in range(4):
            c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j] + a[i][3] * b[3][j]
    return c


def apply(m, v):
    x, y, z = v
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    )


def local_matrix(pos, rot, scale):
    x, y, z, w = rot
    r00, r01, r02 = 1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)
    r10, r11, r12 = 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)
    r20, r21, r22 = 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
    sx, sy, sz = scale
    px, py, pz = pos
    return [
        [r00 * sx, r01 * sy, r02 * sz, px],
        [r10 * sx, r11 * sy, r12 * sz, py],
        [r20 * sx, r21 * sy, r22 * sz, pz],
        [0.0, 0.0, 0.0, 1.0],
    ]


IDENT = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def f3(v):
    return [round(float(v[0]), 3), round(float(v[1]), 3), round(float(v[2]), 3)]


def f2(v):
    return [round(float(v[0]), 4), round(float(v[1]), 4)]


class Exporter:
    def __init__(self):
        self.env = UnityPy.Environment()
        self.env.load_file(os.path.join(DATA, "specialscenes_scenes_uk_construct.bundle"))
        self.env.load_file(os.path.join(DATA, "gameprefabs_assets_all.bundle"))
        self.env.load_file(os.path.join(DATA, "assets_assets_assets", "materials.bundle"))
        self.env.load_file(os.path.join(DATA, "assets_assets_assets", "textures.bundle"))
        self.env.load_file(os.path.join(DATA, "assets_assets_assets", "models.bundle"))
        self.by_go = {}
        self.transforms = {}
        self.tr_owner = {}
        self.world = {}
        self.handlers = {}
        self.tex_cache = {}
        for o in self.env.objects:
            if o.type.name != "GameObject":
                continue
            try:
                g = o.read()
            except Exception:
                continue
            comps = {}
            for c in g.m_Components:
                try:
                    comp = c.read()
                except Exception:
                    continue
                comps.setdefault(type(comp).__name__, []).append(comp)
            self.by_go[o.path_id] = (g.m_Name or "", comps)
            if "Transform" in comps:
                tr = comps["Transform"][0]
                self.transforms[o.path_id] = tr
                self.tr_owner[tr.object_reader.path_id] = o.path_id

    def world_of(self, go_id, depth=0):
        if go_id in self.world:
            return self.world[go_id]
        t = self.transforms.get(go_id)
        if t is None or depth > 32:
            self.world[go_id] = IDENT
            return IDENT
        p, r, s = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
        local = local_matrix(
            (float(p.x), float(p.y), float(p.z)),
            (float(r.x), float(r.y), float(r.z), float(r.w)),
            (float(s.x), float(s.y), float(s.z)),
        )
        father = t.m_Father
        parent_go = self.tr_owner.get(father.path_id) if father and father.path_id else None
        if parent_go:
            parent = self.world_of(parent_go, depth + 1)
            m = mul(parent, local)
        else:
            m = local
        self.world[go_id] = m
        return m

    def handler(self, mesh_pptr):
        pid = mesh_pptr.path_id
        if pid not in self.handlers:
            mesh = mesh_pptr.read()
            h = MeshHandler(mesh)
            h.process()
            self.handlers[pid] = (mesh, h)
        return self.handlers[pid]

    def save_tex(self, tex, folder):
        key = (folder, tex.m_PathID if hasattr(tex, "m_PathID") else id(tex))
        # path id lives on the reader
        pid = tex.object_reader.path_id
        key = (folder, pid)
        if key in self.tex_cache:
            return self.tex_cache[key]
        img = tex.image
        if img is None:
            return None
        if max(img.size) > 512:
            img = img.copy()
            img.thumbnail((512, 512), Image.Resampling.BOX)
        name = f"t{pid}.png"
        os.makedirs(folder, exist_ok=True)
        img.save(os.path.join(folder, name))
        self.tex_cache[key] = name
        return name

    def material_look(self, renderer, folder):
        color = [1, 1, 1, 1]
        tex = None
        scale = (1, 1)
        offset = (0, 0)
        name = ""
        if not renderer or not renderer.m_Materials:
            return name, color, tex, scale, offset
        try:
            mat = renderer.m_Materials[0].read()
        except Exception:
            return name, color, tex, scale, offset
        name = mat.m_Name or ""
        try:
            for key, col in mat.m_SavedProperties.m_Colors:
                if key == "_Color":
                    color = [round(col.r, 3), round(col.g, 3), round(col.b, 3), round(col.a, 3)]
            for key, env in mat.m_SavedProperties.m_TexEnvs:
                if key != "_MainTex":
                    continue
                scale = (float(env.m_Scale.x), float(env.m_Scale.y))
                offset = (float(env.m_Offset.x), float(env.m_Offset.y))
                if env.m_Texture and env.m_Texture.path_id:
                    try:
                        image = env.m_Texture.read()
                        if image.m_Width > 2:
                            tex = self.save_tex(image, folder)
                    except Exception:
                        tex = None
        except Exception:
            pass
        return name, color, tex, scale, offset

    def part_from(self, go_id, sub_first, sub_count, baked_world, folder):
        name, comps = self.by_go[go_id]
        mf = comps.get("MeshFilter", [None])[0]
        mr = comps.get("MeshRenderer", [None])[0]
        if not mf:
            return []
        try:
            mesh, h = self.handler(mf.m_Mesh)
        except Exception:
            return []
        if not h.m_Vertices:
            return []
        tris_all = h.get_triangles()
        mat_name, color, tex, scale, offset = self.material_look(mr, folder)
        world = self.world_of(go_id)
        combined = baked_world or (mesh.m_Name or "").startswith("Combined Mesh")
        parts = []
        for si in range(sub_first, min(sub_first + sub_count, len(tris_all))):
            tris = tris_all[si]
            if not tris:
                continue
            used = sorted({i for tri in tris for i in tri})
            remap = {old: n for n, old in enumerate(used)}
            pos, uv = [], []
            for i in used:
                v = h.m_Vertices[i]
                if combined:
                    x, y, z = float(v[0]), float(v[1]), float(v[2])
                else:
                    x, y, z = apply(world, (float(v[0]), float(v[1]), float(v[2])))
                pos.extend((x, y, z))
                if h.m_UV0 and i < len(h.m_UV0):
                    u, vv = h.m_UV0[i]
                    uv.extend((u * scale[0] + offset[0], vv * scale[1] + offset[1]))
            idx = []
            for a, b, c in tris:
                idx.extend((remap[a], remap[b], remap[c]))
            parts.append({
                "name": name,
                "mat": mat_name,
                "pos": [round(n, 3) for n in pos],
                "uv": [round(n, 4) for n in uv],
                "tris": idx,
                "color": color,
                "tex": tex,
            })
        return parts


def sandbox(ex: Exporter):
    # the sandbox checkpoint is where you stand; the floor parent is far below the plaza
    start = None
    for gid, (name, _comps) in ex.by_go.items():
        if name == "Sandbox Checkpoint":
            start = apply(ex.world_of(gid), (0, 0, 0))
            break
    if not start:
        raise SystemExit("no sandbox checkpoint")
    sx, sy, sz = start
    folder = os.path.join(ROOT, "sandbox", "tex")
    near, lake = [], []
    for gid, (name, comps) in ex.by_go.items():
        low = name.lower()
        if any(k in low for k in SKIP) or "leaves" in low or low.endswith("axis") or low.startswith("eye"):
            continue
        mf = comps.get("MeshFilter", [None])[0]
        mr = comps.get("MeshRenderer", [None])[0]
        if not mf or not mr:
            continue
        info = getattr(mr, "m_StaticBatchInfo", None)
        first = int(getattr(info, "firstSubMesh", 0) or 0)
        count = int(getattr(info, "subMeshCount", 0) or 0) or 1
        try:
            mesh_name = mf.m_Mesh.read().m_Name or ""
        except Exception:
            continue
        baked = mesh_name.startswith("Combined Mesh")
        is_lake = "water" in low
        parts = ex.part_from(gid, first, count, baked, folder)
        if not parts:
            continue
        # bounds in unity space
        xs, ys, zs = [], [], []
        for p in parts:
            xs += p["pos"][0::3]
            ys += p["pos"][1::3]
            zs += p["pos"][2::3]
        cx, cy, cz = sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)
        span = max(max(xs) - min(xs), max(zs) - min(zs))
        height = max(ys) - min(ys)
        mats = {p["mat"] for p in parts}
        yardish = any(
            m.startswith("Construct") or m in ("GrassBig", "GrassSprite1", "TilesDirty 1", "StoneSmooth 2", "StoneSmooth 1")
            for m in mats
        )
        reach = 180 if yardish else 42
        overlaps = min(xs) < sx + reach and max(xs) > sx - reach and min(zs) < sz + reach and max(zs) > sz - reach
        on_ground = min(ys) < sy + 80 and max(ys) > sy - 12
        if name == "Water New":
            lake.extend(parts)
        elif overlaps and on_ground and height < 200 and span < 260 and not is_lake:
            near.extend(parts)
            if height > 24:
                print("tower", name, "h", round(height, 1), "span", round(span, 1),
                      "at", round(cx - sx, 1), round(cy - sy, 1), round(cz - sz, 1))
    # floor height: vertices of the plaza near the spawn
    floor_ys = []
    for p in near:
        pos = p["pos"]
        ys = pos[1::3]
        if not ys or max(ys) - min(ys) > 1.5:
            continue
        for i in range(0, len(pos), 3):
            if abs(pos[i] - sx) < 20 and abs(pos[i + 2] - sz) < 20:
                floor_ys.append(pos[i + 1])
    floor_y = sorted(floor_ys)[len(floor_ys) // 2] if floor_ys else sy
    ox, oy, oz = sx, floor_y, sz

    def to_three(parts, dx=0, dy=0, dz=0, scale=1):
        out = []
        for p in parts:
            pos = []
            src = p["pos"]
            for i in range(0, len(src), 3):
                # mirror X so the lake (unity +X) sits on the left, flip Z into three's forward
                pos.extend((
                    round((ox - src[i]) * scale + dx, 3),
                    round((src[i + 1] - oy) * scale + dy, 3),
                    round((oz - src[i + 2]) * scale + dz, 3),
                ))
            out.append({
                "name": p["name"],
                "mat": p["mat"],
                "pos": pos,
                "uv": p["uv"],
                "tris": p["tris"],
                "color": p["color"],
                "tex": p["tex"],
                "water": "water" in (p["name"] + p["mat"]).lower(),
            })
        return out

    # the real lake sits far to the side of the checkpoint; bring that mesh in on the left of the range
    lake_parts = to_three(lake, scale=0.075)
    if lake_parts:
        xs, ys, zs = [], [], []
        for p in lake_parts:
            xs += p["pos"][0::3]
            ys += p["pos"][1::3]
            zs += p["pos"][2::3]
        cx, cy, cz = sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)
        dx, dy, dz = -11.0 - cx, -0.32 - cy, -9.0 - cz
        for p in lake_parts:
            p["pos"] = [
                round(p["pos"][i] + (dx if i % 3 == 0 else dy if i % 3 == 1 else dz), 3)
                for i in range(len(p["pos"]))
            ]
    scene = {
        "camera": [0, 1.65, 1.2],
        "look": [0, 1.15, -12],
        "dummies": [[-7.2, -10.5], [0.0, -12.5], [7.2, -10.5]],
        "parts": to_three(near),
    }
    path = os.path.join(ROOT, "sandbox", "scene.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(scene, f, separators=(",", ":"))
    print("sandbox parts", len(near), "lake", len(lake), "floorY", round(floor_y, 2), "bytes", os.path.getsize(path))
    names = defaultdict(int)
    for p in near:
        names[p["name"]] += 1
    print("near", dict(names))


def invert_affine(m):
    a, b, c = m[0][0], m[0][1], m[0][2]
    d, e, f = m[1][0], m[1][1], m[1][2]
    g, h, i = m[2][0], m[2][1], m[2][2]
    A, B, C = e * i - f * h, f * g - d * i, d * h - e * g
    D, E, F = c * h - b * i, a * i - c * g, b * g - a * h
    G, H, I = b * f - c * e, c * d - a * f, a * e - b * d
    det = a * A + b * B + c * C
    if abs(det) < 1e-8:
        return IDENT
    inv = 1 / det
    r = [[A * inv, D * inv, G * inv], [B * inv, E * inv, H * inv], [C * inv, F * inv, I * inv]]
    t = (m[0][3], m[1][3], m[2][3])
    rt = tuple(r[row][0] * t[0] + r[row][1] * t[1] + r[row][2] * t[2] for row in range(3))
    return [
        [r[0][0], r[0][1], r[0][2], -rt[0]],
        [r[1][0], r[1][1], r[1][2], -rt[1]],
        [r[2][0], r[2][1], r[2][2], -rt[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def align_nose_up(parts):
    """Point the longest axis along +Y so a shot can aim the mesh with its nose forward."""
    xs, ys, zs = [], [], []
    for p in parts:
        xs += p["pos"][0::3]
        ys += p["pos"][1::3]
        zs += p["pos"][2::3]
    if not xs:
        return parts
    span = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    axis = span.index(max(span))
    out = []
    for p in parts:
        pos = []
        src = p["pos"]
        for i in range(0, len(src), 3):
            x, y, z = src[i], src[i + 1], src[i + 2]
            if axis == 0:
                x, y, z = -y, x, z
            elif axis == 2:
                x, y, z = x, z, -y
            pos.extend((round(x, 4), round(y, 4), round(z, 4)))
        item = dict(p)
        item["pos"] = pos
        if axis != 1:
            tris = []
            idx = p["tris"]
            for i in range(0, len(idx), 3):
                tris.extend((idx[i], idx[i + 2], idx[i + 1]))
            item["tris"] = tris
        out.append(item)
    return out


def fx(ex: Exporter):
    folder = os.path.join(ROOT, "fx", "tex")
    want = {
        "bullet": "Revolver Beam",
        "laser": "Railcannon Beam",
        "rocket": "Rocket",
        "flame": "NailHeated",
        "grenade": "Grenade",
        "explosion": "Explosion",
        "muzzle": "MuzzleFlash",
    }
    tr_to_go = ex.tr_owner

    def walk(gid):
        out = [gid]
        t = ex.transforms.get(gid)
        if not t:
            return out
        for c in t.m_Children or []:
            child = tr_to_go.get(c.path_id)
            if child:
                out.extend(walk(child))
        return out

    def grab(gid):
        inv = invert_affine(ex.world_of(gid))
        ids = walk(gid)
        parts, sprites, beam = [], [], None
        for cid in ids:
            name, comps = ex.by_go[cid]
            if "MeshFilter" in comps and "MeshRenderer" in comps:
                for p in ex.part_from(cid, 0, 8, False, folder):
                    pos = []
                    src = p["pos"]
                    for i in range(0, len(src), 3):
                        x, y, z = apply(inv, (src[i], src[i + 1], src[i + 2]))
                        pos.extend((round(x, 4), round(y, 4), round(-z, 4)))
                    tris = []
                    idx = p["tris"]
                    for i in range(0, len(idx), 3):
                        tris.extend((idx[i], idx[i + 2], idx[i + 1]))
                    if len(pos) >= 9:
                        parts.append({
                            "name": p["name"], "mat": p["mat"], "pos": pos, "uv": p["uv"],
                            "tris": tris, "color": p["color"], "tex": p["tex"],
                        })
            for kind in ("LineRenderer", "TrailRenderer", "ParticleSystemRenderer", "SpriteRenderer"):
                if kind not in comps:
                    continue
                rend = comps[kind][0]
                mat_name, color, tex, _s, _o = ex.material_look(rend, folder)
                if kind == "SpriteRenderer" and not tex:
                    try:
                        sprite = rend.m_Sprite.read()
                        tex = ex.save_tex(sprite.image and sprite or sprite, folder) if False else None
                        img = sprite.image
                        if img is not None:
                            fake = sprite
                            # save_tex expects a Texture2D-like object; write the sprite image directly
                            pid = sprite.object_reader.path_id
                            fn = f"s{pid}.png"
                            os.makedirs(folder, exist_ok=True)
                            if max(img.size) > 256:
                                img = img.copy()
                                img.thumbnail((256, 256))
                            img.save(os.path.join(folder, fn))
                            tex = fn
                    except Exception:
                        pass
                if kind == "LineRenderer" and beam is None and (tex or mat_name):
                    width = float(getattr(rend, "m_WidthMultiplier", 0.1) or 0.1)
                    beam = {"tex": tex, "color": color, "width": round(width, 3), "mat": mat_name}
                elif tex and kind != "LineRenderer":
                    sprites.append({"tex": tex, "color": color, "mat": mat_name, "name": name})
        return {"parts": align_nose_up(parts), "beam": beam, "sprites": sprites[:4]}

    book = {}
    for key, label in want.items():
        best, best_n = None, -1
        labels = ("NailHeated", "Nail") if key == "flame" else (label,)
        for gid, (name, comps) in ex.by_go.items():
            if name not in labels or "Transform" not in comps:
                continue
            item = grab(gid)
            if key == "flame" and item["parts"]:
                spans = []
                for p in item["parts"]:
                    xs, ys, zs = p["pos"][0::3], p["pos"][1::3], p["pos"][2::3]
                    spans.append((max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))
                longest = max(max(s) for s in spans)
                thinnest = min(min(s) for s in spans)
                if longest > 1.6 or thinnest > 0.4 or any(p["mat"] == "Floor" for p in item["parts"]):
                    print("flame skip", round(longest, 3), round(thinnest, 3), [p["mat"] for p in item["parts"]])
                    continue
            n = sum(len(p["pos"]) for p in item["parts"]) + (50 if item["beam"] else 0) + 10 * len(item["sprites"])
            if n > best_n:
                best, best_n = item, n
        book[key] = best or {"parts": [], "beam": None, "sprites": []}
        print("fx", key, "parts", len(book[key]["parts"]), "beam", bool(book[key]["beam"]), "sprites", len(book[key]["sprites"]),
              "mats", {p["mat"] for p in book[key]["parts"]})
    path = os.path.join(ROOT, "fx", "fx.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(book, f, separators=(",", ":"))
    print("fx bytes", os.path.getsize(path))


if __name__ == "__main__":
    ex = Exporter()
    sandbox(ex)
    fx(ex)
