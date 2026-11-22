# Quick iteration render: front view plus a thigh close-up, CPU end to end.
import base64, json, pathlib, sys, time
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
out = pathlib.Path('/workspace/projects/selfit-2/.devtest')
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
        globalThis.__sceneObj = globalThis.__createScene(container, {opts_js});
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
W, H = 700, 950
jobs = [
    ('it_front.png', "view:'pants', playing:false, walking:false"),
    ('it_back.png', "view:'back', playing:false, walking:false"),
    ('it_zoom_front.png', "view:'pants', zoom:2.6, playing:false, walking:false"),
    ('it_zoom_back.png', "view:'back', zoom:2.6, playing:false, walking:false"),
]
only = sys.argv[1] if len(sys.argv) > 1 else None
for name, opts in jobs:
    if only and only not in name:
        continue
    t0 = time.time()
    c = boot()
    r = scene(c, BASE + ", " + opts + " }", W, H)
    if r != 'created':
        print(name, r); continue
    run(c, 10)
    capture(c, out / name)
    errs = json.loads(c.eval('JSON.stringify(globalThis.__consoleErrors)'))
    print(f'{name}: {time.time()-t0:.1f}s errors={errs}', flush=True)
