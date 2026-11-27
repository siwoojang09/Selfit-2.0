import * as THREE from './vendor/three.module.js';
import { weaveMapsFor, denimMapsFor, loadTwillField, applySheen, luminanceField, reliefNormals, reliefRoughness } from './fabric-pbr.mjs?v=2026-11-27k';
import { attachSample } from './sample-garment.mjs?v=2026-11-27k';
import { createWardrobe } from './wardrobe.mjs?v=2026-11-27k';
import { projectWardrobe, garmentColors } from './projection.mjs?v=2026-11-27k';
import {pantsFit} from './pants-fit.mjs?v=2026-11-27k';
import {wearer} from './hoodie-fit.mjs?v=2026-11-27k';
import { makeMannequin } from './mannequin.mjs?v=2026-11-27k';
import { loadGarmentAsset, peekGarment, hasPhotoGarment } from './photo-denim.mjs?v=2026-11-27k';
import { loadHoodieAsset, peekHoodieAsset, hasPhotoHoodie } from './photo-hoodie.mjs?v=2026-11-27k';
import { loadTopAsset, peekTopAsset, hasPhotoTop } from './photo-top.mjs?v=2026-11-27k';
import { createSoftwareRenderer } from './software.mjs?v=2026-11-27k';

const limit = THREE.MathUtils.clamp;
const tau = Math.PI * 2;
// normalScale/relief describe how strongly each weave bends the light; sheenColor
// is the grazing-angle bloom of that cloth (cool for fleece, warm for silk).
const fabrics = {
  linen: { repeat: 35, roughness: .88, sheen: .26, weave: 'plain', normalScale: .7, relief: { radius: 1, strength: 1.0, contrast: .14, crown: -1 }, sheenColor: '#f2ead9' },
  cotton: { repeat: 48, roughness: .93, sheen: .18, weave: 'knit', normalScale: .75, relief: { radius: 1, strength: 1.15, contrast: .16, crown: 1 }, sheenColor: '#c9ccd4' },
  denim: { repeat: 32, roughness: .87, sheen: .2, weave: 'twill', normalScale: .85, relief: { radius: 1, strength: 1.25, contrast: .13, crown: -1 }, sheenColor: '#dfe6ee' },
  silk: { repeat: 70, roughness: .38, sheen: .91, weave: 'satin', normalScale: .35, relief: { radius: 1, strength: .6, contrast: .08, crown: -1 }, sheenColor: '#fff6e8' },
  wool: { repeat: 22, roughness: 1, sheen: .4, weave: 'knit', normalScale: .9, relief: { radius: 1, strength: 1.3, contrast: .17, crown: 1 }, sheenColor: '#e8e2d6' }
};

function makeWeave(type) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(256, 256);
  let s = 427;
  const noise = () => (s = (1664525 * s + 1013904223) >>> 0) / 4294967296;
  const warp = Array.from({length: 32}, () => noise());
  const weft = Array.from({length: 32}, () => noise());
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const col = x >> 3;
      const row = y >> 3;
      const over = type === 'twill' ? (col + row) % 4 < 3 : (col + row) % 2 === 0;
      const fiber = over ? (x + weft[row] * .5) % 8 : (y + warp[col] * .5) % 8;
      let light = 216 + 20 * Math.sin(Math.PI * fiber / 8);
      light += 12 * ((over ? warp[col] : weft[row]) - .5) + 10 * (noise() - .5);
      if (type === 'knit') light += 7 * Math.cos(tau * (x / 16 + Math.sin(tau * y / 16) * .2));
      if (type === 'satin') light = 238 + (light - 220) * .35;
      const i = (y * 256 + x) * 4;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = light;
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function clothMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: .9, side: THREE.DoubleSide, sheen: .3,
    sheenColor: new THREE.Color('#f7eddf'), sheenRoughness: .78
  });
}

const textileSamples = new Map();

function photographedWeave(name, repeats) {
  if (!['linen', 'cotton', 'denim', 'silk'].includes(name)) return Promise.resolve(null);
  if (!textileSamples.has(name)) {
    const load = new Promise((resolve) => {
      const sample = new Image();
      sample.onload = () => {
        const tile = document.createElement('canvas');
        tile.width = tile.height = 512;
        const ctx = tile.getContext('2d');
        ctx.drawImage(sample, 0, 0, 512, 512);
        const image = ctx.getImageData(0, 0, 512, 512);
        let sum = 0;
        const luma = new Uint8Array(512 * 512);
        for (let i = 0; i < luma.length; i++) {
          const j = 4 * i;
          luma[i] = .213 * image.data[j] + .715 * image.data[j+1] + .072 * image.data[j+2];
          sum += luma[i];
        }
        const mean = sum / luma.length;
        for (let i = 0; i < luma.length; i++) {
          const value = Math.min(253, 228 + .8 * (luma[i] - mean));
          image.data[4*i] = image.data[4*i+1] = image.data[4*i+2] = value;
        }
        ctx.putImageData(image, 0, 0);
        const texture = new THREE.CanvasTexture(tile);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.repeat.set(repeats * .54, repeats * .31);
        texture.anisotropy = 4;
        resolve(texture);
      };
      sample.onerror = () => resolve(null);
      sample.src = new URL('textures/' + name + '.webp', import.meta.url);
    });
    textileSamples.set(name, load);
  }
  return textileSamples.get(name);
}

