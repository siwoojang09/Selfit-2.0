# Inspect the rebuilt pants geometry: per-mesh bounds and vertex samples.
import json, pathlib
import quickjs

work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
c = quickjs.Context()
c.set_memory_limit(2 << 30); c.set_max_stack_size(8 << 20)
c.eval("globalThis.console = { log(){}, info(){}, warn(){}, error(){} };")
c.eval((work / 'bundle.js').read_text())
print(c.eval('''(() => {
  try {
    const T = globalThis.__THREE;
    const group = new T.Group();
    const mat = new T.MeshPhysicalMaterial({color:'#596e74', side:T.DoubleSide});
    const body = globalThis.__makeMannequin(mat, 'female');
    body.pose(0, false);
    const opts = { pants: { id:'x', type:'pants', color:'#596e74', material:'denim',
      measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} },
      size:'M', model:'female', playing:false, walking:false };
    const pants = globalThis.__makeMeasuredPants(T, group, body, mat, opts);
    const out = [];
    group.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      out.push([o.name, +b.min.x.toFixed(3), +b.max.x.toFixed(3), +b.min.y.toFixed(3), +b.max.y.toFixed(3), +b.min.z.toFixed(3), +b.max.z.toFixed(3), o.geometry.attributes.position.count]);
    });
    return JSON.stringify({ meshes: out, vertices: pants.vertices });
  } catch (e) { return 'ERR ' + e + ' ' + ((e && e.stack) || '').slice(0, 700); }
})()'''))
