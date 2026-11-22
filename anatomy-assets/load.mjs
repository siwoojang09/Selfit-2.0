const jointNames = [
  'pelvis', 'torso', 'head',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'
];

export async function loadAnatomy(model, THREE) {
  const response = await fetch(new URL(model + '.bin', import.meta.url));
  if (!response.ok) throw new Error('인체 모델을 불러오지 못했습니다.');
  const data = await response.arrayBuffer();
  const header = new DataView(data);
  if (data.byteLength < 12 || header.getUint32(0) !== 0x44413031) throw new Error('Invalid anatomy file');
  const vertices = header.getUint32(4, true);
  const indices = header.getUint32(8, true);
  if (!vertices || !indices || indices % 3 || data.byteLength !== 12 + 20 * vertices + 2 * indices) {
    throw new Error('Incomplete anatomy file');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data, 12, vertices * 3), 3));
  const joints = new Uint8Array(data, 12 + 12 * vertices, vertices * 4);
  const weights = new Uint8Array(data, 12 + 16 * vertices, vertices * 4);
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(data, 12 + 20 * vertices, indices), 1));
  geometry.computeVertexNormals();
  return { geometry, joints, weights, jointNames };
}
