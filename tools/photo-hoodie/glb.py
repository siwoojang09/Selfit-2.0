#!/usr/bin/env python3
"""Pack the photographed adidas hoodie into a binary glTF 2.0 asset.

The mesh is the real pattern, piece for piece, in the order the fitting code
builds it. What the photographs decide is the surface: every piece's UVs are
laid out in the atlas that `build_atlas.py` baked from the product flat lays, so
the wearer's torso, sleeves, hood, rib and zip all read as the actual garment.

    python3 tools/photo-hoodie/dump_pieces.py
    python3 tools/photo-hoodie/build_atlas.py
    python3 tools/photo-hoodie/glb.py
"""
import io, json, pathlib, struct
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / '.devtest' / 'photo-hoodie'
ASSET = ROOT / 'assets' / 'adidas-kc9315.glb'

data = np.load(WORK / 'pieces.npz')
meta = [json.loads(s) for s in data['meta']]


def piece_pos(i):
    return data[f'p{i}_pos'].astype(np.float32)


def piece_idx(i):
    return data[f'p{i}_idx'].astype(np.uint32).reshape(-1, 3)


# The panel's column count is fixed by the builder, and a vertex count can have
# more than one divisor: 3185 is both 49x65 and 91x35. Read it from the source of
# truth rather than guessing, or every UV lands on the wrong meridian.
COLS = {
    'Measured garment body': 64, 'Ribbed waistband': 68, 'Folded bottom hem': 64,
    'Folded hood': 64, 'Lined hood opening': 60, 'Zip tape': 96,
    'Silver coil zipper': 96, 'Sleeve': 34, 'Dropped shoulder seam': 36,
    'Sleeve cuff': 36, 'Turned cuff edge': 36,
}


def columns_for(i):
    cols = COLS[meta[i]['name']]
    assert meta[i]['count'] == (meta[i]['count'] // (cols + 1)) * (cols + 1), meta[i]['count']
    return cols


def ring_arcs(ring):
    steps = np.linalg.norm(np.diff(ring, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(steps)])


# ---- frames ---------------------------------------------------------------
body_i = next(i for i, m in enumerate(meta) if m['name'] == 'Measured garment body')
body_pos = piece_pos(body_i)
APEX = float(body_pos[:, 1].max())
HEM = float(body_pos[:, 1].min())
BODY_LEN = APEX - HEM

sleeve_i = next(i for i, m in enumerate(meta) if m['name'] == 'Sleeve')
seam_i = next(i for i, m in enumerate(meta) if m['name'] == 'Dropped shoulder seam')
SEAM_Y = float(piece_pos(seam_i)[:, 1].mean())
SLEEVE_END = float(piece_pos(sleeve_i)[:, 1].min())

hood_i = next(i for i, m in enumerate(meta) if m['name'] == 'Folded hood')
hood_pos = piece_pos(hood_i)
HOOD_X = (float(hood_pos[:, 0].min()), float(hood_pos[:, 0].max()))
HOOD_Y = (float(hood_pos[:, 1].min()), float(hood_pos[:, 1].max()))

zip_i = next(i for i, m in enumerate(meta) if m['name'] == 'Zip tape')
zip_pos = piece_pos(zip_i)
ZIP_X = (float(zip_pos[:, 0].min()), float(zip_pos[:, 0].max()))
ZIP_Y = (float(zip_pos[:, 1].min()), float(zip_pos[:, 1].max()))
ZIP_REPEAT = 2.2          # teeth per garment length, from the closeup's pitch


def uv_ring(pos, cols, top=APEX, length=BODY_LEN):
    """Torso-style unwrap: u follows the arc round the section from column 0."""
    rings = pos.reshape(-1, cols + 1, 3)
    out = np.zeros((len(pos), 2), np.float32)
    for i, ring in enumerate(rings):
        arc = ring_arcs(ring)
        total = arc[-1] or 1.0
        sl = slice(i * (cols + 1), (i + 1) * (cols + 1))
        out[sl, 0] = arc / total
        out[sl, 1] = np.clip((top - ring[:, 1]) / length, 0.0, 1.0)
    return out


def uv_sleeve(pos, cols, arm):
    """u = 0 at the sleeve's outer edge, 0.5 at the inner one, 1 outer again.

    Measured along the section's arc, not its angle: the atlas was unwrapped by
    arc length, so an elliptical section would otherwise pull the cream stripes
    towards the outer edge and thin them down the arm.
    """
    rings = pos.reshape(-1, cols + 1, 3)
    out = np.zeros((len(pos), 2), np.float32)
    angles = 2 * np.pi * np.arange(cols + 1) / cols
    outer = (-np.pi / 2 if arm == 0 else np.pi / 2) % (2 * np.pi)
    span = SEAM_Y - SLEEVE_END
    for i, ring in enumerate(rings):
        arc = ring_arcs(ring)
        P = arc[-1] or 1.0
        a = (np.arctan2(ring[:, 0], ring[:, 2]) + 2 * np.pi) % (2 * np.pi)
        s = np.interp(a, angles, arc)
        s0 = float(np.interp(outer, angles, arc))
        d = (s - s0 + P / 2) % P - P / 2
        front = d >= 0 if arm == 0 else d <= 0
        mag = np.abs(d) / (P / 2)
        u = np.where(front, .5 * mag, .5 + .5 * mag)
        sl = slice(i * (cols + 1), (i + 1) * (cols + 1))
        out[sl, 0] = u
        out[sl, 1] = np.clip((SEAM_Y - ring[:, 1]) / span, 0.0, 1.0)
    return out


def uv_hood(pos):
    out = np.zeros((len(pos), 2), np.float32)
    out[:, 0] = np.clip((pos[:, 0] - HOOD_X[0]) / (HOOD_X[1] - HOOD_X[0]), 0, 1)
    out[:, 1] = np.clip((HOOD_Y[1] - pos[:, 1]) / (HOOD_Y[1] - HOOD_Y[0]), 0, 1)
    return out


def uv_zip(pos):
    out = np.zeros((len(pos), 2), np.float32)
    out[:, 0] = np.clip((pos[:, 0] - ZIP_X[0]) / max(1e-6, ZIP_X[1] - ZIP_X[0]), 0, 1)
    out[:, 1] = (pos[:, 1] - ZIP_Y[0]) / max(1e-6, ZIP_Y[1] - ZIP_Y[0]) * ZIP_REPEAT
    return out


RULES = {
    'Measured garment body': ('body', uv_ring),
    'Ribbed waistband': ('body', uv_ring),
    'Folded bottom hem': ('body', uv_ring),
    'Folded hood': ('hood', lambda p, c: uv_hood(p)),
    'Lined hood opening': ('hood', lambda p, c: uv_hood(p)),
    'Zip tape': ('@tape', lambda p, c: uv_zip(p)),
    'Silver coil zipper': ('zip', lambda p, c: uv_zip(p)),
    'Sleeve': ('sleeve', uv_sleeve),
    'Dropped shoulder seam': ('sleeve', uv_sleeve),
    'Sleeve cuff': ('sleeve', uv_sleeve),
    'Turned cuff edge': ('sleeve', uv_sleeve),
}
METAL = ('Interlocking zipper teeth', 'Zipper slider', 'Zipper pull',
         'Lower zipper slider', 'Lower zipper pull')


def jpeg(img, quality=88, gray=False):
    mode = 'L' if gray else 'RGB'
    buf = io.BytesIO()
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), mode).save(buf, 'JPEG', quality=quality)
    return buf.getvalue()


