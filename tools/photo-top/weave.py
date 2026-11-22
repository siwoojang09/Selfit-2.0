#!/usr/bin/env python3
"""Cloth surfaces described by numbers instead of a photograph.

Two weaves are decided by measurement, not by a crop:

* a yarn-dyed stripe, where the pitch was read off the flat-lay with an FFT
  (the striped oxford's period is 5.2 mm), and
* a 2x2 rib, which is what every hem, cuff and collar band on a knit is.

Both are evaluated at whatever resolution the caller needs (a 512 px swatch,
or the whole 2048 px atlas), so a stripe never has to survive being resampled
from one grid onto another.  The oxford's own weave is a normal map: a plain
weave of warp and weft with the two-over-two float of an oxford, which is what
gives the cloth its dry, slightly granular sheen.
"""
import numpy as np


def _grid(w, h, tile_m):
    """Metres per texel, and the texel centres in metres."""
    px = w / tile_m
    py = h / tile_m
    x = (np.arange(w) + .5) / px
    y = (np.arange(h) + .5) / py
    return x, y


def _stripe_axis(length_px, tile_m, period_mm, line_frac, phase=0.0):
    """Signed distance (in periods) to the nearest dyed line, 0 at its centre."""
    period = period_mm / 1000.0
    pos = ((np.arange(length_px) + .5) / length_px * tile_m) / period + phase
    d = np.abs(pos - np.round(pos))
    return d, (period / (tile_m / length_px))  # distance in periods, period in px


def stripes(w, h, tile_m, period_mm=5.2, line_frac=.30, dark=(62, 64, 61),
            light=(224, 226, 221), phase=0.0, horizontal=False):
    """A yarn-dyed stripe: one dyed line per period, softened over one texel."""
    n = h if horizontal else w
    d, period_px = _stripe_axis(n, tile_m, period_mm, line_frac, phase)
    # distance in texels from the line centre
    dist = d * period_px
    half = line_frac * period_px / 2.0
    cover = np.clip((half + .5 - dist) / 1.0, 0, 1)
    if not horizontal:
        cover = cover[None, :, None]
    else:
        cover = cover[:, None, None]
    cover = np.broadcast_to(cover, (h, w, 1))
    dark = np.array(dark, np.float32).reshape(1, 1, 3)
    light = np.array(light, np.float32).reshape(1, 1, 3)
    return (light * (1 - cover) + dark * cover).astype(np.float32)


def oxford(w, h, tile_m, thread_mm=.52, strength=.55, tone=(176, 178, 174),
           contrast=.10):
    """A plain oxford weave as a colour plus normal.

    Two warps and two wefts float over each other, so the surface is a field of
    small squares rather than a twill's diagonal.  The relief is evaluated per
    texel, and its amplitude fades once a thread is narrower than two texels:
    that is a prefiltered normal, not an aliased one.
    """
    px = w / tile_m
    pitch = (thread_mm / 1000.0) * px          # texels per thread
    x = (np.arange(w) + .5) / px * 1000.0
    y = (np.arange(h) + .5) / px * 1000.0
    u = x / thread_mm
    v = y / thread_mm
    # warp over weft in a two-and-two basket
    basket = np.sign(np.sin(np.pi * u) * np.sin(np.pi * v))
    warp = np.sin(np.pi * 2 * u) * .55
    weft = np.sin(np.pi * 2 * v) * .45
    height = (warp[None, :] + weft[:, None]) * .5 + basket * .35
    gy, gx = np.gradient(height)
    fade = np.clip(pitch / 2.0 - .3, 0, 1)
    s = strength * fade / max(1.0, pitch)
    nx = np.clip(-gx * s, -.9, .9)
    ny = np.clip(-gy * s, -.9, .9)
    nz = np.sqrt(np.maximum(1 - nx * nx - ny * ny, .04))
    normal = np.dstack([nx, ny, nz]) * .5 + .5
    grain = (height - height.mean()) * contrast
    colour = np.array(tone, np.float32).reshape(1, 1, 3) * (1 + grain[..., None])
    return np.clip(colour, 0, 255), normal


def cable(w, h, tile_m, pitch_mm=52.0, ply_mm=13.0, height_mm=5.0, slope=1.3,
          rope_w=.86, tone=(23, 23, 25), contrast=.34, seed=3):
    """A rope cable: two plies crossing, the ridges of one passing over the other.

    The ply lines run diagonally across the cable and cross at its centre, which
    is the X a knitted cable makes; the cable itself is a rounded rope with a
    deep groove on each side.  A cable is geometric by nature, and its relief is
    what a black knit shows under a light.
    """
    import cv2
    rng = np.random.default_rng(seed)
    ppm = w / (tile_m * 1000.0)
    X = (np.arange(w) + .5) / ppm
    Y = (np.arange(h) + .5) / ppm
    XX = X[None, :]
    YY = Y[:, None]
    n = max(1, int(round(tile_m * 1000.0 / pitch_mm)))
    H = np.zeros((h, w), np.float32)
    for c in range(n):
        xc = (c + .5) * pitch_mm
        sway = np.sin(YY / 140.0 + c * 1.7) * 1.1
        u = (XX - xc - sway) / (pitch_mm * rope_w * .5)
        body = np.clip(1 - u * u, 0, 1) ** .55
        skew = slope * (1 + .06 * rng.normal())
        p1 = .5 + .5 * np.cos(2 * np.pi * (YY - skew * (XX - xc)) / ply_mm)
        p2 = .5 + .5 * np.cos(2 * np.pi * (YY + skew * (XX - xc)) / ply_mm)
        H = np.maximum(H, body * (.10 + .90 * np.maximum(p1, p2)))
    gy, gx = np.gradient(H * height_mm)
    nx = np.clip(-gx, -.95, .95)
    ny = np.clip(-gy, -.95, .95)
    nz = np.sqrt(np.maximum(1 - nx * nx - ny * ny, .03))
    normal = np.dstack([nx, ny, nz]) * .5 + .5
    fibre = cv2.GaussianBlur(rng.normal(0, 1, (h, w)).astype(np.float32), (0, 0), .8) * .012
    colour = np.array(tone, np.float32).reshape(1, 1, 3) * (
        1 + contrast * (H - .35)[..., None] + fibre[..., None])
    return np.clip(colour, 0, 255), normal


def rib(w, h, tile_m, period_mm=5.5, tone=(150, 60, 64), horizontal=False,
        depth=.35):
    """A 2x2 rib: rounded columns, as on every band of a knit."""
    n = h if horizontal else w
    d, period_px = _stripe_axis(n, tile_m, period_mm, .5)
    phase = (np.arange(n) + .5) / n * tile_m / (period_mm / 1000.0)
    wave = np.cos(2 * np.pi * phase)
    if horizontal:
        wave = wave[:, None]
        shade = wave
    else:
        wave = wave[None, :]
        shade = wave * np.ones((h, 1))
    colour = np.array(tone, np.float32).reshape(1, 1, 3) * (1 + depth * shade[..., None])
    grad = np.gradient(shade, axis=1 if not horizontal else 0)
    gy, gx = (np.zeros_like(grad), grad) if not horizontal else (grad, np.zeros_like(grad))
    s = 1.4
    nx = np.clip(-gx * s, -.9, .9)
    ny = np.clip(-gy * s, -.9, .9)
    nz = np.sqrt(np.maximum(1 - nx * nx - ny * ny, .04))
    normal = np.dstack([nx, ny, nz]) * .5 + .5
    return np.clip(colour, 0, 255), normal
