#!/usr/bin/env python3
"""Bake a top's atlas from its cloth and pack the pattern into a GLB.

The atlas is the pattern's own parameter space: u goes once around the torso
from the centre front seam, v runs from the neck/shoulder apex to the hem. The
cloth tile is laid into that space at its real size, so the weave keeps its
scale on a small size and a large one, and the garment's graphics (a Swoosh, a
chest print, a pony) are stamped where the product photographs put them.

Usage:
    python3 tools/photo-top/fabric.py nike-sport-tee-white
    python3 tools/photo-top/dump_pieces.py nike-sport-tee-white
    python3 tools/photo-top/build.py nike-sport-tee-white
"""
import io, json, pathlib, struct, sys
import numpy as np
import cv2
from PIL import Image

import weave

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIGS = ROOT / 'tools/photo-top/configs'
PHOTOS = pathlib.Path('/workspace/attachments/2026-11-23')
LUM = np.array([.213, .715, .072], np.float32)


def crop_named(path, box):
    img = Image.open(path).convert('RGB').crop(box)
    return np.asarray(img).astype(np.float32)


def tiled(img, reps_y, reps_x):
    """Mirrored repeat: the tile's edges are reflected, never joined."""
    h, w = img.shape[:2]
    row = np.concatenate([img, img[:, ::-1]], axis=1)
    grid = np.concatenate([row, row[::-1]], axis=0)
    reps_y = max(1, int(np.ceil(reps_y)))
    reps_x = max(1, int(np.ceil(reps_x)))
    big = np.tile(grid, (reps_y, reps_x, 1))
    return big[:h * reps_y * 2, :w * reps_x * 2]


def decal_alpha(src, decal):
    """The print's own coverage, from the photograph that shows it clearest."""
    lum = src @ LUM
    mode = decal.get('mode', 'dark')
    if mode == 'light':
        alpha = np.clip((lum - decal['threshold']) / decal['soft'], 0, 1)
    elif mode == 'red':
        score = src[..., 0] - np.maximum(src[..., 1], src[..., 2])
        alpha = np.clip((score - decal['threshold']) / decal['soft'], 0, 1)
    else:
        alpha = np.clip((decal['threshold'] - lum) / decal['soft'], 0, 1)
    for x0, y0, x1, y1 in decal.get('patches', []):
        # A drawcord crosses the print here. Both sides of the band are the
        # print's own white, so the band is rebuilt from its two edges.
        left = alpha[y0:y1, max(0, x0 - 1)].copy()
        right = alpha[y0:y1, min(alpha.shape[1] - 1, x1)].copy()
        t = np.linspace(0, 1, x1 - x0).reshape(1, -1)
        alpha[y0:y1, x0:x1] = left[:, None] * (1 - t) + right[:, None] * t
    return alpha


def draw_decals(cfg, atlas, size, circ, length):
    for decal in cfg['atlas'].get('decals', []):
        src = crop_named(PHOTOS / decal['photo'], decal['crop'])
        alpha = decal_alpha(src, decal)
        if not alpha.any():
            print('decal empty', decal['photo'], decal['crop'])
            continue
        ys, xs = np.where(alpha > .2)
        alpha = alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        w = int(round(decal['size'][0] / circ * size))
        h = int(round(decal['size'][1] / length * size))
        up = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
        sharpen = decal.get('sharpen')
        if sharpen:
            # A small photograph upscaled four times blurs its own edge; a
            # narrow smoothstep around half coverage pins it back down.
            up = np.clip((up - .5) / sharpen + .5, 0, 1)
        cx = int(round(decal['center'][0] * size))
        cy = int(round(decal['center'][1] / length * size))
        # A print is flat when it is laid on the cloth and only then wraps: its
        # width is an arc, not an angle, so the atlas columns near its edges
        # have to take a narrower slice of the photograph.
        cols = np.arange(w) + .5
        theta = 2 * np.pi * (cx - w / 2 + cols) / size - 2 * np.pi * decal['center'][0]
        arc = (circ / (2 * np.pi)) * theta
        frac = .5 + arc / decal['size'][0]
        src = np.clip(frac * w - .5, 0, w - 1)
        i0 = np.floor(src).astype(int)
        i1 = np.minimum(i0 + 1, w - 1)
        t = (src - i0)[None, :]
        up = up[:, i0] * (1 - t) + up[:, i1] * t
        ink = np.array(decal['color'], np.float32).reshape(1, 1, 3)
        for shift in (-size, 0, size):
            x0, y0 = cx - w // 2 + shift, cy - h // 2
            x1, y1 = x0 + w, y0 + h
            xs0, ys0 = max(0, x0), max(0, y0)
            xs1, ys1 = min(size, x1), min(size, y1)
            if xs1 <= xs0 or ys1 <= ys0:
                continue
            a = up[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0][..., None]
            # The thread sits a little proud of the cloth but is dyed, not
            # metallic: in the atlas it is ink, and the normal stays flat.
            atlas[ys0:ys1, xs0:xs1] = atlas[ys0:ys1, xs0:xs1] * (1 - a) + ink * a
            print('decal at', x0, y0, w, h)
    return atlas


