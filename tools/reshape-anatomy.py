#!/usr/bin/env python3
"""Shape the two anatomical mannequins to ordinary adult proportions.

The meshes shipped with the app are one unisex height — 178 cm for both bodies,
with a 65 cm waist on the female one. Nothing on a shelf is cut for that figure,
so every garment in the wardrobe hangs as if it were a size or two too big, and
the fitting room answers a question nobody asked.

This reads the untouched mesh in `anatomy-assets/source/` and writes the shaped
one beside it, and regenerates the tape sections the pattern builders read
(`body-sections-data.mjs`).

Two transforms, applied together:

  * vertical   y' = y * ky, ky = target stature / source stature. One factor, so
               the shoulders, waist, hip, knee and floor keep their relation to
               each other; only the stature changes.
  * horizontal (only)  x' = x * s(y), z' = z * s(y): a smooth profile that takes
               the slim runway waist out to an ordinary one and leaves the head,
               hands and feet alone.

The section table is transformed by the same factors and resampled onto the same
10 mm grid, so the cloth patterns see exactly the body that is drawn.

    python3 tools/reshape-anatomy.py
"""
import json, pathlib, struct
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'anatomy-assets'
OUT = ROOT / 'body-sections-data.mjs'

# Target stature (cm) and the horizontal profile: (height in the source mesh,
# factor). The factors come from ordinary Korean adult tape measurements — a
# 163.5 cm woman is about 85 cm at the bust, 70 at the waist, 92 at the seat and
# 36 at the shoulder; a 174.5 cm man about 99, 78, 90 and 41.5.
MODELS = {
    'female': {
        'height': 163.5,
        'source': 178.1,
        'profile': [
            (0.00, 1.000), (0.12, 1.020), (0.30, 1.035), (0.45, 1.040),
            (0.62, 1.052), (0.74, 1.055), (0.877, 1.012), (1.00, 1.035),
            (1.159, 1.072), (1.296, 1.017), (1.402, 1.070), (1.45, 1.035),
            (1.52, 1.000), (1.60, 1.000), (1.80, 1.000),
        ],
    },
    'male': {
        'height': 174.5,
        'source': 178.3,
        'profile': [
            (0.00, 1.000), (0.12, 1.020), (0.30, 1.030), (0.45, 1.030),
            (0.62, 1.038), (0.74, 1.042), (0.801, 1.050), (1.00, 1.058),
            (1.113, 1.065), (1.323, 1.005), (1.454, 1.017), (1.50, 1.005),
            (1.60, 1.000), (1.80, 1.000),
        ],
    },
}

# The neck apex the top patterns are cut from: the high point of the shoulder
# next to the neck, 18 mm above the joint in the source frame.
APEX_SOURCE = 1.475
SECTION_BASE_SOURCE = 0.68


def profile_fn(points):
    ys = np.array([p[0] for p in points])
    ss = np.array([p[1] for p in points])
    def f(y):
        y = np.asarray(y, dtype=float)
        i = np.clip(np.searchsorted(ys, y), 1, len(ys) - 1)
        a, b = ys[i - 1], ys[i]
        t = np.clip((y - a) / (b - a), 0.0, 1.0)
        t = t * t * (3 - 2 * t)
        return ss[i - 1] + (ss[i] - ss[i - 1]) * t
    return f


def read_mesh(path):
    raw = path.read_bytes()
    magic, = struct.unpack('>I', raw[:4])
    vertices, indices = struct.unpack('<II', raw[4:12])
    assert magic == 0x44413031, path
    assert len(raw) == 12 + 20 * vertices + 2 * indices
    pos = np.frombuffer(raw, dtype=np.float32, count=vertices * 3, offset=12).reshape(vertices, 3).copy()
    rest = raw[12 + 12 * vertices:]
    return pos, rest, vertices, indices


def write_mesh(path, pos, rest, vertices, indices):
    head = struct.pack('>I', 0x44413031) + struct.pack('<II', vertices, indices)
    path.write_bytes(head + pos.astype(np.float32).tobytes() + rest)


def resample(rows, ky, s):
    """Take the source tape sections through the same transform.

    Rows of the source table sit every 10 mm from y = 0.68; the shaped body keeps
    that grid, starting at the shaped crotch. Each value is a distance from the
    axis, so it scales like the mesh: radii, perimeter, the section's own centre
    and every radial reading all take s(y) of the row they came from.
    """
    base = SECTION_BASE_SOURCE * ky
    ys = np.array([SECTION_BASE_SOURCE + i * 0.01 for i in range(len(rows))])
    out = []
    for i in range(len(rows)):
        y = base + i * 0.01
        sy = y / ky
        j = int(np.clip(np.searchsorted(ys, sy) - 1, 0, len(rows) - 2))
        t = float(np.clip((sy - ys[j]) / (ys[j + 1] - ys[j]), 0, 1))
        row = [rows[j][k] + (rows[j + 1][k] - rows[j][k]) * t for k in range(len(rows[j]))]
        f = float(s(sy))
        out.append([row[0] * f, row[1] * f, row[2] * f, row[3] * f] + [v * f for v in row[4:]])
    return out, base


