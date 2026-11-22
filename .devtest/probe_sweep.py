# Robustness sweep: every combination the fitting page can request must build
# and pose without errors or non-finite vertices.
import json, pathlib
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
B64 = r"""
globalThis.__b64=function(u8){const C='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let s='';for(let i=0;i<u8.length;i+=3){const a=u8[i],b=u8[i+1],c=u8[i+2];s+=C[a>>2]+C[((a&3)<<4)|((b|0)>>4)]+(i+1<u8.length?C[((b&15)<<2)|((c|0)>>6)]:'=')+(i+2<u8.length?C[c&63]:'=');}return s;};
"""
configs = [
    ("M denim", "{ length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28 }", "'female'", "null"),
    ("S denim", "{ length:102, waist:37, hip:55, thigh:38, rise:36, hem:27 }", "'female'", "null"),
    ("L denim", "{ length:107, waist:42, hip:59, thigh:42, rise:39, hem:29 }", "'female'", "null"),
    ("male M", "{ length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28 }", "'male'", "null"),
    ("tall person", "{ length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28 }", "'female'",
     "{height:190, waist:72, hip:100, chest:92}"),
    ("short person", "{ length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28 }", "'female'",
     "{height:160, waist:62, hip:86, chest:80}"),
    ("long length", "{ length:112, waist:39.5, hip:57, thigh:40, rise:34, hem:30 }", "'female'", "null"),
    ("short length", "{ length:92, waist:40, hip:58, thigh:41, rise:40, hem:26 }", "'female'", "null"),
]

for label, m, model, person in configs:
    c = quickjs.Context(); c.set_memory_limit(2 << 30); c.set_max_stack_size(8 << 20)
    c.eval("globalThis.console={log(){},info(){},warn(){},error(){globalThis.__e.push(Array.prototype.map.call(arguments,String).join(' '));}};globalThis.__e=[];")
    c.eval((work / 'bundle.js').read_text())
    r = c.eval(f'''(() => {{
      try {{
        const cv = [];
        const k = {{clientWidth:420,clientHeight:560,style:{{}},appendChild(n){{if(n&&n.getContext)cv.push(n);}},removeChild(){{}}}};
        globalThis.__clock = 0;
        globalThis.__s = globalThis.__createScene(k, {{ pants: {{ id:'x', type:'pants', category:'bottom', color:'#596e74', material:'denim',
          measurements:{m} }}, size:'M', model:{model}, person:{person}, view:'pants', playing:true, walking:true, speed:1, render3D:false }});
        for (let i = 0; i < 40; i++) {{ const cb = globalThis.__raf; globalThis.__raf = null; if (!cb) break; globalThis.__clock += 16.7; cb(globalThis.__clock); }}
        const cloth = globalThis.__s.cloth();
        return JSON.stringify({{ ok:true, nonFinite:cloth.nonFinite, verts:cloth.vertices, puck:cloth.pants }});
      }} catch (e) {{ return JSON.stringify({{ ok:false, err:String(e), stack:((e&&e.stack)||'').slice(0,300) }}); }}
    }})()''')
    errs = c.eval('JSON.stringify(globalThis.__e)')
    print(f'{label:14s}', r, 'errors=' + errs)

print(c.eval('JSON.stringify(globalThis.__s.stats())') if False else '')
