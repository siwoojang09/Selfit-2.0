#!/usr/bin/env python3
"""A pigment-washed black denim, described by numbers instead of a swatch.

The jacket's cloth is not a flat dye: it was stone- and pigment-washed, so the
black sits unevenly — cloudy silver-grey patches over a charcoal ground, pale
where a seam or a rib has rubbed, and a fine 3/1 twill running diagonally
through all of it. A photograph of the cloth cannot be repeated over a whole
garment without showing its own fold, so the cloth is drawn here instead:
twill, wash blotches and seam wear are all evaluated in metres, at whatever
resolution the caller needs (the 2048 px body atlas or the sleeve's own tile).

Functions return (colour, normal, roughness) ready for the GLB packer:
colour 0..255 float, normal -1..1 float, roughness 0..1 float.
"""
import numpy as np
import cv2

LUM = np.array([.213, .715, .072], np.float32)


def _noise(w, h, span, cell_m, seed):
    """Smooth value noise with cells of `cell_m`, normalised to unit spread.

    `span` is the size of the patch in metres (width, height); the grid is
    sized so one cell is `cell_m` wide and high, whichever way the patch is
    stretched — the atlas is 1.48 m round and 0.65 m tall, so its cells are not
    square in texels.
    """
    rng = np.random.default_rng(seed)
    cx = max(3, int(round(span[0] / cell_m)) + 1)
    cy = max(3, int(round(span[1] / cell_m)) + 1)
    grid = rng.normal(0, 1, (cy, cx)).astype(np.float32)
    up = cv2.resize(grid, (w, h), interpolation=cv2.INTER_CUBIC)
    up -= up.mean()
    up /= max(1e-6, float(up.std()))
    return up


def wash(w, h, span, seed=11, cell_scale=1.0):
    """How far the pigment has come off, 0..1, in cloudy patches and streaks.

    Three scales of blotch (a hand, a forearm, a whole panel) plus the vertical
    runs a wash leaves as it drains: the photograph shows pale streaks 2-4 cm
    wide running down the cloth, so the streak field is stretched tall.
    """
    c = cell_scale
    blotch = (0.60 * _noise(w, h, span, .075 * c, seed)
              + 0.34 * _noise(w, h, span, .190 * c, seed + 1)
              + 0.20 * _noise(w, h, span, .420 * c, seed + 2))
    # Cells a centimetre wide and 15 cm tall: the streaks of a wash.
    rng = np.random.default_rng(seed + 3)
    cx = max(3, int(round(span[0] / (.030 * c))) + 1)
    cy = max(3, int(round(span[1] / (.280 * c))) + 1)
    streak = cv2.resize(rng.normal(0, 1, (cy, cx)).astype(np.float32), (w, h),
                        interpolation=cv2.INTER_CUBIC)
    streak -= streak.mean()
    streak /= max(1e-6, float(streak.std()))
    field = 0.86 * blotch + 0.11 * streak
    field /= max(1e-6, float(field.std()))
    # A soft shoulder: most of the cloth stays near its dyed black, and the
    # washed places lift away from it in broad patches rather than dots.
    return np.clip(0.40 + 0.27 * np.tanh(field * .92), 0, 1)


def twill(w, h, span, thread_mm=1.05, diag_mm=2.55, seed=5):
    """The 3/1 twill as a height field in millimetres, plus its own wobble.

    Three warp threads float over one weft, and the float steps one thread
    sideways on every row, which is what makes the diagonal ridge. The threads
    wander a little — a real denim is never ruled — so each warp column gets its
    own small offset in phase.
    """
    rng = np.random.default_rng(seed)
    X = (np.arange(w) + .5) / w * span[0]          # metres
    Y = (np.arange(h) + .5) / h * span[1]
    t = thread_mm / 1000.0
    d = diag_mm / 1000.0
    # Warp columns: one jitter value per thread, interpolated across the cloth.
    cols = max(4, int(round(span[0] / t)))
    jitter = rng.normal(0, .09, cols).astype(np.float32)
    jit = np.interp(np.arange(w) * cols / w, np.arange(cols), jitter)[None, :]
    ridge = np.cos(2 * np.pi * ((X[None, :] - Y[:, None]) / d + jit))
    ridge = np.sign(ridge) * np.abs(ridge) ** .55
    warp = np.cos(2 * np.pi * X[None, :] / t)
    weft = np.cos(2 * np.pi * Y[:, None] / t)
    # Fibre: a tooth at the scale of a single yarn, always there, never regular.
    tooth = _noise(w, h, span, .0016, seed + 9) * .30
    return (.62 * ridge + .30 * warp + .17 * weft + tooth), t