def main():
    source = json.loads((ASSETS / 'source' / 'sections.json').read_text())
    data = {'sections': {}, 'landmarks': {}}
    for model, spec in MODELS.items():
        ky = spec['height'] / spec['source']
        s = profile_fn(spec['profile'])

        pos, rest, vertices, indices = read_mesh(ASSETS / 'source' / f'{model}.bin')
        y = pos[:, 1].copy()
        factor = s(y)
        pos[:, 1] = y * ky
        pos[:, 0] *= factor
        pos[:, 2] *= factor
        write_mesh(ASSETS / f'{model}.bin', pos, rest, vertices, indices)
        print(f'{model}: stature {pos[:, 1].max()*100 - pos[:, 1].min()*100:.1f} cm, '
              f'feet {pos[:, 1].min()*100:.1f} cm, width {factor.min():.3f}-{factor.max():.3f}, '
              f'ky {ky:.4f}')

        rows, base = resample(source['sections'][model], ky, s)
        data['sections'][model] = [[round(v, 1) for v in row] for row in rows]
        old = source['landmarks'][model]
        mark = dict(old)
        for key in ('height', 'chest', 'waist', 'hip', 'shoulder', 'armLength'):
            if key in ('height', 'armLength'):
                mark[key] = round(old[key] * ky, 1)
            else:
                key_y = {'chest': 'chestY', 'waist': 'waistY', 'hip': 'hipY', 'shoulder': 'shoulderY'}[key]
                mark[key] = round(old[key] * float(s(old[key_y])), 1)
        for key in ('chestY', 'waistY', 'hipY', 'shoulderY'):
            mark[key] = round(old[key] * ky, 3)
        mark['apex'] = round(APEX_SOURCE * ky, 3)
        mark['ky'] = round(ky, 4)
        data['landmarks'][model] = mark
        print('   ', mark)

    data['sectionBase'] = round(SECTION_BASE_SOURCE * MODELS['female']['height'] / MODELS['female']['source'], 4)
    # The two models are shaped by different factors, so the grid start has to be
    # carried per model rather than shared.
    data['sectionBase'] = {m: round(SECTION_BASE_SOURCE * MODELS[m]['height'] / MODELS[m]['source'], 4) for m in MODELS}

    lines = ['// Generated by tools/reshape-anatomy.py — edit the profile there, not here.',
             '//',
             '// Cross sections of the two production mannequin meshes in their standing',
             '// fitting pose, every 10 mm from the crotch upward. Each row holds',
             '// rx, rz, cz, hull perimeter (all in half millimetres), then the radial',
             '// distance every 5 degrees from the front, anti-clockwise.',
             'export const sections = {']
    for model in ('female', 'male'):
        lines.append(f'  {model}: [')
        for row in data['sections'][model]:
            lines.append('    [' + ', '.join(f'{v:g}' for v in row) + '],')
        lines.append('  ],')
    lines.append('};')
    lines.append('')
    lines.append('// Stature and tape measurements of the shaped body. Linear values in')
    lines.append('// centimetres; Y landmarks and the neck apex in metres above the floor.')
    lines.append('export const landmarks = {')
    for model in ('female', 'male'):
        mark = data['landmarks'][model]
        body = ', '.join(f'{k}: {v}' for k, v in mark.items())
        lines.append(f'  {model}: {{{body}}},')
    lines.append('};')
    lines.append('')
    lines.append('// The horizontal profile the meshes were shaped with, as (source height,')
    lines.append('// factor) knots. The rig and the coverage tests read it in the source frame.')
    lines.append('export const widthKnots = {')
    for model in ('female', 'male'):
        knots = ', '.join(f'[{y:g}, {f:g}]' for y, f in MODELS[model]['profile'])
        lines.append(f'  {model}: [{knots}],')
    lines.append('};')
    lines.append('')
    lines.append('// Height of the first section row, per model.')
    lines.append('export const sectionBase = {' + ', '.join(f'{m}: {v}' for m, v in data['sectionBase'].items()) + '};')
    lines.append('')
    OUT.write_text('\n'.join(lines))
    print('wrote', OUT)


if __name__ == '__main__':
    main()