def _yoke(cfg, atlas, size, length):
    """The shirt's back yoke and box pleat, painted into the body's atlas.

    A yoke is cut across the cloth, so its stripes run across the body while
    the rest of the back runs down it; the seam under it and the pleat's fold
    are lines on the cloth, not separate pieces.
    """
    yoke = cfg['atlas'].get('yoke')
    if not yoke:
        return
    u0, u1 = [int(round(x * size)) for x in yoke.get('u', [.28, .72])]
    seam = int(round(yoke['v'] * size))
    width = u1 - u0
    band = weave.stripes(width, size, length, cfg['fabric'].get('period_mm', 5.2),
                         cfg['fabric'].get('line_frac', .3),
                         cfg['fabric'].get('dark', (62, 64, 61)),
                         cfg['fabric'].get('light', (224, 226, 221)), horizontal=True)[:seam]
    atlas[:seam, u0:u1] = band
    # The seam: a narrow shadow with the stitching line just below it.
    atlas[max(0, seam - 2):seam, u0:u1] *= .55
    atlas[seam:seam + 1, u0:u1] *= 1.12
    # The pleat's fold, taken in at the middle of the back.
    centre = (u0 + u1) // 2
    end = min(size, seam + int(round(yoke.get('pleat', .12) / length * size)))
    for dx, k in ((-3, 1.05), (-2, .92), (0, .72), (2, .92), (3, 1.05)):
        atlas[seam:end, centre + dx] *= k


