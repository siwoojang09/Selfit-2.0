# Build the headless bundle: stub body-library (top-level await + fetch) with a
# synchronous parser over the real .bin data, embed decoded webp tiles, bundle
# with esbuild to a single IIFE QuickJS can evaluate.
import base64, json, pathlib, re, shutil, struct, subprocess

root = pathlib.Path('/workspace/projects/selfit-2')
work = root / '.devtest/work'
if work.exists():
    shutil.rmtree(work)
shutil.copytree(root, work, ignore=shutil.ignore_patterns('.git', '.devtest'))
stubs = root / '.devtest/stubs'
shutil.copytree(stubs, work / 'stubs')

# 1. body-library stub: parse the real anatomy binaries with Python, emit data URLs.
joint_names = ['pelvis', 'torso', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
               'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']
anatomy = {}
for model in ('female', 'male'):
    raw = (work / 'anatomy-assets' / f'{model}.bin').read_bytes()
    magic, = struct.unpack(">I", raw[:4]); vertices, indices = struct.unpack("<II", raw[4:12])
    assert magic == 0x44413031, hex(magic)
    assert len(raw) == 12 + 20 * vertices + 2 * indices
    anatomy[model] = {'b64': base64.b64encode(raw).decode(), 'vertices': vertices, 'indices': indices}

stub = work / 'body-library.mjs'
stub.write_text(f"""
import * as THREE from './vendor/three.module.js';

const jointNames = {json.dumps(joint_names)};
const DATA = {json.dumps(anatomy)};

function decodeBase64(s) {{
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let bits = 0, acc = 0, p = 0;
  for (let i = 0; i < s.length; i++) {{
    const v = C.indexOf(s[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {{ bits -= 8; out[p++] = (acc >> bits) & 255; }}
  }}
  return out.subarray(0, p);
}}

function loadAnatomy(model) {{
  const entry = DATA[model];
  const data = decodeBase64(entry.b64).buffer;
  const header = new DataView(data);
  const vertices = header.getUint32(4, true);
  const indices = header.getUint32(8, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data, 12, vertices * 3), 3));
  const joints = new Uint8Array(data, 12 + 12 * vertices, vertices * 4);
  const weights = new Uint8Array(data, 12 + 16 * vertices, vertices * 4);
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(data, 12 + 20 * vertices, indices), 1));
  geometry.computeVertexNormals();
  return {{ geometry, joints, weights, jointNames }};
}}

export const anatomyLibrary = {{ female: loadAnatomy('female'), male: loadAnatomy('male') }};
""")

# 2. embed the fabric tiles the tests load (base64 RGBA).
from PIL import Image
embedded = {}
for rel in ('textures/washed-jean-twill.webp', 'textures/kc9315-knit.webp', 'textures/kc9315-rib.webp', 'textures/kc9315-tape.webp'):
    im = Image.open(work / rel).convert('RGBA')
    raw = im.tobytes()
    embedded[rel.split('/')[-1]] = {'width': im.width, 'height': im.height, 'b64': base64.b64encode(raw).decode()}
print('embedded tiles:', {k: (v['width'], v['height']) for k, v in embedded.items()})

