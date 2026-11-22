#!/usr/bin/env python3
"""Run a top's pattern headless and save its pieces for a photo-baked asset."""
import base64, json, pathlib, subprocess, sys
import numpy as np
import quickjs

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIGS = ROOT / 'tools/photo-top/configs'


def main(name):
    cfg = json.loads((CONFIGS / f'{name}.json').read_text())
    work = ROOT / '.devtest' / 'photo-top' / cfg['id']
    work.mkdir(parents=True, exist_ok=True)
    bundle = work / 'dump.bundle.js'
    subprocess.run([
        '/workspace/esbuild', str(ROOT / 'tools/photo-top/dump.mjs'),
        '--bundle', '--format=iife', '--platform=browser', '--log-level=error',
        f'--outfile={bundle}'
    ], check=True)
    ctx = quickjs.Context()
    ctx.set_memory_limit(2 << 30)
    ctx.set_max_stack_size(16 << 20)
    ctx.eval("globalThis.console={log(){},info(){},warn(){},error(){}};")
    ctx.eval(bundle.read_text())
    payload = {'id': cfg['id'], 'type': cfg['type'], 'category': cfg.get('category', 'top'),
               'color': cfg['color'], 'material': cfg.get('material', 'cotton'),
               'pattern': cfg.get('pattern', ''), 'measurements': cfg['measurements']}
    data = json.loads(str(ctx.eval(f'__dumpTop({json.dumps(payload)})')))

    def f32(s):
        return np.frombuffer(base64.b64decode(s), dtype='<f4')

    def u32(s):
        return np.frombuffer(base64.b64decode(s), dtype='<u4')

    out, meta = {}, []
    for i, piece in enumerate(data['pieces']):
        key = f'p{i}'
        out[key + '_pos'] = f32(piece['pos']).reshape(-1, 3)
        if piece['uv']:
            out[key + '_uv'] = f32(piece['uv']).reshape(-1, 2)
        out[key + '_idx'] = u32(piece['idx'])
        meta.append({k: piece[k] for k in ('name', 'frame', 'material', 'count')})
    out['meta'] = np.array([json.dumps(m) for m in meta])
    np.savez_compressed(work / 'pieces.npz', **out)
    print(cfg['id'], 'pieces', len(meta), 'verts', sum(m['count'] for m in meta))
    for m in meta:
        print(f"  {m['count']:6d}  {m['frame']:5s}  {m['name']}")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'nike-sport-tee-white')