def build_atlas(cfg, work):
    size = cfg['atlas']['size']
    circ = cfg['atlas']['circumference']
    length = cfg['atlas']['length']
    fabric = cfg['fabric']
    tile_m = fabric['tile']
    rep_u = circ / tile_m
    rep_v = length / tile_m
    if fabric.get('mode') == 'stripes':
        # The stripe goes straight into the pattern's own grid: there is no
        # swatch resampled up to atlas size, and no repeat seam to hide.
        atlas = weave.stripes(size, size, circ, fabric.get('period_mm', 5.2),
                              fabric.get('line_frac', .3),
                              fabric.get('dark', (62, 64, 61)),
                              fabric.get('light', (224, 226, 221)))
        _yoke(cfg, atlas, size, length)
        rng = np.random.default_rng(7)
        raw = rng.normal(0, 1.0, (size // 4, size // 4, 2)).astype(np.float32)
        raw = cv2.GaussianBlur(raw, (0, 0), 1.6)
        raw = np.repeat(np.repeat(raw, 4, 0), 4, 1)[:size, :size]
        nz = np.ones((size, size, 1), np.float32)
        nrm = np.concatenate([raw * .05, nz], 2)
        nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
        rgh = np.full((size, size), fabric.get('roughness', .88), np.float32)
        rgh += cv2.GaussianBlur(rng.normal(0, .012, (size, size)).astype(np.float32), (0, 0), 2)[:size, :size]
        Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).save(work / 'atlas.png')
        Image.fromarray(((np.clip(nrm, -1, 1) * .5 + .5) * 255).astype(np.uint8)).save(work / 'atlas-normal.png')
        Image.fromarray((np.clip(rgh, 0.6, .99) * 255).astype(np.uint8)).save(work / 'atlas-rough.png')
        print('atlas', atlas.shape, 'mean', atlas.reshape(-1, 3).mean(0).round(1))
        return
    if fabric.get('mode') == 'cable':
        atlas, nrm = weave.cable(size, size, circ, fabric.get('pitch_mm', 52.0),
                                 fabric.get('ply_mm', 13.0),
                                 fabric.get('height_mm', 3.0),
                                 fabric.get('slope', 1.3), fabric.get('rope_w', .86),
                                 tuple(fabric.get('tone', (23, 23, 25))),
                                 fabric.get('contrast', .16))
        nrm = nrm * 2 - 1
        rgh = np.full((size, size), fabric.get('roughness', .92), np.float32)
        Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).save(work / 'atlas.png')
        Image.fromarray(((np.clip(nrm, -1, 1) * .5 + .5) * 255).astype(np.uint8)).save(work / 'atlas-normal.png')
        Image.fromarray((np.clip(rgh, .6, .99) * 255).astype(np.uint8)).save(work / 'atlas-rough.png')
        print('atlas', atlas.shape, 'mean', atlas.reshape(-1, 3).mean(0).round(1))
        return
    color = np.asarray(Image.open(work / 'tile-color.png').convert('RGB')).astype(np.float32)
    normal = np.asarray(Image.open(work / 'tile-normal.png').convert('RGB')).astype(np.float32) / 255.0 * 2 - 1
    rough = np.asarray(Image.open(work / 'tile-rough.png').convert('L')).astype(np.float32) / 255.0

    # One repeat in atlas texels, then mirrored across the atlas.
    base = Image.fromarray(color.astype(np.uint8)).resize(
        (max(8, int(round(size / rep_u))), max(8, int(round(size / rep_v)))), Image.LANCZOS)
    base = np.asarray(base).astype(np.float32)
    atlas = tiled(base, rep_v / 2 + 1, rep_u / 2 + 1)[:size, :size]
    nb = Image.fromarray(((normal * .5 + .5) * 255).astype(np.uint8)).resize(
        (base.shape[1], base.shape[0]), Image.LANCZOS)
    nb = np.asarray(nb).astype(np.float32) / 255.0 * 2 - 1
    nrm = tiled(nb, rep_v / 2 + 1, rep_u / 2 + 1)[:size, :size]
    rb = Image.fromarray((rough * 255).astype(np.uint8)).resize(
        (base.shape[1], base.shape[0]), Image.LANCZOS)
    rb = np.asarray(rb).astype(np.float32) / 255.0
    rgh = tiled(rb[..., None], rep_v / 2 + 1, rep_u / 2 + 1)[:size, :size, 0]

    atlas = draw_decals(cfg, atlas, size, circ, length)

    # The body's u=0 and u=1 are the same centre-front seam; the atlas must
    # meet itself there or a bright line runs down the chest.
    def wrap_seam(img, n=32):
        w = np.linspace(0, 1, n).reshape((1, n) + (1,) * (img.ndim - 2))
        img[:, -n:] = img[:, -n:] * (1 - w) + img[:, :n] * w
        return img
    atlas = wrap_seam(atlas)
    nrm = wrap_seam(nrm)
    rgh = wrap_seam(rgh[..., None])[..., 0]
    Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8)).save(work / 'atlas.png')
    Image.fromarray(((np.clip(nrm, -1, 1) * .5 + .5) * 255).astype(np.uint8)).save(work / 'atlas-normal.png')
    Image.fromarray((rgh * 255).astype(np.uint8)).save(work / 'atlas-rough.png')
    print('atlas', atlas.shape, 'mean', atlas.reshape(-1, 3).mean(0).round(1),
          'normal mean', nrm.reshape(-1, 3).mean(0).round(2))


def jpeg(img, quality=88, gray=False):
    mode = 'L' if gray else 'RGB'
    buf = io.BytesIO()
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), mode).save(buf, 'JPEG', quality=quality)
    return buf.getvalue()


def compute_normals(pos, idx):
    n = np.zeros_like(pos)
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    face = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, idx[:, k], face)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return (n / np.maximum(ln, 1e-9)).astype(np.float32)


