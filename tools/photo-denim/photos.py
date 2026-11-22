#!/usr/bin/env python3
"""Pull the jeans out of the two Musinsa flat-lay screenshots.

Everything downstream (atlas, GLB) is built from these pixels, so the job here
is only to be faithful: find the garment, keep its real colour and grain, and
measure the per-row edges the unwrap needs (silhouette, centre, crotch gap).
"""
import json, pathlib
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
PHOTOS = pathlib.Path('/workspace/attachments/2026-11-22')
OUT = ROOT / '.devtest' / 'photo-denim'
OUT.mkdir(parents=True, exist_ok=True)
NAMES = {
    'front': 'IMG_2531-ea5e7a8e39a94252846261b40158297f.jpg',
    'back': 'IMG_2532-26fe4356d0594f528c5cc0e8b1682df9.jpg',
}


def garment_mask(rgb):
    sat = rgb.max(2) - rgb.min(2)
    lum = rgb @ np.array([.213, .715, .072])
    mask = ((sat > 5) | (lum < 233)).astype(np.uint8)
    mask[:470] = 0
    mask[1640:] = 0
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    best = 1 + np.argmax(stats[1:, 4])
    mask = (lab == best).astype(np.uint8)
    # Bright seam highlights and the white brand label punch holes through a
    # colour test; they are cloth, not background. Only the outside is outside.
    flood = mask.copy()
    cv2.floodFill(flood, np.zeros((mask.shape[0] + 2, mask.shape[1] + 2), np.uint8), (0, 0), 1)
    holes = ((flood == 0) & (mask == 0)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(holes, 8)
    for i in range(1, n):
        if stats[i, 4] < 400:
            continue
        mask[lab == i] = 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return mask


def row_edges(mask):
    """Per-row left/right silhouette and the inner gap edges of each leg."""
    h, w = mask.shape
    left = np.full(h, np.nan)
    right = np.full(h, np.nan)
    gap_l = np.full(h, np.nan)   # right edge of the wearer-left... (image-left leg)
    gap_r = np.full(h, np.nan)   # left edge of the image-right leg
    for y in range(h):
        xs = np.where(mask[y])[0]
        if len(xs) == 0:
            continue
        left[y] = xs[0]
        right[y] = xs[-1]
        d = np.diff(xs)
        holes = np.where(d > 4)[0]
        if len(holes):
            k = holes[np.argmax(d[holes])]
            gap_l[y] = xs[k]
            gap_r[y] = xs[k + 1]
    return left, right, gap_l, gap_r


def fill_gaps(a):
    a = a.copy()
    idx = np.arange(len(a))
    good = np.isfinite(a)
    a[~good] = np.interp(idx[~good], idx[good], a[good])
    return a


def smooth(a, k=9):
    pad = k // 2
    p = np.pad(a, pad, mode='edge')
    ker = np.ones(k) / k
    return np.convolve(p, ker, mode='valid')


def main():
    for tag, name in NAMES.items():
        img = np.asarray(Image.open(PHOTOS / name).convert('RGB')).astype(np.float32)
        mask = garment_mask(img)
        left, right, gl, gr = row_edges(mask)
        ys = np.where(np.isfinite(left))[0]
        y0, y1 = ys.min(), ys.max()
        widths = right - left
        # The waistband top is the first row that is already most of the hip width.
        top = next(y for y in range(y0, y1) if widths[y] > .9 * widths[min(y + 40, y1)])
        hem = y1
        # A soft, light-shadow edge sits under the hem; the cloth itself ends
        # where the silhouette stops growing.
        while hem > top + 50 and widths[hem] < .55 * np.nanmax(widths):
            hem -= 1
        print(tag, 'rows', y0, y1, 'top', top, 'hem', hem, 'width', widths[top:hem + 1].max())

        L = smooth(fill_gaps(left), 7)
        R = smooth(fill_gaps(right), 7)
        # Gap edges exist only below the crotch; hold them gently above it.
        wide = np.array([np.isfinite(gl[y]) and np.isfinite(gr[y]) and (gr[y] - gl[y]) > 8
                         for y in range(len(gl))])
        crotch = next((y for y in range(top + int(.45 * (hem - top)), hem) if wide[y]), hem)
        print(' crotch row', crotch)
        GL = fill_gaps(np.where(wide, gl, np.nan))
        GR = fill_gaps(np.where(wide, gr, np.nan))
        GL = smooth(GL, 7)
        GR = smooth(GR, 7)

        # Keep the garment on its own light backdrop for texture work.
        rgb = img.copy()
        alpha = (mask * 255).astype(np.uint8)
        Image.fromarray(np.dstack([img.astype(np.uint8), alpha]), 'RGBA').save(OUT / f'{tag}-cut.png')
        Image.fromarray(mask * 255).save(OUT / f'{tag}-mask.png')

        np.savez(OUT / f'{tag}-edges.npz', left=L, right=R, gap_left=GL, gap_right=GR,
                 mask=mask, top=top, hem=hem, crotch=crotch if crotch else hem,
                 width=widths)
        print(' saved', tag)


main()
