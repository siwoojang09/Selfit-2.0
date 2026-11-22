#!/usr/bin/env python3
"""The chino's cotton twill, at the scale the eye reads it.

The atlas carries the garment's macro structure — the wash, the seams, the
pockets, the stitching — but at 2048 texels across a metre it cannot carry the
1 mm twill rib, and a render without it reads as smooth plastic. This file cuts
a clean patch out of the close-up (the hem corner, no seam in it), turns its
relief into a normal map and its grain into a roughness map. Those are applied
on a second UV set measured in metres, so the rib keeps its real size whatever
the garment's width or the model's size.
"""
import pathlib
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / '.devtest' / 'photo-chino'
WORK.mkdir(parents=True, exist_ok=True)
DETAIL = pathlib.Path('/workspace/attachments/2026-11-23/IMG_2599-c9883022a3a442fdb697675a2fab227d.jpg')

# A clean stretch of the hem corner in the close-up, clear of the seam on the
# left and the shadow at the fold. Its twill runs diagonally at about 1 mm.
BOX = (262, 1152, 442, 1332)
LUM = np.array([.213, .715, .072], np.float32)


def normal_from(lum, strength=1.0):
    """Relief as a normal map, scaled so the rib tilts but does not sandpaper."""
    fine = cv2.GaussianBlur(lum, (0, 0), .7)
    fine = fine - cv2.GaussianBlur(fine, (0, 0), 3.2)
    gy, gx = np.gradient(fine)
    grad = np.maximum(np.hypot(gx, gy), 1e-6)
    scale = strength / max(float(np.percentile(grad, 92)), 1e-6)
    nx = np.clip(-gx * scale, -1, 1)
    ny = np.clip(gy * scale, -1, 1)
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / ln, ny / ln, nz / ln])


def roughness_from(lum):
    base = cv2.GaussianBlur(lum, (0, 0), 1.6)
    fine = lum - cv2.GaussianBlur(lum, (0, 0), 8)
    # Cotton twill is matte everywhere; the rib's raised threads catch slightly
    # more light, so roughness moves a little with the same grain.
    r = .905 - .012 * (base - base.mean()) / 12.0 + .010 * (fine / 8.0)
    return np.clip(r, .83, .96)


def main():
    img = np.asarray(Image.open(DETAIL).convert('RGB')).astype(np.float32)
    patch = img[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    lum = patch @ LUM
    nrm = normal_from(lum, strength=2.1)
    rough = roughness_from(lum)
    Image.fromarray(((nrm * .5 + .5) * 255).astype(np.uint8)).save(WORK / 'weave-normal.png')
    Image.fromarray((rough * 255).astype(np.uint8)).save(WORK / 'weave-rough.png')
    print('weave patch', patch.shape, 'normal mean', nrm.reshape(-1, 3).mean(0).round(2),
          'rough', round(float(rough.mean()), 3))


if __name__ == '__main__':
    main()
