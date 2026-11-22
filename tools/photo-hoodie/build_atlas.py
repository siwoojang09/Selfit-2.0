#!/usr/bin/env python3
"""Bake the adidas hoodie's product photographs into the pattern's own UV space.

Each surface is unwrapped by its *arc length*, not its angle: a flat lay is the
cloth pressed flat, so a point's distance across the photograph is the distance
along the garment's surface from the centre seam. Rows are laid at the same
metres-per-pixel as the photograph, calibrated from the garment's own centre
length (62 cm) and from the sleeve seam to the cuff (58 cm).

Outputs, all in `.devtest/photo-hoodie/`:

    body.png     front + back of the torso, hem rib included
    sleeve.png   front + back of one sleeve (the pattern's sleeve is identical
                 on both sides), cuff rib included
    hood.png     the hood seen from behind
    zip.png      the silver two-way zip, tape and teeth
    normal-*.png roughness-*.png   relief derived from each baked image
"""
import json, pathlib
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / '.devtest' / 'photo-hoodie'
WORK.mkdir(parents=True, exist_ok=True)
PHOTOS = pathlib.Path('/workspace/attachments/2026-11-22')
FRONT = PHOTOS / 'IMG_2545-363d9fa92def43b28111830a36344a96.jpg'
BACK = PHOTOS / 'IMG_2546-deb9d8427f7e492ab28319b4e8acfa09.jpg'
ZIP = PHOTOS / 'IMG_2550-429c3a44f123482ab740cf92e71f0d05.jpg'

# Calibration of the two flat lays. Both screenshots frame the garment
# identically, which their silhouettes confirm row for row.
CX = 470.0          # centre front / centre back: the zip line and hood seam
TOP = 797.0         # the neck/shoulder apex the 62 cm centre length starts at
PXPCM = 8.55        # pixels per centimetre

BODY_TOP = 1.506    # apex in the pattern's metres
BODY_LEN = 0.62
SLEEVE_SEAM = -0.074
SLEEVE_END = -0.6034
SLEEVE_PX = (SLEEVE_SEAM - SLEEVE_END) / 1.0 * 0 + 496.0   # seam -> cuff in px

BODY_SIZE = 2048
SLEEVE_SIZE = (1024, 2048)     # u around the sleeve, v down its length
HOOD_SIZE = 1024

# Sleeve axes in the photographs: from the middle of the shoulder seam to the
# middle of the cuff opening.
SLEEVE_AXIS = {
    -1: ((300.0, 822.0), (129.0, 1286.0)),
    1: ((640.0, 822.0), (811.0, 1286.0)),
}
# The hood, as laid on the back of the garment: crown and neck.
HOOD_BOX = (330.0, 700.0, 610.0, 838.0)   # x0, y0, x1, y1


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32)


def clean(rgb):
    """Paint out the shop's white hang tag so the cloth continues under it."""
    lum = rgb @ np.array([.213, .715, .072], np.float32)
    sat = rgb.max(2) - rgb.min(2)
    bright = ((lum > 145) & (sat < 70)).astype(np.uint8)
    bright[:620] = 0
    bright[1500:] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    holes = np.zeros_like(bright)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        # The hang tag is the only compact bright shape at the neck; the three
        # stripes are long bands and the zip a narrow column.
        if 12 <= w <= 70 and 10 <= h <= 130 and area <= 9000 and x + w > 400 and x < 540:
            holes[max(0, y - 3):y + h + 3, max(0, x - 3):x + w + 3] = 1
    if holes.any():
        rgb = cv2.inpaint(rgb.astype(np.uint8), holes, 5, cv2.INPAINT_TELEA).astype(np.float32)
    return rgb


def without_logo(rgb):
    """The chest trefoil belongs to the body, not to the sleeve beside it."""
    out = rgb.copy()
    patch = out[912:958, 516:584]
    mask = np.zeros(out.shape[:2], np.uint8)
    lum = patch @ np.array([.213, .715, .072], np.float32)
    mask[912:958, 516:584] = (lum > 70).astype(np.uint8)
    return cv2.inpaint(out.astype(np.uint8), mask, 6, cv2.INPAINT_TELEA).astype(np.float32)


