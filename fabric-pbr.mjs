// Fabric surface maps for the dressing room.
//
// A colour photograph reused as `bumpMap` only nudges the diffuse term: it has
// no normal, so the weave never bends the light and the garment reads as a flat
// printed image. These helpers keep the photograph as the colour and derive the
// two maps that make it behave like cloth:
//   * a tangent-space normal map from the high-frequency part of the luminance
//     (the crown of each yarn), so grazing light reveals the weave;
//   * a micro-roughness map from the same relief, so a compressed crown
//     reflects a little tighter than the loose valley beside it.
//
// The generators are pure functions over typed arrays so a map can be checked
// without a GPU. Only `weaveMapsFor` and `applyDenimSurface` touch Three.

const tau = Math.PI * 2;
const clamp = (v, low, high) => v < low ? low : v > high ? high : v;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, centre, width) => { const t = (x - centre) / width; return Math.exp(-t * t); };
const wrapIndex = (i, n) => { const m = i % n; return m < 0 ? m + n : m; };

export function luminanceField(rgba, width, height, out = new Float32Array(width * height)) {
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (.2126 * rgba[j] + .7152 * rgba[j + 1] + .0722 * rgba[j + 2]) / 255;
  }
  return out;
}

// Separable box blur that wraps at the edges, so a tile or a leg cylinder keeps
// no seam where the map meets itself.
export function tileBlur(field, width, height, radius) {
  if (radius < 1) return Float32Array.from(field);
  const span = radius * 2 + 1;
  const mid = new Float32Array(width * height), out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += field[row + wrapIndex(k, width)];
    for (let x = 0; x < width; x++) {
      mid[row + x] = sum / span;
      sum += field[row + wrapIndex(x + radius + 1, width)];
      sum -= field[row + wrapIndex(x - radius, width)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += mid[wrapIndex(k, height) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span;
      sum += mid[wrapIndex(y + radius + 1, height) * width + x];
      sum -= mid[wrapIndex(y - radius, height) * width + x];
    }
  }
  return out;
}

// Tangent space, +X across the UV, +Y up the UV. Image rows run downwards while
// V runs upwards, hence the swapped sign on the vertical difference.
export function reliefNormals(field, width, height, { radius = 2, strength = 1.6 } = {}) {
  const blurred = tileBlur(field, width, height, radius);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * width, up = wrapIndex(y - 1, height) * width, down = wrapIndex(y + 1, height) * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const left = field[row + wrapIndex(x - 1, width)] - blurred[row + wrapIndex(x - 1, width)];
      const right = field[row + wrapIndex(x + 1, width)] - blurred[row + wrapIndex(x + 1, width)];
      const above = field[up + x] - blurred[up + x];
      const below = field[down + x] - blurred[down + x];
      const nx = (left - right) * strength, ny = (above - below) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const j = i * 4;
      out[j] = (nx * inv * .5 + .5) * 255;
      out[j + 1] = (ny * inv * .5 + .5) * 255;
      out[j + 2] = (inv * .5 + .5) * 255;
      out[j + 3] = 255;
    }
  }
  return out;
}

// `crown` = -1 makes the raised yarn smoother (denim, worn twill), +1 makes it
// rougher (fleece, brushed cotton). `wear` (0..1) flattens relief where the wash
// has abraded the cloth. Returns the map plus its mean, so a caller can divide
// the material roughness by it and keep the average response where it was.
export function reliefRoughness(field, width, height, { radius = 2, contrast = .12, crown = -1, wear = null, wearRelief = .3 } = {}) {
  const blurred = tileBlur(field, width, height, radius);
  const out = new Uint8ClampedArray(width * height * 4);
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const raised = clamp(.5 + (field[i] - blurred[i]) * 3.2, 0, 1);
    let value = crown < 0 ? 1 - contrast * raised : 1 - contrast * (1 - raised);
    if (wear) value *= 1 - wearRelief * wear[i];
    const byte = clamp(value, 0, 1) * 255;
    const j = i * 4;
    out[j] = out[j + 1] = out[j + 2] = byte;
    out[j + 3] = 255;
    sum += clamp(value, 0, 1);
  }
  return { map: out, mean: sum / field.length || 1 };
}

export function weaveSurface(rgba, width, height, options = {}) {
  const field = luminanceField(rgba, width, height);
  const normal = reliefNormals(field, width, height, options);
  const roughness = reliefRoughness(field, width, height, options);
  return { width, height, normal, roughness: roughness.map, roughnessMean: roughness.mean };
}

// ---- washed denim ---------------------------------------------------------

const angularGap = (u, centre) => { const d = Math.abs(u - centre); return Math.min(d, 1 - d) * tau; };

