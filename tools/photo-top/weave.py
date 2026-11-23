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


def cable(w, h, tile_m, pitch_mm=40.0, ply_mm=56.0, height_mm=5.0, slope=1.0,
          rope_w=.76, tone=(26, 26, 28), contrast=.42, seed=3, strands=3):
    """A cable knit: columns of three strands twisted round each other.

    A cable is not a printed pattern but a rope: three plies travel up the
    column, each one crossing in front of the next and behind the last, so the
    surface is a chain of soft diagonals with a highlight on whichever strand is
    on top.  Between the cables are purl gutters: narrow rounded valleys with
    their own fine stitches, which is what separates one cable from the next.

    The relief is a height field in millimetres, built once for one pitch of the
    pattern and then repeated, so an atlas holds 26 exact cables rather than 26
    hand-stitched ones.  Slope is measured in millimetres too, so the normals do
    not change when the same cloth is asked for at a coarser resolution.
    """
    import cv2
    rng = np.random.default_rng(seed)
    ppm = w / (tile_m * 1000.0)                    # texels per millimetre
    tw = max(12, int(round(pitch_mm * ppm)))
    th = max(12, int(round(ply_mm * ppm)))
    X = ((np.arange(tw) + .5) / tw * pitch_mm)[None, :]
    Y = ((np.arange(th) + .5) / th * ply_mm)[:, None]
    half = pitch_mm * rope_w * .5                  # half the cable's body
    centre = pitch_mm * .5
    u = (X - centre) / half
    body = np.clip(1 - u * u, 0, 1) ** .48
    H = np.zeros((th, tw), np.float32)
    phase = 2 * np.pi * Y / ply_mm
    for i in range(strands):
        a = phase + 2 * np.pi * i / strands
        # The strand's centre swings across the cable; its depth decides which
        # of the three lies on top where they cross.
        off = .46 * np.cos(a)
        over = .5 + .5 * np.sin(a)
        dx = (u - off) / .40
        tube = np.clip(1 - dx * dx, 0, 1) ** .52
        H = np.maximum(H, body * (.14 + .86 * tube) * (.55 + .45 * over))
    # A round cable sits on its own shadow: the sides fall away quickly.
    H *= np.clip(1.16 - .20 * (np.abs(u) ** 3), 0, 1)
    # --- the purl gutters between cables
    v = (np.abs(u) - 1.0) / max(.10, (pitch_mm * .5 / half) - 1.0)
    v = np.clip(v, 0, 1)
    stitches = .5 + .5 * np.cos(2 * np.pi * (Y / 3.4) + np.pi * (X / 3.0))
    purl = .40 * np.sin(np.pi * v) ** .7 * (.60 + .40 * stitches)
    H = np.where(np.abs(u) > 1.0, purl, H)
    # A soft valley just outside the cable, so the rope reads as raised cloth.
    H -= .09 * np.exp(-((np.abs(u) - 1.0) ** 2) / .005)
    H = np.tile(H, (max(1, int(np.ceil(h / th))), max(1, int(np.ceil(w / tw)))))
    H = H[:h, :w].astype(np.float32)
    # Height in millimetres, then the slope per millimetre of cloth.
    gy, gx = np.gradient(H * height_mm)
    gx *= ppm
    gy *= ppm
    s = float(slope)
    nx = np.clip(-gx * s, -.96, .96)
    ny = np.clip(-gy * s, -.96, .96)
    nz = np.sqrt(np.maximum(1 - nx * nx - ny * ny, .02))
    normal = np.dstack([nx, ny, nz]) * .5 + .5
    # The yarn: a little fibre noise, plus the shade of the cable itself.  The
    # shade is drawn from a blurred copy of the relief, because a black knit is
    # read at a distance from the tone that pools in its valleys: the fine
    # normals alone average out to one flat black once the cloth is far away.
    fibre = cv2.GaussianBlur(rng.normal(0, 1, (h, w)).astype(np.float32), (0, 0), .7) * .012
    sigma = max(1.5, 5.0 * ppm / 2.0)          # a few millimetres of blur
    broad = cv2.GaussianBlur(H, (0, 0), sigma)
    level = (broad - broad.min()) / max(1e-4, float(broad.max() - broad.min()))
    level = level ** 1.15
    fine = (H - broad)
    fine = fine / max(1e-6, float(np.abs(fine).max()))
    shade = 1.0 + contrast * ((level - .45) * 2.0) + contrast * .55 * fine
    colour = np.array(tone, np.float32).reshape(1, 1, 3) * (
        np.clip(shade, .30, 2.4)[..., None] + fibre[..., None])
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
