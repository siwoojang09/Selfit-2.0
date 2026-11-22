# Render the measured denim from several angles for visual inspection.
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
    c.set_memory_limit(2 << 30)
    c.set_max_stack_size(8 << 20)
    c.eval("globalThis.console = { log(){}, info(){}, warn(){}, error(){ globalThis.__consoleErrors.push(Array.prototype.map.call(arguments, String).join(' ')); } }; globalThis.__consoleErrors = [];")
    c.eval(B64)
    c.eval((work / 'bundle.js').read_text())
    c.eval("globalThis.__clock = 0;")
    return c

def scene(c, opts_js, w=760, h=1000):
    return c.eval(f'''(() => {{
      try {{
        const canvases = [];
        const container = {{ clientWidth: {w}, clientHeight: {h}, style: {{}},
          appendChild(node) {{ if (node && node.getContext) canvases.push(node); }}, removeChild() {{}} }};
        globalThis.__opts = {opts_js};
        globalThis.__sceneObj = globalThis.__createScene(container, globalThis.__opts);
        globalThis.__canvases = canvases;
        return 'created';
      }} catch (e) {{ return 'ERR ' + e + ' STACK ' + ((e && e.stack) || '').slice(0, 900); }}
    }})()''')

def run(c, n=1):
    for _ in range(n):
        r = c.eval('''(() => {
          const cb = globalThis.__raf; globalThis.__raf = null;
          if (!cb) return 'no raf';
          globalThis.__clock += 16.7; cb(globalThis.__clock);
          return 'ok';
        })()''')
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
views = [('front', 'front', 1), ('pants', 'pants', 1), ('side', 'side', 1), ('back', 'back', 1)]
if len(sys.argv) > 1:
    views = []
    for a in sys.argv[1].split(','):
        parts = a.split(':')
        views.append((parts[0], parts[1] if len(parts) > 1 else parts[0],
                      float(parts[2]) if len(parts) > 2 else 1))
prefix = 'probe'
for label, view, zoom in views:
    c = boot()
    dbg = ", pants:{ id:'washed-denim-medium-blue', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28}, debugShell:true }" if 'shell' in label else ''
    if dbg:
        r = scene(c, "{ pants: { id:'washed-denim-medium-blue', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28}, debugShell:true }, size:'M', model:'female'" + f", view:'{view}', zoom:{zoom}, playing:false, walking:false }}")
    else:
        r = scene(c, BASE + f", view:'{view}', zoom:{zoom}, playing:false, walking:false }}")
    if r != 'created':
        print(r); break
    run(c, 9)
    p = capture(c, work / f'..' / f'{prefix}-{label}.png')
    print('saved', p.name, c.eval('JSON.stringify(globalThis.__sceneObj.stats())'))
    err = c.eval('JSON.stringify(globalThis.__consoleErrors)')
    if err != '[]':
        print('  console:', err)
