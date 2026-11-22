// Dump a top's pattern as plain vertex data for a photo-baked asset.
//
// The runtime rebuilds the same builder for every size, so the asset has to
// mirror it piece for piece: same rows, same columns, same winding, same order.
// Running the real builder here (instead of a second hand-written model) keeps
// the two in step. Only the UVs are decided later, by the baked photographs.
import * as THREE from '../../vendor/three.module.js';
import { attachSample } from '../../sample-garment.mjs';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encode(bytes) {
  const parts = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63]);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const v = bytes[i] << 16;
    parts.push(B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + '==');
  } else if (rest === 2) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8);
    parts.push(B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + '=');
  }
  return parts.join('');
}

// A stand-in rig: the garment's own geometry is built in each joint's local
// frame, so the sleeve only needs a shoulder group to hang from.
function stubBody() {
  const group = new THREE.Group();
  const torso = new THREE.Group();
  group.add(torso);
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * .18, 1.402, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -.30, 0);
    shoulder.add(elbow);
    group.add(shoulder);
    return { shoulder, elbow };
  });
  return { group, parts: { torso, arms }, teeMeshes: [], model: 'female', anatomy: { handPoints: null } };
}

globalThis.__dumpTop = (config) => {
  const body = stubBody();
  const opts = {
    id: config.id, type: config.type, category: config.category || 'top',
    color: config.color, material: config.material || 'cotton',
    pattern: config.pattern || '', measurements: config.measurements,
    adidas: false, photo: true
  };
  attachSample(body, opts, []);
  body.group.updateMatrixWorld(true);
  const pieces = [];
  const walk = (root, frame) => {
    root.traverse(object => {
      if (!object.isMesh) return;
      const position = object.geometry.attributes.position;
      const index = object.geometry.index;
      const idx = new Uint32Array(index ? index.count : position.count);
      for (let i = 0; i < idx.length; i++) idx[i] = index ? index.getX(i) : i;
      const uvs = object.geometry.attributes.uv;
      pieces.push({
        name: object.name,
        frame,
        material: object.material?.name || '',
        count: position.count,
        pos: encode(new Uint8Array(position.array.buffer.slice(0))),
        uv: uvs ? encode(new Uint8Array(uvs.array.buffer.slice(0))) : '',
        idx: encode(new Uint8Array(idx.buffer))
      });
    });
  };
  walk(body.parts.torso, 'torso');
  body.parts.arms.forEach((arm, i) => walk(arm.shoulder, 'arm' + i));
  return JSON.stringify({ pieces, measurements: config.measurements });
};
