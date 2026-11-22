# Run the headless bundle inside QuickJS, pump microtasks, collect rendered frames.
import base64, pathlib
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
bundle = (work / 'bundle.js').read_text()

B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function __b64(u8){const parts=[];let i=0;const n=u8.length;for(;i+2<n;i+=3){const v=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+B64C[v&63]);}const rest=n-i;if(rest===1){const v=u8[i]<<16;parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+'==');}else if(rest===2){const v=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+'=');}return parts.join('');}
globalThis.__b64 = __b64;
"""

ctx = quickjs.Context()
ctx.set_memory_limit(2 << 30)
ctx.set_max_stack_size(8 << 20)
ctx.set_time_limit(600)

ctx.eval("globalThis.console = { log: function(){}, info: function(){}, warn: function(){}, error: function(){ globalThis.__consoleErrors.push(Array.prototype.map.call(arguments, String).join(' ')); } }; globalThis.__consoleErrors = [];")
ctx.eval(bundle)
ctx.eval(B64)
print('bundle loaded, starting test...')
ctx.eval('globalThis.__testDone = false; globalThis.__runTest().then(r => { globalThis.__testResult = r; globalThis.__testDone = true; }, e => { globalThis.__testResult = ["fatal: " + e]; globalThis.__testDone = true; });')

pumps = 0
while not ctx.eval('globalThis.__testDone === true'):
    if ctx.execute_pending_job() is False:
        pumps += 1
        if pumps > 50:
            print('no more pending jobs and test not done — breaking')
            break
    else:
        pumps = 0

result = list(ctx.eval('globalThis.__testResult')) + list(ctx.eval('globalThis.__consoleErrors'))
print('errors/result:', result)
n = ctx.eval('globalThis.__FRAMES.length')
print('frames captured:', n)

outdir = pathlib.Path('/workspace/projects/selfit-2/.devtest')
for i in range(int(n)):
    label = str(ctx.eval(f'globalThis.__FRAMES[{i}].label'))
    w = int(ctx.eval(f'globalThis.__FRAMES[{i}].width'))
    h = int(ctx.eval(f'globalThis.__FRAMES[{i}].height'))
    b64 = str(ctx.eval(f'__b64(globalThis.__FRAMES[{i}].rgba, 0, 0)'))
    arr = np.frombuffer(base64.b64decode(b64), dtype=np.uint8).reshape(h, w, 4)
    Image.fromarray(arr[:, :, :3]).save(outdir / f'render_{label}.png')
    print('saved', f'render_{label}.png', w, 'x', h)
