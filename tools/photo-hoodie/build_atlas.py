#!/usr/bin/env python3
"""Bake the adidas hoodie's product photographs into the pattern's own UV space.

Each surface is unwrapped by its *arc length*, not its angle: a flat lay is the
cloth pressed flat, so a point's distance across the photograph is the distance
along the garment's surface from the centre seam. Rows are laid at the same
metres-per-pixel as the photograph, calibrated from the garment's own centre
length (62 cm) and from the sleeve seam to the cuff (58 cm).

The photographs are studio-lit, so the same black cotton is several shades
lighter across the chest than at the hem and carries a broad sheen down the
upper body. Baked in as-is and multiplied by the scene's own lights, that
product-light gradient reads as a grey two-tone on a garment that is one flat
black. `flatten` divides out the low-frequency illumination of the cloth — the
knit, the seams and the stitches are high frequency and stay — so every panel
bakes to one albedo. That is what the cloth is: the shading belongs to the
three.js light, not to the texture.

The cream sleeve stripes are not read from the photograph row by row. A flat
lay's sleeve is angled, its silhouette wanders between the stripes and the
backdrop, and sampling it row by row pinches and ripples the three bands. Their
geometry is constant instead — parallel tapes a fixed distance from the outer
fold — so they are painted at arc positions taken from the pattern's own
circumference, which is also what the UVs are measured in.

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

# The sleeve band in the photographs, row by row: the shoulder seam and the
# cuff opening sit on the same rows in both flat lays.
SLEEVE_ROWS = (822.0, 1286.0)

BODY_SIZE = 2048
SLEEVE_SIZE = (1024, 2048)     # u around the sleeve, v down its length
HOOD_SIZE = 1024
HOOD_BOX = (330.0, 700.0, 610.0, 838.0)   # x0, y0, x1, y1

# The three cream tapes, from the closeup and the flat lay: each is 0.95 cm
# wide, the first sits 1.3 cm in from the outer fold, and the pitch is 1.9 cm.
STRIPES = tuple(1.3 + 1.9 * i for i in range(3))
STRIPE_W = 0.95
STRIPE_STOP = .90      # the tape ends where the ribbed cuff is sewn on
LUM = np.array([.213, .715, .072], np.float32)


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32)


def luma(img):
    return img @ LUM


def blur(img, sigma):
    return cv2.GaussianBlur(img, (0, 0), sigma)


def backdrop(img):
    """The shop's light backdrop, as the pixels of light grey that lie outside
    the row's dark cloth. It is the same tone as the cream tapes, so it has to
    be told apart by where it is, not only by how bright it is."""
    l = luma(img)
    light = l > 190
    cloth = l < 190
    inside = np.zeros_like(light)
    rows = np.arange(l.shape[0])
    for y in range(l.shape[0]):
        xs = np.where(cloth[y])[0]
        xs = xs[(xs > 30) & (xs < l.shape[1] - 30)]
        if len(xs) < 6:
            continue
        inside[y, xs.min():xs.max() + 1] = True
    inside = cv2.morphologyEx(inside.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)) > 0
    return light & ~inside


def cloth_tone(img, region=None):
    """The albedo of the garment's black cotton: the median of its dark pixels."""
    l = luma(img)
    mask = (l > 6) & (l < 55)
    if region is not None:
        mask &= region
    pixels = img[mask]
    if not len(pixels):
        return np.array([22, 21, 26], np.float32)
    return np.median(pixels, axis=0).astype(np.float32)


def flatten(img, sigma=64.0, low=0.72, high=1.55):
    """Divide out the studio's illumination, keeping the cloth's own detail.

    The field is a normalised blur of the luminance over the dark cloth only, so
    bright features (the cream tapes, the zipper, the trefoil) do not pull it.
    Everything is then scaled by `tone/field`, which leaves knit, seams and
    stitching untouched but makes the panel one flat albedo.
    """
    l = luma(img)
    cloth = (l < 60).astype(np.float32)
    den = blur(cloth, sigma)
    if float(den.max()) < .2:
        return img.copy()
    field = blur(l * cloth, sigma) / np.maximum(den, 1e-4)
    tone = float(np.median(field[cloth > .5])) if cloth.any() else float(l.mean())
    gain = np.clip(tone / np.maximum(field, 1e-3), low, high)
    return np.clip(img * gain[..., None], 0, 255)


