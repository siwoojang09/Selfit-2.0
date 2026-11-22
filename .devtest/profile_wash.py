# Profile the wash tone: print v-profiles at a few angles and tone percentiles.
import quickjs, pathlib, re, json
import numpy as np

root = pathlib.Path('/workspace/projects/selfit-2')
src = (root / 'fabric-pbr.mjs').read_text()
body = re.sub(r'^\s*import[^;]*;\s*$', '', src, flags=re.M).replace('export ', '')

ctx = quickjs.Context()
ctx.set_memory_limit(2 << 30)
ctx.eval(body + """
globalThis.PROF = (() => {
  const out = {};
  for (const u of [0, .02, .05, .10, .16, .22, .25, .30, .40, .45, .50, .55, .75]) {
    const row = [];
    for (let k = 0; k <= 100; k++) row.push(washAt(u, k / 100, 7, 1));
    out['u' + u] = row.map(x => Math.round(x * 1000) / 1000);
  }
  const vals = [];
  for (let y = 0; y < 448; y++) for (let x = 0; x < 448; x++) vals.push(washAt(x / 448, y / 448, 7, 1));
  vals.sort((a, b) => a - b);
  out.pct = [0, .01, .05, .25, .5, .75, .95, .99, 1].map(p => Math.round(vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] * 1000) / 1000);
  out.mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 1000) / 1000;
  return out;
})();
""")
prof = json.loads(ctx.eval('JSON.stringify(globalThis.PROF)'))
print('percentiles(0,1,5,25,50,75,95,99,100):', prof['pct'], 'mean', prof['mean'])
for key in ('u0', 'u0.05', 'u0.1', 'u0.16', 'u0.22', 'u0.25', 'u0.4', 'u0.5', 'u0.75'):
    row = prof[key]
    print(key.ljust(7), ' '.join(f'{v:.2f}' for v in row[::5]))
