// The real garment: the adidas 3-Stripes zip hoodie, surface and all, built
// from the product flat lays.
//
// The GLB carries the pattern's pieces with UVs unwrapped onto photographs of
// the actual garment: the knitted body, the drawcord-free hood laid down the
// back, the cream sleeve stripes, the ribbed hem and cuffs, and the silver
// two-way zip. The fitting rig still cuts every size from the measurement table
// and deforms the cloth as the wearer walks; only the surface is the product.
//
// This asset is the ONLY hoodie for `KC9315`: the drawn pattern (solid colours,
// modelled pockets, stripe tapes, embroidery) is never worn for that item, so a
// slow or failed transfer can delay the hoodie but cannot put a stand-in on the
// body.
import { GLTFLoader } from './vendor/GLTFLoader.js';

const ASSET_VERSION = '2026-11-24p';
const pending = new Map();
const ready = new Map();

export function hasPhotoHoodie(sample) {
  return Boolean(sample && /kc9315/i.test(String(sample.id || sample.code || '')));
}

export function peekHoodieAsset() {
  return ready.get('KC9315') || null;
}

// glTF node names arrive with spaces turned into underscores and the index
// suffix still attached, so pieces are matched on their letters alone.
export function pieceKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '');
}

function note(state) {
  if (typeof document !== 'undefined') document.documentElement.dataset.hoodie = state;
}

export function loadHoodieAsset() {
  if (!pending.has('KC9315')) {
    const url = new URL('./assets/adidas-kc9315.glb', import.meta.url).href + '?v=' + ASSET_VERSION;
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const job = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`hoodie asset HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(buffer => new Promise((resolve, reject) => {
        note('parsing ' + buffer.byteLength);
        new GLTFLoader().parse(buffer, base, gltf => {
          const parts = [], byName = {};
          gltf.scene.traverse(object => {
            if (!object.isMesh) return;
            const name = String(object.name || '').replace(/#\d+$/, '');
            const uv = object.geometry.attributes.uv;
            if (!uv) return;
            const material = object.material;
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
              const texture = material?.[key];
              if (texture) texture.anisotropy = 8;
            }
            if (material) material.needsUpdate = true;
            const part = { name, uv, material };
            const key = pieceKey(name);
            parts.push(part);
            (byName[key] = byName[key] || []).push(part);
          });
          resolve({ id: 'KC9315', parts, byName });
        }, reject);
      }))
      .then(asset => {
        ready.set('KC9315', asset);
        return asset;
      })
      .catch(error => {
        pending.delete('KC9315');
        ready.delete('KC9315');
        throw error;
      });
    pending.set('KC9315', job);
  }
  return pending.get('KC9315');
}
