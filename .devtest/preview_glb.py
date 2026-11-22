#!/usr/bin/env python3
"""Preview the baked GLB with a plain matte shader, no GPU.

This is a dev check only: it shows the atlas on the actual mesh (UVs, stripe
placement, tone) with a Lambert model, so the mapping can be judged without a
browser.
"""
import io, json, struct, sys
import numpy as np
from PIL import Image

PATH = sys.argv[1] if len(sys.argv) > 1 else 'assets/adidas-kc9315.glb'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.devtest/glb-preview'

data = open(PATH, 'rb').read()
magic, version, total = struct.unpack('<III', data[:12])
off = 12
js, bin_ = None, None
while off < total:
    length, kind = struct.unpack('<II', data[off:off + 8])
    chunk = data[off + 8:off + 8 + length]
    if kind == 0x4E4F534A:
        js = json.loads(chunk)
    else:
        bin_ = chunk
    off += 8 + length

COMP = {5126: ('f4', 4), 5125: ('u4', 4), 5123: ('u2', 2), 5121: ('u1', 1)}
ITEMS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def accessor(index):
    acc = js['accessors'][index]
    view = js['bufferViews'][acc['bufferView']]
    dtype, size = COMP[acc['componentType']]
    n = ITEMS[acc['type']]
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    arr = np.frombuffer(bin_, dtype=np.dtype('<' + dtype), count=acc['count'] * n, offset=start)
    return arr.reshape(acc['count'], n) if n > 1 else arr


def images():
    out = []
    for image in js.get('images', []):
        view = js['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        blob = bin_[start:start + view['byteLength']]
        out.append(np.asarray(Image.open(io.BytesIO(blob)).convert('RGB')).astype(np.float32))
    return out


TEX = images()
MESHES = []
for mesh in js['meshes']:
    for prim in mesh['primitives']:
        attrs = prim['attributes']
        pos = accessor(attrs['POSITION']).astype(np.float64)
        uv = accessor(attrs['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in attrs else None
        idx = accessor(prim['indices']).astype(np.int64).reshape(-1, 3)
        mat = js['materials'][prim['material']]
        pbr = mat.get('pbrMetallicRoughness', {})
        image = js['textures'][pbr['baseColorTexture']['index']]['source'] if 'baseColorTexture' in pbr else 0
        tex = TEX[image]
        gain = pbr.get('baseColorFactor', [1, 1, 1, 1])[0]
        name = mesh.get('name', '')
        MESHES.append(dict(name=name, pos=pos, uv=uv, idx=idx, tex=tex, gain=gain))

lo = np.min([m['pos'].min(0) for m in MESHES], axis=0)
hi = np.max([m['pos'].max(0) for m in MESHES], axis=0)
print('bounds', lo.round(3), hi.round(3))


def shade(m, light, amb):
    if m['uv'] is None:
        return np.full(len(m['pos']), .1, np.float32), np.zeros((len(m['pos']), 3), np.float32)
    h, w, _ = m['tex'].shape
    u = np.clip(m['uv'][:, 0] % 1.0, 0, .999999)
    v = np.clip(m['uv'][:, 1] % 1.0, 0, .999999)
    px = m['tex'][(v * (h - 1)).astype(int), (u * (w - 1)).astype(int)]
    return px, None


def render(view, size=(760, 900), zoom=1.0, focus=None, mask_pieces=None):
    W, H = size
    if focus is None:
        focus = (lo + hi) / 2
        span = max(hi[0] - lo[0], hi[1] - lo[1]) * 1.05
    else:
        span = focus[1]
        focus = focus[0]
    scale = min(W, H) / span / zoom
    img = np.full((H, W, 3), 238, np.float32)
    zbuf = np.full((H, W), -1e9)
    ly = np.array([-0.35, 0.62, 0.70]); ly /= np.linalg.norm(ly)
    for m in MESHES:
        if mask_pieces and not any(k.lower() in m['name'].lower() for k in mask_pieces):
            continue
        pos, uv = m['pos'], m['uv']
        n = len(pos)
        if view == 'front':
            sx = pos[:, 0]; sy = pos[:, 1]; depth = pos[:, 2]
        elif view == 'back':
            sx = -pos[:, 0]; sy = pos[:, 1]; depth = -pos[:, 2]
        elif view == 'side':
            sx = pos[:, 2]; sy = pos[:, 1]; depth = pos[:, 0]
        X = (sx - focus[0]) * scale + W / 2
        Y = H / 2 - (sy - focus[1]) * scale
        # face normals in view space
        p = np.stack([sx, sy, depth], 1)
        tri = p[m['idx']]
        fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-9)
        lit = np.abs(fn @ ly) if view != 'front' else np.abs(fn @ ly)
        base = m['tex']
        h, w, _ = base.shape
        for k in range(len(m['idx'])):
            i0, i1, i2 = m['idx'][k]
            xs = np.array([X[i0], X[i1], X[i2]]); ys = np.array([Y[i0], Y[i1], Y[i2]])
            x0, x1 = int(np.floor(xs.min())), int(np.ceil(xs.max()))
            y0, y1 = int(np.floor(ys.min())), int(np.ceil(ys.max()))
            if x1 < 0 or y1 < 0 or x0 >= W or y0 >= H:
                continue
            x0 = max(0, x0); y0 = max(0, y0); x1 = min(W - 1, x1); y1 = min(H - 1, y1)
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-9:
                continue
            l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
            l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
            l2 = 1 - l0 - l1
            inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
            if not inside.any():
                continue
            if uv is not None:
                uu = l0 * uv[i0, 0] + l1 * uv[i1, 0] + l2 * uv[i2, 0]
                vv = l0 * uv[i0, 1] + l1 * uv[i1, 1] + l2 * uv[i2, 1]
                tx = np.clip((uu % 1.0) * (w - 1), 0, w - 1).astype(int)
                ty = np.clip((vv % 1.0) * (h - 1), 0, h - 1).astype(int)
                col = m['tex'][ty, tx] * m['gain']
            else:
                col = np.full((*gx.shape, 3), 120.0)
            dep = l0 * depth[i0] + l1 * depth[i1] + l2 * depth[i2]
            shade_k = (0.32 + 0.80 * lit[k]) * (1.0 if view != 'side' else 1.0)
            rgb = np.clip(col * shade_k, 0, 255)
            sub = zbuf[y0:y1 + 1, x0:x1 + 1]
            win = inside & (dep > sub)
            sub[win] = dep[win]
            img[y0:y1 + 1, x0:x1 + 1][win] = rgb[win]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


render('front').save(OUT + '-front.png')
render('back').save(OUT + '-back.png')
render('side').save(OUT + '-side.png')
render('front', focus=((0.0, 1.15), 0.55), zoom=1.0).save(OUT + '-chest.png')
# the sleeve alone, close up: the tapes must run straight
print('wrote', OUT + '-front.png')
