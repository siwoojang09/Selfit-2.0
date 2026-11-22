# Ad-hoc frame probe: render one walking frame of a garment for inspection.
import base64, json, pathlib
import numpy as np
from PIL import Image
import quickjs
work=pathlib.Path('/workspace/projects/selfit-2/.devtest/work'); out=pathlib.Path('/workspace/projects/selfit-2/.devtest')
B64=r"""
const B64C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
globalThis.__b64=function(u8){const parts=[];let i=0;const n=u8.length;for(;i+2<n;i+=3){const v=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+B64C[v&63]);}const rest=n-i;if(rest===1){const v=u8[i]<<16;parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+'==');}else if(rest===2){const v=(u8[i]<<16)|(u8[i+1]<<8);parts.push(B64C[(v>>18)&63]+B64C[(v>>12)&63]+B64C[(v>>6)&63]+'=');}return parts.join('');};
"""
def boot():
    c=quickjs.Context(); c.set_memory_limit(2<<30); c.set_max_stack_size(8<<20)
    c.eval("globalThis.console={log(){},info(){},warn(){},error(){globalThis.__e.push(1);}};globalThis.__e=[];")
    c.eval(B64); c.eval((work/'bundle.js').read_text()); c.eval("globalThis.__clock=0;")
    return c
def scene(c,o):
    return c.eval(f'''(()=>{{const cv=[];const k={{clientWidth:560,clientHeight:780,style:{{}},appendChild(n){{if(n&&n.getContext)cv.push(n);}},removeChild(){{}}}};
      globalThis.__opts={o};globalThis.__s=globalThis.__createScene(k,globalThis.__opts);globalThis.__cv=cv;return 'ok';}})()''')
def run(c):
    return c.eval("(()=>{const cb=globalThis.__raf;globalThis.__raf=null;if(!cb)return 'x';globalThis.__clock+=16.7;cb(globalThis.__clock);return 'ok';})()")
def cap(c,label):
    w=int(c.eval('globalThis.__cv[globalThis.__cv.length-1].width'));h=int(c.eval('globalThis.__cv[globalThis.__cv.length-1].height'))
    b=str(c.eval("__b64(globalThis.__cv[globalThis.__cv.length-1]._ctx._pixels,0,0)"))
    a=np.frombuffer(base64.b64decode(b),dtype=np.uint8).reshape(h,w,4)
    Image.fromarray(a[:,:,:3]).save(out/f'{label}.png'); print('saved',label)
PANTS="{ pants: { id:'washed-denim-medium-blue', type:'pants', category:'bottom', color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} }, size:'M', model:'female', view:'pants', playing:true, walking:true, speed:1, wind:2.4, direction:35, turbulence:.18, gravity:9.81, render3D:false"
HOOD="{ sample: { id:'KC9315', type:'ziphoodie', category:'outer', color:'#1d1c20', material:'cotton', measurements:{length:62, shoulder:62, chest:60.5, sleeve:58, hem:50.5} }, model:'female', view:'fit', playing:true, walking:true, speed:1, wind:2.4, direction:35, turbulence:.18, gravity:9.81, render3D:false"