def compute_normals(pos, idx):
    n = np.zeros_like(pos)
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    face = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, idx[:, k], face)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return (n / np.maximum(ln, 1e-9)).astype(np.float32)


class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.images, self.textures = [], [], [], []
        self.materials, self.nodes, self.meshes = [], [], []

    def pad(self):
        while len(self.bin) % 4:
            self.bin.append(0)

    def view(self, payload, target=None):
        self.pad()
        offset = len(self.bin)
        self.bin += payload
        v = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)}
        if target:
            v['target'] = target
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, array, kind, target=None, typ=None, minmax=False):
        array = np.ascontiguousarray(array)
        view = self.view(array.tobytes(), target)
        comp = {np.float32: 5126, np.uint16: 5123, np.uint32: 5125}[array.dtype.type]
        count = array.shape[0] if array.ndim > 1 else array.size
        acc = {'bufferView': view, 'componentType': comp, 'count': int(count),
               'type': typ if array.ndim > 1 else 'SCALAR'}
        if minmax:
            acc['min'] = [float(x) for x in array.min(0)]
            acc['max'] = [float(x) for x in array.max(0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def image(self, payload, mime):
        view = self.view(payload)
        self.images.append({'bufferView': view, 'mimeType': mime})
        return len(self.images) - 1

    def texture(self, image, sampler=0):
        self.textures.append({'sampler': sampler, 'source': image})
        return len(self.textures) - 1


def build():
    g = Gltf()
    g.samplers = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]

    def photo_material(name, tag, colour, sheen):
        colour_img = np.asarray(Image.open(WORK / f'{tag}.png').convert('RGB'))
        normal_img = np.asarray(Image.open(WORK / f'normal-{tag}.png').convert('RGB'))
        rough_img = np.asarray(Image.open(WORK / f'rough-{tag}.png').convert('L'))
        mr = np.zeros(rough_img.shape + (3,), np.uint8)
        mr[:, :, 1] = rough_img
        c = g.texture(g.image(jpeg(colour_img, 90), 'image/jpeg'))
        n = g.texture(g.image(jpeg(normal_img, 84), 'image/jpeg'))
        m = g.texture(g.image(jpeg(mr, 85), 'image/jpeg'))
        g.materials.append({
            'name': name, 'doubleSided': True,
            'pbrMetallicRoughness': {
                # The studio lights this scene for pale cloth; the photographed
                # black cotton is lifted a touch so its knit still reads.
                'baseColorFactor': colour + [1.0],
                'baseColorTexture': {'index': c},
                'metallicRoughnessTexture': {'index': m},
                'metallicFactor': 0.0, 'roughnessFactor': 1.0,
            },
            'normalTexture': {'index': n, 'scale': 1.0},
            'extensions': {'KHR_materials_sheen': {
                'sheenColorFactor': sheen, 'sheenRoughnessFactor': 1.0}},
        })
        return len(g.materials) - 1

    material_index = {
        'body': photo_material('kc9315 cotton photo', 'body', [1.9, 1.9, 1.9], [0.10, 0.10, 0.11]),
        'sleeve': photo_material('kc9315 sleeve photo', 'sleeve', [1.9, 1.9, 1.9], [0.10, 0.10, 0.11]),
        'hood': photo_material('kc9315 hood photo', 'hood', [1.9, 1.9, 1.9], [0.10, 0.10, 0.11]),
        'zip': photo_material('kc9315 zip photo', 'zip', [0.42, 0.42, 0.42], [0.0, 0.0, 0.0]),
    }
    # The zip's cloth tape is plain black webbing; only the teeth are metal, so
    # the photographed strip goes on the coil alone and cannot widen the zip.
    g.materials.append({
        'name': 'zip tape', 'doubleSided': True,
        'pbrMetallicRoughness': {'baseColorFactor': [0.055, 0.055, 0.062, 1.0],
                                 'metallicFactor': 0.0, 'roughnessFactor': 0.82}})
    material_index['@tape'] = len(g.materials) - 1
    g.materials.append({
        'name': 'brushed nickel', 'doubleSided': True,
        'pbrMetallicRoughness': {'baseColorFactor': [0.78, 0.78, 0.76, 1.0],
                                 'metallicFactor': 0.9, 'roughnessFactor': 0.34}})
    metal_index = len(g.materials) - 1

    for i, m in enumerate(meta):
        pos = piece_pos(i)
        idx = piece_idx(i)
        name = m['name']
        arm = 0 if m['frame'] == 'arm0' else 1 if m['frame'] == 'arm1' else None
        if name in METAL:
            material = metal_index
            uv = np.zeros((len(pos), 2), np.float32)
        else:
            tag, rule = RULES[name]
            cols = columns_for(i)
            uv = rule(pos, cols) if rule is not uv_sleeve else rule(pos, cols, arm)
            material = material_index[tag]
        if arm is not None:
            # Assemble the sleeves onto the shoulders so the file is a garment
            # on its own, not twenty pieces stacked at the origin.
            pos = pos + np.array([0.18 if arm == 1 else -0.18, 1.402, 0.0], np.float32)
        nrm = compute_normals(pos, idx)
        dtype = np.uint16 if len(pos) < 65536 else np.uint32
        prim = {
            'attributes': {
                'POSITION': g.accessor(pos, 'POSITION', 34962, 'VEC3', True),
                'NORMAL': g.accessor(nrm, 'NORMAL', 34962, 'VEC3'),
                'TEXCOORD_0': g.accessor(uv, 'TEXCOORD_0', 34962, 'VEC2'),
            },
            'indices': g.accessor(idx.reshape(-1).astype(dtype), 'INDICES', 34963),
            'material': material, 'mode': 4,
        }
        node = {'mesh': len(g.meshes), 'name': f'{name}#{i}'}
        g.meshes.append({'name': f'{name}#{i}', 'primitives': [prim]})
        g.nodes.append(node)

    gltf = {
        'asset': {'version': '2.0', 'generator': 'Selfit 2.0 photo hoodie builder'},
        'scene': 0,
        'scenes': [{'nodes': list(range(len(g.nodes)))}],
        'nodes': g.nodes,
        'meshes': g.meshes,
        'materials': g.materials,
        'textures': g.textures,
        'images': g.images,
        'samplers': g.samplers,
        'accessors': g.accessors,
        'bufferViews': g.views,
        'buffers': [{'byteLength': len(g.bin)}],
        'extensionsUsed': ['KHR_materials_sheen'],
    }
    g.pad()
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(g.bin)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(g.bin), 0x004E4942) + bytes(g.bin)
    ASSET.parent.mkdir(parents=True, exist_ok=True)
    ASSET.write_bytes(out)
    print('wrote', ASSET, len(out), 'bytes;', len(g.meshes), 'pieces;',
          'apex', round(APEX, 3), 'len', round(BODY_LEN, 3),
          'sleeve', round(SEAM_Y, 3), round(SLEEVE_END, 3))


if __name__ == '__main__':
    build()
