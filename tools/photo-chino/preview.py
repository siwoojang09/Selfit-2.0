#!/usr/bin/env python3
"""Software rasterise the packed GLB so the texture can be judged off-browser.

Parses the asset exactly as a glTF viewer would (accessors, primitives,
embedded JPEGs), samples base colour per pixel, and shades with a key light so
we see the same wash, seams and pockets the WebGL build will show.
"""
import json, struct, sys, pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
ASSET = ROOT / 'assets' / 'signature-wide-chino.glb'


def load_glb(path=ASSET):
    raw = path.read_bytes()
    magic, version, length = struct.unpack('<III', raw[:12])
    off = 12
    js, bin_ = None, None
    while off < length:
        size, kind = struct.unpack('<II', raw[off:off + 8])
        payload = raw[off + 8:off + 8 + size]
        if kind == 0x4E4F534A:
            js = json.loads(payload)
        elif kind == 0x004E4942:
            bin_ = payload
        off += 8 + size
    return js, bin_


def accessor(g, bin_, i):
    acc = g['accessors'][i]
    view = g['bufferViews'][acc['bufferView']]
    base = view['byteOffset'] + acc.get('byteOffset', 0)
    n = acc['count']
    comp = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: '<u1'}[acc['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    arr = np.frombuffer(bin_, dtype=comp, count=n * width, offset=base)
    return arr.reshape(n, width) if width > 1 else arr


def image(g, bin_, idx):
    im = g['images'][idx]
    view = g['bufferViews'][im['bufferView']]
    payload = bin_[view['byteOffset']:view['byteOffset'] + view['byteLength']]
    import io
    return np.asarray(Image.open(io.BytesIO(payload)).convert('RGB')).astype(np.float32) / 255.0


def sample(tex, uv):
    h, w, _ = tex.shape
    x = np.clip(uv[:, 0], 0, 1) * (w - 1)
    y = np.clip(uv[:, 1], 0, 1) * (h - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    a = tex[y0, x0]; b = tex[y0, x1]; c = tex[y1, x0]; d = tex[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def render(view='front', width=760, height=1200, yaw=0.0, out=None, solid=False):
    g, bin_ = load_glb()
    prims = g['meshes'][0]['primitives']
    tex = {}
    for mi, mat in enumerate(g['materials']):
        pbr = mat['pbrMetallicRoughness']
        if 'baseColorTexture' in pbr:
            tex[mi] = image(g, bin_, g['textures'][pbr['baseColorTexture']['index']]['source'])
        else:
            tex[mi] = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3], np.float32).reshape(1, 1, 3)

    pos_all = np.concatenate([accessor(g, bin_, p['attributes']['POSITION']) for p in prims])
    lo, hi = pos_all.min(0), pos_all.max(0)
    centre = (lo + hi) / 2
    scale = (hi[1] - lo[1])
    tan = np.tan(np.radians(14))
    span = scale * 1.08
    aspect = width / height
    right = np.array([np.cos(yaw), 0, -np.sin(yaw)])
    up = np.array([0, 1, 0])
    eye = -np.array([np.sin(yaw), 0, np.cos(yaw)])

    zbuf = np.full((height, width), 1e9, np.float32)
    colour = np.ones((height, width, 3), np.float32) * np.array([0.84, 0.82, 0.79])
    yy, xx = np.mgrid[0:height, 0:width]
    px = (xx + .5) / width * 2 - 1
    py = 1 - (yy + .5) / height * 2
    ray_d = (right[None, None, :] * (px * aspect * tan * span / (aspect))[:, :, None] * 0 +
             np.zeros((1, 1, 1)))
    sx = px * (span / 2) * aspect / aspect
    sy = py * (span / 2)

    light = np.array([-0.45, 0.62, 0.64]); light /= np.linalg.norm(light)
    fill = np.array([0.55, 0.25, 0.35]); fill /= np.linalg.norm(fill)

    for p in prims:
        pos = accessor(g, bin_, p['attributes']['POSITION'])
        uv = accessor(g, bin_, p['attributes']['TEXCOORD_0'])
        nrm = accessor(g, bin_, p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else None
        idx = accessor(g, bin_, p['indices']).reshape(-1, 3)
        t = tex[p['material']]
        # to camera space
        rel = pos - centre
        cx = rel @ right
        cy = rel @ up
        cz = rel @ eye
        ppm = height / span
        ux = cx * ppm + width / 2
        uy = height / 2 - cy * ppm
        if solid:
            base = np.array([0.35, 0.45, 0.5], np.float32)
        for k in range(0, len(idx), 4096):
            tri = idx[k:k + 4096]
            X = ux[tri]; Y = uy[tri]; Z = cz[tri]
            N = nrm[tri] if nrm is not None else None
            x0 = np.floor(X.min(1)).astype(int); x1 = np.ceil(X.max(1)).astype(int)
            y0 = np.floor(Y.min(1)).astype(int); y1 = np.ceil(Y.max(1)).astype(int)
            x0 = np.clip(x0, 0, width - 1); x1 = np.clip(x1, 0, width - 1)
            y0 = np.clip(y0, 0, height - 1); y1 = np.clip(y1, 0, height - 1)
            for j in range(len(tri)):
                if x1[j] < x0[j] or y1[j] < y0[j]:
                    continue
                xs = np.arange(x0[j], x1[j] + 1)
                ys = np.arange(y0[j], y1[j] + 1)
                if len(xs) == 0 or len(ys) == 0:
                    continue
                gx, gy = np.meshgrid(xs + .5, ys + .5)
                ax, ay = X[j, 0], Y[j, 0]; bx, by = X[j, 1], Y[j, 1]; cx2, cy2 = X[j, 2], Y[j, 2]
                den = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2)
                if abs(den) < 1e-9:
                    continue
                w0 = ((by - cy2) * (gx - cx2) + (cx2 - bx) * (gy - cy2)) / den
                w1 = ((cy2 - ay) * (gx - cx2) + (ax - cx2) * (gy - cy2)) / den
                w2 = 1 - w0 - w1
                inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
                if not inside.any():
                    continue
                z = w0 * Z[j, 0] + w1 * Z[j, 1] + w2 * Z[j, 2]
                sub = zbuf[np.ix_(ys, xs)]
                keep = inside & (z < sub)
                if not keep.any():
                    continue
                u = w0 * uv[tri[j, 0], 0] + w1 * uv[tri[j, 1], 0] + w2 * uv[tri[j, 2], 0]
                v = w0 * uv[tri[j, 0], 1] + w1 * uv[tri[j, 1], 1] + w2 * uv[tri[j, 2], 1]
                c = sample(t, np.stack([u[keep], v[keep]], 1)) if t.shape[0] > 1 else np.broadcast_to(t[0, 0], (keep.sum(), 3))
                if N is not None:
                    nn = (w0[keep, None] * N[j, 0] + w1[keep, None] * N[j, 1] + w2[keep, None] * N[j, 2])
                    nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-6)
                    facing = nn @ eye
                    nn = np.where(facing[:, None] < 0, -nn, nn)
                    lam = np.clip(nn @ light, 0, 1) * .62 + np.clip(nn @ fill, 0, 1) * .18
                    shade = (.78 + lam * 1.05)[:, None]
                else:
                    shade = np.full((keep.sum(), 1), .8)
                gy_sel = np.broadcast_to(ys[:, None], keep.shape)[keep]
                gx_sel = np.broadcast_to(xs[None, :], keep.shape)[keep]
                colour[gy_sel, gx_sel] = np.clip(c * shade, 0, 1)
                zbuf[gy_sel, gx_sel] = z[keep]
    img = (np.clip(colour, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8)
    if out:
        Image.fromarray(img).save(out)
    return img


if __name__ == '__main__':
    view = sys.argv[1] if len(sys.argv) > 1 else 'front'
    yaw = {'front': 0.0, 'back': np.pi, 'side': np.pi / 2, 'quarter': .6}[view]
    out = WORK = pathlib.Path('/workspace/scratch/chino') / f'preview-{view}.png'
    render(yaw=yaw, out=out)
    print(out)
