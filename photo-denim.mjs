// The real garment: a photo-mapped denim asset built from the product flat lays.
//
// The GLB carries the shell mesh, its unwrapped photo textures and the fabric
// response. The fitting rig still places every vertex (so each size is cut from
// the measurement table and the walk deforms it), but the surface you look at is
// the actual pair of jeans rather than a drawn approximation.
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const cache = new Map();

export function hasPhotoGarment(pants) {
  return Boolean(pants && pants.id === 'washed-denim-medium-blue');
}

export function loadGarmentAsset(id) {
  if (!cache.has(id)) {
    cache.set(id, new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(new URL(`./assets/${id}.glb`, import.meta.url).href, gltf => {
        // Collect first: the loader nests one mesh per primitive under the
        // glTF mesh node, and their order is the order the pattern must wear.
        const meshes = [];
        gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
        const parts = meshes.map(object => ({
          geometry: object.geometry,
          material: object.material,
          count: object.geometry.attributes.position.count
        }));
        resolve({ id, parts });
      }, undefined, error => {
        cache.delete(id);
        reject(error);
      });
    }));
  }
  return cache.get(id);
}
