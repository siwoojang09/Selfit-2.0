# Probe: is the denim wash map attached to the leg material, and what does it hold?
import json, pathlib
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
c = quickjs.Context()
c.set_memory_limit(2 << 30); c.set_max_stack_size(8 << 20)
c.eval("globalThis.console={log(){},info(){},warn(){},error(){globalThis.__e=(globalThis.__e||[]);globalThis.__e.push(Array.prototype.map.call(arguments,String).join(' '));}};")
c.eval((work / 'bundle.js').read_text())
r = c.eval('''(() => {
  const cv = [];
  const k = {clientWidth: 500, clientHeight: 700, style: {},
    appendChild(n){ if (n && n.getContext) cv.push(n); }, removeChild(){}};
  const scene = globalThis.__createScene(k, { pants: { id:'washed-denim-medium-blue', type:'pants', category:'bottom',
    color:'#596e74', material:'denim', measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} },
    size:'M', model:'female', view:'pants', playing:false, walking:false });
  globalThis.__s = scene; globalThis.__cv = cv;
  return 'ok';
})()''')
print('create', r)
print(c.eval('''(() => {
  const out = [];
  globalThis.__s && null;
  let n = 0;
  const visit = o => {
    if (!o) return;
    if (o.isMesh && o.material) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m.map || m.normalMap) {
        n++;
        if (n < 6) out.push({ name: o.name, hasMap: !!m.map, mapImg: m.map && (m.map.image ? (m.map.image.width + 'x' + m.map.image.height) : 'noimg'),
          normal: !!m.normalMap, rough: !!m.roughnessMap, color: m.color.getHexString(), wash: String(o.userData.measuredWash).slice(0, 40) });
      }
    }
    (o.children || []).forEach(visit);
  };
  visit(globalThis.__s.scene || window);
  return JSON.stringify(out);
})()'''))
