import pathlib, quickjs
work = pathlib.Path('/workspace/projects/selfit-2/.devtest/work')
c = quickjs.Context(); c.set_memory_limit(2 << 30); c.set_max_stack_size(8 << 20)
c.eval("globalThis.console = { log(){}, info(){}, warn(){}, error(){} };")
c.eval((work / 'bundle.js').read_text())
print(c.eval('''(() => {
  const T = globalThis.__THREE;
  const group = new T.Group();
  const mat = new T.MeshPhysicalMaterial({color:'#596e74', side:T.DoubleSide});
  const body = globalThis.__makeMannequin(mat, 'female');
  body.pose(0, false);
  const opts = { pants: { id:'x', type:'pants', color:'#596e74', material:'denim',
    measurements:{length:105, waist:39.5, hip:57, thigh:40, rise:37.5, hem:28} },
    size:'M', model:'female', playing:false, walking:false };
  globalThis.__makeMeasuredPants(T, group, body, mat, opts);
  let shell = null;
  group.traverse(o => { if (o.isMesh && /shell/.test(o.name) && !shell) shell = o; });
  const a = shell.geometry.attributes.position.array;
  const rows = [0, 1, 2, 48, 94, 95, 96];
  const out = [];
  for (const r of rows) {
    const line = [];
    for (const j of [0, 16, 32, 48, 64]) {
      const k = (r * 65 + j) * 3;
      line.push([+a[k].toFixed(3), +a[k+1].toFixed(3), +a[k+2].toFixed(3)]);
    }
    out.push([r, line]);
  }
  return JSON.stringify(out);
})()'''))
