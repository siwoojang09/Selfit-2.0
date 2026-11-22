# Preview the denim wash map (colour, normal, roughness) as PNGs, plus a flat
# "front of leg" unwrap, so the wash can be judged without a GPU.
import quickjs, numpy as np, pathlib, re, base64, json
from PIL import Image

root = pathlib.Path('/workspace/projects/selfit-2')
src = (root / 'fabric-pbr.mjs').read_text()
body = re.sub(r'^\s*import[^;]*;\s*$', '', src, flags=re.M).replace('export ', '')

B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(u8){const parts=[];let i=0;for(;i+2<u8.length;i+=3){const n=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(n>>18)&63]+B64C[(n>>12)&63]+B64C[(n>>6)&63]+B64C[n&63]);}const rest=u8.length-i;if(rest===1){const n=u8[i]<<16;parts.push(B64C[(n>>18)&63]+B64C[(n>>12)&63]+'==');}else if(rest===2){const n=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(n>>18)&63]+B64C[(n>>12)&63]+B64C[(n>>6)&63]+'=');}return parts.join('');}
"""
W, H = 512, 1024
ctx = quickjs.Context()
ctx.set_memory_limit(2 << 30)
# optional photographed twill field
twill = root / '.devtest/twill_lum.npy'
mottle = ''
if twill.exists():
    arr = np.load(twill)
    h0, w0 = arr.shape
    vals = json.dumps((np.clip(arr, 0, 1) * 255).round().astype(np.uint8).flatten().tolist())
    mottle = f"""
globalThis.TW={{field:null,width:{w0},height:{h0}}};
(function(){{const a={vals};const f=new Float32Array(a.length);for(let i=0;i<a.length;i++)f[i]=a[i]/255;globalThis.TW.field=f;}})();
"""
ctx.eval(body + B64 + mottle + f"""
const s = denimSurface({{width:{W}, height:{H}, across:.68, along:1.03, mottle: globalThis.TW || null, fade:1}});
globalThis.DMAP=b64(s.map); globalThis.DNORMAL=b64(s.normal); globalThis.DROUGH=b64(s.roughness);
globalThis.DMEAN=s.roughnessMean; globalThis.DSHADE=s.meanShade;
""")
out = root / '.devtest'
for key, name in (('DMAP', 'wash_map'), ('DNORMAL', 'wash_normal'), ('DROUGH', 'wash_rough')):
    a = np.frombuffer(base64.b64decode(ctx.get(key)), dtype=np.uint8).reshape(H, W, 4)
    Image.fromarray(a[:, :, :3]).save(out / f'{name}.png')
    np.save(out / f'{name}.npy', a)
print('rough mean %.4f shade mean %.4f' % (ctx.get('DMEAN'), ctx.get('DSHADE')))

# Front unwrap: for a cylinder seen from the front, screen x = sin(angle), so the
# visible front half is u in [.75,1] + [0,.25]. Build a 2x-wide strip: left leg
# inner->outer is u .75..1..25 mapped through asin.
m = np.load(out / 'wash_map.npy')
img = np.zeros((H, W, 3), np.uint8)
for x in range(W):
    t = x / (W - 1)            # 0 = inner edge (-90deg) .. 1 = outer (+90deg)
    ang = (t - .5) * np.pi     # -90..90 degrees around the cylinder front
    u = ang / (2 * np.pi)
    col = int(round((u % 1.0) * W)) % W
    img[:, x] = m[:, col, :3]
Image.fromarray(img).save(out / 'wash_front_unwrap.png')

# Simulated flat colour: the CPU preview multiplies the map over the material
# colour in sRGB, so this is what the leg reads like before lighting.
import sys
BASE = '#596e74'
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 1.99
b = np.array([int(BASE[i:i+2], 16) for i in (1, 3, 5)], float) / 255
lin = ((b + .055) / 1.055) ** 2.4
lin = lin * SCALE
base = np.where(lin <= .0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - .055)
sim = np.clip(img.astype(float) / 255 * base * 255 * .78, 0, 255).astype(np.uint8)
Image.fromarray(sim).save(out / 'wash_front_sim.png')
st = np.clip((img.astype(float).mean(axis=2) / 255 - .36) / (.95 - .36), 0, 1)
Image.fromarray((st * 255).astype(np.uint8)).save(out / 'wash_front_unwrap_stretch.png')
print('wrote previews; base sRGB', (base * 255).round())