// Normal + micro-roughness derived from the procedural weave canvas, cached per
// weave type. They carry the same repeat as the colour map they accompany.
const weaveMaps = new Map();
function proceduralWeaveMaps(type, repeatX, repeatY) {
  if (!weaveMaps.has(type)) {
    const size = 256;
    const source = makeWeave(type).image;
    const ctx = source.getContext('2d');
    const pixels = ctx.getImageData(0, 0, size, size);
    const field = luminanceField(pixels.data, size, size);
    const normal = reliefNormals(field, size, size, { radius: 1, strength: 1.1 });
    const rough = reliefRoughness(field, size, size, { radius: 1, contrast: .12, crown: -1 });
    weaveMaps.set(type, { normal, roughness: rough.map, mean: rough.mean });
  }
  const cached = weaveMaps.get(type);
  const textureFor = rgba => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    canvas.getContext('2d').putImageData(new ImageData(rgba, 256, 256), 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 4;
    return texture;
  };
  return {
    normalMap: textureFor(cached.normal), roughnessMap: textureFor(cached.roughness),
    normalScale: new THREE.Vector2(1, 1), roughnessCenter: cached.mean
  };
}

function setTextile(material, name, invalidate = () => {}) {
  if (material.userData.fabric === name) return;
  material.userData.fabric = name;
  const spec = fabrics[String(name).toLowerCase()] || fabrics.linen;
  const map = makeWeave(spec.weave);
  map.repeat.set(spec.repeat, spec.repeat * .75);
  if (material.map?.userData.transient) material.map.dispose();
  map.userData.transient = true;
  material.map = map;
  applySheen(material, { amount: spec.sheen, roughness: .8, color: spec.sheenColor }, THREE);
  material.roughness = spec.roughness;
  const weave = proceduralWeaveMaps(spec.weave, spec.repeat, spec.repeat * .75);
  material.normalMap = weave.normalMap;
  material.normalScale = weave.normalScale.multiplyScalar(spec.normalScale);
  material.roughnessMap = weave.roughnessMap;
  material.roughness = Math.min(1, spec.roughness / weave.roughnessCenter);
  material.needsUpdate = true;
  photographedWeave(name, spec.repeat).then(texture => {
    if (!texture || material.map !== map) return;
    material.map = texture;
    map.dispose();
    const maps = weaveMapsFor(THREE, texture.image, name, texture.repeat.x, texture.repeat.y,
      { relief: spec.relief, normalScale: spec.normalScale });
    if (maps) {
      material.normalMap = maps.normalMap;
      material.normalScale = maps.normalScale;
      material.roughnessMap = maps.roughnessMap;
      material.roughness = Math.min(1, spec.roughness / maps.roughnessCenter);
    }
    material.needsUpdate = true;
    invalidate();
  });
}

function makeContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(60,52,43,.27)');
  gradient.addColorStop(.45, 'rgba(70,61,50,.13)');
  gradient.addColorStop(1, 'rgba(78,70,60,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.92, .72), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .003;
  return mesh;
}

