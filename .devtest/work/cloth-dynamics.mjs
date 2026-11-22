// Secondary cloth motion, shared by the denim trousers and the hoodie.
//
// A garment is modelled as a short chain of horizontal rows. Rows high on the
// body stay locked to the pose (anchored), while rows released towards a hem or
// a cuff carry their own mass: they trail the body, swing with the stride, and
// settle back under damping. Each row is a spring-mass particle whose rest
// position is the pose-driven ("kinematic") surface, so the solver only ever
// produces the difference between the fabric and the body underneath it.
//
// The integration is semi-implicit (Verlet style velocity update) at a fixed
// 1/120 s step. Every excursion is bounded, the target acceleration is measured
// by finite difference and clamped, and any non-finite value reseeds the
// lattice — switching tabs or a slow frame can never explode the mesh.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fixedStep = 1 / 120;
const accelerationLimit = 26; // m/s²

// Stiffness (1/s²) and damping (1/s) are per fabric: denim is heavy and holds
// its shape, knit and cotton are light and swing, silk and chiffon almost give
// up their shape to the air.
export const fabricDynamics = {
  denim: { stiffness: 900, damping: 30, air: .34, crease: .0052, creaseScale: 1.0, anchor: .90, sway: .40 },
  cotton: { stiffness: 380, damping: 19, air: .78, crease: .0082, creaseScale: 1.22, anchor: .84, sway: 1.0 },
  knit: { stiffness: 300, damping: 17, air: .70, crease: .0088, creaseScale: 1.30, anchor: .82, sway: 1.08 },
  linen: { stiffness: 520, damping: 22, air: .72, crease: .0066, creaseScale: 1.10, anchor: .86, sway: .94 },
  wool: { stiffness: 620, damping: 25, air: .50, crease: .0058, creaseScale: 1.04, anchor: .87, sway: .66 },
  silk: { stiffness: 190, damping: 10, air: 1.20, crease: .0074, creaseScale: 1.34, anchor: .78, sway: 1.42 },
  satin: { stiffness: 210, damping: 11, air: 1.06, crease: .0068, creaseScale: 1.24, anchor: .79, sway: 1.30 },
  chiffon: { stiffness: 130, damping: 8, air: 1.55, crease: .0080, creaseScale: 1.40, anchor: .74, sway: 1.60 },
  fleece: { stiffness: 430, damping: 21, air: .62, crease: .0074, creaseScale: 1.16, anchor: .84, sway: .86 },
  leather: { stiffness: 1300, damping: 40, air: .30, crease: .0026, creaseScale: .80, anchor: .92, sway: .34 },
};

export function dynamicsFor(name) {
  return fabricDynamics[String(name || 'cotton').toLowerCase()] || fabricDynamics.cotton;
}