def clean_tag(img, tone):
    """Paint out the shop's white hang tag at the neck with the cloth's tone.

    The tag sits over the front neck opening, where the hood and the collar
    cover the cloth in wear. Filling it with the garment's own black leaves no
    white speck to bleed through the collar rings.
    """
    out = img.copy()
    l = luma(out)
    sat = out.max(2) - out.min(2)
    bright = ((l > 120) & (sat < 60)).astype(np.uint8)
    bright[backdrop(out)] = 0
    zone = np.zeros_like(bright)
    zone[600:900, int(CX) - 90:int(CX) + 90] = 1
    bright &= zone
    if not bright.any():
        return out
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    holes = np.zeros_like(bright)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 40:
            continue
        holes[max(0, y - 3):y + h + 3, max(0, x - 3):x + w + 3] = 1
    holes = cv2.dilate(holes, np.ones((5, 5), np.uint8))
    out[holes > 0] = tone
    return out


def stripe_mask_like(img):
    """The cream sleeve tapes, as one mask."""
    l = luma(img)
    sat = img.max(2) - img.min(2)
    bright = ((l > 100) & (l < 225) & (sat < 75)).astype(np.uint8)
    bright[backdrop(img)] = 0
    bright[:620] = 0
    bright[1500:] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bright, 8)
    mask = np.zeros_like(bright)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 400 or not (40 < h < 720) or not (10 < w < 340):
            continue
        if float(luma(img)[lab == i].mean()) > 221:
            continue    # a piece of the backdrop trapped between sleeve and body
        # Long thin diagonal bands are the tapes; a compact blob is the trefoil
        # or the tag, which the body has its own treatment for.
        mask[lab == i] = 1
    return cv2.dilate(mask, np.ones((5, 5), np.uint8)) > 0


def without_stripes(img, tone):
    """The lay with the sleeve tapes taken out: the cloth under them is black.

    The tape sits on the sleeve's outer fold, so an inpaint along the band picks
    up the light backdrop at its tip; anything brighter than the cloth after the
    fill is set back to the garment's own tone.
    """
    mask = stripe_mask_like(img).astype(np.uint8)
    if not mask.any():
        return img.copy()
    out = cv2.inpaint(img.astype(np.uint8), mask, 5, cv2.INPAINT_TELEA).astype(np.float32)
    out[luma(out) > luma(tone) * 1.8] = tone
    return cv2.GaussianBlur(out, (3, 3), 0)


def without_zip(img, tone):
    """The centre front's zipper is its own piece: the body is cloth there."""
    out = img.copy()
    l = luma(out)
    band = np.zeros(l.shape, bool)
    band[620:1560, int(CX) - 10:int(CX) + 11] = True
    sel = band & (l > 45)
    out[sel] = tone
    return out


def cloth_mask(img):
    l = luma(img)
    sat = img.max(2) - img.min(2)
    mask = (l < 165) | ((l > 100) & (l <= 165) & (sat > 12))
    mask[:600] = False
    mask[1560:] = False
    return mask


def silhouette(img):
    """Left and right edge of the garment on every row, cream tapes included."""
    l = luma(img)
    cloth = l < 220
    left = np.full(l.shape[0], np.nan, np.float32)
    right = np.full(l.shape[0], np.nan, np.float32)
    for y in range(l.shape[0]):
        xs = np.where(cloth[y])[0]
        xs = xs[(xs > 30) & (xs < l.shape[1] - 30)]
        if len(xs) < 6:
            continue
        left[y] = xs.min(); right[y] = xs.max()
    idx = np.arange(len(left)); good = np.isfinite(left)
    left[~good] = np.interp(idx[~good], idx[good], left[good])
    right[~good] = np.interp(idx[~good], idx[good], right[good])
    return left, right