// The stage is a warm stone studio: a light backdrop with no horizon line, a
// turntable the wearer stands on, and the light coming from above and slightly
// left, so a matte black garment keeps its shade instead of turning grey.
export function createScene(container, opts, gestureSurface = container) {
  const scene = new THREE.Scene();
  // A soft top-down studio gradient rather than a flat colour: the backdrop
  // falls off towards the plinth the way a paper sweep does.
  const backdrop = document.createElement('canvas');
  backdrop.width = 4; backdrop.height = 256;
  const backdropCtx = backdrop.getContext('2d');
  const sweep = backdropCtx.createLinearGradient(0, 0, 0, 256);
  sweep.addColorStop(0, '#F7F4EF');
  sweep.addColorStop(.5, '#EFEAE2');
  sweep.addColorStop(1, '#E9E3D9');
  backdropCtx.fillStyle = sweep;
  backdropCtx.fillRect(0, 0, 4, 256);
  const backdropTex = new THREE.CanvasTexture(backdrop);
  backdropTex.colorSpace = THREE.SRGBColorSpace;
  // The body study keeps the same sweep, only neutral: the anatomical figure is
  // grey, and a warm ground behind it reads as a colour cast.
  const backdropBody = document.createElement('canvas');
  backdropBody.width = 4; backdropBody.height = 256;
  const bodyCtx = backdropBody.getContext('2d');
  const bodySweep = bodyCtx.createLinearGradient(0, 0, 0, 256);
  bodySweep.addColorStop(0, '#F2F3F1');
  bodySweep.addColorStop(.5, '#E9EBE8');
  bodySweep.addColorStop(1, '#E1E3E0');
  bodyCtx.fillStyle = bodySweep;
  bodyCtx.fillRect(0, 0, 4, 256);
  const backdropBodyTex = new THREE.CanvasTexture(backdropBody);
  backdropBodyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = backdropTex;
  scene.userData.stageGradient = true;
  scene.userData.backdrop = backdropTex;
  scene.userData.backdropBody = backdropBodyTex;
  scene.fog = new THREE.FogExp2('#EFEAE2', .05);
  const cam = new THREE.PerspectiveCamera(29, 1, .025, 40);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.10;
  } catch {
    renderer = createSoftwareRenderer();
  }
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '3D 피팅 화면. 드래그로 회전하고 두 손가락이나 마우스 휠로 확대·축소합니다.');
  Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab'});
  container.appendChild(canvas);

  scene.add(new THREE.HemisphereLight('#fffdf8', '#d8cdbc', 1.92));
  const key = new THREE.DirectionalLight('#fff7ee', 1.44);
  key.position.set(-2.2, 3.7, 3.4);
  key.castShadow = true;
  Object.assign(key.shadow.camera, {left:-1.5,right:1.5,top:1.6,bottom:-1.6,near:.1,far:9});
  key.shadow.mapSize.set(1024,1024);
  key.shadow.normalBias = .003;
  key.shadow.bias = -.00015;
  scene.add(key, key.target);
  key.target.position.y = .7;
  const rim = new THREE.DirectionalLight('#fffbf3', .85);
  rim.position.set(2, 2.4, -2.5);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100,100), new THREE.MeshStandardMaterial({
    color: '#ECE7DE', roughness: 1
  }));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -.07;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  scene.add(floor);

  // The turntable: a low stone plinth the wearer stands on. It turns with the
  // model (the camera orbits, the plinth is round, so one cylinder is enough),
  // and its top edge catches a lighter line the way the reference does.
  const plinth = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(.64, .66, .095, 96),
    new THREE.MeshStandardMaterial({color: '#E6DFD2', roughness: .96, metalness: 0}));
  drum.position.y = -.0465; drum.receiveShadow = true; drum.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.622, .622, .01, 96),
    new THREE.MeshStandardMaterial({color: '#FCFAF6', roughness: .95, metalness: 0}));
  cap.position.y = -.002; cap.receiveShadow = true;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(.624, .0035, 8, 128),
    new THREE.MeshStandardMaterial({color: '#D8D0C2', roughness: 1}));
  lip.rotation.x = Math.PI / 2; lip.position.y = -.0005;
  plinth.add(drum, cap, lip);
  plinth.name = 'turntable';
  scene.add(plinth, makeContactShadow());

  const grid = new THREE.GridHelper(13,52,'#a79e91','#b8b0a3');
  grid.material.transparent = true;
  grid.material.opacity = .25;
  grid.position.y = -.068;
  scene.add(grid);

  // The body study isolates the anatomical mesh while reusing the fitting skeleton.
  scene.traverse(object=>object.layers.enable(1));
  let body, wardrobe, top, lower, lookKey, sampleGarment;
  // Photographed trousers are kept per garment: the chino and the jeans are two
  // different files, and switching from one pair to the other has to swap the
  // mesh, not keep the first one the scene happened to load. Until a pair is in
  // hand its look hides rather than stands in with the drawn pattern.
  const denimAssets = new Map();      // id -> parsed asset
  const denimLoading = new Set();     // ids whose transfer is in flight
  // The photographed hoodie is one asset for the scene as well: the first look
  // that asks for it starts the transfer, and every later look wears it at once.
  let hoodieAsset = null, hoodieLoading = false;
  // The photographed tops share the same rule: one asset per garment for the
  // whole scene, worn only once it is in hand.
  let topAssets = {}, topLoading = {};
  const lookCache = new Map();
  let motionSamples = [];
  const worldPoint = new THREE.Vector3();

  // Keep representative points on the actual garment to drive the studio front view.
  function sampleMotion() {
    scene.updateMatrixWorld(true);
    const vertices = [];
    const collect = mesh => {
      if (!mesh.isMesh || !['lower','legLeft','legRight'].includes(mesh.userData.garmentPart)) return;
      const position = mesh.geometry.attributes.position;
      for (let i=0; i<position.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
        vertices.push({mesh,i,p});
      }
    };
    wardrobe.group.traverseVisible(collect);
    if (!vertices.length) return [];
    let bottom=Infinity,top=-Infinity;
    for (const {p} of vertices) {bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);}
    return [.69,.36,.025].map(level => {
      const y=bottom+(top-bottom)*level;
      let row=vertices.filter(v => Math.abs(v.p.y-y)<.045 && v.p.z>-.035);
      if (!row.length) row=vertices;
      let xmin=Infinity,xmax=-Infinity;
      row.forEach(({p})=>{xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);});
      return [.04,.25,.5,.75,.96].map(u=>{
        const x=THREE.MathUtils.lerp(xmin,xmax,u);
        let best=row[0], score=Infinity;
        row.forEach(v=>{const d=1.35*Math.abs(v.p.x-x)+Math.abs(v.p.y-y)-v.p.z*.035;if(d<score){score=d;best=v;}});
        return best;
      });
    });
  }
  function selectLook() {
    const model=opts.model==='male'?'male':'female';
    const outfit=['tailored','casual'].includes(opts.outfit)?opts.outfit:'classic';
    // Take the already-parsed asset of THIS pair before the look is built, so
    // a fresh look starts out wearing the right file instead of the pair the
    // scene wore last, one frame later.
    const pantsId=opts.pants&&opts.pants.id?String(opts.pants.id):'';
    if(pantsId&&hasPhotoGarment(opts.pants)&&!denimAssets.has(pantsId)){
      const ready=peekGarment(pantsId);
      if(ready)denimAssets.set(pantsId,ready);
    }
    const pantsAsset=pantsId?denimAssets.get(pantsId)||null:null;
    const key=[model,outfit,Boolean(opts.selectedOnly),opts.bottom||'',Boolean(opts.sample),opts.pants?opts.pants.id:'none',opts.pants?(opts.pants.material||'denim'):'default'].join('-');
    if(key===lookKey)return false;
    if(body){sampleGarment?.dispose();sampleGarment=null;scene.remove(body.group,wardrobe.group);}
    let look=lookCache.get(key);
    if(!look) {
      const colors=garmentColors(outfit);
      const shirt=clothMaterial(colors.top), bottom=clothMaterial(colors.lower);
      const figure=makeMannequin(shirt,model);
      const clothes=createWardrobe(THREE,figure,{top:shirt,lower:bottom},{...opts,model,outfit,
        photoPants:hasPhotoGarment(opts.pants),photoAsset:pantsAsset});
      figure.pose(0,false);
      clothes.pose(0,{...opts,walking:false},0);
      if(!opts.selectedOnly && !opts.sample && !opts.pants)projectWardrobe(figure,clothes,model,outfit,{top:shirt,lower:bottom},()=>{dirty=true;});
      setTextile(shirt,'cotton',()=>{dirty=true;});
      look={body:figure,wardrobe:clothes,top:shirt,lower:bottom,pantsId};
      lookCache.set(key,look);
    }
    ({body,wardrobe,top,lower}=look);
    // A look pooled before its own file finished loading takes it now; a look
    // that was wearing another pair swaps to this one.
    if(pantsAsset && wardrobe.denimAsset!==pantsAsset) wardrobe.setDenimAsset(pantsAsset);
    scene.add(body.group,wardrobe.group);
    lookKey=key;
    return true;
  }
  // The hoodie is only ever the photograph: until the asset is in hand the
  // garment is not built at all, so the drawn pattern can never appear first.
  function adoptHoodieAsset() {
    if (hoodieAsset) return true;
    hoodieAsset = peekHoodieAsset();
    if (hoodieAsset) return true;
    if (!hoodieLoading) {
      hoodieLoading = true;
      document.documentElement.dataset.hoodie = 'loading';
      loadHoodieAsset().then(asset => {
        hoodieAsset = asset;
        document.documentElement.dataset.hoodie = 'worn ' + asset.parts.length;
        // Nothing was built while the file was in flight, so ask for the same
        // top again: this time the builder has the photographs.
        if (hasPhotoHoodie(opts.sample)) update({sample:opts.sample});
      }).catch(error => {
        document.documentElement.dataset.hoodie = 'failed ' + (error && error.message || error);
        console.warn('hoodie asset', error);
        window.dispatchEvent(new CustomEvent('drape:garment-error',{detail:'KC9315'}));
      }).finally(() => { hoodieLoading = false; });
    }
    return false;
  }

  // A photographed top (the Nike tee and the rest of the wardrobe) arrives the
  // same way the hoodie does: the garment is not built until its own surface is
  // in hand, so the drawn stand-in can never appear.
  function adoptTopAsset(sample) {
    const id = String(sample?.id || '');
    if (!id || !hasPhotoTop(sample)) return true;
    if (topAssets[id]) return true;
    const cached = peekTopAsset(id);
    if (cached) { topAssets[id] = cached; return true; }
    if (!topLoading[id]) {
      topLoading[id] = true;
      document.documentElement.dataset.top = 'loading ' + id;
      loadTopAsset(id, sample.assetUrl).then(asset => {
        topAssets[id] = asset;
        document.documentElement.dataset.top = 'worn ' + asset.parts.length;
        if (opts.sample?.id===id) update({sample:opts.sample});
      }).catch(error => {
        document.documentElement.dataset.top = 'failed ' + (error && error.message || error);
        console.warn('top asset', error);
        window.dispatchEvent(new CustomEvent('drape:garment-error',{detail:id}));
      }).finally(() => { topLoading[id] = false; });
    }
    return false;
  }

  // Put the photographed jeans on every look the scene holds. The first call
  // may have to wait for the transfer; after that the parsed asset is shared, so
  // a new look, a size change or a model switch wears it immediately.
  function adoptDenimAsset() {
    const id = opts.pants && opts.pants.id ? String(opts.pants.id) : '';
    if (!id || !hasPhotoGarment(opts.pants)) return;
    let asset = denimAssets.get(id) || peekGarment(id);
    if (!asset) {
      if (denimLoading.has(id)) return;
      denimLoading.add(id);
      document.documentElement.dataset.denim = 'loading ' + id;
      loadGarmentAsset(id).then(loaded => {
        denimAssets.set(id, loaded);
        let worn = false;
        // Only the looks cut for this pair may wear it; a pooled look of the
        // other pair keeps its own file.
        for (const look of lookCache.values()) {
          if (look.pantsId === id) worn = look.wardrobe.setDenimAsset(loaded) || worn;
        }
        document.documentElement.dataset.denim = worn ? 'worn ' + id + ' ' + loaded.parts.length : 'mismatch ' + id;
        if (opts.pants?.id===id) update({pants:opts.pants});
      }).catch(error => {
        document.documentElement.dataset.denim = 'failed ' + id + ' ' + (error && error.message || error);
        console.warn('denim asset', error);
        window.dispatchEvent(new CustomEvent('drape:garment-error',{detail:id}));
      }).finally(() => { denimLoading.delete(id); });
      return;
    }
    denimAssets.set(id, asset);
    if (wardrobe.denimAsset !== asset) wardrobe.setDenimAsset(asset);
    // The asset arrived from cache this time, so nothing above announced it.
    if (wardrobe.denimAsset === asset) {
      const state = 'worn ' + id + ' ' + asset.parts.length;
      if (document.documentElement.dataset.denim !== state) document.documentElement.dataset.denim = state;
    }
  }
  let yaw = .045, pitch = .045, targetYaw = yaw, targetPitch = pitch;
  let cameraZoom = 1, panX = 0, panY = 0, targetPanX = 0, targetPanY = 0;
  let worldPerPixel = 0;
  let frameTime = Number(opts.time) || 0, phase = frameTime * tau * .83 * limit(Number(opts.speed) || 0, 0, 4) + .8;
  let previous = 0, accumulator = 0, lastStats = 0, frames = 0, fps = 0, dirty = true;
  let width = 1, height = 1, heightRatio=1;
  const stepSize = 1/60;
  const worldUp = new THREE.Vector3(0,1,0);
  const getZoom = () => limit(Number(opts.zoom) || 1, .46, 3.3);
  function zoomBy(factor) {
    const current = getZoom();
    const next = limit(current * factor, .46, 3.3);
    if (next === current) return;
    opts.zoom = next;
    dirty = true;
  }
  const updateCamera = () => {
    const zoom = cameraZoom;
    const closePants=opts.view==='pants',closeFit=opts.view==='fit',detail=opts.view==='finish';
    // The stage is a full-height column, so the frame holds the wearer and the
    // turntable under them: about 2.5 m of height at the focus, not the 2 m a
    // short landscape panel needed.
    const distance = Math.max(detail?1.72:closePants?4.62:closeFit?2.95:opts.model==='male'?5.35:5.12, (detail?1.62:2.02) / Math.max(.25, cam.aspect)) * heightRatio / zoom;
    const focus = (detail?.98:closePants?.86:closeFit?1.19:1.0) * heightRatio + Math.max(0, zoom - 1) * .1;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, focus + Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    cam.up.copy(worldUp);
    cam.lookAt(0, focus, 0);
    cam.translateX(-panX);
    cam.translateY(panY);
    cam.updateMatrixWorld();
    worldPerPixel = 2 * distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / height;
  };
  const resize = () => {
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    updateCamera();
    dirty = true;
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const nativeTouch = 'ontouchstart' in window;
  const point = event => ({x:event.clientX, y:event.clientY});
  function moveContacts(contacts, positions) {
    const [oldA, oldB] = contacts.values();
    if (!oldA) return;
    for (const [id, position] of positions) {
      const contact = contacts.get(id);
      if (contact) contacts.set(id, {...contact, ...position});
    }
    const [a, b] = contacts.values();
    if (!b) {
      targetYaw -= (a.x - oldA.x) * .01;
      targetPitch = limit(targetPitch + (a.y - oldA.y) * .005, -.16, .64);
    } else {
      const before = Math.hypot(oldA.x - oldB.x, oldA.y - oldB.y);
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 12 && after > 12) zoomBy(after / before);
      targetPanX = limit(targetPanX + (a.x + b.x - oldA.x - oldB.x) * worldPerPixel / 2, -1.5, 1.5);
      targetPanY = limit(targetPanY + (a.y + b.y - oldA.y - oldB.y) * worldPerPixel / 2, -1.5, 1.5);
    }
    dirty = true;
  }

  if (nativeTouch) {
    const contacts = new Map();
    const touchOptions = {capture:true, passive:false};
    const touchPositions = event => Array.from(event.touches, touch => [touch.identifier, point(touch)]);
    gestureSurface.addEventListener('touchstart', event => {
      // One contact must start on the render area. Further contacts can land
      // over the stage controls without turning a pinch into a rotation.
      if (!contacts.size && !container.contains(event.target)) return;
      event.preventDefault();
      for (const touch of Array.from(event.touches)) {
        if (gestureSurface.contains(touch.target)) contacts.set(touch.identifier, point(touch));
      }
    }, touchOptions);
    gestureSurface.addEventListener('touchmove', event => {
      if (!Array.from(event.changedTouches).some(touch => contacts.has(touch.identifier))) return;
      event.preventDefault();
      moveContacts(contacts, touchPositions(event));
    }, touchOptions);
    const endTouch = event => {
      for (const touch of Array.from(event.changedTouches)) contacts.delete(touch.identifier);
      // Rebase the surviving finger before switching back to rotation.
      for (const [id, position] of touchPositions(event)) {
        if (contacts.has(id)) contacts.set(id, position);
      }
    };
    gestureSurface.addEventListener('touchend', endTouch, touchOptions);
    gestureSurface.addEventListener('touchcancel', endTouch, touchOptions);
    // Safari can dispatch its own page-zoom gesture alongside touch events.
    const keepZoomInStage = event => {
      if (contacts.size || container.contains(event.target)) event.preventDefault();
    };
    gestureSurface.addEventListener('gesturestart', keepZoomInStage, touchOptions);
    gestureSurface.addEventListener('gesturechange', keepZoomInStage, touchOptions);
  }

  const pointers = new Map();
  gestureSurface.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (nativeTouch && event.pointerType === 'touch')) return;
    const first = pointers.values().next().value;
    if (!first && !container.contains(event.target)) return;
    if (first && (first.type !== 'touch' || event.pointerType !== 'touch')) return;
    pointers.set(event.pointerId, {...point(event), type:event.pointerType});
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  gestureSurface.addEventListener('pointermove', event => {
    if (pointers.has(event.pointerId)) moveContacts(pointers, [[event.pointerId, point(event)]]);
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (!pointers.size) canvas.style.cursor = 'grab';
  };
  gestureSurface.addEventListener('pointerup', release);
  gestureSurface.addEventListener('pointercancel', release);
  gestureSurface.addEventListener('lostpointercapture', release);
  canvas.addEventListener('wheel', event => {
    if (!event.deltaY) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const pixels = event.deltaY * scale;
    zoomBy(Math.exp(-limit(pixels * (event.ctrlKey ? .01 : .0015), -.3, .3)));
  }, {passive:false});

  function poseAndStep(dt) {
    body.pose(phase, opts.walking, opts.bodyOnly);
    if(opts.bodyOnly)return;
    wardrobe.pose(phase, opts, dt);
    sampleGarment?.pose(phase,opts,dt);
  }
  function settle() {
    if (opts.bodyOnly) {
      body.pose(phase, opts.walking, true);
    } else {
      wardrobe.reset();
      sampleGarment?.resetCloth?.();
      for(let i=0; i<10; i++) poseAndStep(stepSize);
    }
    dirty = true;
  }
  function update(changes) {
    const changedLook=selectLook();
    wardrobe.updatePants(opts);
    // A short dark crew reveals the waistband in a lower-garment fitting.
    let displayTop=opts.sample;
    if(!opts.selectedOnly && opts.pants && !displayTop){
      const f=pantsFit(opts.pants.measurements,opts.model,opts.person),w=f.w;
      // Cropped just above the waistband so the band, its loops and the fly are
      // what the fitting view is looking at. The hem overlaps the band by a
      // couple of centimetres, as a crew neck sits on a jean in wear: a hem
      // that stops exactly at the band leaves a strip of bare waist when the
      // body moves.
      displayTop={id:'pants-studio-crew',type:'sweatshirt',color:'#24252a',material:'cotton',
        measurements:{length:Math.max(30,(w.base.apex-f.waistY)*100+2.1),
          chest:Math.max(47,w.chest*.5+8),shoulder:Math.max(41,w.shoulder+4),sleeve:54}};
    }
    if(changedLook || ('sample' in changes || 'pants' in changes) || 'bodyOnly' in changes || 'person' in changes){
      const active=opts.person && (opts.selectedOnly || opts.bodyOnly || opts.pants || opts.sample?.id==='KC9315');
      const user=active?wearer(opts.model,opts.person):null;
      heightRatio=user?.sy||1;
      body.group.scale.y=heightRatio;
      const width=displayTop?.measurements?.chest||0;
      const bodyChest=(displayTop?.id==='KC9315'||displayTop?.imported)?(user||wearer(opts.model)).chest:2*width;
      body.group.userData.armClearance=.145+Math.min(.13,Math.max(0,2*width-bodyChest)*.002)+Math.max(0,(user?.chest||0)-(user?.base.chest||0))*.004
        // A wide-hip trouser stands off the body by the tape's own ease, so the
        // hanging arms step aside instead of disappearing into the cloth.
        +(opts.pants?Math.min(.10,Math.max(0,(pantsFit(opts.pants.measurements,opts.model,opts.person).hipCirc
          -(user?.hip||wearer(opts.model,opts.person).hip)/100))*.30):0);
      const hipScale=user&&!opts.pants?user.hip/user.base.hip:1;
      wardrobe.group.scale.set(hipScale,heightRatio,hipScale);
      body.anatomy.setWearer(user);
    }
    if (hasPhotoGarment(opts.pants)) adoptDenimAsset();
    if(changedLook || 'sample' in changes || 'pants' in changes || 'person' in changes || 'bodyOnly' in changes){
      const photographed=hasPhotoHoodie(displayTop);
      const photographedTop=hasPhotoTop(displayTop);
      const readyToWear=(!photographed||adoptHoodieAsset())&&(!photographedTop||adoptTopAsset(displayTop));
      if(displayTop&&readyToWear){
        const upper={...displayTop,person:opts.person,photoHoodie:photographed||displayTop.adidas,
          hoodieAsset:photographed?hoodieAsset:null,
          topAsset:photographedTop?topAssets[String(displayTop.id)]:null,onReady:()=>{dirty=true;}};
        if(sampleGarment)sampleGarment.update(upper);
        else sampleGarment=attachSample(body,upper,wardrobe.lowerColliders);
        sampleGarment.pose(phase,opts,0);
      }else if(sampleGarment){sampleGarment.dispose();sampleGarment=null;}
      const lowerPending=opts.selectedOnly&&hasPhotoGarment(opts.pants)&&!wardrobe.denimAsset;
      const bareLower=opts.selectedOnly&&(lowerPending||(!opts.pants&&opts.bottom==='none'));
      body.shoeMeshes.forEach(mesh=>{mesh.visible=!bareLower;});
      body.anatomy.setCoverage(Boolean(opts.bodyOnly),{
        ...opts,sample:!opts.selectedOnly||readyToWear?displayTop:null,
        pants:lowerPending?null:opts.pants,
        bottom:lowerPending?'none':opts.bottom
      });
    }
    // A photographed pair wears its own material on every piece, so the shared
    // cloth material is never painted for it.
    if (!hasPhotoGarment(opts.pants)) {
      if (opts.pants && (opts.pants.material||'denim')==='denim' && !wardrobe.denimAsset) {
        if(!lower.userData.measuredWash){
          // The wash layer is one shaded surface per leg size, woven at a true
          // metre pitch: colour, normal and micro-roughness together, so the
          // denim reads as twill under light instead of a printed photograph.
          lower.userData.measuredWash='pending';
          applySheen(lower, { amount: .34, roughness: .62, color: '#dfe6ee' }, THREE);
          // The measured pieces share this material object, so the maps land on
          // every shell, band, patch and thread mesh at once.
          const applyMaps = maps => {
            if (!maps || lower.userData.measuredWash !== 'pending') return;
            lower.userData.measuredWash = maps;
            lower.map = maps.map;
            lower.normalMap = maps.normalMap;
            lower.normalScale = maps.normalScale;
            lower.roughnessMap = maps.roughnessMap;
            lower.roughness = Math.min(1, .855 / maps.roughnessCenter);
            lower.needsUpdate = true;
            dirty = true;
          };
          applyMaps(denimMapsFor(THREE, {across:.68, along:1.03, fade:1}));
          loadTwillField(new URL('./textures/washed-jean-twill.webp',import.meta.url).href)
            .then(mottle => applyMaps(denimMapsFor(THREE, {across:.68, along:1.03, mottle, fade:1})));
        }
        lower.color.set(opts.pants.color||'#596e74').multiplyScalar(1.99);
      } else {
        if (changedLook || 'fabric' in changes) setTextile(lower, opts.fabric, () => { dirty = true; });
        if (changedLook || 'color' in changes) lower.color.set(opts.color || garmentColors(opts.outfit || 'classic').lower);
      }
    }
    if (changedLook || 'topColor' in changes) top.color.set(opts.topColor && opts.topColor !== '#b4532e' ? opts.topColor : garmentColors(opts.outfit || 'classic').top);
    if (changedLook || 'wireframe' in changes) {
      lower.wireframe = top.wireframe = Boolean(opts.wireframe);
      body.anatomy.setWireframe(Boolean(opts.wireframe));
    }
    if ('bodyOnly' in changes || 'grid' in changes){
      cam.layers.set(opts.bodyOnly?1:0);
      grid.visible=Boolean(opts.grid);
      scene.userData.bodyStudy=Boolean(opts.bodyOnly);
      scene.background = opts.bodyOnly ? scene.userData.backdropBody : scene.userData.backdrop;
      scene.fog.color.set(opts.bodyOnly?'#E2E5E2':'#EFEAE2');
      floor.material.color.set(opts.bodyOnly?'#DDE0DD':'#ECE7DE');
    }
    if ('view' in changes) {
      const angles = {pants:.08,finish:.24,fit:.22,study:.47,front: .045, side: Math.PI/2, back: Math.PI + .13, left: -Math.PI/2, right:Math.PI/2};
      targetYaw = angles[opts.view] ?? .045;
      targetPitch = opts.view==='study'?.29:.045;
      yaw = targetYaw;
      pitch = targetPitch;
      panX = targetPanX = panY = targetPanY = 0;
    }
    if ('time' in changes) {
      frameTime = Math.max(0, Number(opts.time)||0);
      phase = frameTime * tau * .83 * limit(Number(opts.speed) || 0, 0, 4) + .8;
      accumulator = 0;
      settle();
    } else if (changedLook || ('sample' in changes || 'pants' in changes) || 'person' in changes || 'bodyOnly' in changes || ('walking' in changes && !opts.playing)) {
      settle();
    }
    if(changedLook || 'bodyOnly' in changes || 'pants' in changes || 'person' in changes)motionSamples=opts.bodyOnly?[]:sampleMotion();
    dirty = true;
  }
  function motion() {
    const bands=motionSamples.map(row=>row.map(({mesh,i,p})=>{worldPoint.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld).sub(p);return {x:worldPoint.x,y:worldPoint.y,z:worldPoint.z};}));
    const hips=body?.hipsFromPose || worldUp;
    return {phase,time:frameTime,hips:{x:hips.x,y:hips.y,z:hips.z},bands,hems:bands[2]||[]};
  }
  function stats() {
    return {fps, time:frameTime, hemLift:(sampleGarment?.hemRise||0)*heightRatio, vertices: wardrobe?.vertices || 0, renderer: renderer.isWebGLRenderer ? 'WebGL' : 'Canvas', secondary: cloth()};
  }
  // Everything the secondary-motion work has to keep finite: garment metrics
  // plus a full sweep of the deformed vertices for NaN or explosive values.
  function cloth() {
    const out={pants:null,top:null,nonFinite:0,vertices:0};
    const scan=mesh=>{
      const attribute=mesh?.geometry?.attributes?.position; if(!attribute||!mesh.visible)return;
      const array=attribute.array; out.vertices+=attribute.count;
      for(let i=0;i<array.length;i+=3){
        if(!Number.isFinite(array[i])||!Number.isFinite(array[i+1])||!Number.isFinite(array[i+2]))out.nonFinite++;
      }
    };
    wardrobe?.group.traverseVisible(scan);
    body?.group.traverseVisible(scan);
    out.pants=wardrobe?.secondary||null;
    out.top=sampleGarment?.secondary||null;
    return out;
  }
  function draw(now) {
    requestAnimationFrame(draw);
    const delta = previous ? Math.min((now - previous)/1000, .06) : 0;
    previous = now;
    if (!width || !height || document.hidden) return;
    if (opts.playing) {
      accumulator = Math.min(.12, accumulator + delta);
      while (accumulator >= stepSize) {
        frameTime += stepSize;
        if (opts.walking) phase += stepSize * tau * .83 * limit(Number(opts.speed) || 0, 0, 4);
        poseAndStep(stepSize);
        accumulator -= stepSize;
      }
      dirty = true;
    }
    const desiredZoom = getZoom();
    const moving = Math.abs(targetYaw-yaw) + Math.abs(targetPitch-pitch) +
      Math.abs(desiredZoom-cameraZoom) + Math.abs(targetPanX-panX) + Math.abs(targetPanY-panY) > .0001;
    if (!dirty && !moving) return;
    const easing = 1 - Math.pow(.62, (delta || stepSize) / stepSize);
    yaw += (targetYaw - yaw) * easing;
    pitch += (targetPitch - pitch) * easing;
    cameraZoom += (desiredZoom - cameraZoom) * easing;
    panX += (targetPanX - panX) * easing;
    panY += (targetPanY - panY) * easing;
    updateCamera();
    if(opts.render3D!==false && !opts.portrait) renderer.render(scene, cam);
    dirty = false;
    frames++;
    if (now - lastStats > 450) {
      fps = Math.round(frames * 1000 / (now-lastStats));
      frames = 0;
      lastStats = now;
      window.dispatchEvent(new CustomEvent('drape:stats',{detail:stats()}));
    }
  }
  update(opts);
  requestAnimationFrame(draw);
  // A small read-only handle for the asset diagnostics the fitting screen's
  // `dataset` flags point at (`document.documentElement.dataset.hoodie`).
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, '__selfit', {value: {
      get top(){ return sampleGarment?.inspect?.() || null; },
      get hoodie(){ return hoodieAsset ? hoodieAsset.parts.length : 0; },
      get topAsset(){ return topAssets[String(opts.sample?.id)] || null; }
    }, configurable: true});
  }
  return {update, zoomBy, stats, motion, cloth, probe: () => ({lower: wardrobe?.probe||null, top: sampleGarment?.probe||null}),
    reset() {yaw = targetYaw = .045; pitch = targetPitch = .045;}};
}
