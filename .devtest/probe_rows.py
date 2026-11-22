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
  const rows = [];
  for (let r = 0; r < 97; r += 8) {
    let maxX = 0, minY = 9, maxY = -9, zmin = 9, zmax = -9;
    for (let j = 0; j < 65; j++) {
      const k = (r * 65 + j) * 3;
      maxX = Math.max(maxX, Math.abs(a[k]));
      minY = Math.min(minY, a[k+1]); maxY = Math.max(maxY, a[k+1]);
      zmin = Math.min(zmin, a[k+2]); zmax = Math.max(zmax, a[k+2]);
    }
    rows.push([r, +(minY).toFixed(3), +(maxX*2000).toFixed(0), +((zmax-zmin)*1000).toFixed(0)]);
  }
  return JSON.stringify(rows);
})()'''))