def bilinear(img, xs, ys):
    h, w, _ = img.shape
    xs = np.clip(xs, 0, w - 1.001)
    ys = np.clip(ys, 0, h - 1.001)
    x0 = np.floor(xs).astype(np.int32); y0 = np.floor(ys).astype(np.int32)
    fx = (xs - x0)[..., None]; fy = (ys - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def body_edge(img):
    """How far the torso itself reaches from the centre, row by row.

    The sleeves hang over the body's sides in a flat lay, with the tapes and the
    backdrop showing in between, so the last cloth pixel before that is the
    furthest the photograph can tell us about the body. A wide median keeps
    bright details (the chest trefoil) from being mistaken for the edge.
    """
    l = luma(img)
    bright = l > 150
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
        edge[y] = max(0, min(left, right) - 8)
    pad = 30
    padded = np.pad(edge, pad, mode='edge')
    return np.array([np.median(padded[i:i + 2 * pad + 1]) for i in range(h)])


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


def ring_perimeter(ring):
    return float(np.linalg.norm(np.diff(ring, axis=0), axis=1).sum() + np.linalg.norm(ring[0] - ring[-1]))


def perimeters(name, rows, frame='torso', nth=0, cols=34):
    """Perimeter of the section at each of `rows` evenly spaced heights."""
    pos = piece(name, frame, nth)
    panel_rows = len(pos) // (cols + 1) - 1
    rings = pos.reshape(panel_rows + 1, cols + 1, 3)
    out = []
    for r in range(rows):
        t = r / max(1, rows - 1) * panel_rows
        i = min(panel_rows - 1, int(t)); f = t - i
        ring = rings[i] * (1 - f) + rings[i + 1] * f
        ring[-1] = ring[0]
        out.append(ring_perimeter(ring))
    return np.array(out)


def normal_from(img, strength=1.0):
    """Relief from the knit and the seams, read only as a gentle tilt."""
    l = luma(img)
    fine = l - blur(l, 4.0)
    fine = blur(fine, .7)
    gy, gx = np.gradient(fine)
    grad = np.maximum(np.hypot(gx, gy), 1e-6)
    scale = .32 * strength / max(float(np.percentile(grad, 90)), 1e-6)
    nx = np.clip(-gx * scale, -1, 1)
    ny = np.clip(gy * scale, -1, 1)
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / ln, ny / ln, nz / ln])


def roughness_from(img):
    l = luma(img)
    base = blur(l, 18)
    fine = l - base
    r = .94 - .02 * (fine / 20.0)
    return np.clip(r, .86, .99)


def bake_body(front, back, front_edge, back_edge):
    """u 0 = centre front, 0.25 = right side, 0.5 = centre back, 0.75 = left.

    The two photographs meet at the side seams, which is where the flat lay
    stops showing the body: the front's right edge and the back's left edge are
    the same seam, because the back lay is flipped over.
    """
    us = (np.arange(BODY_SIZE) + .5) / BODY_SIZE
    vs = np.arange(BODY_SIZE) / (BODY_SIZE - 1)
    ys = TOP + vs * BODY_LEN * 100 * PXPCM
    dist_front = np.where(us < .25, us, us - 1.0) * 4.0
    dist_back = (us - .5) * 4.0
    front_side = (us < .25) | (us >= .75)
    rows = np.arange(len(front_edge))
    out = np.zeros((BODY_SIZE, BODY_SIZE, 3), np.float32)
    for r in range(BODY_SIZE):
        y = np.full(BODY_SIZE, ys[r] if ys[r] < len(front_edge) else rows[-1], np.float32)
        xf = CX + dist_front * np.interp(y[0], rows, front_edge)
        xb = CX + dist_back * np.interp(y[0], rows, back_edge)
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


