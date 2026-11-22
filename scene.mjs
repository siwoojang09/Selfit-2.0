import * as THREE from './vendor/three.module.js';
import { weaveMapsFor, denimMapsFor, loadTwillField, applySheen, luminanceField, reliefNormals, reliefRoughness } from './fabric-pbr.mjs';
import { attachSample } from './sample-garment.mjs';
import { createWardrobe } from './wardrobe.mjs?v=2026-11-22k';
import { projectWardrobe, garmentColors } from './projection.mjs';
import {pantsFit} from './pants-fit.mjs';
import {wearer} from './hoodie-fit.mjs';
import { makeMannequin } from './mannequin.mjs';
import { loadGarmentAsset, peekGarment, hasPhotoGarment } from './photo-denim.mjs?v=2026-11-22k';
import { createSoftwareRenderer } from './software.mjs';

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

export function createScene(container, opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9d3ca');
  scene.fog = new THREE.FogExp2(scene.background, .14);
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
  canvas.setAttribute('aria-label', '회전하고 확대할 수 있는 실시간 의상 시뮬레이션');
  Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab'});
  container.appendChild(canvas);

  scene.add(new THREE.HemisphereLight('#fffcf7', '#cfbdaa', 2.08));
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
    color: '#d2cbc1', roughness: 1
  }));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -.003;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  scene.add(floor, makeContactShadow());

  const grid = new THREE.GridHelper(13,52,'#a79e91','#b8b0a3');
  grid.material.transparent = true;
  grid.material.opacity = .25;
  grid.position.y = -.001;
  scene.add(grid);

  // The body study isolates the anatomical mesh while reusing the fitting skeleton.
  scene.traverse(object=>object.layers.enable(1));
  let body, wardrobe, top, lower, lookKey, sampleGarment;
  // The photograph is one asset for the whole scene: once it is in hand every
  // look can wear it, so it is not a per-look request. Until then the pooled
  // jeans hide rather than stand in with the drawn pattern.
  let denimAsset = null, denimLoading = false;
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
    // Take the already-parsed asset before the look is built, so a fresh look
    // starts out wearing it instead of being rebuilt one frame later.
    if(!denimAsset && hasPhotoGarment(opts.pants)) denimAsset=peekGarment(opts.pants.id);
    const key=[model,outfit,opts.bottom||'',Boolean(opts.sample),opts.pants?opts.pants.id:'none',opts.pants?(opts.pants.material||'denim'):'default'].join('-');
    if(key===lookKey)return false;
    if(body){sampleGarment?.dispose();sampleGarment=null;scene.remove(body.group,wardrobe.group);}
    let look=lookCache.get(key);
    if(!look) {
      const colors=garmentColors(outfit);
      const shirt=clothMaterial(colors.top), bottom=clothMaterial(colors.lower);
      const figure=makeMannequin(shirt,model);
      const clothes=createWardrobe(THREE,figure,{top:shirt,lower:bottom},{...opts,model,outfit,
        photoPants:hasPhotoGarment(opts.pants),photoAsset:denimAsset});
      figure.pose(0,false);
      clothes.pose(0,{...opts,walking:false},0);
      if(!opts.sample && !opts.pants)projectWardrobe(figure,clothes,model,outfit,{top:shirt,lower:bottom},()=>{dirty=true;});
      setTextile(shirt,'cotton',()=>{dirty=true;});
      look={body:figure,wardrobe:clothes,top:shirt,lower:bottom};
      lookCache.set(key,look);
    }
    ({body,wardrobe,top,lower}=look);
    // A look pooled before the asset finished loading takes it now instead of
    // staying on the drawn stand-in it was built with.
    if(denimAsset && !wardrobe.denimAsset) wardrobe.setDenimAsset(denimAsset);
    scene.add(body.group,wardrobe.group);
    lookKey=key;
    return true;
  }
  // Put the photographed jeans on every look the scene holds. The first call
  // may have to wait for the transfer; after that the parsed asset is shared, so
  // a new look, a size change or a model switch wears it immediately.
  function adoptDenimAsset() {
    if (!denimAsset) {
      denimAsset = peekGarment(opts.pants.id);
      if (!denimAsset) {
        if (denimLoading) return;
        denimLoading = true;
        document.documentElement.dataset.denim = 'loading';
        loadGarmentAsset(opts.pants.id).then(asset => {
          denimAsset = asset;
          let worn = false;
          for (const look of lookCache.values()) worn = look.wardrobe.setDenimAsset(asset) || worn;
          document.documentElement.dataset.denim = worn ? 'worn ' + asset.parts.length : 'mismatch';
          if (worn) {
            settle();
            dirty = true;
          }
        }).catch(error => {
          document.documentElement.dataset.denim = 'failed ' + (error && error.message || error);
          console.warn('denim asset', error);
        }).finally(() => { denimLoading = false; });
        return;
      }
      for (const look of lookCache.values()) look.wardrobe.setDenimAsset(denimAsset);
    }
    if (!wardrobe.denimAsset) wardrobe.setDenimAsset(denimAsset);
  }
  let yaw = .045, pitch = .045, targetYaw = yaw, targetPitch = pitch;
  let frameTime = Number(opts.time) || 0, phase = frameTime * tau * .83 * limit(Number(opts.speed) || 0, 0, 4) + .8;
  let previous = 0, accumulator = 0, lastStats = 0, frames = 0, fps = 0, dirty = true;
  let width = 1, height = 1, heightRatio=1;
  const stepSize = 1/60;
  const worldUp = new THREE.Vector3(0,1,0);
  const updateCamera = () => {
    const zoom = limit(Number(opts.zoom)||1, .46, 3.3);
    const closePants=opts.view==='pants',closeFit=opts.view==='fit',detail=opts.view==='finish';
    const distance = Math.max(detail?1.40:closePants?2.68:closeFit?2.42:opts.model==='male'?4.15:3.96, (detail?1.49:1.76) / Math.max(.25, cam.aspect)) * heightRatio / zoom;
    const focus = (detail?.98:closePants?.60:closeFit?1.19:opts.model==='male'?.93:.88) * heightRatio + Math.max(0, zoom - 1) * .1;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, focus + Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    cam.up.copy(worldUp);
    cam.lookAt(0, focus, 0);
    cam.updateMatrixWorld();
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

  let pointer = null;
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointer = {x:event.clientX,y:event.clientY,id:event.pointerId};
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    targetYaw -= (event.clientX - pointer.x) * .01;
    targetPitch = limit(targetPitch + (event.clientY - pointer.y)*.005, -.16, .64);
    pointer.x = event.clientX; pointer.y = event.clientY;
    dirty = true;
  });
  const release = () => { pointer = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

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
    if(opts.pants && !displayTop){
      const f=pantsFit(opts.pants.measurements,opts.model,opts.person),w=f.w;
      // Cropped just above the waistband so the band, its loops and the fly are
      // what the fitting view is looking at.
      displayTop={id:'pants-studio-crew',type:'sweatshirt',color:'#24252a',material:'cotton',
        measurements:{length:Math.max(30,(1.475-f.waistY)*100-1.3),
          chest:Math.max(47,w.chest*.5+8),shoulder:Math.max(41,w.shoulder+4),sleeve:54}};
    }
    if(changedLook || ('sample' in changes || 'pants' in changes) || 'bodyOnly' in changes || 'person' in changes){
      const active=opts.person && (opts.bodyOnly || opts.pants || opts.sample?.id==='KC9315');
      const user=active?wearer(opts.model,opts.person):null;
      heightRatio=user?.sy||1;
      body.group.scale.y=heightRatio;
      const width=displayTop?.measurements?.chest||0;
      const bodyChest=opts.sample?.id==='KC9315'?(user||wearer(opts.model)).chest:2*width;
      body.group.userData.armClearance=.145+Math.min(.13,Math.max(0,2*width-bodyChest)*.002)+Math.max(0,(user?.chest||0)-(user?.base.chest||0))*.004
        // A wide-hip trouser stands off the body by the tape's own ease, so the
        // hanging arms step aside instead of disappearing into the cloth.
        +(opts.pants?Math.min(.10,Math.max(0,(pantsFit(opts.pants.measurements,opts.model,opts.person).hipCirc
          -(user?.hip||wearer(opts.model,opts.person).hip)/100))*.30):0);
      const hipScale=user&&!opts.pants?user.hip/user.base.hip:1;
      wardrobe.group.scale.set(hipScale,heightRatio,hipScale);
      body.anatomy.setWearer(user);
    }
    if(changedLook || 'bodyOnly' in changes || ('sample' in changes || 'pants' in changes) || 'person' in changes){
      body.anatomy.setCoverage(Boolean(opts.bodyOnly),{...opts,sample:displayTop});
    }
    if(changedLook || ('sample' in changes || 'pants' in changes) || 'person' in changes){
      if(displayTop){
        const upper={...displayTop,person:opts.person,onReady:()=>{dirty=true;}};
        if(sampleGarment)sampleGarment.update(upper);
        else sampleGarment=attachSample(body,upper,wardrobe.lowerColliders);
        sampleGarment.pose(phase,opts,0);
      }else if(sampleGarment){sampleGarment.dispose();sampleGarment=null;}
    }
    // The photographed garment is the only surface this pair is drawn with.
    // Both the look that is on screen and every pooled look settle on it once
    // the file is in hand, so switching model, size or top cannot bring back a
    // drawn stand-in.
    if (hasPhotoGarment(opts.pants)) adoptDenimAsset();
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
      body.anatomy.mesh.material.wireframe = Boolean(opts.wireframe);
    }
    if ('bodyOnly' in changes || 'grid' in changes){
      cam.layers.set(opts.bodyOnly?1:0);
      grid.visible=Boolean(opts.grid);
      scene.userData.bodyStudy=Boolean(opts.bodyOnly);
      scene.background.set(opts.bodyOnly?'#d4d7d7':'#d9d3ca');
      scene.fog.color.copy(scene.background);
      floor.material.color.set(opts.bodyOnly?'#b8bfbd':'#d2cbc1');
    }
    if ('view' in changes) {
      const angles = {pants:.08,finish:.24,fit:.22,study:.47,front: .045, side: Math.PI/2, back: Math.PI + .13, left: -Math.PI/2, right:Math.PI/2};
      targetYaw = angles[opts.view] ?? .045;
      targetPitch = opts.view==='study'?.29:.045;
      yaw = targetYaw;
      pitch = targetPitch;
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
    const orbiting = Math.abs(targetYaw-yaw) + Math.abs(targetPitch-pitch) > .0001;
    if (!dirty && !orbiting) return;
    yaw += (targetYaw - yaw) * .38;
    pitch += (targetPitch - pitch) * .38;
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
  return {update, stats, motion, cloth, probe: () => ({lower: wardrobe?.probe||null, top: sampleGarment?.probe||null}),
    reset() {yaw = targetYaw = .045; pitch = targetPitch = .045;}};
}
