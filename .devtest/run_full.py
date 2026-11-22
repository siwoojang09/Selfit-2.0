# Full headless run: denim jeans view + adidas hoodie view, frames captured to PNG.
import base64, pathlib, time
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
globalThis.__b64 = function(u8){const parts=[];let i=0;const n=u8.length;for(;i+2<n;i+=3){const v=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+B64C[v&63]);}const rest=n-i;if(rest===1){const v=u8[i]<<16;parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+'==');}else if(rest===2){const v=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+'=');}return parts.join('');};
"""

ctx = quickjs.Context()
ctx.set_memory_limit(2 << 30)
ctx.set_max_stack_size(8 << 20)
ctx.eval("globalThis.console = { log(){}, info(){}, warn(){}, error(){ globalThis.__consoleErrors.push(Array.prototype.map.call(arguments, String).join(' ')); } }; globalThis.__consoleErrors = [];")
ctx.eval(B64)
ctx.eval((work / 'bundle.js').read_text())
ctx.eval("globalThis.__trace = () => {};")

def pump(seconds=1.0):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if not ctx.execute_pending_job():
            break

# simpler: track clock in JS
ctx.eval('globalThis.__clock = 0;')
def frames(n):
    try:
        return ctx.eval(f'''(() => {{
          for (let i = 0; i < {n}; i++) {{
            const cb = globalThis.__raf; globalThis.__raf = null;
            if (!cb) return 'no raf';
            globalThis.__clock += 16.7; cb(globalThis.__clock);
          }}
          return 'ok clock=' + Math.round(globalThis.__clock);
        }})()''')
    except Exception as e:
        return 'EXC ' + str(e)

def start_scene(opts_js):
    return ctx.eval(f'''(() => {{
      try {{
        const canvases = [];
        const container = {{ clientWidth: 700, clientHeight: 950, style: {{}},
          appendChild(node){{ if (node && node.getContext) canvases.push(node); }}, removeChild(){{}} }};
        globalThis.__sceneObj = globalThis.__createScene(container, {opts_js});
        globalThis.__canvases = canvases;
        return 'created ' + canvases.length;
      }} catch (e) {{ return 'ERR ' + e + ' STACK ' + (e && e.stack || '').slice(0,400); }}
    }})()''')

def capture(label):
    w = int(ctx.eval('globalThis.__canvases[globalThis.__canvases.length-1].width'))
    h = int(ctx.eval('globalThis.__canvases[globalThis.__canvases.length-1].height'))
    b64 = str(ctx.eval(f"__b64(globalThis.__canvases[globalThis.__canvases.length-1]._ctx._pixels, 0, 0)"))
    arr = np.frombuffer(base64.b64decode(b64), dtype=np.uint8).reshape(h, w, 4)
    out = pathlib.Path('/workspace/projects/selfit-2/.devtest') / f'render_{label}.png'
    Image.fromarray(arr[:, :, :3]).save(out)
    print('saved', out.name, w, 'x', h, flush=True)

print('--- denim pants view', flush=True)
print(start_scene("{ pants: { id:'washed-denim-medium-blue', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} }, size:'M', model:'female', view:'pants', playing:false, walking:false }"), flush=True)
pump(20)
print(frames(8), flush=True)
print('stats:', ctx.eval('JSON.stringify(globalThis.__sceneObj.stats())'), flush=True)
capture('denim-pants')

print('--- adidas hoodie view', flush=True)
print(start_scene("{ sample: { id:'KC9315', type:'ziphoodie', category:'outer', color:'#1d1c20', material:'cotton', measurements:{length:62, shoulder:62, chest:60.5, sleeve:58, hem:50.5} }, model:'female', view:'fit', playing:false, walking:false }"), flush=True)
pump(25)
print(frames(8), flush=True)
print('stats:', ctx.eval('JSON.stringify(globalThis.__sceneObj.stats())'), flush=True)
capture('hoodie')

print('console errors:', ctx.eval('JSON.stringify(globalThis.__consoleErrors)'), flush=True)