def bake_sleeve(front, back, tone, cream):
    """One sleeve, unwrapped as the flat lay shows it.

    u = 0 is the outer fold of the sleeve, u = 0.5 the inner one (under the
    arm), u = 1 the outer fold again, so the atlas holds the full circumference
    and the two photographs each give one face. The row's width comes from the
    pattern's own section perimeter, in the photograph's pixels-per-centimetre:
    the flat lay's sleeve is angled and partly hidden by the body, so its
    silhouette cannot be trusted to say how wide the cloth is.
    """
    w, h = SLEEVE_SIZE
    per = perimeters('Sleeve', h, 'arm0', 0, 34)
    # The first rows are the cap that folds over the shoulder; their section is
    # a small ring at the neck, which would collapse the band and smear the
    # tapes over the whole shoulder. Hold the cap at the sleeve's own width, and
    # take the row-to-row noise out of the rest so the tapes run truly straight.
    cap = int(.07 * h)
    per[:cap] = per[cap]
    per = cv2.GaussianBlur(per.reshape(-1, 1), (0, 0), 6).ravel()
    us = (np.arange(w) + .5) / w
    vs = (np.arange(h) + .5) / h
    left_f, right_f = silhouette(front)
    left_b, right_b = silhouette(back)
    y0, y1 = SLEEVE_ROWS
    out = np.zeros((h, w, 3), np.float32)
    front_sel = us < .5
    across_front = us * 2.0
    across_back = 1.0 - (us - .5) * 2.0
    for r in range(h):
        y = y0 + vs[r] * (y1 - y0)
        half_px = per[r] / 2 * 100 * PXPCM      # half the circumference, in px
        row = int(np.clip(round(y), 0, len(left_f) - 1))
        out[r, front_sel] = bilinear(front, left_f[row] + 3 + across_front[front_sel] * half_px,
                                     np.full(int(front_sel.sum()), y, np.float32))
        out[r, ~front_sel] = bilinear(back, left_b[row] + 3 + across_back[~front_sel] * half_px,
                                      np.full(int((~front_sel).sum()), y, np.float32))
    # The tapes: three parallel bands a fixed distance from the outer fold. In
    # arc terms that is a fraction of the row's circumference, so they run
    # straight down the atlas and stay crisp instead of following the
    # photograph's wandering silhouette.
    u = np.arange(w) / w
    shade = np.ones((h, w), np.float32)
    for centre in STRIPES:
        start = centre - STRIPE_W / 2
        end = centre + STRIPE_W / 2
        u0 = start / (per * 100)[:, None]
        u1 = end / (per * 100)[:, None]
        band = np.clip((u[None, :] - u0) * w, 0, 1) - np.clip((u[None, :] - u1) * w, 0, 1)
        band *= (vs[:, None] < STRIPE_STOP)
        shade = np.minimum(shade, 1.0 - band)
    cloth = np.broadcast_to(tone, out.shape)
    out = cloth * shade[..., None] + cream * (1.0 - shade[..., None])
    return out


def bake_hood(back, tone):
    h = HOOD_SIZE
    x0, y0, x1, y1 = HOOD_BOX
    us = (np.arange(h) + .5) / h
    vs = np.arange(h) / (h - 1)
    xs = x0 + us * (x1 - x0)
    out = np.zeros((h, h, 3), np.float32)
    for r in range(h):
        out[r] = bilinear(back, xs, np.full(h, y0 + vs[r] * (y1 - y0), np.float32))
    # The box's corners hold the light backdrop; on the hood every pixel is
    # cloth, so anything bright is the backdrop showing where the box overruns.
    l = luma(out)
    out[l > 70] = tone
    return out


def bake_zip():
    img = np.asarray(Image.open(ZIP).convert('RGB')).astype(np.float32)
    # A clean stretch of tape and teeth, below the two sliders.
    strip = img[1300:1580, 448:492]
    w, h = 64, 512
    return cv2.resize(strip, (w, h), interpolation=cv2.INTER_AREA)


def main():
    front_raw = load(FRONT)
    back_raw = load(BACK)
    tone = cloth_tone(front_raw)
    print('cloth tone', tone.round(1))

    cream = np.percentile(front_raw[stripe_mask_like(front_raw)], 72, axis=0)
    front_tag = clean_tag(front_raw, tone)
    back_tag = clean_tag(back_raw, tone)
    front = flatten(front_tag)
    back = flatten(back_tag)
    # The tapes are painted from the pattern's own circumference, so the
    # photograph's own tapes must come out of the base or they show through as
    # a second, doubled set that follows the flat lay.
    front_plain = flatten(without_zip(without_stripes(front_tag, tone), tone))
    back_plain = flatten(without_stripes(back_tag, tone))
    cream = np.clip(cream * 1.0, 0, 255).astype(np.float32)
    print('cream', cream.round(1))

    Image.fromarray(front.astype(np.uint8)).save(WORK / 'front-clean.png')
    Image.fromarray(back.astype(np.uint8)).save(WORK / 'back-clean.png')
    Image.fromarray(front_plain.astype(np.uint8)).save(WORK / 'front-plain.png')

    jobs = {
        'body': bake_body(front_plain, back_plain, body_edge(front_raw), body_edge(back_raw)),
        'sleeve': bake_sleeve(front_plain, back_plain, tone, cream),
        'hood': bake_hood(back, tone),
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
