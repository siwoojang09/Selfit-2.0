#!/usr/bin/env python3
"""Pack the photo-mapped wide chino into a binary glTF 2.0 asset.

The mesh is the real measured-pants pattern at size M, piece for piece, with
UVs that unwrap each leg onto the baked photo atlas. Textures are embedded, so
the file stands alone: no CDN, no sidecar images.
"""
import io, json, struct, pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / '.devtest' / 'photo-chino'
ASSET = ROOT / 'assets' / 'signature-wide-chino.glb'

data = np.load(WORK / 'pieces.npz')
meta = [json.loads(s) for s in data['meta']]
land = json.loads(data['landmarks'][0])


def jpeg(img, quality=88, gray=False):
    mode = 'L' if gray else 'RGB'
    buf = io.BytesIO()
    Image.fromarray(img.astype(np.uint8), mode).save(buf, 'JPEG', quality=quality)
    return buf.getvalue()


def load_atlas(side):
    tag = 'right' if side < 0 else 'left'
    colour = np.asarray(Image.open(WORK / f'atlas-{tag}.png').convert('RGB'))
    normal = np.asarray(Image.open(WORK / f'normal-{tag}.png').convert('RGB')
                        .resize((1024, 1024), Image.LANCZOS))
    rough = np.asarray(Image.open(WORK / f'rough-{tag}.png').convert('L').resize((1024, 1024), Image.LANCZOS))
    mr = np.zeros((1024, 1024, 3), np.uint8)
    mr[:, :, 1] = rough
    return {'colour': jpeg(colour, 90), 'normal': jpeg(normal, 84),
            'mr': jpeg(mr, 85)}


def compute_normals(pos, idx):
    n = np.zeros_like(pos)
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    face = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, idx[:, k], face)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    n = np.divide(n, np.maximum(ln, 1e-9))
    return n.astype(np.float32)


class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.views = []
        self.accessors = []
        self.images = []
        self.textures = []
        self.materials = []
        self.primitives = []

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
        acc = {'bufferView': view, 'componentType': comp, 'count': int(count)}
        if len(array.shape) > 1:
            acc['type'] = typ
        else:
            acc['type'] = 'SCALAR'
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
    atlas = {-1: load_atlas(-1), 1: load_atlas(1)}
    # one sampler: repeat, mipmapped, trilinear
    g.samplers = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]

    def cloth_material(side):
        tex = atlas[side]
        colour = g.texture(g.image(tex['colour'], 'image/jpeg'))
        normal = g.texture(g.image(tex['normal'], 'image/jpeg'))
        mr = g.texture(g.image(tex['mr'], 'image/jpeg'))
        g.materials.append({
            'name': 'chino-photo-right' if side < 0 else 'chino-photo-left',
            'doubleSided': True,
            'pbrMetallicRoughness': {
                # The studio rig lights this scene for pale cloth, and the
                # chino photograph was shot under its own soft sweep. The tone
                # factor only trims the beige to the scene's lights.
                'baseColorFactor': [0.94, 0.93, 0.95, 1.0],
                'baseColorTexture': {'index': colour, 'texCoord': 0},
                'metallicRoughnessTexture': {'index': mr, 'texCoord': 0},
                'metallicFactor': 0.0, 'roughnessFactor': 1.0,
            },
            # The twill is baked into this atlas normal at its real repeat, so
            # the beige shows its rib under a raking light instead of plastic.
            'normalTexture': {'index': normal, 'texCoord': 0, 'scale': 0.72},
            'extensions': {'KHR_materials_sheen': {
                'sheenColorFactor': [0.16, 0.15, 0.12], 'sheenRoughnessFactor': 1.0}},
        })
        return len(g.materials) - 1

    def plain_material(name, colour, roughness=.9, metal=0.0):
        g.materials.append({
            'name': name, 'doubleSided': True,
            'pbrMetallicRoughness': {
                'baseColorFactor': list(colour) + [1.0],
                'metallicFactor': metal, 'roughnessFactor': roughness,
            }})
        return len(g.materials) - 1

    cloth = {-1: cloth_material(-1), 1: cloth_material(1)}
    stitch = plain_material('tonal topstitch', (0.62, 0.57, 0.44), .82)
    shadow = plain_material('seam shadow', (0.42, 0.38, 0.29), .95)
    lining = plain_material('chino lining', (0.55, 0.50, 0.38), .95)
    metal = plain_material('brushed nickel', (0.72, 0.73, 0.72), .34, .9)
    by_layer = {'shell': cloth, 'band': cloth, 'patch': cloth,
                'thread': stitch, 'shadow': shadow, 'lining': lining, 'metal': metal}

    used_layers = []
    for i, m in enumerate(meta):
        pos = data[f'p{i}_pos'].astype(np.float32)
        uv = data[f'p{i}_uv'].astype(np.float32).copy()
        idx = data[f'p{i}_idx'].astype(np.uint32).reshape(-1, 3)
        uv[:, 1] = 1.0 - uv[:, 1]          # glTF V runs down from the waistband
        uv = np.clip(uv, 0.0, 1.0)
        nrm = compute_normals(pos, idx)
        mat = by_layer[m['layer']]
        # buildSide(-1) names its meshes "right" (the wearer's right leg).
        material = (mat[-1] if m['side'] == 'right' else mat[1]) if isinstance(mat, dict) else mat
        used_layers.append((m['name'], material))
        dtype = np.uint16 if pos.shape[0] < 65536 else np.uint32
        g.primitives.append({
            'attributes': {
                'POSITION': g.accessor(pos, 'POSITION', 34962, 'VEC3', True),
                'NORMAL': g.accessor(nrm, 'NORMAL', 34962, 'VEC3'),
                'TEXCOORD_0': g.accessor(uv, 'TEXCOORD_0', 34962, 'VEC2'),
            },
            'indices': g.accessor(idx.reshape(-1).astype(dtype), 'INDICES', 34963),
            'material': material, 'mode': 4,
        })

    gltf = {
        'asset': {'version': '2.0', 'generator': 'Selfit 2.0 photo chino builder'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'signature-wide-chino'}],
        'meshes': [{'name': 'signature-wide-chino', 'primitives': g.primitives}],
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
    print('wrote', ASSET, len(out), 'bytes;', len(g.primitives), 'primitives')
    print('textures', len(g.images), 'images', [len(v) for v in atlas[1].values()])
    return gltf


if __name__ == '__main__':
    build()
