// The real garment: a photo-mapped denim asset built from the product flat lays.
//
// The GLB carries the shell mesh, its unwrapped photo textures and the fabric
// response. The fitting rig still places every vertex (so each size is cut from
// the measurement table and the walk deforms it), but the surface you look at is
// the actual pair of jeans rather than a drawn approximation.
import { GLTFLoader } from './vendor/GLTFLoader.js';

// Bumped whenever the baked asset changes: GitHub Pages caches files for ten
// minutes, and a garment that arrives stale reads as the wrong fabric entirely.
const ASSET_VERSION = '2026-11-22j';
const cache = new Map();

export function hasPhotoGarment(pants) {
  return Boolean(pants && pants.id === 'washed-denim-medium-blue');
}

function note(state) {
  if (typeof document !== 'undefined') document.documentElement.dataset.denim = state;
}

export function loadGarmentAsset(id) {
  if (!cache.has(id)) {
    const url = new URL(`./assets/${id}.glb`, import.meta.url).href + '?v=' + ASSET_VERSION;
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    // Fetch the container here rather than inside the loader so a stalled or
    // refused transfer surfaces as a rejection instead of a load that never ends.
    const job = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`denim asset HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(buffer => new Promise((resolve, reject) => {
        note('parsing ' + buffer.byteLength);
        new GLTFLoader().parse(buffer, base, gltf => {
          // Collect first: the loader nests one mesh per primitive under the
          // glTF mesh node, and their order is the order the pattern wears them.
          const meshes = [];
          gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
          // A trouser leg is read almost edge-on: without anisotropy the
          // photograph smears into one flat tone along every curve.
          for (const object of meshes) {
            const material = object.material;
            if (!material) continue;
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
              const texture = material[key];
              if (texture) texture.anisotropy = 8;
            }
            material.needsUpdate = true;
          }
          resolve({
            id,
            parts: meshes.map(object => ({
              geometry: object.geometry,
              material: object.material,
              count: object.geometry.attributes.position.count
            }))
          });
        }, reject);
      }))
      .catch(error => {
        cache.delete(id);
        throw error;
      });
    cache.set(id, job);
  }
  return cache.get(id);
}