def maps(w, h, span, base=(30, 31, 35), mid=(56, 58, 63), wash_tone=(152, 159, 167),
         thread_mm=1.05, diag_mm=2.55, relief=.16, rough=.78, rough_var=.028,
         wash_amount=1.0, wash_bias=0.0, seed=11, extra_wash=None, extra_mask=None,
         cell_scale=1.0):
    """Colour, normal and roughness for one piece of washed black denim."""
    W = wash(w, h, span, seed, cell_scale)
    if extra_wash is not None:
        W = np.clip(W + extra_wash * wash_amount, 0, 1)
    W = np.clip(W ** 1.75 + wash_bias, 0, 1)
    # The dye: a charcoal ground that lifts to silver where the wash took.
    k = W[..., None]
    colour = np.array(base, np.float32) + (np.array(wash_tone, np.float32)
                                          - np.array(base, np.float32)) * k
    # The half-washed middle sits between the two: a touch of the mid tone in
    # the shoulder of the ramp keeps the transition from looking painted.
    band = np.clip(1 - np.abs(W - .34) / .40, 0, 1)[..., None]
    colour = colour * (1 - .22 * band) + np.array(mid, np.float32) * .22 * band

    H, t = twill(w, h, span, thread_mm, diag_mm, seed + 4)
    # The twill also catches the dye differently on its floats and its valleys:
    # a few per cent of tone is what makes the cloth read as woven when the
    # light is flat.
    colour = colour * (1 + .075 * (H - H.mean()) / max(1e-6, float(H.std()))) [..., None]
    # The relief is a fraction of a millimetre, but the slope matters, so the
    # gradient is measured per millimetre of cloth and scaled by `relief`.
    ppmm_x = w / (span[0] * 1000.0)
    ppmm_y = h / (span[1] * 1000.0)
    gy, gx = np.gradient(H)
    gx *= ppmm_x
    gy *= ppmm_y
    # A washed place stands a little softer: its fibres have been beaten down.
    amp = relief * (1.0 - .22 * W)
    nx = np.clip(-gx * amp, -.92, .92)
    ny = np.clip(-gy * amp, -.92, .92)
    nz = np.sqrt(np.maximum(1 - nx * nx - ny * ny, .05))
    normal = np.dstack([nx, ny, nz])

    # A wash also changes the sheen: the raw black is slightly glossier than the
    # abraded pale cloth, which scatters light flatly.
    grain = cv2.GaussianBlur(_noise(w, h, span, .004, seed + 12), (0, 0), .8)
    roughness = np.clip(rough - .045 * W + rough_var * grain, .60, .90)

    if extra_mask is not None:
        # Seam wear: the cloth is already pale there, and the twill has been
        # pressed flat by the needle.
        colour = colour * (1 - .38 * extra_mask[..., None]) + \
            np.array([152, 158, 166], np.float32) * .38 * extra_mask[..., None]
        roughness = np.clip(roughness + .03 * extra_mask, .6, .92)
    return np.clip(colour, 0, 255), normal, roughness


def _band(d, centre, sigma):
    return np.exp(-((d - centre) / sigma) ** 2)


def body_seams(w, h, circ, length):
    """The atlas' share of the wash: placket, hem and neck wear.

    The body's atlas is its pattern space — u once round the torso from the
    centre front, v down from the shoulder — so a seam can be painted where it
    will actually be sewn, and it lands on the garment at its real width.
    Returns (wash lift 0..1, pale mask 0..1).
    """
    u = ((np.arange(w) + .5) / w)[None, :] * circ         # metres round
    v = ((np.arange(h) + .5) / h)[:, None] * length        # metres down
    d_front = np.minimum(u, circ - u)                      # metres from centre front
    lift = np.zeros((h, w), np.float32)
    pale = np.zeros((h, w), np.float32)

    # The two-way zip's placket: tape and the cloth either side of it, worn pale
    # along its whole run, palest at the top where the hands go.
    placket = _band(d_front, .017, .011) * np.clip((v - .02) / .05, 0, 1) * np.clip((length - v) / .03, 0, 1)
    lift += .32 * placket
    pale += .17 * placket
    # Right at the seam the tape shades the cloth: a dark crease, not a highlight.
    lift -= .45 * _band(d_front, .003, .004)

    # The hem: worn pale above the rib, and puckered where the rib gathers it.
    above_hem = length - v
    hem = _band(above_hem, .058, .030) * np.clip((above_hem - .020) / .02, 0, 1)
    pucker = (0.5 + 0.5 * np.cos(2 * np.pi * u / .0095)) * _band(above_hem, .062, .028)
    lift += .20 * hem + .15 * pucker
    pale += .07 * hem
    # The rib line itself: a shadowed fold where the cloth turns under.
    lift -= .55 * _band(above_hem, .034, .0045)

    # The neck and hood edge, rubbed pale where the hood sits on the shoulders.
    neck = np.clip((.055 - v) / .055, 0, 1) ** 1.4
    lift += .18 * neck
    pale += .06 * neck

    # Side seams under the arms: the cloth is doubled back on itself there.
    for side in (.25, .75):
        d = np.abs(((u / circ) - side + .5) % 1 - .5) * circ
        lift -= .10 * _band(d, 0, .004)
    return np.clip(lift, -1, 1), np.clip(pale, 0, 1)