// The wash is painted in the leg's own UV space, so it follows the pattern
// instead of sliding over it. u runs once around the leg (0 = centre front,
// .25 = outside seam, .5 = centre back, .75 = inside seam) and v runs from the
// hem (0) to the waistband (1). Both come from measured-pants' patch UVs; the
// knee sits near v = .43 and the hip whiskers near v = .80 because the pattern
// cuts the leg linearly from the waist down.
function washAt(u, v, seed, fade) {
  const angle = u * tau;
  const backMask = Math.max(0, -Math.cos(angle));
  const fromFront = Math.min(u, 1 - u) * tau;
  // Fade follows the front of the leg and dies out at the side seam.
  const column = Math.exp(-Math.pow(fromFront * 1.45, 2));
  let tone = 1;

  // Vintage fade down the front of the leg: thigh and shin wear before the
  // outside of the leg does, and the knee takes the sharpest loss.
  const thigh = gauss(v, .60, .17);
  const shin = gauss(v, .17, .12);
  const knee = gauss(v, .43, .055) * (.40 + .60 * column);
  const stack = gauss(v, .085, .03) * (.5 + .5 * column);
  tone += fade * (.105 * thigh * (.25 + .75 * column) + .06 * shin * column
    + .10 * knee + .05 * stack);

  // Hip whiskers: the fabric bunches as the wearer sits, so the crests of those
  // creases rub light while the folds between them keep their indigo.
  const hip = smoothstep(.695, .80, v) * (1 - smoothstep(.878, .95, v));
  if (hip > .002 && fromFront < 1.3) {
    let crest = 0;
    for (let k = 0; k < 6; k++) {
      const rise = .772 + k * .0158 + .0045 * Math.sin(k * 2.7 + seed);
      const curl = .052 + .014 * Math.sin(k * 1.9 + seed * .7);
      const line = rise + curl * Math.pow(Math.min(fromFront, 1.25) / 1.25, .8) * (k % 2 ? 1 : .72);
      crest += gauss(v, line, .0082);
    }
    const reach = 1 - smoothstep(.95, 1.3, fromFront);
    const streak = Math.min(1.25, crest) * reach * hip;
    tone += fade * .135 * streak;
    tone -= fade * .05 * Math.max(0, 1 - Math.min(1, streak)) * hip * (1 - smoothstep(.2, 1.15, fromFront));
  }

  // Honeycomb creases behind the knee, where the cloth folds on itself.
  const comb = backMask * gauss(v, .40, .08);
  if (comb > .01) {
    tone -= fade * .038 * comb * (.5 + .5 * Math.sin(v * 520 + fromFront * 22 + seed));
  }

  // Slubs run down the leg as the yarn was woven; they are faint and vertical.
  const slub = .55 * Math.sin(angle * 9 + 1.7 * Math.sin(v * 4.1 + seed))
    + .30 * Math.sin(angle * 17 - v * 2.3)
    + .15 * Math.sin(angle * 31 + v * 6.1);
  tone += fade * .016 * slub;

  // Seams: a pressed ridge that rubs light, sitting inside a soft indigo crease.
  const outer = angularGap(u, .25), inner = angularGap(u, .75);
  tone += fade * .05 * Math.exp(-Math.pow(outer / .035, 2));
  tone -= fade * .065 * Math.exp(-Math.pow(outer / .105, 2));
  tone += fade * .038 * Math.exp(-Math.pow(inner / .03, 2));
  tone -= fade * .07 * Math.exp(-Math.pow(inner / .10, 2));

  // The waistband keeps its indigo; the hem is densest where the cloth stacks,
  // with one worn line just above the stitching.
  tone -= .035 * smoothstep(.80, .99, v);
  tone -= .05 * smoothstep(.93, .995, v);
  tone += .028 * gauss(v, 1, .012);
  tone -= .062 * (1 - smoothstep(0, .042, v));
  tone += .034 * gauss(v, .052, .012);

  return clamp(tone, .72, 1.3);
}

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function sampleTile(field, width, height, u, v) {
  const x = u * width - .5, y = v * height - .5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const xa = wrapIndex(x0, width), xb = wrapIndex(x0 + 1, width);
  const ya = wrapIndex(y0, height) * width, yb = wrapIndex(y0 + 1, height) * width;
  const top = field[ya + xa] + (field[ya + xb] - field[ya + xa]) * fx;
  const bottom = field[yb + xa] + (field[yb + xb] - field[yb + xa]) * fx;
  return top + (bottom - top) * fy;
}

