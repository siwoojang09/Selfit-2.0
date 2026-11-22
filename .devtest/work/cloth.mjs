import * as THREE from './vendor/three.module.js';

const segments = 80;
const rings = 27;
const count = rings * segments;
const stride = segments + 1;
const tau = Math.PI * 2;
const fixedStep = 1 / 90;

const fabrics = {
  cotton: { drag: 0.975, shape: 31, bend: 0.10, air: 0.70 },
  linen: { drag: 0.971, shape: 43, bend: 0.15, air: 0.75 },
  silk: { drag: 0.980, shape: 16, bend: 0.045, air: 1.25 },
  denim: { drag: 0.965, shape: 64, bend: 0.25, air: 0.37 },
  wool: { drag: 0.964, shape: 49, bend: 0.21, air: 0.48 },
  knit: { drag: 0.970, shape: 23, bend: 0.08, air: 0.64 },
  satin: { drag: 0.980, shape: 20, bend: 0.055, air: 1.06 },
  leather: { drag: 0.963, shape: 78, bend: 0.29, air: 0.30 },
  chiffon: { drag: 0.981, shape: 12, bend: 0.031, air: 1.55 },
};

function level(row) {
  if (row === 0) return 0;
  if (row === 1) return 0.006;
  if (row === 2) return 0.039;
  if (row === 3) return 0.044;
  if (row === rings - 1) return 1;
  return 0.052 + (row - 4) / (rings - 6) * 0.933;
}