class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.images, self.textures = [], [], [], []
        self.materials, self.nodes, self.meshes = [], [], []

    def pad(self):
        while len(self.bin) % 4:
            self.bin.append(0)

    def view(self, payload, target=None):
        self.pad()
        offset = len(self.bin)
        self.bin += payload
        v = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload)}
        if target:
            v['target'] = target
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, array, kind, target=None, typ=None, minmax=False):
        array = np.ascontiguousarray(array)
        view = self.view(array.tobytes(), target)
        comp = {np.float32: 5126, np.uint16: 5123, np.uint32: 5125}[array.dtype.type]
        count = array.shape[0] if array.ndim > 1 else array.size
        acc = {'bufferView': view, 'componentType': comp, 'count': int(count),
               'type': typ if array.ndim > 1 else 'SCALAR'}
        if minmax:
            acc['min'] = [float(x) for x in array.min(0)]
            acc['max'] = [float(x) for x in array.max(0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def image(self, payload, mime):
        view = self.view(payload)
        self.images.append({'bufferView': view, 'mimeType': mime})
        return len(self.images) - 1

    def texture(self, image, sampler=0):
        self.textures.append({'sampler': sampler, 'source': image})
        return len(self.textures) - 1


def build_glb(cfg, work):
    data = np.load(work / 'pieces.npz')
    meta = [json.loads(s) for s in data['meta']]
    g = Gltf()
    g.samplers = [
        {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497},
        {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33648, 'wrapT': 33648},
    ]

    def tex_from(path, mode='RGB', quality=90, sampler=0):
        img = np.asarray(Image.open(path).convert(mode))
        return g.texture(g.image(jpeg(img, quality, gray=(mode == 'L')), 'image/jpeg'), sampler)

    def photo_material(name, colour_path, normal_path, rough_path, gain, sampler=0, normal_scale=1.0):
        c = tex_from(colour_path, 'RGB', 92, sampler)
        n = tex_from(normal_path, 'RGB', 88, sampler)
        r = np.asarray(Image.open(rough_path).convert('L'))
        mr = np.zeros(r.shape + (3,), np.uint8)
        mr[:, :, 1] = r
        m = g.texture(g.image(jpeg(mr, 88), 'image/jpeg'), sampler)
        g.materials.append({
            'name': name, 'doubleSided': True,
            'pbrMetallicRoughness': {
                'baseColorFactor': list(gain) + [1.0],
                'baseColorTexture': {'index': c},
                'metallicRoughnessTexture': {'index': m},
                'metallicFactor': 0.0, 'roughnessFactor': 1.0,
            },
            'normalTexture': {'index': n, 'scale': normal_scale},
        })
        return len(g.materials) - 1

    gain = cfg.get('gain', [1, 1, 1])
    mat_atlas = photo_material(cfg['id'] + ' body photo', work / 'atlas.png',
                               work / 'atlas-normal.png', work / 'atlas-rough.png',
                               gain, 0, cfg.get('normal_scale', 1.0))
    mat_tile = photo_material(cfg['id'] + ' cloth photo', work / 'tile-color.png',
                              work / 'tile-normal.png', work / 'tile-rough.png',
                              gain, 1, cfg.get('normal_scale', 1.0))
    rib_gain = [x * .96 for x in gain]
    if cfg.get('rib'):
        # Every band on a knit is a 2x2 rib: a swatch of rounded columns, so
        # the hem and cuffs do not wear the body's cable or fleece.
        rib = cfg['rib']
        rib_px = int(rib.get('px', 256))
        colour, normal = weave.rib(rib_px, rib_px, rib.get('tile', .045),
                                   rib.get('period_mm', 5.0), tuple(rib['tone']),
                                   depth=rib.get('depth', .35))
        Image.fromarray(colour.astype(np.uint8)).save(work / 'rib-color.png')
        Image.fromarray((normal * 255).astype(np.uint8)).save(work / 'rib-normal.png')
        Image.fromarray(np.full((rib_px, rib_px), rib.get('roughness', .92) * 255, np.uint8)).save(work / 'rib-rough.png')
        mat_rib = photo_material(cfg['id'] + ' rib knit', work / 'rib-color.png',
                                 work / 'rib-normal.png', work / 'rib-rough.png',
                                 gain, 1, cfg.get('normal_scale', 1.0))
    else:
        mat_rib = photo_material(cfg['id'] + ' rib photo', work / 'tile-color.png',
                                 work / 'tile-normal.png', work / 'tile-rough.png',
                                 rib_gain, 1, cfg.get('normal_scale', 1.0))

    def plain(name, rgb, rough=.9, metal=0.0):
        g.materials.append({'name': name, 'doubleSided': True,
                            'pbrMetallicRoughness': {'baseColorFactor': list(rgb) + [1.0],
                                                     'metallicFactor': metal, 'roughnessFactor': rough}})
        return len(g.materials) - 1

    mat_thread = plain('tonal topstitch', [c / 255 * .92 for c in cfg.get('thread', (235, 235, 233))], .86)
    mat_button = plain('resin button', [c / 255 for c in cfg.get('button', (23, 23, 24))], .5)
    mat_metal = plain('antique nickel', [.58, .57, .55], .36, .8)
    groups = cfg['pieces']
    lookup = {}
    for mat, names in (('atlas', groups.get('atlas', [])), ('tile', groups.get('tile', [])),
                       ('rib', groups.get('rib', [])), ('thread', groups.get('thread', [])),
                       ('metal', groups.get('metal', [])), ('button', groups.get('button', []))):
        for n in names:
            lookup[n] = mat
    material_index = {'atlas': mat_atlas, 'tile': mat_tile, 'rib': mat_rib,
                      'thread': mat_thread, 'metal': mat_metal, 'button': mat_button}
    rep_u, rep_v = cfg.get('sleeve_repeat', [4.0, 5.0])
    piece_repeat = cfg.get('piece_repeat', {})

    for i, m in enumerate(meta):
        pos = data[f'p{i}_pos'].astype(np.float32)
        idx = data[f'p{i}_idx'].astype(np.uint32).reshape(-1, 3)
        arm = m['frame'][:3] == 'arm'
        tag = lookup.get(m['name'], 'tile')
        uv = data.get(f'p{i}_uv')
        if uv is None:
            uv = np.zeros((len(pos), 2), np.float32)
        else:
            uv = uv.astype(np.float32).copy()
            uv[:, 1] = 1.0 - uv[:, 1]        # v runs down from the apex
            if tag == 'atlas':
                uv = np.clip(uv, 0, 1)
            elif tag in ('tile', 'rib'):
                ru, rv = piece_repeat.get(m['name'], (rep_u, rep_v))
                uv = np.stack([uv[:, 0] * ru, uv[:, 1] * rv], 1)
        if arm:
            # Assemble the sleeves onto the shoulders, as the builder hangs them.
            side = 1 if m['frame'] == 'arm1' else -1
            pos = pos + np.array([0.18 * side, 1.402, 0.0], np.float32)
        nrm = compute_normals(pos, idx)
        dtype = np.uint16 if len(pos) < 65536 else np.uint32
        prim = {
            'attributes': {
                'POSITION': g.accessor(pos, 'POSITION', 34962, 'VEC3', True),
                'NORMAL': g.accessor(nrm, 'NORMAL', 34962, 'VEC3'),
                'TEXCOORD_0': g.accessor(uv, 'TEXCOORD_0', 34962, 'VEC2'),
            },
            'indices': g.accessor(idx.reshape(-1).astype(dtype), 'INDICES', 34963),
            'material': material_index[tag], 'mode': 4,
        }
        node = {'mesh': len(g.meshes), 'name': f"{m['name']}#{i}"}
        g.meshes.append({'name': f"{m['name']}#{i}", 'primitives': [prim]})
        g.nodes.append(node)

    gltf = {
        'asset': {'version': '2.0', 'generator': 'Selfit 2.0 photo top builder'},
        'scene': 0,
        'scenes': [{'nodes': list(range(len(g.nodes)))}],
        'nodes': g.nodes, 'meshes': g.meshes, 'materials': g.materials,
        'textures': g.textures, 'images': g.images, 'samplers': g.samplers,
        'accessors': g.accessors, 'bufferViews': g.views,
        'buffers': [{'byteLength': len(g.bin)}], 'extensionsUsed': [],
    }
    g.pad()
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(g.bin)
    out = bytearray()
    out += struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(g.bin), 0x004E4942) + bytes(g.bin)
    asset = ROOT / 'assets' / f"{cfg['id']}.glb"
    asset.parent.mkdir(parents=True, exist_ok=True)
    asset.write_bytes(out)
    print('wrote', asset, len(out), 'bytes;', len(g.meshes), 'pieces')


def main(name):
    cfg = json.loads((CONFIGS / f'{name}.json').read_text())
    work = ROOT / '.devtest' / 'photo-top' / cfg['id']
    build_atlas(cfg, work)
    build_glb(cfg, work)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'nike-sport-tee-white')