// A shaded denim leg at the physical size of one pattern piece.
//
// The twill itself is woven here instead of tiled from the photograph: a tile
// repeated over a whole leg shows its seams, and at the size the legs are drawn
// on screen its ridges fall below a pixel and mip down to flat grey. So the
// ridge family is generated at a true metre pitch, the photograph only lends
// its broad dye mottle (once across the leg, never tiled), and the wash sits on
// top of both.
export function denimSurface({
  width = 1024, height = 2048, across = .68, along = 1.03,
  mottle = null, pitch = .0034, fade = 1, seed = 7, relief = 1.3
} = {}) {
  const ridgeCycles = Math.max(12, Math.round(across / pitch));
  const ridgePitch = across / ridgeCycles;
  const alongCycles = Math.max(12, Math.round(along / ridgePitch));
  const dye = mottle ? tileBlur(mottle.field, mottle.width, mottle.height, Math.round(mottle.width / 24)) : null;
  let dyeMean = 1;
  if (dye) {
    let sum = 0;
    for (let i = 0; i < dye.length; i++) sum += dye[i];
    dyeMean = sum / dye.length || 1;
  }

  // The wash has no fine structure of its own, so it is solved on a coarse grid
  // and interpolated; the weave still runs at full pixel density.
  const toneWidth = Math.min(width, 288), toneHeight = Math.min(height, 576);
  const tone = new Float32Array(toneWidth * toneHeight);
  let toneSum = 0;
  for (let y = 0; y < toneHeight; y++) {
    const v = 1 - y / (toneHeight - 1);
    for (let x = 0; x < toneWidth; x++) {
      const value = washAt(x / toneWidth, v, seed, fade);
      tone[y * toneWidth + x] = value;
      toneSum += value;
    }
  }
  const toneMean = toneSum / tone.length || 1;

  function sampleTone(u, v) {
    const x = u * toneWidth - .5, y = (1 - v) * (toneHeight - 1);
    const x0 = Math.floor(x), y0 = Math.max(0, Math.min(toneHeight - 2, Math.floor(y)));
    const fx = x - x0, fy = Math.max(0, Math.min(1, y - y0));
    const xa = wrapIndex(x0, toneWidth), xb = wrapIndex(x0 + 1, toneWidth);
    const top = tone[y0 * toneWidth + xa] + (tone[y0 * toneWidth + xb] - tone[y0 * toneWidth + xa]) * fx;
    const bottom = tone[(y0 + 1) * toneWidth + xa] + (tone[(y0 + 1) * toneWidth + xb] - tone[(y0 + 1) * toneWidth + xa]) * fx;
    return top + (bottom - top) * fy;
  }

  const shade = new Float32Array(width * height);
  const weaveField = new Float32Array(width * height);
  const wear = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = 1 - y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      // 3/1 twill: one diagonal ridge family at a true metre pitch, its profile
      // skewed the way a shuttle lays three warps over one weft.
      const phase = tau * (ridgeCycles * u + alongCycles * (1 - v));
      const slub = valueNoise(u * 26, (1 - v) * 7, 5) - .5;
      let ridge = .55 * Math.sin(phase) + .3 * Math.sin(phase * 2 + .8) + .15 * Math.sin(phase * 3 + 1.7);
      ridge *= 1 + .3 * slub;
      // Broad dye mottle from the photographed swatch, sampled once per leg.
      const dyeValue = dye ? sampleTile(dye, mottle.width, mottle.height, u, 1 - v) / dyeMean : 1;
      const weave = (.88 + .045 * ridge) * (1 + .26 * (dyeValue - 1));
      const wash = sampleTone(u, v) / toneMean;
      const i = y * width + x;
      shade[i] = weave * wash;
      weaveField[i] = ridge * .62 + (dyeValue - 1) * 2.4 + (wash - 1) * .55;
      wear[i] = clamp((wash - 1) / .16, 0, 1);
    }
  }

  let mean = 0;
  for (let i = 0; i < shade.length; i++) mean += shade[i];
  mean /= shade.length;

  const map = new Uint8ClampedArray(width * height * 4);
  const reliefField = new Float32Array(width * height);
  for (let i = 0; i < shade.length; i++) {
    // Faded cloth has been rubbed flat, so its relief is shallower there.
    const flat = 1 - .3 * wear[i];
    reliefField[i] = weaveField[i] * flat;
    // A soft shoulder keeps the brightest wash from flattening into a clipped patch.
    const value = shade[i] <= .82 ? shade[i] : .82 + .18 * (1 - Math.exp(-(shade[i] - .82) / .18));
    const j = i * 4;
    // A wash does not only brighten the cloth: it rubs the indigo out, so the
    // abraded places drift towards a pale grey while the base keeps its blue.
    // The map stays a multiplier over the garment's colour, but the fade now
    // shifts its hue as well as its value.
    const worn = clamp((value - .80) / .17, 0, 1);
    const level = clamp(value, 0, 1) * 255;
    map[j] = level * (1 + .11 * worn);
    map[j + 1] = level * (1 + .05 * worn);
    map[j + 2] = level * (1 - .012 * worn);
    map[j + 3] = 255;
  }

  const normal = reliefNormals(reliefField, width, height, { radius: 2, strength: relief });
  const roughness = reliefRoughness(reliefField, width, height, {
    radius: 2, contrast: .12, crown: -1, wear, wearRelief: .34
  });

  return {
    width, height, map, normal, roughness: roughness.map, roughnessMean: roughness.mean,
    meanShade: mean, ridgePitch
  };
}

