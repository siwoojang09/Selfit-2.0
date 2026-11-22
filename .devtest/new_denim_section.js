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
  const frontMask = smoothstep(.05, .62, cosA);
  const backMask = smoothstep(.08, .55, -cosA);
  const fromFront = Math.min(u, 1 - u) * tau;
  let tone = 1;

  // ---- vintage fade down the front ---------------------------------------
  // The thigh and the knee wear first because they rub against everything; the
  // fade dies out before the outside seam, which keeps its indigo edge.
  tone += fade * (.285 * gauss(v, .615, .105) * frontMask
    + .170 * gauss(v, .450, .058) * (.30 + .70 * frontMask)
    + .115 * gauss(v, .275, .090) * frontMask
    + .050 * gauss(v, .120, .048) * frontMask
    + .070 * frontMask);

  // ---- seat -------------------------------------------------------------
  // The back is lighter across the seat and the upper thigh, then falls back to
  // a cooler slate down the calf, as in the reference rear views.
  tone += fade * (.105 * gauss(v, .835, .115) * backMask
    - .045 * (1 - smoothstep(.10, .48, v)) * backMask);

  // The hip block and the waistband are doubled cloth that barely wears.
  tone -= fade * (.075 * smoothstep(.86, .97, v));

  // ---- hip whiskers ------------------------------------------------------
  // Five rolled creases radiate from the fly across the upper thigh: the crest
  // of each rubs pale, the fold beneath it keeps its indigo.
  const hip = smoothstep(.695, .785, v) * (1 - smoothstep(.870, .950, v));
  if (hip > .002) {
    const reach = 1 - smoothstep(.92, 1.46, fromFront);
    let crest = 0, fold = 0;
    for (let k = 0; k < 5; k++) {
      const rise = .782 + k * .0180 + .0035 * Math.sin(k * 2.1 + seed);
      const curl = .030 + .011 * Math.sin(k * 1.7 + seed * .55);
      const line = rise + curl * Math.pow(Math.min(fromFront, 1.4) / 1.4, .85) * (k % 2 ? -1 : 1);
      crest += gauss(v, line, .0150);
      fold += gauss(v, line + .0108, .0078);
    }
    const light = Math.min(1.15, crest) * reach * hip;
    tone += fade * (.150 * light - .055 * Math.min(1, fold) * reach * hip);
  }

  // ---- abrasion streaks --------------------------------------------------
  for (let k = 0; k < DISTRESS.length; k++) {
    const [f0, v0, hv, hw, strength] = DISTRESS[k];
    const du = (fromFront - f0) / hw, dv = (v - v0) / hv;
    const q = du * du + dv * dv;
    if (q < 6) tone += fade * strength * Math.exp(-q) * (.6 + .4 * Math.sin(v * 900 + k * 2.1));
  }

  // ---- washing blotches --------------------------------------------------
  // Machine washing never fades evenly; a couple of octaves of soft cloud keep
  // the flat areas from reading as a gradient.
  tone += fade * .075 * (valueNoise(u * 6.5, v * 4.0, seed) - .5);
  tone += fade * .035 * (valueNoise(u * 17, v * 11, seed + 3) - .5);

  // ---- front pocket mouth ------------------------------------------------
  // The scoop pocket line runs from beside the fly down and out towards the
  // outside seam; geometry puts the ribbon there, the wash wears its lip pale.
  if (v > .845 && v < .978) {
    const s = clamp((v - .866) / (.954 - .866), 0, 1);
    const mouth = .545 + s * .955 + .045 * Math.sin(s * Math.PI);
    const d = fromFront - mouth;
    tone += fade * .115 * Math.exp(-Math.pow(d / .055, 2));
    tone -= fade * .055 * Math.exp(-Math.pow((d + .105) / .050, 2));
  }

  // ---- back patch pocket -------------------------------------------------
  // Pocket edges and their stitching wear pale; the bag inside stays indigo.
  {
    const dp = Math.abs(u - .43) * tau;
    if (dp < .40 && v > .705 && v < .910) {
      const half = .33;
      const top = .888 - .012 * (dp / half);
      const corner = .768, point = .735;
      const bottom = point + (corner - point) * Math.pow(dp / half, .9);
      const side = (half - dp) * .126;
      const edge = Math.min(Math.abs(v - top), Math.abs(v - bottom), side);
      tone += fade * .105 * Math.exp(-Math.pow(edge / .018, 2));
      tone -= fade * .055 * (1 - smoothstep(0, .030, edge)) * 0;
      tone -= fade * .035 * smoothstep(.030, .075, edge) * (dp < half ? 1 : 0) * (v < top && v > bottom ? 1 : 0);
    }
  }

  // ---- back yoke ---------------------------------------------------------
  {
    const fromBack = Math.abs(u - .5) * tau;
    if (fromBack < 1.95) {
      const yoke = .899 + .033 * Math.min(1, fromBack / 1.84);
      tone -= fade * .070 * Math.exp(-Math.pow((v - yoke) / .012, 2));
      tone += fade * .045 * Math.exp(-Math.pow((v - yoke - .022) / .012, 2));
    }
  }

  // ---- waistband and hem -------------------------------------------------
  tone -= fade * .130 * smoothstep(.940, .968, v) * (1 - smoothstep(.993, 1, v));
  tone += fade * .055 * gauss(v, 1, .007);
  tone -= fade * .120 * (1 - smoothstep(.004, .032, v));
  tone += fade * .090 * gauss(v, .042, .010);
  tone -= fade * .045 * gauss(v, .062, .007);

  // ---- vertical slub grain ----------------------------------------------
  // Faint and vertical: the yarns the cloth was woven from.
  tone += fade * .020 * (.55 * Math.sin(angle * 13 + v * 3.1 + seed)
    + .30 * Math.sin(angle * 29 - v * 5.7) + .15 * Math.sin(angle * 47 + v * 2.3));

  return clamp(tone, .68, 1.40);
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
    centre: new Float32Array(width), rope: new Float32Array(width), grain: new Float32Array(width)
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
    col.outRidge[x] = .16 * Math.exp(-Math.pow(aOut / .026, 2)) + .10 * Math.exp(-Math.pow(aOut / .011, 2));
    col.outCrease[x] = -.14 * Math.exp(-Math.pow(aOut / .12, 2)) * (1 - Math.exp(-Math.pow(aOut / .020, 2)));
    col.inRidge[x] = .15 * Math.exp(-Math.pow(aIn / .022, 2));
    col.inCrease[x] = -.20 * Math.exp(-Math.pow(aIn / .09, 2)) * (1 - Math.exp(-Math.pow(aIn / .016, 2)));
    col.centre[x] = -.13 * Math.exp(-Math.pow(aCf / .042, 2)) + .075 * Math.exp(-Math.pow((aCf - .085) / .017, 2))
      + .055 * Math.exp(-Math.pow((aCf - .170) / .017, 2))
      - .14 * Math.exp(-Math.pow(aCb / .055, 2)) + .06 * Math.exp(-Math.pow(aCb / .015, 2));
    // Roping: the hem folds into vertical ripples that catch the light.
    col.rope[x] = .55 * Math.sin(a * 74 + seed) + .30 * Math.sin(a * 31 - seed * .7) + .15 * Math.sin(a * 117);
    col.grain[x] = .50 * Math.sin(a * 46 + 1.3) + .30 * Math.sin(a * 97 - .7) + .20 * Math.sin(a * 23 + 2.1);
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
    + meanOf(col.rope) * meanOf(row.ropeMask) * .055 + meanOf(col.grain) * .011;

  const shade = new Float32Array(width * height);
  const weaveField = new Float32Array(width * height);
  const wear = new Float32Array(width * height);
  const toneField = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = 1 - y / height;
    const rowDetail = row.waistDark[y] + row.waistEdge[y] + row.hemDark[y] + row.hemLine[y];
    const ropeWeight = row.ropeMask[y] * .055;
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
      const detail = rowDetail + col.outRidge[x] + col.outCrease[x] + col.inRidge[x] + col.inCrease[x]
        + col.centre[x] + col.rope[x] * ropeWeight + col.grain[x] * .011 - detailMean;
      const wash = sampleTone(u, v) / toneMean * (1 + detail);
      const i = y * width + x;
      shade[i] = weave * wash;
      toneField[i] = wash;
      weaveField[i] = ridge * .62 + (dyeValue - 1) * 2.4 + (wash - 1) * .40;
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
    const worn = clamp((tone - .96) / .34, 0, 1);
    const deep = clamp((.96 - tone) / .26, 0, 1);
    const level = clamp(value, 0, 1) * 255;
    map[j] = level * (1 + .170 * worn - .035 * deep);
    map[j + 1] = level * (1 + .100 * worn - .020 * deep);
    map[j + 2] = level * (1 + .020 * worn + .025 * deep);
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

