// Dump the measured wide chino as plain vertex data for the photo-mapped GLB.
//
// The runtime rebuilds this exact pattern for every size; the asset therefore
// has to mirror it piece for piece. Running the real builder here (instead of a
// second hand-written model) keeps the two in step: same rows, same columns,
// same winding, same order.
import * as THREE from '../../vendor/three.module.js';
import { makeMeasuredPants } from '../../measured-pants.mjs';

const measurements = { length: 107, waist: 39, hip: 55, thigh: 39.5, rise: 36, hem: 26 };

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

function stubBody() {
  const legs = [];
  for (const s of [-1, 1]) {
    legs.push({ a: new THREE.Vector3(s * .091, .96, 0), b: new THREE.Vector3(s * .091, .52, 0) });
    legs.push({ a: new THREE.Vector3(s * .091, .52, 0), b: new THREE.Vector3(s * .091, .08, 0) });
  }
  return { legs };
}

globalThis.__dumpChino = () => {
  const group = new THREE.Group();
  const cloth = new THREE.MeshPhysicalMaterial();
  const pants = makeMeasuredPants(THREE, group, stubBody(), cloth, {
    pants: { measurements, color: '#c3b696', material: 'cotton' },
    model: 'female', person: null, photoDenim: true
  });
  const pieces = [];
  for (const mesh of group.children) {
    if (!mesh.name.startsWith('Measured denim ')) continue;
    const position = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const index = mesh.geometry.index;
    const idx = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) idx[i] = index.getX(i);
    const label = mesh.name.slice('Measured denim '.length);
    const side = label.startsWith('left') ? 'left' : 'right';
    pieces.push({
      name: label,
      side,
      layer: label.split(' ')[1],
      count: position.count,
      pos: encode(new Uint8Array(position.array.buffer.slice(0))),
      uv: encode(new Uint8Array(uv.array.buffer.slice(0))),
      idx: encode(new Uint8Array(idx.buffer))
    });
  }
  return JSON.stringify({ pieces, guide: pants.rowGuide(192), landmarks: pants.landmarks });
};
