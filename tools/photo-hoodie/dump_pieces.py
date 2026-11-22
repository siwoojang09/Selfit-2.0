#!/usr/bin/env python3
"""Run the real adidas hoodie pattern builder headless and save its pieces.

esbuild bundles the modules for QuickJS (no DOM, no WebGL needed: only geometry
construction), then the JSON dump is decoded into an .npz for the texture and
GLB builders.
"""
import base64, json, pathlib, subprocess
import numpy as np
import quickjs

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / '.devtest' / 'photo-hoodie'
WORK.mkdir(parents=True, exist_ok=True)
BUNDLE = WORK / 'dump.bundle.js'

subprocess.run([
    '/workspace/esbuild', str(ROOT / 'tools/photo-hoodie/dump.mjs'),
    '--bundle', '--format=iife', '--platform=browser', '--log-level=warning',
    f'--outfile={BUNDLE}'
], check=True)

ctx = quickjs.Context()
ctx.set_memory_limit(2 << 30)
ctx.set_max_stack_size(16 << 20)
ctx.eval("globalThis.console={log(){},info(){},warn(){},error(){}};")
ctx.eval(BUNDLE.read_text())
raw = str(ctx.eval('__dumpHoodie()'))
data = json.loads(raw)


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
np.savez_compressed(WORK / 'pieces.npz', **out)
print('pieces', len(meta), 'verts', sum(m['count'] for m in meta))
for m in meta:
    print(f"  {m['count']:6d}  {m['frame']:5s}  {m['material']:18s}  {m['name']}")