def without_stripes(rgb):
    """The front lay again, with the three cream sleeve stripes taken out.

    The body's side seams are hidden under the sleeves in a flat lay, so the
    torso unwrap has to read those columns from the sleeve. Left in, the cream
    bands would be painted down the sides of the body as bright wedges.
    """
    lum = rgb @ np.array([.213, .715, .072], np.float32)
    sat = rgb.max(2) - rgb.min(2)
    bright = ((lum > 105) & (sat < 70)).astype(np.uint8)
    bright[:620] = 0
    bright[1500:] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    mask = np.zeros_like(bright)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        # The stripes are long, thin, diagonal bands; the trefoil is compact.
        if area > 500 and 45 < h < 700 and 12 < w < 320:
            mask[max(0, y - 4):y + h + 4, max(0, x - 4):x + w + 4] = 1
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))
    out = cv2.inpaint(rgb.astype(np.uint8), mask, 8, cv2.INPAINT_TELEA).astype(np.float32)
    # Inpainting a band this wide pulls from the light backdrop above the
    # shoulder, which would paint a pale patch onto the body's shoulder. Those
    # columns are under the sleeve in the photograph, so flat cloth is honest.
    cloth = rgb[lum < 60]
    fill = np.median(cloth, axis=0) if len(cloth) else np.array([26, 24, 27], np.float32)
    out[mask > 0] = fill
    return out


def cloth_mask(img):
    """Where cloth is: the dark fabric plus the cream stripes that cross it."""
    lum = img @ np.array([.213, .715, .072], np.float32)
    sat = img.max(2) - img.min(2)
    mask = lum < 170
    bright = ((lum > 105) & (sat < 70)).astype(np.uint8)
    bright[:620] = 0
    bright[1500:] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area > 500 and 45 < h < 700 and 12 < w < 320:
            mask[lab == i] = True
    return cv2.dilate(mask.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0


def silhouette(img):
    """Left and right edge of the garment on every row, from the dark cloth."""
    lum = img @ np.array([.213, .715, .072], np.float32)
    dark = (lum < 170) & (np.arange(lum.shape[1])[None, :] >= 0)
    left = np.full(lum.shape[0], np.nan, np.float32)
    right = np.full(lum.shape[0], np.nan, np.float32)
    for y in range(lum.shape[0]):
        xs = np.where(dark[y])[0]
        if len(xs) < 6:
            continue
        left[y] = xs.min(); right[y] = xs.max()
    idx = np.arange(len(left)); good = np.isfinite(left)
    left[~good] = np.interp(idx[~good], idx[good], left[good])
    right[~good] = np.interp(idx[~good], idx[good], right[good])
    return left, right


def _backdrop(img, x, y, dx, dy, limit):
    """Distance along (dx, dy) until the photograph's light backdrop begins."""
    lum = img @ np.array([.213, .715, .072], np.float32)
    h, w = lum.shape
    step = 2.0
    d = 0.0
    while d < limit:
        xi = int(round(x + dx * d)); yi = int(round(y + dy * d))
        if xi < 0 or yi < 0 or xi >= w or yi >= h:
            return d
        if lum[yi, xi] > 150:
            return d
        d += step
    return limit


def bilinear(img, xs, ys):
    h, w, _ = img.shape
    xs = np.clip(xs, 0, w - 1.001)
    ys = np.clip(ys, 0, h - 1.001)
    x0 = np.floor(xs).astype(np.int32); y0 = np.floor(ys).astype(np.int32)
    fx = (xs - x0)[..., None]; fy = (ys - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


pieces = np.load(WORK / 'pieces.npz')
meta = [json.loads(s) for s in pieces['meta']]


def piece(name, frame='torso', nth=0):
    seen = 0
    for i, m in enumerate(meta):
        if m['name'] == name and m['frame'] == frame:
            if seen == nth:
                return pieces[f'p{i}_pos'].reshape(-1, 3)
            seen += 1
    raise KeyError(name)


def grid(pos):
    n = len(pos)
    for cols in range(30, 100):
        if n % (cols + 1) == 0:
            return n // (cols + 1) - 1, cols
    raise ValueError(n)


def ring_perimeter(ring):
    return float(np.linalg.norm(np.diff(ring, axis=0), axis=1).sum() + np.linalg.norm(ring[0] - ring[-1]))


def perimeters(name, rows, frame='torso', nth=0, cols=64):
    """Perimeter of the section at each of `rows` evenly spaced heights."""
    pos = piece(name, frame, nth)
    panel_rows = len(pos) // (cols + 1) - 1
    rings = pos.reshape(panel_rows + 1, cols + 1, 3)
    out = []
    for r in range(rows):
        t = r / (rows - 1) * panel_rows
        i = min(panel_rows - 1, int(t)); f = t - i
        ring = rings[i] * (1 - f) + rings[i + 1] * f
        ring[-1] = ring[0]
        out.append(ring_perimeter(ring))
    return np.array(out)


def normal_from(img, strength=1.0):
    """Relief from the knit and the seams, read only as a gentle tilt."""
    lum = img @ np.array([.213, .715, .072], np.float32)
    fine = lum - cv2.GaussianBlur(lum, (0, 0), 4.0)
    fine = cv2.GaussianBlur(fine, (0, 0), .7)
    gy, gx = np.gradient(fine)
    grad = np.maximum(np.hypot(gx, gy), 1e-6)
    scale = .32 * strength / max(float(np.percentile(grad, 90)), 1e-6)
    nx = np.clip(-gx * scale, -1, 1)
    ny = np.clip(gy * scale, -1, 1)
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / ln, ny / ln, nz / ln])