export function makeSkirt(material) {
  const rest = new Float32Array(count * 3);
  const positions = new Float32Array(rest.length);
  const previous = new Float32Array(rest.length);
  const weights = new Float32Array(count);
  const seamLength = new Float32Array(count);
  const uvs = [];
  const triangles = [];
  const links = [], lengths = [], kinds = [];
  const circumferenceX = [], circumferenceZ = [], levels = [];
  const point = (r, s) => r * segments + (s + segments) % segments;
  const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

  for (let r = 0; r < rings; r++) {
    const h = level(r);
    const band = r < 3;
    const hip = smooth(0.035, 0.19, h);
    const flare = Math.max(0, (h - 0.06) / 0.94);
    const rx = 0.147 + 0.029 * hip + 0.165 * Math.pow(flare, 1.12);
    const rz = 0.103 + 0.035 * hip + 0.101 * Math.pow(flare, 1.1);
    levels.push(h);
    circumferenceX.push(rx);
    circumferenceZ.push(rz);
    for (let s = 0; s < segments; s++) {
      const theta = tau * s / segments;
      const pleatPhase = theta * 11 + 0.9 * Math.sin(theta * 3 + h) + 0.72 * h + 0.42 * Math.sin(1.8 * h + theta * 2);
      const fold = 0.78 * Math.cos(pleatPhase) + 0.22 * Math.cos(2 * pleatPhase + 0.44);
      const swell = band ? 0 : (0.004 + 0.032 * Math.pow(h, 0.87)) * hip;
      const ridge = r === 0 || r === 2 || r === rings - 1 ? 0.0017 : 0;
      const hem = smooth(0.65, 1, h) * (0.008 * Math.cos(pleatPhase) + 0.008 * Math.sin(3 * theta + 0.6));
      const i = point(r, s);
      rest[i * 3] = Math.sin(theta) * (rx + swell * fold + ridge);
      rest[i * 3 + 1] = 1.04 - 0.84 * h + hem;
      rest[i * 3 + 2] = Math.cos(theta) * (rz + swell * fold + ridge) - 0.008 * hip;
      weights[i] = band ? 0 : Math.min(1, 0.09 + h * 3);
      if (r > 2) {
        const last = point(r - 1, s);
        seamLength[i] = seamLength[last] + Math.hypot(rest[i * 3] - rest[last * 3], rest[i * 3 + 1] - rest[last * 3 + 1], rest[i * 3 + 2] - rest[last * 3 + 2]);
      }
    }
    for (let s = 0; s <= segments; s++) uvs.push(s / segments, 1 - h);
  }

  // Shared particles on both sides of the texture seam keep the closed tube continuous.
  function link(a, b, kind) {
    const ia = a * 3, ib = b * 3;
    const distance = Math.hypot(rest[ia] - rest[ib], rest[ia + 1] - rest[ib + 1], rest[ia + 2] - rest[ib + 2]);
    links.push(a, b);
    lengths.push(distance);
    kinds.push(kind);
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const i = point(r, s);
      link(i, point(r, s + 1), 0);
      if (r < rings - 1) {
        link(i, point(r + 1, s), 0);
        link(i, point(r + 1, s + (r % 2 ? 1 : -1)), 1);
        const v = r * stride + s;
        triangles.push(v, v + stride, v + 1, v + 1, v + stride, v + stride + 1);
      }
      link(i, point(r, s + 2), 2);
      if (r < rings - 2) link(i, point(r + 2, s), 2);
    }
  }
  const endPoints = Uint16Array.from(links);
  const restLengths = Float32Array.from(lengths);
  const linkKinds = Uint8Array.from(kinds);
  const geometry = new THREE.BufferGeometry();
  const display = new Float32Array(rings * stride * 3);
  const attr = new THREE.BufferAttribute(display, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attr);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(triangles);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Draped skirt';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  let time = 0, accumulator = 0;

  function updateMesh() {
    for (let r = 0; r < rings; r++) {
      const off = 3 * r * segments;
      display.set(positions.subarray(off, off + 3 * segments), 3 * r * stride);
      display.set(positions.subarray(off, off + 3), 3 * (r * stride + segments));
    }
    attr.needsUpdate = true;
    geometry.computeVertexNormals();
    const norm = geometry.attributes.normal.array;
    // Average shading across UV duplicates to avoid a line on the front of the garment.
    for (let r = 0; r < rings; r++) {
      const a = 3 * r * stride, b = a + segments * 3;
      for (let k = 0; k < 3; k++) norm[a + k] = norm[b + k] = 0.5 * (norm[a + k] + norm[b + k]);
    }
    geometry.attributes.normal.needsUpdate = true;
  }

  function collide(legs, hx, hz) {
    for (let r = 3; r < rings; r++) {
      const h = levels[r];
      for (let i = r * segments; i < (r + 1) * segments; i++) {
        const o = i * 3;
        let x = positions[o], y = positions[o + 1], z = positions[o + 2];
        // A meridian cannot extend past its full fabric length under sustained tension.
        const anchor = (segments * 2 + i % segments) * 3;
        const sx = x - positions[anchor], sy = y - positions[anchor + 1], sz = z - positions[anchor + 2];
        const span = Math.sqrt(sx * sx + sy * sy + sz * sz);
        const limit = seamLength[i] * 1.025;
        if (span > limit) {
          const correction = (span - limit) / span;
          x -= sx * correction; y -= sy * correction; z -= sz * correction;
        }
        // Pelvis collision keeps darts from collapsing inward above the moving thighs.
        if (h < 0.27) {
          const dx = (x - hx) / (circumferenceX[r] * 0.95);
          const dz = (z - hz + 0.008) / (circumferenceZ[r] * 0.94);
          const rad = dx * dx + dz * dz;
          if (rad < 1 && rad > 1e-7) {
            const push = 1 / Math.sqrt(rad);
            x = hx + (x - hx) * push;
            z = hz - 0.008 + (z - hz + 0.008) * push;
          }
        }
        for (const capsule of legs) {
          const { a, b, r: radius } = capsule;
          if (y > Math.max(a.y, b.y) + radius || y < Math.min(a.y, b.y) - radius) continue;
          const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
          const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / (ex * ex + ey * ey + ez * ez + 1e-12)));
          const dx = x - a.x - t * ex, dy = y - a.y - t * ey, dz = z - a.z - t * ez;
          const dist2 = dx * dx + dy * dy + dz * dz;
          const margin = radius + 0.009;
          if (dist2 < margin * margin && dist2 > 1e-9) {
            const correction = margin / Math.sqrt(dist2) - 1;
            x += dx * correction; y += dy * correction; z += dz * correction;
          }
        }
        positions[o] = x; positions[o + 1] = Math.max(0.014, y); positions[o + 2] = z;
      }
    }
  }

  function integrate(opts, legs, hips) {
    time += fixedStep;
    const fabric = fabrics[String(opts.fabric || 'linen').toLowerCase()] || fabrics.linen;
    const g = THREE.MathUtils.clamp(Number(opts.gravity ?? 9.81), 0, 30);
    const wind = THREE.MathUtils.clamp(Number(opts.wind ?? 0), 0, 30);
    const angle = Number(opts.direction ?? 0) * Math.PI / 180;
    const noisy = THREE.MathUtils.clamp(Number(opts.turbulence ?? 0.2), 0, 1);
    const hx = hips?.x || 0, hy = hips?.y || 0, hz = hips?.z || 0;
    const drag = opts.damping == null ? fabric.drag : THREE.MathUtils.clamp(0.997 - Number(opts.damping) * 0.07, 0.90, 0.998);
    const stiff = opts.stiffness == null ? 1 : 0.50 + Number(opts.stiffness);
    const force = wind * (0.40 + wind * 0.088) * fabric.air;
    const wx = Math.cos(angle), wz = Math.sin(angle);
    const dt2 = fixedStep * fixedStep;
    for (let r = 0; r < rings; r++) {
      const h = levels[r];
      const shape = fabric.shape * stiff * (1.03 - 0.53 * h);
      const flutter = 0.4 * Math.sin(time * 3.3 + h * 11) + 0.33 * Math.sin(time * 6.1 - h * 8);
      for (let i = r * segments; i < (r + 1) * segments; i++) {
        const o = i * 3;
        const x = positions[o], y = positions[o + 1], z = positions[o + 2];
        if (weights[i] === 0) {
          positions[o] = rest[o] + hx; positions[o + 1] = rest[o + 1] + hy; positions[o + 2] = rest[o + 2] + hz;
        } else {
          const facing = (wx * rest[o] / circumferenceX[r] + wz * rest[o + 2] / circumferenceZ[r]);
          const gust = force * (0.63 + 0.29 * Math.abs(facing)) * (1 + noisy * (flutter + 0.24 * Math.sin(time * 6 + rest[o] * 23)));
          const ax = shape * (rest[o] + hx - x) + wx * gust;
          const ay = -g + shape * 0.25 * (rest[o + 1] + hy - y) + gust * (0.12 + noisy * flutter * 0.3) * h;
          const az = shape * (rest[o + 2] + hz - z) + wz * gust;
          positions[o] += drag * (x - previous[o]) + ax * dt2;
          positions[o + 1] += drag * (y - previous[o + 1]) + ay * dt2;
          positions[o + 2] += drag * (z - previous[o + 2]) + az * dt2;
        }
        previous[o] = x; previous[o + 1] = y; previous[o + 2] = z;
      }
    }
    const strength = [0.94, 0.52, Math.min(0.42, fabric.bend * stiff)];
    for (let iter = 0; iter < 4; iter++) {
      // Alternating sweep direction limits directional bias from Gauss–Seidel relaxation.
      const forward = iter % 2 === 0;
      let l = forward ? 0 : restLengths.length - 1;
      const inc = forward ? 1 : -1;
      for (let n = 0; n < restLengths.length; n++, l += inc) {
        const a = endPoints[2 * l], b = endPoints[2 * l + 1];
        const wa = weights[a], wb = weights[b];
        if (!(wa + wb)) continue;
        const ia = a * 3, ib = b * 3;
        const dx = positions[ib] - positions[ia], dy = positions[ib + 1] - positions[ia + 1], dz = positions[ib + 2] - positions[ia + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-8;
        const p = (1 - restLengths[l] / len) * strength[linkKinds[l]] / (wa + wb);
        const pa = wa * p, pb = wb * p;
        positions[ia] += dx * pa; positions[ia + 1] += dy * pa; positions[ia + 2] += dz * pa;
        positions[ib] -= dx * pb; positions[ib + 1] -= dy * pb; positions[ib + 2] -= dz * pb;
      }
      if (iter % 2) collide(legs, hx, hz);
    }
  }

  function reset() {
    positions.set(rest); previous.set(rest); time = 0; accumulator = 0;
    updateMesh();
  }
  function step(dt, opts = {}, legs = [], hips = opts.hips) {
    accumulator += THREE.MathUtils.clamp(dt, 0, 0.068);
    let moved = false;
    while (accumulator >= fixedStep) {
      integrate(opts, legs, hips);
      accumulator -= fixedStep;
      moved = true;
    }
    if (moved) updateMesh();
  }
  reset();
  return { mesh, step, reset };
}
