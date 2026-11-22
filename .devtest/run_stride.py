# Walking-stride check.
#  A) Physics pass (software renderer off): the denim jeans and the adidas hoodie
#     walk 64 frames; at several stride frames we read the secondary-motion
#     metrics and the live positions of the hem/cuff ring. The same stride is
#     then replayed with the solver switched off, and the two ring positions are
#     compared: that difference is the fabric's own displacement.
#  B) Picture pass (renderer on, a few frames only): one mid-stride frame for
#     each garment, with physics on and off, plus the pixel difference.
import base64, json, pathlib
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
outdir = pathlib.Path('/workspace/projects/selfit-2/.devtest')

B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
globalThis.__b64 = function(u8){const parts=[];let i=0;const n=u8.length;for(;i+2<n;i+=3){const v=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+B64C[v&63]);}const rest=n-i;if(rest===1){const v=u8[i]<<16;parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+'==');}else if(rest===2){const v=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+'=');}return parts.join('');};
"""

PANTS = "{ pants: { id:'washed-denim-medium-blue', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} }, size:'M', model:'female', view:'pants', playing:true, walking:true, speed:1, wind:2.4, direction:35, turbulence:.18, gravity:9.81"
HOODIE = "{ sample: { id:'KC9315', type:'ziphoodie', category:'outer', color:'#1d1c20', material:'cotton', measurements:{length:62, shoulder:62, chest:60.5, sleeve:58, hem:50.5} }, model:'female', view:'fit', playing:true, walking:true, speed:1, wind:2.4, direction:35, turbulence:.18, gravity:9.81"


def boot():
    ctx = quickjs.Context()
    ctx.set_memory_limit(2 << 30)
    ctx.set_max_stack_size(8 << 20)
    ctx.eval("globalThis.console = { log(){}, info(){}, warn(){}, error(){ globalThis.__consoleErrors.push(Array.prototype.map.call(arguments, String).join(' ')); } }; globalThis.__consoleErrors = [];")
    ctx.eval(B64)
    ctx.eval((work / 'bundle.js').read_text())
    ctx.eval("globalThis.__clock = 0;")
    return ctx


def scene(ctx, opts_js):
    return ctx.eval(f'''(() => {{
      try {{
        const canvases = [];
        const container = {{ clientWidth: 560, clientHeight: 780, style: {{}},
          appendChild(node) {{ if (node && node.getContext) canvases.push(node); }}, removeChild() {{}} }};
        globalThis.__opts = {opts_js};
        globalThis.__sceneObj = globalThis.__createScene(container, globalThis.__opts);
        globalThis.__canvases = canvases;
        return 'created';
      }} catch (e) {{ return 'ERR ' + e + ' STACK ' + (e && e.stack || '').slice(0, 500); }}
    }})()''')


def run(ctx):
    return ctx.eval('''(() => {
      const cb = globalThis.__raf; globalThis.__raf = null;
      if (!cb) return 'no raf';
      globalThis.__clock += 16.7; cb(globalThis.__clock);
      return 'ok';
    })()''')


def poke(ctx, expr):
    return json.loads(ctx.eval(f'JSON.stringify({expr})'))


def capture(ctx, label):
    w = int(ctx.eval('globalThis.__canvases[globalThis.__canvases.length-1].width'))
    h = int(ctx.eval('globalThis.__canvases[globalThis.__canvases.length-1].height'))
    b64 = str(ctx.eval("__b64(globalThis.__canvases[globalThis.__canvases.length-1]._ctx._pixels, 0, 0)"))
    arr = np.frombuffer(base64.b64decode(b64), dtype=np.uint8).reshape(h, w, 4)
    img = Image.fromarray(arr[:, :, :3])
    path = outdir / f'stride_{label}.png'
    img.save(path)
    return path, np.asarray(img, dtype=np.int16)


def physics_pass(label, base_opts, frames=64, marks=(6, 16, 26, 36, 46)):
    print(f'--- {label}: walking pass (64 frames)', flush=True)
    result = {'label': label, 'frames': frames, 'marks': {}}
    ctx = boot()
    print('  ', scene(ctx, base_opts + ', clothPhysics:true, render3D:false }'), flush=True)
    for i in range(1, frames + 1):
        if run(ctx) != 'ok':
            print('  render loop stopped at', i, flush=True)
            break
        if i in marks:
            result['marks'][i] = {
                'cloth': poke(ctx, 'globalThis.__sceneObj.cloth()'),
                'probe': poke(ctx, 'globalThis.__sceneObj.probe()'),
                'stats': poke(ctx, 'globalThis.__sceneObj.stats()'),
            }
            c = result['marks'][i]['cloth']
            print(f"  frame {i:3d} t={result['marks'][i]['stats']['time']:.2f}s nonFinite={c['nonFinite']}",
                  flush=True)
            print(f"    pants {json.dumps(c['pants'])}", flush=True)
            print(f"    top   {json.dumps(c['top'])}", flush=True)
    result['errors'] = json.loads(ctx.eval('JSON.stringify(globalThis.__consoleErrors)'))
    print('  console errors:', result['errors'], flush=True)

    base = boot()
    print('  ', scene(base, base_opts + ', clothPhysics:false, render3D:false }'), flush=True)
    for i in range(1, frames + 1):
        if run(base) != 'ok':
            break
        if i in marks:
            result['marks'][i]['probeStatic'] = poke(base, 'globalThis.__sceneObj.probe()')
    for i, data in result['marks'].items():
        live, dead = data['probe'], data['probeStatic']
        # probe() returns {lower: [...], top: [...]}: compare every ring it holds.
        # probe() returns {lower: [...], top: [...]} where each group is a list
        # of rings, each ring a list of [x, y, z] samples.
        rings = lambda probe: [ring for group in (probe.values() if isinstance(probe, dict) else [probe])
                               for ring in (group or [])]
        travel, points, moved = 0.0, 0, 0
        for ringLive, ringDead in zip(rings(live), rings(dead)):
            for a, b in zip(ringLive, ringDead):
                va, vb = np.array(a, dtype=float), np.array(b, dtype=float)
                if va.shape != (3,) or vb.shape != (3,):
                    continue
                distance = float(np.linalg.norm(va - vb))
                travel = max(travel, distance)
                points += 1
                if distance > 1e-4:
                    moved += 1
        data['ringTravelMm'] = round(travel * 1000, 2)
        data['ringPoints'] = points
        data['ringPointsMoved'] = moved
        print(f"  frame {i:3d} hem/cuff ring moved {travel*1000:5.2f} mm "
              f"({moved}/{points} sampled vertices, vs pose-only)", flush=True)
    return result


def picture_pass(label, base_opts, frames=26):
    """One mid-stride frame rendered with the solver on and off."""
    print(f'--- {label}: stride frame render', flush=True)
    shots, opened = {}, {}
    for mode in (True, False):
        ctx = boot()
        scene(ctx, base_opts + f', clothPhysics:{str(mode).lower()}, render3D:false }}')
        for _ in range(frames):
            if run(ctx) != 'ok':
                break
        ctx.eval('globalThis.__opts.render3D = true;')
        run(ctx)
        path, pixels = capture(ctx, f'{label}-{"live" if mode else "static"}-f{frames}')
        opened[mode] = str(path)
        shots[mode] = pixels
        print('  saved', path.name, flush=True)
    diff = np.abs(shots[True] - shots[False]).sum(axis=2)
    changed = int((diff > 12).sum())
    height = diff.shape[0]
    lower = int((diff[int(height * .55):, :] > 12).sum())
    print(f'  pixels changed by secondary motion: {changed} total, {lower} in the lower body', flush=True)
    return {'label': label, 'frame': frames, 'paths': opened, 'pixelsChanged': changed,
            'pixelsChangedLowerBody': lower}


results = {'physics': [], 'pictures': []}
for label, opts in (('denim', PANTS), ('hoodie', HOODIE)):
    results['physics'].append(physics_pass(label, opts))
for label, opts, frame in (('denim', PANTS, 26), ('hoodie', HOODIE, 26)):
    results['pictures'].append(picture_pass(label, opts, frame))
pathlib.Path(outdir / 'stride_results.json').write_text(json.dumps(results, indent=1))
print('written', outdir / 'stride_results.json')