def roughness_from(img):
    lum = img @ np.array([.213, .715, .072], np.float32)
    base = cv2.GaussianBlur(lum, (0, 0), 18)
    fine = lum - base
    r = .90 - .05 * (fine / 20.0) - .02 * (base - 40) / 60.0
    return np.clip(r, .72, .99)


def body_edge(img):
    """How far the torso itself reaches from the centre, row by row.

    The sleeves hang over the body's sides in a flat lay, with backdrop showing
    in between, so the last cloth pixel before that backdrop is the furthest the
    photograph can tell us about the body. A wide median keeps bright details
    (the chest trefoil) from being mistaken for the edge.
    """
    lum = img @ np.array([.213, .715, .072], np.float32)
    bright = lum > 150
    h, w = bright.shape
    edge = np.zeros(h, np.float32)
    cx = int(round(CX))
    inner = 70          # the zip line itself is bright; start past it
    for y in range(h):
        row = bright[y]
        x = cx + inner
        while x < w - 1 and not row[x]:
            x += 1
        right = x - cx
        x = cx - inner
        while x > 0 and not row[x]:
            x -= 1
        left = cx - x
        edge[y] = max(0, min(left, right) - 10)
    pad = 30
    padded = np.pad(edge, pad, mode='edge')
    out = np.array([np.median(padded[i:i + 2 * pad + 1]) for i in range(h)])
    return out


def bake_body(front, back, front_edge, back_edge):
    us = (np.arange(BODY_SIZE) + .5) / BODY_SIZE
    vs = np.arange(BODY_SIZE) / (BODY_SIZE - 1)
    ys = TOP + vs * BODY_LEN * 100 * PXPCM
    dist_front = np.where(us < .25, us, -(1.0 - us)) * 4.0
    dist_back = np.where(us < .5, .5 - us, us - .5) * 4.0
    front_side = (us < .25) | (us >= .75)
    rows = np.arange(len(front_edge))
    out = np.zeros((BODY_SIZE, BODY_SIZE, 3), np.float32)
    for r in range(BODY_SIZE):
        y = np.full(BODY_SIZE, ys[r], np.float32)
        half = np.interp(ys[r], rows, front_edge)
        xf = CX + dist_front * half
        half_b = np.interp(ys[r], rows, back_edge)
        xb = CX + dist_back * half_b
        out[r, front_side] = bilinear(front, xf[front_side], y[front_side])
        out[r, ~front_side] = bilinear(back, xb[~front_side], y[~front_side])
    # Feather the side seams where the two photographs meet.
    soft = 24
    w = np.sin(np.linspace(0, np.pi / 2, soft))[:, None] ** 2
    for boundary in (int(.25 * BODY_SIZE), int(.75 * BODY_SIZE)):
        a = out[:, boundary - soft:boundary][:, ::-1]
        b = out[:, boundary:boundary + soft]
        blend = a * (1 - w) + b * w
        out[:, boundary - soft:boundary] = blend[:, ::-1]
        out[:, boundary:boundary + soft] = blend
    return out


