// Visual yarn-scale presets. The reference photograph does not establish a yarn
// gauge or measured roughness; tile dimensions below keep the estimated weave
// the same physical size when a larger pattern uses the same normalized UVs.
const textiles = {
  knit: { tileM: .032, roughness: .92, bumpM: .00065 },
  rib:  { tileM: .036, roughness: .95, bumpM: .00105 },
  tape: { tileM: .026, roughness: .79, bumpM: .00040 }
};
const images = new Map();

function tileImage(name) {
  let pending = images.get(name);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load ' + name + ' fabric tile'));
      image.src = new URL('./textures/kc9315-' + name + '.webp', import.meta.url).href;
    }).catch(error => {
      images.delete(name);
      throw error;
    });
    images.set(name, pending);
  }
  return pending;
}

// circumferenceM and lengthM are the surface distances covered by the U and V
// axes. On a narrow stripe, pass tape width in place of circumference.
export function applyHoodieTextile(T, material, role, circumferenceM, lengthM, onReady) {
  const name = role === 'rib' ? 'rib' : ['stripe', 'twill', 'tape'].includes(role) ? 'tape' : 'knit';
  const preset = textiles[name];
  material.roughness = preset.roughness;
  material.metalness = 0;
  if (typeof Image === 'undefined') return;

  // Texture transforms belong to each pattern piece, but all sizes share the
  // decoded image. The existing garment cleanup disposes this one texture.
  const texture = new T.Texture();
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.repeat.set(circumferenceM / preset.tileM, lengthM / preset.tileM);
  material.map = material.bumpMap = texture;
  material.bumpScale = preset.bumpM;
  material.needsUpdate = true;

  let disposed = false;
  texture.addEventListener('dispose', () => { disposed = true; });
  tileImage(name).then(image => {
    if (disposed || material.map !== texture) return;
    texture.image = image;
    texture.needsUpdate = true;
    onReady?.();
  }).catch(() => {
    if (disposed || material.map !== texture) return;
    material.map = material.bumpMap = null;
    texture.dispose();
    material.needsUpdate = true;
    onReady?.();
  });
}
