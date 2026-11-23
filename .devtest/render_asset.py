#!/usr/bin/env python3
"""Render a baked GLB with numpy: base colour + normal map + a key light.

Fast enough to iterate on shape and cloth at full-body size and in close-up.
Pieces can be filtered by name, and the camera framed on a box so a hood or a
collar can be judged on its own.
"""
import io, json, struct, sys, pathlib, os, math
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_glb(path):
    raw = pathlib.Path(path).read_bytes()
    magic, version, length = struct.unpack('<III', raw[:12])
    off, js, bin_ = 12, None, None
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
    base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    n = acc['count']
    comp = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: '<u1'}[acc['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    arr = np.frombuffer(bin_, dtype=comp, count=n * width, offset=base)
    return arr.reshape(n, width) if width > 1 else arr


def image(g, bin_, idx):
    im = g['images'][idx]
    view = g['bufferViews'][im['bufferView']]
    payload = bin_[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    return np.asarray(Image.open(io.BytesIO(payload)).convert('RGB')).astype(np.float32) / 255.0


def bilinear(tex, u, v, wrap=True):
    h, w, _ = tex.shape
    if wrap:
        u = u - np.floor(u)
        v = v - np.floor(v)
    x = np.clip(u, 0, 1) * (w - 1)
    y = np.clip(v, 0, 1) * (h - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    a, b = tex[y0, x0], tex[y0, x1]
    c, d = tex[y1, x0], tex[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def mip(tex, scale):
    """A crude mip: box-downsample until one texel is below a screen pixel."""
    step = max(1, int(round(scale)))
    if step == 1:
        return tex
    h, w, _ = tex.shape
    while step > 1 and min(w, h) > 4:
        tex = tex[:h // 2 * 2, :w // 2 * 2].reshape(h // 2, 2, w // 2, 2, 3).mean((1, 3))
        h, w = tex.shape[:2]
        step //= 2
    return tex


def render(path, out, name_filter=None, yaw=0.0, pitch=0.06, fov=14.0,
           width=760, height=1000, focus=None, frame_h=None, zoom=1.0,
           bg=(0.86, 0.85, 0.83), light=(-0.42, 0.66, 0.62), ambient=.52,
           collect=False):
    g, bin_ = load_glb(path)
    prims = []
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            prims.append((mesh.get('name', ''), p))
    if name_filter:
        prims = [(n, p) for n, p in prims if any(f.lower() in n.lower() for f in name_filter)]
    if not prims:
        raise SystemExit('no primitives matched')

    mats, texs = {}, {}
    for mi, m in enumerate(g['materials']):
        pbr = m.get('pbrMetallicRoughness', {})
        col = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3], np.float32)
        ct = pbr.get('baseColorTexture')
        nt = m.get('normalTexture')
        texs[mi], texs[('n', mi)] = None, None
        if ct is not None:
            texs[mi] = image(g, bin_, g['textures'][ct['index']]['source'])
        if nt is not None:
            texs[('n', mi)] = image(g, bin_, g['textures'][nt['index']]['source'])
        mats[mi] = (col, cats := (ct is not None), nt is not None,
                    float(nt.get('scale', 1.0)) if nt else 1.0)

    pos_all, tri_all = [], []
    for name, p in prims:
        pos = accessor(g, bin_, p['attributes']['POSITION'])
        idx = accessor(g, bin_, p['indices']).reshape(-1, 3)
        pos_all.append(pos); tri_all.append(idx)
    allpos = np.concatenate(pos_all)
    lo, hi = allpos.min(0), allpos.max(0)
    centre = np.array(focus, np.float32) if focus is not None else (lo + hi) / 2
    span = frame_h if frame_h else float(hi[1] - lo[1])
    right = np.array([np.cos(yaw), 0, -np.sin(yaw)])
    up = np.array([0, 1, 0])
    eye = -np.array([np.sin(yaw) * math.cos(pitch), -math.sin(pitch), np.cos(yaw) * math.cos(pitch)])
    eye /= np.linalg.norm(eye)
    right = np.cross(eye, up); right /= np.linalg.norm(right)
    up = np.cross(right, eye)
    # Orthographic: the frame's height covers `span` metres of the world.
    ppm = height / span * zoom
    zbuf = np.full((height, width), 1e9, np.float32)
    colour = np.ones((height, width, 3), np.float32) * np.array(bg, np.float32)
    L = np.array(light, np.float32); L /= np.linalg.norm(L)
    Lfill = np.array([0.5, 0.18, 0.4], np.float32); Lfill /= np.linalg.norm(Lfill)

    for name, p in prims:
        pos = accessor(g, bin_, p['attributes']['POSITION'])
        uv = accessor(g, bin_, p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else np.zeros((len(pos), 2), np.float32)
        nrm = accessor(g, bin_, p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else None
        idx = accessor(g, bin_, p['indices']).reshape(-1, 3)
        mi = p['material']
        col_factor, has_col, has_nrm, nscale = mats[mi]
        ctex = texs[mi]
        ntex = texs[('n', mi)]
        rel = pos - centre
        cx = rel @ right; cy = rel @ up; cz = rel @ eye
        ux = cx * ppm + width / 2
        uy = height / 2 - cy * ppm
        # triangle tangents from UVs, in world space
        P = pos[idx]; U = uv[idx]
        e1 = P[:, 1] - P[:, 0]; e2 = P[:, 2] - P[:, 0]
        d1 = U[:, 1] - U[:, 0]; d2 = U[:, 2] - U[:, 0]
        den = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
        den = np.where(np.abs(den) < 1e-12, 1e-12, den)
        T = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / den[:, None]
        B = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / den[:, None]
        if nrm is not None:
            Nface = nrm[idx].mean(1)
            Nface /= np.maximum(np.linalg.norm(Nface, axis=1, keepdims=True), 1e-9)
        for k in range(0, len(idx), 6000):
            tri = idx[k:k + 6000]
            X = ux[tri]; Y = uy[tri]; Z = cz[tri]
            x0 = np.clip(np.floor(X.min(1)).astype(int), 0, width - 1)
            x1 = np.clip(np.ceil(X.max(1)).astype(int), 0, width - 1)
            y0 = np.clip(np.floor(Y.min(1)).astype(int), 0, height - 1)
            y1 = np.clip(np.ceil(Y.max(1)).astype(int), 0, height - 1)
            for j in range(len(tri)):
                if x1[j] <= x0[j] or y1[j] <= y0[j]:
                    continue
                xs = np.arange(x0[j], x1[j] + 1)
                ys = np.arange(y0[j], y1[j] + 1)
                gx, gy = np.meshgrid(xs + .5, ys + .5)
                ax, ay = X[j, 0], Y[j, 0]; bx, by = X[j, 1], Y[j, 1]; cx2, cy2 = X[j, 2], Y[j, 2]
                d = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2)
                if abs(d) < 1e-9:
                    continue
                w0 = ((by - cy2) * (gx - cx2) + (cx2 - bx) * (gy - cy2)) / d
                w1 = ((cy2 - ay) * (gx - cx2) + (ax - cx2) * (gy - cy2)) / d
                w2 = 1 - w0 - w1
                inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
                if not inside.any():
                    continue
                z = w0 * Z[j, 0] + w1 * Z[j, 1] + w2 * Z[j, 2]
                sub = zbuf[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]
                keep = inside & (z < sub)
                if not keep.any():
                    continue
                gxx = np.broadcast_to(gx, keep.shape)[keep]
                gyy = np.broadcast_to(gy, keep.shape)[keep]
                u = w0 * uv[tri[j, 0], 0] + w1 * uv[tri[j, 1], 0] + w2 * uv[tri[j, 2], 0]
                v = w0 * uv[tri[j, 0], 1] + w1 * uv[tri[j, 1], 1] + w2 * uv[tri[j, 2], 1]
                if ctex is not None:
                    du = np.hypot(u[keep].max() - u[keep].min(), v[keep].max() - v[keep].min()) if keep.sum() > 1 else 0
                    c = bilinear(ctex, u[keep], v[keep])
                else:
                    c = np.broadcast_to(col_factor, (keep.sum(), 3))
                if nrm is not None:
                    nn = (w0[keep, None] * nrm[tri[j, 0]] + w1[keep, None] * nrm[tri[j, 1]] + w2[keep, None] * nrm[tri[j, 2]])
                    nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
                    if ntex is not None:
                        nt = bilinear(ntex, u[keep], v[keep]) * 2 - 1
                        Tj = T[k + j]; Bj = B[k + j]
                        Tj = Tj - nn * np.sum(Tj * nn, axis=1, keepdims=True)
                        Tj /= np.maximum(np.linalg.norm(Tj, axis=1, keepdims=True), 1e-9)
                        Bj = np.cross(nn, Tj)
                        pert = (nt[:, 0:1] * Tj + nt[:, 1:2] * Bj) * nscale + nt[:, 2:3] * nn
                        nn = pert / np.maximum(np.linalg.norm(pert, axis=1, keepdims=True), 1e-9)
                    facing = np.sum(nn * eye, 1)
                    nn = np.where(facing[:, None] < 0, -nn, nn)
                    lam = np.clip(nn @ L, 0, 1) * .85 + np.clip(nn @ Lfill, 0, 1) * .18
                    shade = (ambient + lam)[:, None]
                else:
                    shade = np.full((keep.sum(), 1), .8)
                colour[gyy.astype(int), gxx.astype(int)] = np.clip(c * shade, 0, 1)
                zbuf[gyy.astype(int), gxx.astype(int)] = z[keep]

    img = np.clip(colour, 0, 1) ** (1 / 1.25)
    arr = (img * 255).clip(0, 255).astype(np.uint8)
    Image.fromarray(arr).save(out)
    print(out)
    if collect:
        return arr
    return None


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('asset', nargs='?', default='assets/underoff-university-hoodie.glb')
    ap.add_argument('--out', default='/workspace/scratch/asset.png')
    ap.add_argument('--name', nargs='*', default=None)
    ap.add_argument('--yaw', type=float, default=0.0)
    ap.add_argument('--pitch', type=float, default=0.06)
    ap.add_argument('--fov', type=float, default=14.0)
    ap.add_argument('--width', type=int, default=760)
    ap.add_argument('--height', type=int, default=1000)
    ap.add_argument('--frame-h', type=float, default=None)
    ap.add_argument('--focus', type=float, nargs=3, default=None)
    ap.add_argument('--zoom', type=float, default=1.0)
    a = ap.parse_args()
    p = pathlib.Path(a.asset)
    if not p.is_absolute():
        p = ROOT / p
    render(p, a.out, name_filter=a.name, yaw=a.yaw, pitch=a.pitch, fov=a.fov,
           width=a.width, height=a.height, focus=a.focus, frame_h=a.frame_h, zoom=a.zoom)
