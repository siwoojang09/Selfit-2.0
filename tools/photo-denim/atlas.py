#!/usr/bin/env python3
"""Bake the two flat-lay photos into a cylindrical denim atlas per leg.

Layout of one atlas (u across, v down):
  0.00-0.25  front, centre front -> outer seam
  0.25-0.50  back,  outer seam  -> centre back
  0.50-0.75  back,  centre back -> inner seam
  0.75-1.00  front, inner seam  -> centre front
which is exactly the angle the cloth generator writes as u = angle / 2pi.

Above the crotch the row still belongs to the seat, so the strip spans the whole
front/back panel; below it the same strip spans only that leg's visible half.
The two are blended by the pattern's own fork value, so the wash flows instead
of stepping.
"""
import json, pathlib
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / '.devtest' / 'photo-denim'
SIZE = 2048           # atlas edge
STRIP = SIZE // 4     # one 90 degree strip
HEIGHT = SIZE

photos = {tag: np.asarray(Image.open(OUT / f'{tag}-cut.png').convert('RGB')).astype(np.float32)
          for tag in ('front', 'back')}
edges = {tag: np.load(OUT / f'{tag}-edges.npz') for tag in ('front', 'back')}
guide = np.load(OUT / 'pieces.npz')['guide']          # [v, f, xc, xb, xi, xo]
land = json.loads(np.load(OUT / 'pieces.npz')['landmarks'][0])

def inpaint(tag, radius=6):
    rgb, mask = photos[tag], edges[tag]['mask']
    holes = (cv2.dilate(mask, np.ones((3, 3), np.uint8)) == 0).astype(np.uint8)
    out = cv2.inpaint(rgb.astype(np.uint8), holes, radius, cv2.INPAINT_TELEA)
    return out.astype(np.float32), holes

filled = {}
for tag in photos:
    filled[tag], _ = inpaint(tag)

def sample(img, xs, ys):
    """Bilinear sample rows: xs, ys are float arrays of the same length."""
    h, w, _ = img.shape
    xs = np.clip(xs, 0, w - 1.001)
    ys = np.clip(ys, 0, h - 1.001)
    x0 = np.floor(xs).astype(np.int32); y0 = np.floor(ys).astype(np.int32)
    fx = (xs - x0)[..., None]; fy = (ys - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def row_guides(tag):
    e = edges[tag]
    top, hem, crotch = float(e['top']), float(e['hem']), float(e['crotch'])
    L, R = e['left'], e['right']
    GL, GR = e['gap_left'], e['gap_right']
    ys = np.arange(photos[tag].shape[0], dtype=np.float64)
    # Above the split the inner line stays where the legs fold together.
    gl = np.where(ys < crotch, GL[int(crotch)] if crotch < len(GL) else (L + R).mean() / 2, GL)
    gr = np.where(ys < crotch, GR[int(crotch)] if crotch < len(GR) else (L + R).mean() / 2, GR)
    # Inside the silhouette a couple of pixels, so no backdrop haze is baked in.
    inset = 15.0
    Ll = L + inset; Rr = R - inset
    return dict(top=top, hem=hem, crotch=crotch, left=Ll, right=Rr,
                gl=gl - inset, gr=gr + inset, mid=(L + R) / 2)

G = {tag: row_guides(tag) for tag in ('front', 'back')}

def build_atlas(side):
    """Four strips: front outer, back outer, back inner, front inner."""
    out = np.zeros((HEIGHT, SIZE, 3), np.float32)
    vrow = np.linspace(0, 1, HEIGHT)
    f = np.interp(vrow, guide[:, 0], guide[:, 1])
    us = (np.arange(SIZE) + .5) / SIZE
    for tag in ('front', 'back'):
        e = G[tag]
        py = e['top'] + 8 + vrow * (e['hem'] - e['top'] - 16)
        rows = np.arange(len(e['left']))
        L = np.interp(py, rows, e['left']); R = np.interp(py, rows, e['right'])
        gl = np.interp(py, rows, e['gl']); gr = np.interp(py, rows, e['gr'])
        mid = (L + R) / 2
        if side > 0:
            edge, other, crotch = R, L, gr
        else:
            edge, other, crotch = L, R, gl
        centre_leg = (edge + crotch) / 2
        C = mid * (1 - f) + centre_leg * f
        I = other * (1 - f) + crotch * f
        E = edge
        for k, (u0, a, b) in enumerate(((0.0, C, E), (0.25, E, C), (0.5, C, I), (0.75, I, C))):
            if (tag == 'front') != (k in (0, 3)):
                continue
            lo = int(k * STRIP); hi = lo + STRIP
            t = (us[lo:hi] - u0) / .25
            xs = a[:, None] * (1 - t)[None, :] + b[:, None] * t[None, :]
            ys = np.repeat(py[:, None], xs.shape[1], axis=1)
            out[:, lo:hi] = sample(filled[tag], xs, ys)
    # feather the two side seams between front and back strips
    soft = 28
    r = np.linspace(0, np.pi / 2, soft)[:, None]
    w = (np.sin(r) ** 2)
    for boundary in (STRIP, 3 * STRIP):
        a = out[:, boundary - soft:boundary][:, ::-1]
        b = out[:, boundary:boundary + soft]
        blend = a * (1 - w) + b * w
        out[:, boundary - soft:boundary] = blend[:, ::-1]
        out[:, boundary:boundary + soft] = blend
    return out


def normal_from(img, strength=1.6):
    lum = img @ np.array([.213, .715, .072], np.float32)
    fine = lum - cv2.GaussianBlur(lum, (0, 0), 5.0)
    fine = cv2.GaussianBlur(fine, (0, 0), .7) * 2.2
    gy, gx = np.gradient(fine)
    scale = 5.0 * strength
    nz = np.ones_like(lum)
    nx, ny = -gx * scale, gy * scale
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / ln, ny / ln, nz / ln])


def roughness_from(img):
    lum = img @ np.array([.213, .715, .072], np.float32)
    base = cv2.GaussianBlur(lum, (0, 0), 24)
    fine = lum - base
    r = .88 - .045 * (fine / 24.0) - .02 * (base - 90) / 90.0
    return np.clip(r, .68, .99)


if __name__ == '__main__':
    for side in (-1, 1):
        col = build_atlas(side)
        tag = 'right' if side < 0 else 'left'
        Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(OUT / f'atlas-{tag}.png')
        nrm = normal_from(col)
        Image.fromarray(((nrm * .5 + .5) * 255).astype(np.uint8)).save(OUT / f'normal-{tag}.png')
        rough = roughness_from(col)
        Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(OUT / f'rough-{tag}.png')
        print(tag, 'atlas mean', col.reshape(-1, 3).mean(0).round(1), 'normal mean', nrm.reshape(-1, 3).mean(0).round(2))