entry = work / 'stubs' / 'entry.js'
entry.write_text(f"""
globalThis.__IMAGES = {json.dumps(embedded)};
import * as THREE_ns from '../vendor/three.module.js';
import {{ makeMannequin }} from '../mannequin.mjs';
import {{ makeMeasuredPants }} from '../measured-pants.mjs';
import {{ createWardrobe }} from '../wardrobe.mjs';
globalThis.__THREE = THREE_ns;
globalThis.__makeMannequin = makeMannequin;
globalThis.__makeMeasuredPants = makeMeasuredPants;
globalThis.__createWardrobe = createWardrobe;
import './dom.js';
import {{ createScene }} from '../scene.mjs';

const failures = [];
globalThis.__errors = failures;
const originalError = console.error;
console.error = (...args) => {{ failures.push(args.map(String).join(' ')); }};
const originalWarn = console.warn;
console.warn = (...args) => {{ failures.push('warn: ' + args.map(String).join(' ')); originalWarn(...args); }};

const PANTS_MEASUREMENTS = {{ length: 105, waist: 39.5, hip: 57, thigh: 40, rise: 37.5, hem: 28 }};

async function renderOnce(opts, label) {{
  const canvases = [];
  const container = {{
    clientWidth: 250, clientHeight: 340, style: {{}},
    appendChild(node) {{ if (node && node.getContext) canvases.push(node); }},
    removeChild() {{}}
  }};
  const scene = createScene(container, opts);
  let clock = 0;
  for (let i = 0; i < 40; i++) {{
    const cb = globalThis.__raf;
    if (!cb) break;
    globalThis.__raf = null;
    clock += 16.7;
    cb(clock);
  }}
  const canvas = canvases[canvases.length - 1];
  if (!canvas || !canvas._ctx) {{ failures.push(label + ': no rendered canvas'); return; }}
  globalThis.__FRAMES.push({{ label, width: canvas.width, height: canvas.height, rgba: canvas._ctx._pixels.slice() }});
  failures.push('stats ' + label + ': ' + JSON.stringify(scene.stats()));
}}

globalThis.__createScene = createScene;
globalThis.__FRAMES = [];
globalThis.__runTest = async function runTest() {{
  await renderOnce({{
    pants: {{ id: 'washed-denim-medium-blue', type: 'pants', category: 'bottom', color: '#596e74', material: 'denim', measurements: PANTS_MEASUREMENTS }},
    size: 'M', model: 'female', view: 'pants', playing: false, walking: false
  }}, 'denim-pants');
  await renderOnce({{
    sample: {{ id: 'KC9315', type: 'ziphoodie', category: 'outer', color: '#1d1c20', material: 'cotton',
      measurements: {{ length: 62, shoulder: 62, chest: 60.5, sleeve: 58, hem: 50.5 }} }},
    model: 'female', view: 'fit', playing: false, walking: false
  }}, 'hoodie');
  return failures;
}};
""")

# 2b. insert trace markers into scene.mjs to bisect the native crash.
scene_mjs = work / 'scene.mjs'
text = scene_mjs.read_text()
traces = [
    ("export function createScene(container, opts) {",
     "export function createScene(container, opts) {\n  globalThis.__trace && globalThis.__trace('createScene enter');"),
    ("  const canvas = renderer.domElement;",
     "  globalThis.__trace && globalThis.__trace('renderer: ' + (renderer && renderer.isWebGLRenderer ? 'webgl' : 'software'));\n  const canvas = renderer.domElement;"),
    ("  const grid = new THREE.GridHelper",
     "  globalThis.__trace && globalThis.__trace('floor ok');\n  const grid = new THREE.GridHelper"),
    ("  function selectLook() {",
     "  function selectLook() {\n    globalThis.__trace && globalThis.__trace('selectLook');"),
    ("    ({body,wardrobe,top,lower}=look);",
     "    ({body,wardrobe,top,lower}=look);\n    globalThis.__trace && globalThis.__trace('look ready');"),
    ("  function settle() {",
     "  function settle() {\n    globalThis.__trace && globalThis.__trace('settle');"),
    ("        applyMaps(denimMapsFor(THREE, {across:.68, along:1.03, fade:1}));",
     "        globalThis.__trace && globalThis.__trace('denimMapsFor sync begin');\n        applyMaps(denimMapsFor(THREE, {across:.68, along:1.03, fade:1}));\n        globalThis.__trace && globalThis.__trace('denimMapsFor sync done');"),
    ("lower.color.set(opts.pants.color||'#596e74').multiplyScalar(1.99);",
     "lower.color.set(opts.pants.color||'#596e74').multiplyScalar(1.99); globalThis.__dbgLower = lower;"),
    ("  update(opts);\n  requestAnimationFrame(draw);",
     "  globalThis.__trace && globalThis.__trace('pre update(opts)');\n  update(opts);\n  globalThis.__trace && globalThis.__trace('post update(opts)');\n  requestAnimationFrame(draw);"),
]
for anchor, replacement in traces:
    assert anchor in text, anchor[:40]
    text = text.replace(anchor, replacement)
scene_mjs.write_text(text)

# 3. bundle
out = work / 'bundle.js'
subprocess.run(['/workspace/esbuild', 'stubs/entry.js', '--bundle', '--format=iife',
                '--platform=browser', '--outfile=bundle.js'],
               cwd=work, check=True, capture_output=True, text=True)
print('bundle size', out.stat().st_size)

# 4. trace persistence: dump to a global that Python reads via separate evals