// One lattice of rows. `weight[i]` is how much row i is released from the body
// (0 keeps it sewn to the pose), `cap[i]` the largest excursion it may take in
// metres. `solver.step` is fed the kinematic offset of every row; the solver's
// `offset` array holds the extra displacement to add on top of it.
export function createRowSolver({ rows, fabric, weight, cap, gain = 1 }) {
  const count = Math.max(1, rows | 0);
  const spec = dynamicsFor(fabric);
  const offset = new Float32Array(count * 3);
  const velocity = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const previous = new Float32Array(count * 3);
  const before = new Float32Array(count * 3);
  const accel = new Float32Array(count * 3);
  const release = new Float32Array(count);
  const ceiling = new Float32Array(count);
  const rigidity = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const share = clamp(weight?.[i] ?? 0, 0, 1);
    release[i] = share;
    ceiling[i] = Math.max(.0015, cap?.[i] ?? .02);
    rigidity[i] = spec.stiffness * gain * (spec.anchor + (1 - spec.anchor) * share);
  }
  let samples = 0;
  let peak = 0;
  let hem = 0;

  function reset() {
    offset.fill(0); velocity.fill(0); target.fill(0);
    previous.fill(0); before.fill(0); accel.fill(0);
    samples = 0; peak = 0; hem = 0;
  }

  // goal: kinematic offset per row (optional — omit when the rows ride a body
  // frame and the motion arrives through env.inertiaX/Y/Z instead).
  function step(dt, goal, env = {}) {
    const h = clamp(Number(dt) || 0, 0, .05);
    if (goal) {
      if (h <= 1e-6) {
        if (!samples) { previous.set(goal); before.set(goal); samples = 1; }
      } else {
        const inv = 1 / (h * h);
        if (samples >= 2) {
          for (let i = 0; i < count * 3; i++) {
            accel[i] = clamp((goal[i] - 2 * previous[i] + before[i]) * inv, -accelerationLimit, accelerationLimit);
          }
        } else {
          accel.fill(0);
        }
        before.set(previous); previous.set(goal); samples++;
      }
      target.set(goal);
    }
    if (h <= 1e-6) {
      peak = 0;
      for (let i = 0; i < count; i++) if (release[i] > .25) {
        const q = i * 3, m = Math.hypot(offset[q], offset[q + 1], offset[q + 2]);
        if (m > peak) peak = m;
      }
      return;
    }

    const wind = clamp(Number(env.wind) || 0, 0, 30);
    const gravity = clamp(Number(env.gravity ?? 9.81), 0, 30);
    const turbulence = clamp(Number(env.turbulence ?? .2), 0, 1);
    const clock = Number(env.clock) || 0;
    const angle = (Number(env.direction) || 0) * Math.PI / 180;
    const push = wind * .42 * spec.air;
    const wx = Math.cos(angle) * push, wz = Math.sin(angle) * push;
    const ix = Number(env.inertiaX) || 0, iy = Number(env.inertiaY) || 0, iz = Number(env.inertiaZ) || 0;
    const fall = gravity * .045;

    const steps = Math.max(1, Math.min(5, Math.round(h / fixedStep) || 1));
    const sub = h / steps;
    for (let s = 0; s < steps; s++) {
      const t = clock + sub * s;
      for (let i = 0; i < count; i++) {
        const q = i * 3, share = release[i];
        if (share <= 1e-4) {
          offset[q] = offset[q + 1] = offset[q + 2] = 0;
          velocity[q] = velocity[q + 1] = velocity[q + 2] = 0;
          continue;
        }
        const k = rigidity[i], c = spec.damping * (.55 + .45 * share);
        const gust = 1 + turbulence * .30 * Math.sin(t * 3.6 + i * .83)
          + turbulence * .18 * Math.sin(t * 7.1 - i * 1.7);
        const ax = -k * offset[q] - c * velocity[q] - accel[q] + wx * share * gust + ix * share;
        const ay = -k * offset[q + 1] - c * velocity[q + 1] - accel[q + 1] - fall * share + iy * share;
        const az = -k * offset[q + 2] - c * velocity[q + 2] - accel[q + 2] + wz * share * gust + iz * share;
        velocity[q] += ax * sub; velocity[q + 1] += ay * sub; velocity[q + 2] += az * sub;
        offset[q] += velocity[q] * sub; offset[q + 1] += velocity[q + 1] * sub; offset[q + 2] += velocity[q + 2] * sub;
        const span = Math.hypot(offset[q], offset[q + 1], offset[q + 2]);
        if (span > ceiling[i]) {
          const shrink = ceiling[i] / span;
          offset[q] *= shrink; offset[q + 1] *= shrink; offset[q + 2] *= shrink;
          velocity[q] *= .42; velocity[q + 1] *= .42; velocity[q + 2] *= .42;
        }
      }
    }
    for (let i = 0; i < count * 3; i++) {
      if (!Number.isFinite(offset[i]) || !Number.isFinite(velocity[i])) { reset(); return; }
    }
    peak = 0;
    let hemSum = 0, hemCount = 0;
    for (let i = 0; i < count; i++) {
      if (release[i] <= .25) continue;
      const q = i * 3, m = Math.hypot(offset[q], offset[q + 1], offset[q + 2]);
      if (m > peak) peak = m;
      if (release[i] >= .85) { hemSum += m; hemCount++; }
    }
    hem = hemCount ? hemSum / hemCount : 0;
  }

  return {
    spec, offset, velocity, release, ceiling,
    step, reset,
    get peak() { return peak; },
    get hem() { return hem; },
    // Linear interpolation between two rows, used when a vertex sits between
    // the rows whose particles were solved.
    at(row, fraction, axis) {
      const a = clamp(row, 0, count - 1), b = Math.min(count - 1, a + 1);
      return offset[a * 3 + axis] + (offset[b * 3 + axis] - offset[a * 3 + axis]) * clamp(fraction, 0, 1);
    },
  };
}

// Pose-driven creasing. `bend` is the joint flexion normalised to 0..1, `along`
// is the signed distance from the joint measured in crease-zone widths, and
// `angle` is the ring angle around the limb so ridges can taper towards the
// sides. Ridges bunch tighter as the joint closes, exactly as fabric does.
export function creaseDepth(spec, bend, along, angle, phase = 0, seed = 0) {
  const f = clamp(bend, 0, 1);
  if (f <= .002) return 0;
  const zone = Math.exp(-along * along * 1.7);
  const ridge = Math.sin(along * 7.4 * (1 + 1.5 * f) + angle * 1.15 + seed + phase * .16) * .66
    + Math.sin(along * 3.3 - angle * 2.1 + seed * 1.7 - phase * .11) * .34;
  return zone * f * ridge * (spec.crease * spec.creaseScale);
}
