// Photographed tops: the garment's surface is the product photograph, baked
// into the pattern's own UV space (see tools/photo-top).
//
// The pattern still cuts every size and deforms the cloth as the wearer moves;
// what the asset decides is what the cloth looks like: the weave as a normal
// map at its real size, the dye as one flat albedo, and the print where the
// product photographs put it.
//
// A photographed garment is the ONLY garment for its id: the drawn stand-in is
// never put on the body, so a slow or failed transfer can delay it but cannot
// show something the user did not photograph.
import { GLTFLoader } from './vendor/GLTFLoader.js';

const ASSET_VERSION = '2026-11-27k';
const pending = new Map();
const ready = new Map();

// id -> the catalog item that wears it. A sample registered by hand with a
// different id is cut and shaded from its own pattern.
const PHOTO_TOPS = new Set(['nike-sport-tee-white', 'underoff-university-hoodie',
  'polo-cable-halfzip', 'trillion-striped-oxford', 'glossy-hooded-puffer',
  'mood-inside-vtg-hood-jacket']);

export function hasPhotoTop(sample) {
  return Boolean(sample && (sample.assetUrl || PHOTO_TOPS.has(String(sample.id || ''))));
}

export function peekTopAsset(id) {
  return ready.get(id) || null;
}

// glTF node names arrive with spaces turned into underscores and an index
// suffix still attached, so pieces are matched on their letters alone.
export function pieceKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '');
}

export function loadTopAsset(id, importedUrl) {
  if (!pending.has(id)) {
    const url = importedUrl || new URL(`./assets/${id}.glb`, import.meta.url).href + '?v=' + ASSET_VERSION;
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const job = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`top asset HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(buffer => new Promise((resolve, reject) => {
        if (typeof document !== 'undefined') document.documentElement.dataset.top = 'parsing ' + buffer.byteLength;
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
            parts.push(part);
            (byName[pieceKey(name)] = byName[pieceKey(name)] || []).push(part);
          });
          resolve({ id, parts, byName });
        }, reject);
      }))
      .then(asset => {
        ready.set(id, asset);
        return asset;
      })
      .catch(error => {
        pending.delete(id);
        ready.delete(id);
        throw error;
      });
    pending.set(id, job);
  }
  return pending.get(id);
}
