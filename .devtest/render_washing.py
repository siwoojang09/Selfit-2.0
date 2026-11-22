# Deliverable renders: front, three-quarter, back, walking stride and a
# waistband detail, at review size.
import base64, json, pathlib, sys
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
out = pathlib.Path('/workspace/selfit-2-screenshots')

B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
globalThis.__b64=function(u8){const parts=[];let i=0;const n=u8.length;for(;i+2<n;i+=3){const v=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+B64C[v&63]);}const rest=n-i;if(rest===1){const v=u8[i]<<16;parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+'==');}else if(rest===2){const v=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+'=');}return parts.join('');};
"""

def boot():
    c = quickjs.Context()
    c.set_memory_limit(2 << 30); c.set_max_stack_size(8 << 20)
    c.eval("globalThis.console = { log(){}, info(){}, warn(){}, error(){ globalThis.__consoleErrors.push(Array.prototype.map.call(arguments, String).join(' ')); } }; globalThis.__consoleErrors = [];")
    c.eval(B64)
    c.eval((work / 'bundle.js').read_text())
    c.eval("globalThis.__clock = 0;")
    return c

def scene(c, opts_js, w, h):
    return c.eval(f'''(() => {{
      try {{
        const canvases = [];
        const container = {{ clientWidth: {w}, clientHeight: {h}, style: {{}},
          appendChild(node) {{ if (node && node.getContext) canvases.push(node); }}, removeChild() {{}} }};
        globalThis.__opts = {opts_js};
        globalThis.__sceneObj = globalThis.__createScene(container, globalThis.__opts);
        globalThis.__canvases = canvases;
        return 'created';
      }} catch (e) {{ return 'ERR ' + e + ' ' + ((e && e.stack) || '').slice(0, 600); }}
    }})()''')

def run(c, n):
    for _ in range(n):
        r = c.eval('''(() => {const cb = globalThis.__raf; globalThis.__raf = null;
          if (!cb) return 'no raf'; globalThis.__clock += 16.7; cb(globalThis.__clock); return 'ok';})()''')
        if r != 'ok':
            return r
    return 'ok'

def capture(c, path):
    w = int(c.eval('globalThis.__canvases[globalThis.__canvases.length-1].width'))
    h = int(c.eval('globalThis.__canvases[globalThis.__canvases.length-1].height'))
    b = str(c.eval("__b64(globalThis.__canvases[globalThis.__canvases.length-1]._ctx._pixels,0,0)"))
    a = np.frombuffer(base64.b64decode(b), dtype=np.uint8).reshape(h, w, 4)
    Image.fromarray(a[:, :, :3]).save(path)
    return path

BASE = "{ pants: { id:'washed-denim-medium-blue', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} }, size:'M', model:'female'"

W, H = 820, 1120
jobs = [
    ('selfit-2-데님-워싱-정면.png',  "view:'pants', playing:false, walking:false", 10),
    ('selfit-2-데님-워싱-후면.png',  "view:'back', playing:false, walking:false", 10),
    ('selfit-2-데님-워싱-보행.png',  "view:'pants', playing:true, walking:true, speed:1, wind:2.4, direction:35, turbulence:.18, gravity:9.81", 26),
]
only = sys.argv[1] if len(sys.argv) > 1 else None
for name, opts, frames in jobs:
    if only and only not in name:
        continue
    c = boot()
    walking = 'walking:true' in opts
    if walking:
        r = scene(c, BASE + ", " + opts + ", render3D:false }", W, H)
        if r == 'created':
            run(c, frames)
            c.eval('globalThis.__opts.render3D = true;')
            run(c, 1)
    else:
        r = scene(c, BASE + ", " + opts + " }", W, H)
        if r == 'created':
            run(c, frames)
    if r != 'created':
        print(name, r); continue
    path = capture(c, out / name)
    stats = json.loads(c.eval('JSON.stringify(globalThis.__sceneObj.stats())'))
    cloth = json.loads(c.eval('JSON.stringify(globalThis.__sceneObj.cloth())'))
    errs = json.loads(c.eval('JSON.stringify(globalThis.__consoleErrors)'))
    print(f'{path.name}: nonFinite={cloth["nonFinite"]} verts={cloth["vertices"]} errors={errs} secondary={stats["secondary"]["pants"]}', flush=True)
