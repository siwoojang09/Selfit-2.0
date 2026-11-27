// Visual yarn-scale presets. The reference photograph does not establish a yarn
// gauge or measured roughness; tile dimensions below keep the estimated weave
// the same physical size when a larger pattern uses the same normalized UVs.
//
// The photographed tile stays the colour source; its normal and micro-roughness
// come from fabric-pbr.mjs, derived from the tile's own weave relief. Feeding the
// colour image to `bumpMap` only nudged the diffuse term, so the knit read as a
// flat print: with a normal map the same relief bends the light, and fleece gets
// the grazing-angle bloom (`sheen`) a plain standard material cannot express.
import { weaveMapsFor, applySheen } from './fabric-pbr.mjs?v=2026-11-27p';

const textiles = {
  knit: { tileM: .032, roughness: .90, relief: { radius: 1, strength: 1.35, contrast: .16, crown: 1 },
    normalScale: .85, sheen: { amount: .58, roughness: .86, color: '#c9ccd4' } },
  rib:  { tileM: .036, roughness: .93, relief: { radius: 1, strength: 1.6, contrast: .18, crown: 1 },
    normalScale: 1.1, sheen: { amount: .5, roughness: .8, color: '#c9ccd4' } },
  tape: { tileM: .026, roughness: .72, relief: { radius: 1, strength: .9, contrast: .1, crown: -1 },
    normalScale: .65, sheen: { amount: .3, roughness: .55, color: '#e8e4da' } }
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
  material.metalness = 0;
  applySheen(material, preset.sheen, T);
  if (typeof Image === 'undefined') return;

  // Texture transforms belong to each pattern piece, but all sizes share the
  // decoded image. The garment cleanup disposes these textures with the material.
  const texture = new T.Texture();
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.repeat.set(circumferenceM / preset.tileM, lengthM / preset.tileM);
  material.map = texture;
  material.needsUpdate = true;

  let disposed = false;
  texture.addEventListener('dispose', () => { disposed = true; });
  tileImage(name).then(image => {
    if (disposed || material.map !== texture) return;
    texture.image = image;
    texture.needsUpdate = true;
    const maps = weaveMapsFor(T, image, name, texture.repeat.x, texture.repeat.y,
      { relief: preset.relief, normalScale: preset.normalScale });
    if (maps && !disposed && material.map === texture) {
      material.normalMap = maps.normalMap;
      material.normalScale = maps.normalScale;
      material.roughnessMap = maps.roughnessMap;
      // The roughness map is centred on its own mean, so dividing keeps the
      // fabric's average response at the preset value.
      material.roughness = Math.min(1, preset.roughness / maps.roughnessCenter);
    }
    material.needsUpdate = true;
    onReady?.();
  }).catch(() => {
    if (disposed || material.map !== texture) return;
    material.map = null;
    texture.dispose();
    material.needsUpdate = true;
    onReady?.();
  });
}
