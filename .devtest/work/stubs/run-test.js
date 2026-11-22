// Builds the dressing-room scene headless, renders frames through the app's own
// software renderer, and leaves the pixels on globalThis for Python to collect.
import { createScene } from '../scene.mjs';

const failures = [];
globalThis.__errors = failures;
const originalError = console.error;
console.error = (...args) => { failures.push(args.map(String).join(' ')); originalError(...args); };
const originalWarn = console.warn;
console.warn = (...args) => { failures.push('warn: ' + args.map(String).join(' ')); originalWarn(...args); };

const PANTS_MEASUREMENTS = { length: 105, waist: 39.5, hip: 57, thigh: 40, rise: 37.5, hem: 28 };

async function renderOnce(opts, label, frames = 4) {
  const canvases = [];
  const container = {
    clientWidth: 250, clientHeight: 340, style: {},
    appendChild(node) { if (node && node.getContext) canvases.push(node); },
    removeChild() {}
  };
  const scene = createScene(container, opts);
  let clock = 0;
  for (let i = 0; i < frames * 6; i++) {
    const cb = globalThis.__raf;
    if (!cb) break;
    globalThis.__raf = null;
    clock += 16.7;
    cb(clock);
  }
  const canvas = canvases[canvases.length - 1];
  if (!canvas || !canvas._ctx) { failures.push(label + ': no rendered canvas'); return; }
  const w = canvas.width, h = canvas.height;
  const rgba = canvas._ctx._pixels.slice();
  globalThis.__FRAMES.push({ label, width: w, height: h, rgba });
  const stats = scene.stats();
  failures.push('stats ' + label + ': ' + JSON.stringify(stats));
}

globalThis.__FRAMES = [];
globalThis.__runTest = async function runTest() {
  // 1. measured washed-denim jeans, size M, female model
  await renderOnce({
    pants: { id: 'washed-denim-medium-blue', type: 'pants', category: 'bottom', color: '#596e74', material: 'denim', measurements: PANTS_MEASUREMENTS },
    size: 'M', model: 'female', view: 'pants', playing: false, walking: false
  }, 'denim-pants');

  // 2. adidas KC9315 hoodie, default fitting view
  await renderOnce({
    sample: { id: 'KC9315', type: 'ziphoodie', category: 'outer', color: '#1d1c20', material: 'cotton',
      colourName: '블랙 / 크림화이트', measurements: { length: 62, shoulder: 62, chest: 60.5, sleeve: 58, hem: 50.5 } },
    model: 'female', view: 'fit', playing: false, walking: false
  }, 'hoodie');
  return failures;
};