def bake_sleeve(front, back):
    """One sleeve, unwrapped as the flat lay shows it.

    u = 0 is the outer edge of the sleeve, u = 0.5 the inner edge (under the
    arm), u = 1 the outer edge again. The two photographs each give one half.
    The strip is anchored on the sleeve's silhouette, so the cream stripes stay
    at the same fraction of the sleeve's width as on the garment itself.
    """
    w, h = SLEEVE_SIZE
    per = perimeters('Sleeve', h, 'arm0', 0, 34)
    # The first rows are the cap that folds over the shoulder; their section is
    # a small ring at the neck, which would collapse the strip and smear the
    # stripes over the whole shoulder. Hold the cap at the sleeve's own width.
    cap = int(.08 * h)
    per[:cap] = per[cap]
    us = (np.arange(w) + .5) / w
    vs = np.arange(h) / (h - 1)
    out = np.zeros((h, w, 3), np.float32)
    front_sel = us < .5
    across_front = us * 2.0
    across_back = 1.0 - (us - .5) * 2.0
    left_edge, right_edge = silhouette(front)
    mask = cloth_mask(front)
    cloth_px = front[mask]
    fill = np.median(cloth_px, axis=0)
    for arm in (-1, 1):
        (sx, sy), (ex, ey) = SLEEVE_AXIS[arm]
        length = np.hypot(ex - sx, ey - sy)
        dx, dy = (ex - sx) / length, (ey - sy) / length
        # Across the sleeve, pointing from the outer edge towards the body.
        px, py = (dy, -dx) if arm < 0 else (-dy, dx)
        for r in range(h):
            along = vs[r] * length
            half = per[r] / 4 * 100 * PXPCM
            ax, ay = sx + dx * along, sy + dy * along
            row = int(np.clip(round(ay), 0, len(left_edge) - 1))
            edge = left_edge[row] if arm < 0 else right_edge[row]
            ox = edge + (4.0 if arm < 0 else -4.0)
            oy = ay
            width = min(2 * half, 170.0)
            for sel, img, across in ((front_sel, front, across_front),
                                     (~front_sel, back, across_back)):
                if not sel.any():
                    continue
                off = across[sel] * width
                xs = ox + px * off
                ys = oy + py * off
                # Where the sample runs off the cloth (the backdrop between the
                # sleeve and the body), the garment itself has nothing to show:
                # that part of the sleeve is folded under the arm in the photo.
                # It is filled with the cloth's own tone instead of the backdrop.
                xi = np.clip(xs.astype(np.int32), 0, mask.shape[1] - 1)
                yi = np.clip(ys.astype(np.int32), 0, mask.shape[0] - 1)
                ok = mask[yi, xi]
                sampled = bilinear(img, xs, ys)
                sampled[~ok] = fill
                out[r, sel] = sampled
    return out


def bake_hood(back):
    h = HOOD_SIZE
    x0, y0, x1, y1 = HOOD_BOX
    us = (np.arange(h) + .5) / h
    vs = np.arange(h) / (h - 1)
    xs = x0 + us * (x1 - x0)
    out = np.zeros((h, h, 3), np.float32)
    for r in range(h):
        y = np.full(h, y0 + vs[r] * (y1 - y0), np.float32)
        out[r] = bilinear(back, xs, y)
    return out


def bake_zip():
    img = np.asarray(Image.open(ZIP).convert('RGB')).astype(np.float32)
    # A clean stretch of tape and teeth, below the two sliders.
    strip = img[1300:1580, 448:492]
    w, h = 64, 512
    return cv2.resize(strip, (w, h), interpolation=cv2.INTER_AREA)


def main():
    front = clean(load(FRONT))
    back = clean(load(BACK))
    plain = without_stripes(front)
    Image.fromarray(front.astype(np.uint8)).save(WORK / 'front-clean.png')
    Image.fromarray(back.astype(np.uint8)).save(WORK / 'back-clean.png')
    Image.fromarray(plain.astype(np.uint8)).save(WORK / 'front-plain.png')

    jobs = {
        'body': bake_body(plain, back, body_edge(plain), body_edge(back)),
        'sleeve': bake_sleeve(without_logo(front), back),
        'hood': bake_hood(back),
        'zip': bake_zip(),
    }
    for name, img in jobs.items():
        Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(WORK / f'{name}.png')
        nrm = normal_from(img)
        Image.fromarray(((nrm * .5 + .5) * 255).astype(np.uint8)).save(WORK / f'normal-{name}.png')
        rough = roughness_from(img)
        Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(WORK / f'rough-{name}.png')
        print(name, img.shape, 'mean', img.reshape(-1, 3).mean(0).round(1))


if __name__ == '__main__':
    main()
