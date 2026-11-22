#!/usr/bin/env python3
"""Turn a close-up of a garment's cloth into the maps that carry the fabric.

One call per garment, driven by the JSON config in `tools/photo-top/configs/`:

    python3 tools/photo-top/fabric.py nike-sport-tee-white

It writes, into `.devtest/photo-top/<id>/`:

    tile-color.png    the cloth's own colour, one repeat
    tile-normal.png   its weave — holes, ribs, loops — as a normal map
    tile-rough.png    its grain as roughness

The tile is mirrored when it is laid out (see atlas.py), so it does not have to
be seamless: the reflection hides the edge instead of meeting it.
"""
import json, pathlib, sys
import numpy as np
import cv2
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIGS = ROOT / 'tools/photo-top/configs'
LUM = np.array([.213, .715, .072], np.float32)


def load_config(name):
    return json.loads((CONFIGS / f'{name}.json').read_text())


def normal_from(lum, strength=1.0, fine_sigma=.7, coarse_sigma=3.2):
    fine = cv2.GaussianBlur(lum, (0, 0), fine_sigma)
    fine = fine - cv2.GaussianBlur(fine, (0, 0), coarse_sigma)
    gy, gx = np.gradient(fine)
    grad = np.maximum(np.hypot(gx, gy), 1e-6)
    scale = strength / max(float(np.percentile(grad, 92)), 1e-6)
    nx = np.clip(-gx * scale, -1, 1)
    ny = np.clip(gy * scale, -1, 1)
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / ln, ny / ln, nz / ln])


def build(name):
    cfg = load_config(name)
    out = ROOT / '.devtest' / 'photo-top' / cfg['id']
    out.mkdir(parents=True, exist_ok=True)
    photo = np.asarray(Image.open(pathlib.Path('/workspace/attachments/2026-11-23') / cfg['fabric']['photo']).convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = cfg['fabric']['crop']
    patch = photo[y0:y1, x0:x1]
    if cfg['fabric'].get('rotate'):
        patch = np.ascontiguousarray(np.rot90(patch, cfg['fabric']['rotate']))
    # The close-up is lit from one side; dividing out the low-frequency light
    # leaves one flat cloth tone for the tile, so repeated copies do not turn
    # into a visible chequer of bright and dark squares.
    lum = patch @ LUM
    field = cv2.GaussianBlur(lum, (0, 0), max(patch.shape[:2]) / 3.2)
    tone = float(np.median(field))
    gain = np.clip(tone / np.maximum(field, 1e-3), .75, 1.4)
    flat = np.clip(patch * gain[..., None], 0, 255)
    target = cfg['fabric'].get('tone')
    if target:
        want = np.array(target, np.float32)
        have = flat.reshape(-1, 3).mean(0)
        flat = np.clip(flat * (want / np.maximum(have, 1e-3)), 0, 255)
    # What is left of a drape (a diagonal fold, a shadow) would be reflected
    # into a chequer when the tile repeats. Removing it leaves the cloth's own
    # grain and one tone, which is what a tile must be.
    low = cv2.GaussianBlur(flat, (0, 0), max(flat.shape[:2]) / 20.0)
    detail = cfg['fabric'].get('colour_detail', 1.0)
    flat = np.clip(flat - low + low.reshape(-1, 3).mean(0), 0, 255)
    if detail < 1.0:
        # A plain-dyed cloth has one albedo; its weave is a matter of relief, not
        # colour. Keeping only a trace of the photo's own tone avoids the
        # kaleidoscope a repeated patch makes of a soft fold.
        tone_mean = flat.reshape(-1, 3).mean(0)
        flat = np.clip(tone_mean + (flat - tone_mean) * detail, 0, 255)
    Image.fromarray(flat.astype(np.uint8)).save(out / 'tile-color.png')
    base = flat @ LUM
    nrm = normal_from(base, strength=cfg['fabric'].get('relief', 2.2),
                      fine_sigma=cfg['fabric'].get('fine', .7),
                      coarse_sigma=cfg['fabric'].get('coarse', 3.2))
    Image.fromarray(((nrm * .5 + .5) * 255).astype(np.uint8)).save(out / 'tile-normal.png')
    grain = cv2.GaussianBlur(base, (0, 0), 1.2) - cv2.GaussianBlur(base, (0, 0), 7)
    rough = np.clip(cfg['fabric'].get('roughness', .9) - .02 * grain / 6.0, .6, .99)
    Image.fromarray((rough * 255).astype(np.uint8)).save(out / 'tile-rough.png')
    print(name, 'tile', flat.shape, 'tone', flat.reshape(-1, 3).mean(0).round(1),
          'normal mean', nrm.reshape(-1, 3).mean(0).round(2))


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'nike-sport-tee-white')