// ---- three.js glue --------------------------------------------------------

const surfaceCache = new Map();

function drawToPixels(source, size) {
  const w0 = source.width || source.naturalWidth, h0 = source.height || source.naturalHeight;
  const scale = Math.min(1, size / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function canvasFrom(rgba, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

function tiledTexture(T, canvas, repeatX, repeatY) {
  const texture = new T.Texture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// Normal and micro-roughness for one photographed weave tile, at the repeat the
// caller's colour map uses. `key` identifies the tile so the pixel work is done
// once per tile and garment size rather than once per pattern piece.
export function weaveMapsFor(T, image, key, repeatX, repeatY, options = {}) {
  if (typeof document === 'undefined' || !image) return null;
  const { size = 512, relief = {}, normalScale = .8, roughnessTarget = null } = options;
  const cacheKey = `${key}|${size}|${relief.radius || 2}|${relief.strength || 1.6}|${relief.contrast || .12}|${relief.crown || -1}`;
  let surface = surfaceCache.get(cacheKey);
  if (!surface) {
    const pixels = drawToPixels(image, size);
    surface = weaveSurface(pixels.data, pixels.width, pixels.height, relief);
    surfaceCache.set(cacheKey, surface);
  }
  const normalMap = tiledTexture(T, canvasFrom(surface.normal, surface.width, surface.height), repeatX, repeatY);
  const roughnessMap = tiledTexture(T, canvasFrom(surface.roughness, surface.width, surface.height), repeatX, repeatY);
  const center = surface.roughnessMean || 1;
  return {
    normalMap, roughnessMap,
    normalScale: new T.Vector2(normalScale, normalScale),
    roughnessCenter: center,
    roughnessFor: target => Math.min(1, Math.max(0, (target ?? .92) / center))
  };
}

const DENIM_SIZE = .68;

// One shaded denim surface per pattern size. The pieces of both legs and every
// trim share it, so a size change costs one generation and no extra uploads.
export function denimMapsFor(T, { across = DENIM_SIZE, along = 1.03, mottle = null, fade = 1 } = {}) {
  if (typeof document === 'undefined') return null;
  const key = `denim|${across.toFixed(2)}|${along.toFixed(2)}|${mottle ? 'photo' : 'weave'}|${Math.round(fade * 20)}`;
  if (surfaceCache.has(key)) return surfaceCache.get(key);
  const surface = denimSurface({ width: 1024, height: 2048, across, along, mottle, fade });
  const map = tiledTexture(T, canvasFrom(surface.map, surface.width, surface.height), 1, 1);
  map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
  map.colorSpace = T.SRGBColorSpace;
  const normalMap = tiledTexture(T, canvasFrom(surface.normal, surface.width, surface.height), 1, 1);
  normalMap.wrapS = normalMap.wrapT = T.ClampToEdgeWrapping;
  const roughnessMap = tiledTexture(T, canvasFrom(surface.roughness, surface.width, surface.height), 1, 1);
  roughnessMap.wrapS = roughnessMap.wrapT = T.ClampToEdgeWrapping;
  const result = {
    map, normalMap, roughnessMap, surface,
    normalScale: new T.Vector2(1.05, 1.05),
    roughnessCenter: surface.roughnessMean || 1
  };
  surfaceCache.set(key, result);
  return result;
}

// Load the photographed swatch once, then rebuild the denim surface so its dye
// mottle sits under the wash. Callers pass the same options to `denimMapsFor`.
const twillTiles = new Map();
export function loadTwillField(url) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return Promise.resolve(null);
  if (!twillTiles.has(url)) {
    const load = new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        const pixels = drawToPixels(image, 512);
        resolve({ field: luminanceField(pixels.data, pixels.width, pixels.height), width: pixels.width, height: pixels.height });
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    twillTiles.set(url, load);
  }
  return twillTiles.get(url);
}

// Attach the physical sheen of a fabric: the soft veil a brushed cotton or a
// washed denim throws at grazing angles, which a plain standard material cannot.
export function applySheen(material, sheen = {}, T = null) {
  if (!material) return material;
  material.sheen = sheen.amount ?? 0;
  if (T && sheen.color) material.sheenColor = new T.Color(sheen.color);
  material.sheenRoughness = sheen.roughness ?? .8;
  material.needsUpdate = true;
  return material;
}

export function clearSurfaceCache() {
  surfaceCache.clear();
  twillTiles.clear();
}
