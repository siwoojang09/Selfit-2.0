# Offline harness: runs the pure generators from fabric-pbr.mjs inside QuickJS so
# the maps can be inspected as images without a browser.
import quickjs
import numpy as np
import pathlib, re, base64, json

root = pathlib.Path('/workspace/projects/selfit-2')
src = (root / 'fabric-pbr.mjs').read_text()
body = re.sub(r'^\s*import[^;]*;\s*$', '', src, flags=re.M).replace('export ', '')

twill = np.load(root / '.devtest/twill_lum.npy')
knit = np.load(root / '.devtest/knit_lum.npy')

B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(u8){const parts=[];let i=0;for(;i+2<u8.length;i+=3){const n=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(n>>18)&63]+B64C[(n>>12)&63]+B64C[(n>>6)&63]+B64C[n&63]);}const rest=u8.length-i;if(rest===1){const n=u8[i]<<16;parts.push(B64C[(n>>18)&63]+B64C[(n>>12)&63]+'==');}else if(rest===2){const n=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(n>>18)&63]+B64C[(n>>12)&63]+B64C[(n>>6)&63]+'=');}return parts.join('');}
"""

def ints(arr):
    return json.dumps((np.clip(arr, 0, 1) * 255).round().astype(np.uint8).flatten().tolist())

# 1. weave surface for the hoodie knit (256x256 tile)
ctx = quickjs.Context()
ctx.set_time_limit(120)
ctx.eval(body + B64 + f"""
globalThis.KNIT = {ints(knit)};
function weaveTest(lumArr, w, h){{
  const rgba = new Uint8ClampedArray(w*h*4);
  for (let i=0;i<w*h;i++){{ rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=lumArr[i]; rgba[i*4+3]=255; }}
  const s = weaveSurface(rgba, w, h, {{radius:1, strength:1.25, contrast:.14, crown:-1}});
  globalThis.KNORMAL = b64(s.normal); globalThis.KROUGH = b64(s.roughness); globalThis.KMEAN = s.roughnessMean;
}}
weaveTest(globalThis.KNIT, 256, 256);
""")
for key, name in (('KNORMAL', 'normal'), ('KROUGH', 'rough')):
    arr = np.frombuffer(base64.b64decode(ctx.get(key)), dtype=np.uint8).reshape(256, 256, 4)
    np.save(root / f'.devtest/knit_{name}.npy', arr)
print('knit roughness mean', ctx.get('KMEAN'))

# 2. denim surface with the photographed twill
ctx2 = quickjs.Context()
ctx2.set_time_limit(180)
ctx2.eval(body + B64 + f"""
globalThis.TWILL = {ints(twill)};
globalThis.TW = {{field: null, width: 512, height: 512}};
function prep(){{ const f=new Float32Array(512*512); for(let i=0;i<f.length;i++) f[i]=globalThis.TWILL[i]/255; globalThis.TW.field=f; }}
prep();
const t0 = Date.now();
const s = denimSurface({{width: 512, height: 1024, across: .68, along: 1.03, mottle: globalThis.TW}});
globalThis.DMAP = b64(s.map); globalThis.DNORMAL = b64(s.normal); globalThis.DROUGH = b64(s.roughness);
globalThis.DMEAN = s.roughnessMean; globalThis.DSHADE = s.meanShade; globalThis.DTILE = s.ridgePitch; globalThis.DMS = Date.now()-t0;
""")
W, H = 512, 1024
for key, name in (('DMAP', 'map'), ('DNORMAL', 'normal'), ('DROUGH', 'rough')):
    arr = np.frombuffer(base64.b64decode(ctx2.get(key)), dtype=np.uint8).reshape(H, W, 4)
    np.save(root / f'.devtest/denim_{name}.npy', arr)
print('denim rough mean %.4f shade mean %.4f tile %.3f ms %s' % (ctx2.get('DMEAN'), ctx2.get('DSHADE'), ctx2.get('DTILE'), ctx2.get('DMS')))
