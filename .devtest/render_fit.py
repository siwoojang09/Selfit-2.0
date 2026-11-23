# Render the shaped mannequin and the drawn patterns headless (QuickJS + software
# rasteriser), so the body and every garment can be judged without a browser.
import base64, pathlib, sys
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
out = pathlib.Path('/workspace/scratch/fit')
out.mkdir(parents=True, exist_ok=True)

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
      }} catch (e) {{ return 'ERR ' + e + ' ' + ((e && e.stack) || '').slice(0, 700); }}
    }})()''')


def run(c, n):
    for _ in range(n):
        r = c.eval('''(() => {const cb = globalThis.__raf; globalThis.__raf = null;
          if (!cb) return 'no raf'; globalThis.__clock += 16.7; cb(globalThis.__clock); return 'ok';})()''')
        if r != 'ok':
            return r
    return 'ok'


def capture(c, name):
    w = int(c.eval('globalThis.__canvases[globalThis.__canvases.length-1].width'))
    h = int(c.eval('globalThis.__canvases[globalThis.__canvases.length-1].height'))
    b = str(c.eval("__b64(globalThis.__canvases[globalThis.__canvases.length-1]._ctx._pixels,0,0)"))
    a = np.frombuffer(base64.b64decode(b), dtype=np.uint8).reshape(h, w, 4)
    p = out / f'{name}.png'
    Image.fromarray(a[:, :, :3]).save(p)
    return p


CHINO = "{ id:'drawn-chino', type:'pants', category:'bottom', color:'#c3b696', material:'cotton', measurements:{length:107, waist:39, hip:55, thigh:39.5, rise:36, hem:26} }"
DENIM = "{ id:'drawn-denim', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} }"
TEE = "{ id:'drawn-tee', type:'tee', category:'top', color:'#f4f4f2', material:'cotton', measurements:{length:71.5, shoulder:43.5, chest:50, sleeve:22.5, hem:48} }"
HOODIE = "{ id:'drawn-hoodie', type:'hoodie', category:'top', color:'#5b2029', material:'cotton', measurements:{length:65, shoulder:64, chest:63, sleeve:50} }"
ZIP = "{ id:'drawn-zip', type:'ziphoodie', category:'outer', color:'#1d1c20', material:'cotton', measurements:{length:62, shoulder:62, chest:60.5, sleeve:58, hem:50.5} }"
POLO = "{ id:'drawn-polo', type:'halfzip', category:'top', color:'#141416', material:'cotton', measurements:{length:67.5, shoulder:42.5, chest:52, sleeve:64} }"
SHIRT = "{ id:'drawn-shirt', type:'shirt', category:'top', color:'#b9bab4', material:'cotton', measurements:{length:69, shoulder:55, chest:64, sleeve:61} }"

W, H = 780, 1100
JOBS = {
    'body-female': ("{ bodyOnly:true, model:'female', playing:false, walking:false }", 12),
    'body-male': ("{ bodyOnly:true, model:'male', playing:false, walking:false }", 12),
    'chino-female': (f"{{ pants:{CHINO}, size:'M', model:'female', view:'pants', playing:false, walking:false }}", 14),
    'chino-female-back': (f"{{ pants:{CHINO}, size:'M', model:'female', view:'back', playing:false, walking:false }}", 14),
    'chino-male': (f"{{ pants:{CHINO}, size:'M', model:'male', view:'pants', playing:false, walking:false }}", 14),
    'denim-female': (f"{{ pants:{DENIM}, size:'M', model:'female', view:'pants', playing:false, walking:false }}", 14),
    'tee-female': (f"{{ sample:{TEE}, pants:{CHINO}, size:'M', model:'female', view:'fit', playing:false, walking:false }}", 16),
    'hoodie-female': (f"{{ sample:{HOODIE}, pants:{DENIM}, size:'M', model:'female', view:'fit', playing:false, walking:false }}", 16),
    'zip-female': (f"{{ sample:{ZIP}, pants:{CHINO}, size:'M', model:'female', view:'fit', playing:false, walking:false }}", 16),
    'polo-female': (f"{{ sample:{POLO}, pants:{CHINO}, size:'M', model:'female', view:'fit', playing:false, walking:false }}", 16),
    'shirt-female': (f"{{ sample:{SHIRT}, pants:{CHINO}, size:'M', model:'female', view:'fit', playing:false, walking:false }}", 16),
    'look-only': ("{ model:'female', view:'fit', playing:false, walking:false }", 14),
    'walk-chino-1': (f"{{ pants:{CHINO}, size:'M', model:'female', view:'pants', playing:true, walking:true }}", 22),
    'walk-chino-2': (f"{{ pants:{CHINO}, size:'M', model:'female', view:'pants', playing:true, walking:true }}", 30),
}

names = sys.argv[1:] or list(JOBS)
for name in names:
    opts, frames = JOBS[name]
    c = boot()
    r = scene(c, opts, W, H)
    if r != 'created':
        print(name, r[:600]); continue
    r = run(c, frames)
    p = capture(c, name)
    errors = c.eval('JSON.stringify(globalThis.__consoleErrors.slice(0,4))')
    print(name, '->', p, 'frames', r, errors if errors and errors!='[]' else '')
