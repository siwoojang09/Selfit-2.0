# Diagnostic: paint a stripe pattern into the denim map texture and see how the
# software renderer samples it, to learn the effective resolution.
import base64, pathlib
import numpy as np
from PIL import Image
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
out = pathlib.Path('/workspace/projects/selfit-2/.devtest')
B64 = r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
globalThis.__b64=function(u8){const parts=[];let i=0;const n=u8.length;for(;i+2<n;i+=3){const v=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+B64C[v&63]);}const rest=n-i;if(rest===1){const v=u8[i]<<16;parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+'==');}else if(rest===2){const v=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+'=');}return parts.join('');};
"""
c = quickjs.Context()
c.set_memory_limit(2 << 30); c.set_max_stack_size(8 << 20)
c.eval("globalThis.console={log(){},info(){},warn(){},error(){globalThis.__e=(globalThis.__e||[]);globalThis.__e.push(Array.prototype.map.call(arguments,String).join(' '));}};")
c.eval(B64)
c.eval((work / 'bundle.js').read_text())
print(c.eval('''(() => {const cv=[];const k={clientWidth:700,clientHeight:950,style:{},appendChild(n){if(n&&n.getContext)cv.push(n);},removeChild(){}};
 const s=globalThis.__createScene(k,{pants:{id:'w',type:'pants',category:'bottom',color:'#596e74',material:'denim',measurements:{length:105,waist:39.5,hip:57,thigh:40,rise:37.5,hem:28}},size:'M',model:'female',view:'pants',playing:false,walking:false});
 globalThis.__s=s; globalThis.__cv=cv;
 const cb=globalThis.__raf; if(cb){globalThis.__raf=null;cb(16.7);}
 return 'ok ' + JSON.stringify(globalThis.__e||[]);})()'''))
# paint horizontal stripes (256 texels of 2048 => 8 bands) into the map canvas
print(c.eval('''(() => {
 const L=globalThis.__dbgLower; const m=L.map; const img=m.image;
 const w=img.width,h=img.height,d=img._ctx._pixels;
 for(let y=0;y<h;y++){ const band=Math.floor(y/(h/16))%2; const v=band?255:0;
   for(let x=0;x<w;x++){ const j=(y*w+x)*4; d[j]=d[j+1]=d[j+2]=v; d[j+3]=255; } }
 m.needsUpdate=true; L.needsUpdate=true;
 return 'painted v' + m.version;})()'''))
for i in range(3):
    c.eval("(()=>{const cb=globalThis.__raf;globalThis.__raf=null;if(!cb)return 'x';globalThis.__clock+=16.7;cb(globalThis.__clock);return 'ok';})()")
w = int(c.eval('globalThis.__cv[globalThis.__cv.length-1].width')); h = int(c.eval('globalThis.__cv[globalThis.__cv.length-1].height'))
b = str(c.eval("__b64(globalThis.__cv[globalThis.__cv.length-1]._ctx._pixels,0,0)"))
a = np.frombuffer(base64.b64decode(b), dtype=np.uint8).reshape(h, w, 4)
Image.fromarray(a[:, :, :3]).save(out / 'it_stripes.png')
print('saved stripes', a.shape)
