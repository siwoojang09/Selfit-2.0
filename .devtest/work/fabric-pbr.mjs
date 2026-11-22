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
// knee sits near v = .44 and the hip whiskers near v = .80 because the pattern
// cuts the leg linearly from the waist down.
//
// A wash is not only a brightening: it rubs the indigo out, so the abraded
// places drift towards a warm greenish sand while the seams, the waistband and
// the folds the cloth keeps pressed stay a deep slate. The amplitudes come from
// the reference photographs, where the darkest seam reads about two thirds the
// brightness of the worn thigh and the worn spots have lost most of their blue.

// Short abraded streaks: [radians from centre front, v, half height, half width, strength]
const DISTRESS = [
  [.60, .655, .050, .038, .105], [.74, .625, .038, .032, .085], [.52, .735, .034, .030, .070],
  [1.04, .590, .052, .042, .095], [.88, .520, .030, .028, .060], [.66, .400, .036, .032, .065],
  [.42, .150, .026, .030, .055], [1.06, .175, .030, .036, .050], [.78, .095, .020, .026, .045]
];

function washAt(u, v, seed, fade) {
  const angle = u * tau;
  const cosA = Math.cos(angle);
  // Fade reaches nearly to the outside seam, as it does on the reference: the
  // leg's own curvature hides the last few centimetres from the camera anyway.
  const frontMask = smoothstep(.04, .40, cosA);
  const backMask = smoothstep(.05, .42, -cosA);
  const fromFront = Math.min(u, 1 - u) * tau;
  let tone = 1;

  // ---- vintage fade down the front ---------------------------------------
  // The thigh just above the knee takes the worst of the wear, the knee keeps a
  // pressed pale patch, the shin a thinner continuation, and the hip and the
  // hem fall back to indigo.
  const envelope = gauss(v, .600, .120) + .45 * gauss(v, .445, .052) + .30 * gauss(v, .280, .070);
  // The palest cloth sits either side of the centre seam, not on it: the seam
  // itself and the crease beside it keep a shade more indigo.
  const shoulder = .78 + .22 * smoothstep(.10, .55, Math.abs(Math.sin(angle)));
  tone += fade * .500 * envelope * frontMask * shoulder;

  // ---- seat -------------------------------------------------------------
  // Rear views: the seat sits lighter than the calf, which keeps its slate.
  tone += fade * (.100 * gauss(v, .830, .100) - .050 * (1 - smoothstep(.15, .45, v))) * backMask;

  // The hip block and the waistband are doubled cloth that barely wears.
  tone -= fade * .150 * smoothstep(.835, .935, v) * (1 - smoothstep(.950, 1, v));

  // ---- hip whiskers ------------------------------------------------------
  // Five rolled creases radiate from the fly across the upper thigh: the crest
  // of each rubs pale, the fold beneath it keeps its indigo.
  const hip = smoothstep(.700, .760, v) * (1 - smoothstep(.880, .950, v));
  if (hip > .002) {
    const reach = 1 - smoothstep(1.15, 1.60, fromFront);
    let crest = 0, fold = 0;
    for (let k = 0; k < 5; k++) {
      const rise = .775 + k * .0196 + .004 * Math.sin(k * 2.1 + seed);
      const curl = .032 + .012 * Math.sin(k * 1.7 + seed * .55);
      const line = rise + curl * Math.pow(Math.min(fromFront, 1.4) / 1.4, .85) * (k % 2 ? -1 : 1);
      crest += gauss(v, line, .0140);
      fold += gauss(v, line + .0110, .0070);
    }
    const light = Math.min(1.20, crest) * reach * hip;
    tone += fade * (.300 * light - .125 * Math.min(1, fold) * reach * hip);
  }

  // ---- abrasion streaks --------------------------------------------------
  for (let k = 0; k < DISTRESS.length; k++) {
    const [f0, v0, hv, hw, strength] = DISTRESS[k];
    const du = (fromFront - f0) / hw, dv = (v - v0) / hv;
    const q = du * du + dv * dv;
    if (q < 6) tone += fade * strength * 1.35 * Math.exp(-q) * (.65 + .35 * Math.sin(v * 900 + k * 2.1));
  }

  // ---- washing blotches --------------------------------------------------
  // Machine washing never fades evenly; a couple of octaves of soft cloud keep
  // the flat areas from reading as a gradient.
  tone += fade * .080 * (valueNoise(u * 6.5, v * 4.0, seed) - .5);
  tone += fade * .035 * (valueNoise(u * 17, v * 11, seed + 3) - .5);

  // ---- front pocket mouth ------------------------------------------------
  // The scoop pocket line runs from beside the fly down and out towards the
  // outside seam; geometry puts the ribbon there, the wash wears its lip pale.
  if (v > .840 && v < .980) {
    const s = clamp((v - .866) / (.954 - .866), 0, 1);
    const mouth = .545 + s * .955 + .045 * Math.sin(s * Math.PI);
    const d = fromFront - mouth;
    tone += fade * .165 * Math.exp(-Math.pow(d / .050, 2));
    tone -= fade * .080 * Math.exp(-Math.pow((d + .095) / .045, 2));
  }

  // ---- back patch pocket -------------------------------------------------
  // Pocket edges and their stitching wear pale; the bag inside stays indigo.
  {
    const dp = Math.abs(u - .43) * tau;
    if (dp < .40 && v > .705 && v < .915) {
      const half = .33;
      const top = .888 - .012 * (dp / half);
      const corner = .768, point = .735;
      const bottom = point + (corner - point) * Math.pow(dp / half, .9);
      const side = (half - dp) * .126;
      const edge = Math.min(Math.abs(v - top), Math.abs(v - bottom), side);
      tone += fade * .150 * Math.exp(-Math.pow(edge / .016, 2));
      if (dp < half && v < top && v > bottom) tone -= fade * .030 * smoothstep(.02, .06, edge);
    }
  }

  // ---- back yoke ---------------------------------------------------------
  {
    const fromBack = Math.abs(u - .5) * tau;
    if (fromBack < 1.95) {
      const yoke = .899 + .033 * Math.min(1, fromBack / 1.84);
      tone -= fade * .100 * Math.exp(-Math.pow((v - yoke) / .011, 2));
      tone += fade * .060 * Math.exp(-Math.pow((v - yoke - .020) / .011, 2));
    }
  }

  // ---- waistband and hem -------------------------------------------------
  tone -= fade * .360 * smoothstep(.935, .960, v) * (1 - smoothstep(.988, 1, v));
  tone += fade * .090 * gauss(v, 1, .006);
  tone -= fade * .110 * (1 - smoothstep(.004, .034, v));
  tone += fade * .120 * gauss(v, .040, .009);
  tone -= fade * .050 * gauss(v, .060, .007);

  // ---- striations and grain ---------------------------------------------
  // The wash leaves faint horizontal striations across the faded cloth, and the
  // yarns themselves read as a fine vertical grain.
  const striate = (Math.sin(v * 38 + fromFront * 1.4 + seed) + Math.sin(v * 61 - 2.0 + fromFront * .6)) * .5
    * (.55 + .45 * valueNoise(u * 9, v * 22, seed + 8));
  tone += fade * (.022 * striate * envelope * frontMask
    + .020 * (.55 * Math.sin(angle * 13 + v * 3.1 + seed)
      + .30 * Math.sin(angle * 29 - v * 5.7) + .15 * Math.sin(angle * 47 + v * 2.3)));

  // The wash saturates softly at the top: the brightest thorn is still a little
  // brighter than the one beside it, instead of both flattening at a hard clip.
  const knee = 1.24, cap = 1.55;
  if (tone > knee) tone = knee + (cap - knee) * Math.tanh((tone - knee) / (cap - knee));
  return clamp(tone, .62, cap);
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
  mottle = null, pitch = .0082, fade = 1, seed = 7, relief = 1.5
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
  // and interpolated; the weave, the seams and the hem still run at full pixel
  // density. The grid is fine enough to carry the whiskers (2.5 cm) untouched.
  const toneWidth = Math.min(width, 448), toneHeight = Math.min(height, 896);
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

  // Seams, hem and grain are functions of the angle alone (or of the height
  // alone), so they are solved once per column or row and stay crisp at full
  // pixel density without costing a handful of transcendentals per texel.
  const col = {
    outRidge: new Float32Array(width), outCrease: new Float32Array(width),
    inRidge: new Float32Array(width), inCrease: new Float32Array(width),
    centre: new Float32Array(width), rope: new Float32Array(width), grain: new Float32Array(width),
    seamMask: new Float32Array(width)
  };
  const row = {
    waistDark: new Float32Array(height), waistEdge: new Float32Array(height),
    hemDark: new Float32Array(height), hemLine: new Float32Array(height),
    ropeMask: new Float32Array(height)
  };
  for (let x = 0; x < width; x++) {
    const a = (x / width) * tau;
    const aOut = Math.abs(a - Math.PI / 2), aIn = Math.abs(a - Math.PI * 1.5);
    const aCf = Math.min(a, tau - a), aCb = Math.abs(a - Math.PI);
    // A pressed seam ridge that rubs bright, sitting inside a soft indigo crease.
    col.outRidge[x] = .19 * Math.exp(-Math.pow(aOut / .026, 2)) + .12 * Math.exp(-Math.pow(aOut / .011, 2));
    col.outCrease[x] = -.17 * Math.exp(-Math.pow(aOut / .12, 2)) * (1 - Math.exp(-Math.pow(aOut / .020, 2)));
    col.inRidge[x] = .18 * Math.exp(-Math.pow(aIn / .022, 2));
    col.inCrease[x] = -.23 * Math.exp(-Math.pow(aIn / .09, 2)) * (1 - Math.exp(-Math.pow(aIn / .016, 2)));
    col.centre[x] = -.13 * Math.exp(-Math.pow(aCf / .042, 2)) + .075 * Math.exp(-Math.pow((aCf - .085) / .017, 2))
      + .055 * Math.exp(-Math.pow((aCf - .170) / .017, 2))
      - .14 * Math.exp(-Math.pow(aCb / .055, 2)) + .06 * Math.exp(-Math.pow(aCb / .015, 2));
    // Roping: the hem folds into vertical ripples that catch the light.
    col.rope[x] = .55 * Math.sin(a * 74 + seed) + .30 * Math.sin(a * 31 - seed * .7) + .15 * Math.sin(a * 117);
    col.grain[x] = .50 * Math.sin(a * 46 + 1.3) + .30 * Math.sin(a * 97 - .7) + .20 * Math.sin(a * 23 + 2.1);
    col.seamMask[x] = Math.max(Math.exp(-Math.pow(aOut / .075, 2)), Math.exp(-Math.pow(aIn / .070, 2)),
      Math.exp(-Math.pow(aCf / .055, 2)), Math.exp(-Math.pow(aCb / .070, 2)));
  }
  for (let y = 0; y < height; y++) {
    const v = 1 - y / height;
    row.waistDark[y] = -.150 * smoothstep(.940, .968, v) * (1 - smoothstep(.993, 1, v)) * fade;
    row.waistEdge[y] = .070 * gauss(v, 1, .007) * fade;
    row.hemDark[y] = -.130 * (1 - smoothstep(.004, .032, v)) * fade;
    row.hemLine[y] = (.100 * gauss(v, .042, .010) - .050 * gauss(v, .062, .007)) * fade;
    row.ropeMask[y] = (1 - smoothstep(.010, .075, v)) * fade;
  }
  const meanOf = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / (a.length || 1); };
  const detailMean = meanOf(col.outRidge) + meanOf(col.outCrease) + meanOf(col.inRidge) + meanOf(col.inCrease)
    + meanOf(col.centre) + meanOf(row.waistDark) + meanOf(row.waistEdge) + meanOf(row.hemDark) + meanOf(row.hemLine)
    + meanOf(col.rope) * meanOf(row.ropeMask) * .095 + meanOf(col.grain) * .011
    + meanOf(col.seamMask) * .030;

  const shade = new Float32Array(width * height);
  const weaveField = new Float32Array(width * height);
  const wear = new Float32Array(width * height);
  const toneField = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = 1 - y / height;
    const rowDetail = row.waistDark[y] + row.waistEdge[y] + row.hemDark[y] + row.hemLine[y];
    const ropeWeight = row.ropeMask[y] * .095;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      // 3/1 twill: one diagonal ridge family at a coarse metre pitch, its
      // profile skewed the way a shuttle lays three warps over one weft. The
      // pitch is deliberately coarser than life: at the size a whole leg is
      // drawn on screen, a life-size pitch mips away to flat grey, and the
      // diagonal has to survive that to read as denim at all.
      const phase = tau * (ridgeCycles * u + alongCycles * (1 - v));
      const slub = valueNoise(u * 26, (1 - v) * 7, 5) - .5;
      let ridge = .55 * Math.sin(phase) + .3 * Math.sin(phase * 2 + .8) + .15 * Math.sin(phase * 3 + 1.7);
      ridge *= 1 + .3 * slub;
      // The pale weft peeks out of the valleys between the indigo ridges: a
      // speckle that lives only where the ridge is low.
      const valley = Math.max(0, -ridge);
      const fleck = Math.pow(valueNoise(u * 300, (1 - v) * 240, 11), 2.4);
      // Seams pucker: the stitch row gathers the cloth into diagonal ripples
      // either side of every pressed seam, the hem into deep roping.
      const pucker = col.seamMask[x] * Math.sin(v * 260 + tau * u * 10 + seed) * (.6 + .4 * Math.sin(v * 23 + tau * u * 2));
      // Broad dye mottle from the photographed swatch, sampled once per leg.
      const dyeValue = dye ? sampleTile(dye, mottle.width, mottle.height, u, 1 - v) / dyeMean : 1;
      const weave = (.635 + .095 * ridge) * (1 + .26 * (dyeValue - 1)) + .18 * valley * fleck;
      const detail = rowDetail + col.outRidge[x] + col.outCrease[x] + col.inRidge[x] + col.inCrease[x]
        + col.centre[x] + col.rope[x] * ropeWeight + pucker * .062 + col.grain[x] * .011 - detailMean;
      const wash = sampleTone(u, v) / toneMean * (1 + detail);
      const i = y * width + x;
      shade[i] = weave * wash;
      toneField[i] = wash;
      weaveField[i] = ridge * .62 + (dyeValue - 1) * 2.4 + (wash - 1) * .40 + valley * fleck * 2.4 + pucker * 3.2;
      wear[i] = clamp((wash - 1) / .30, 0, 1);
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
    // abraded places drift towards a warm greenish sand while what the cloth
    // keeps pressed — seams, waistband, the folds under each whisker — stays a
    // deeper slate blue. The map stays a multiplier over the garment's colour,
    // and it carries that hue shift per channel.
    const tone = toneField[i];
    const worn = clamp((tone - 1.02) / .26, 0, 1);
    const deep = clamp((1.02 - tone) / .30, 0, 1);
    const level = clamp(value, 0, 1) * 255;
    map[j] = level * (1 - .005 * worn - .030 * deep);
    map[j + 1] = level * (1 - .045 * worn - .010 * deep);
    map[j + 2] = level * (1 - .105 * worn + .020 * deep);
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
    // The twill and the wash relief have to survive mip-mapping at the size the
    // legs are drawn on screen, so the relief is a little stronger than life.
    normalScale: new T.Vector2(2.25, 2.25),
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
