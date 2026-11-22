import * as THREE from './vendor/three.module.js';

import {anatomyLibrary} from './body-library.mjs?v=2026-11-23a';
import {attachAnatomicalBody} from './body-skin.mjs?v=2026-11-23a';

const TAU = Math.PI * 2;
const point = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function joint(parent, x = 0, y = 0, z = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function surface(parent, material, rings, deform, segments = 48) {
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row < rings.length; row++) {
    const [y, rx, rz, cz = 0, cx = 0] = rings[row];
    for (let col = 0; col <= segments; col++) {
      const angle = TAU * col / segments;
      const p = point(cx + rx * Math.sin(angle), y, cz + rz * Math.cos(angle));
      if (deform) deform(p, angle, y, row);
      positions.push(p.x, p.y, p.z);
      uvs.push(col / segments, (y - rings[0][0]) / (rings[rings.length - 1][0] - rings[0][0]));
      if (row < rings.length - 1 && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let row = 0; row < rings.length; row++) {
    const a = row * (segments + 1), b = a + segments;
    const average = point().fromBufferAttribute(normals, a).add(point().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, average.x, average.y, average.z);
    normals.setXYZ(b, average.x, average.y, average.z);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cord(parent, material, points, width, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(10, points.length * 2), width, 6, closed), material);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function binding(parent, material, rx, rz, level, width, cz = 0) {
  const points = Array.from({length: 48}, (_, i) => {
    const a = TAU * i / 48;
    return point(rx * Math.sin(a), typeof level === 'function' ? level(a) : level, cz + rz * Math.cos(a));
  });
  return cord(parent, material, points, width, true);
}

function makeShirt(torso, fabric, male) {
  const rings = [
    [.995, .136, .085], [1.015, .137, .089], [1.035, .139, .093], [1.056, .141, .095],
    [1.085, .142, .095], [1.115, .144, .097], [1.15, .15, .099], [1.19, .157, .105],
    [1.225, .162, .111, .004], [1.26, .164, .117, .007], [1.29, .166, .114, .007],
    [1.32, .165, .104, .005], [1.35, .166, .094], [1.38, .171, .082],
    [1.408, .175, .069], [1.432, .167, .057], [1.449, .121, .052], [1.456, .067, .052],
  ];
  function shape(p, angle, y, row) {
    const front = Math.max(0, Math.cos(angle));
    const bust = (male ? 0 : 1) * Math.exp(-((y - 1.276) ** 2) / .0026);
    p.z += front * bust * (.016 * Math.exp(-((Math.abs(p.x) - .078) ** 2) / .0014) - .011 * Math.exp(-(p.x ** 2) / .00065));
    const fold = Math.max(0, 1 - Math.abs(y - 1.102) / .135);
    const drape = fold * (.0028 * Math.sin(9 * angle + y * 20) + .002 * Math.sin(17 * angle - y * 49));
    p.x += Math.sin(angle) * drape;
    p.z += Math.cos(angle) * drape;
    if (row >= 14) p.y -= (.005 + .036 * front ** 2) * ((row - 14) / 3);
  }
  surface(torso, fabric, rings, shape, 80);
  const collar = a => 1.452 - .038 * Math.max(0, Math.cos(a)) ** 2;
  binding(torso, fabric, .067, .0535, collar, .0048);
  binding(torso, fabric, .074, .058, a => collar(a) - .004, .00085);
  for (const side of [-1, 1]) {
    cord(torso, fabric, rings.slice(0, 13).map(([y, rx]) => point(side * (rx + .0006), y, -.001)), .00105);
    cord(torso, fabric, [point(side * .072, 1.450, -.005), point(side * .123, 1.446, -.006), point(side * .177, 1.427, -.008)], .0012);
  }
}

function makeArm(torso, sign, fabric) {
  const shoulder=joint(torso,sign*.167,1.402,0);
  const sleeve=[[-.147,.051,.057],[-.14,.052,.058],[-.08,.054,.058],[-.014,.056,.061],[.02,.046,.054],[.036,.003,.007]];
  surface(shoulder,fabric,sleeve);
  binding(shoulder,fabric,.0515,.0575,-.145,.002);
  const elbow=joint(shoulder,0,-.278,0);
  return {shoulder,elbow,hand:joint(elbow,0,-.243,0)};
}

function makeShoe(ankle, sign, shoe, sole, thread) {
  const foot = joint(ankle, 0, 0, .026);
  foot.rotation.y = .07 * sign;
  const outline = (p, a) => {
    const front = Math.cos(a);
    p.x *= .9 + .17 * front;
    p.x -= sign * .009 * Math.max(0, front);
  };
  surface(foot, sole, [[-.081,.001,.001,.022],[-.080,.039,.108,.022],[-.077,.045,.119,.022],[-.068,.046,.123,.022],[-.058,.0465,.124,.022],[-.055,.045,.123,.022]], outline);
  surface(foot, shoe, [[-.057,.0455,.123,.022],[-.049,.046,.122,.021],[-.039,.045,.119,.019],[-.030,.044,.109,.013],[-.022,.043,.098,.004],[-.008,.041,.073,-.004],[.006,.039,.050,-.018],[.012,.037,.041,-.019]], outline);
  binding(foot, shoe, .0365, .041, .012, .0021, -.019);
  for (let i=0; i<4; i++) {
    const z=.010+i*.012, y=.003-i*.0065, x=.024 + .001*i;
    cord(foot, thread,[point(-x,y-.004,z),point(0,y+.002,z+.004),point(x,y-.004,z+.008)], .0019);
    cord(foot, thread,[point(x,y-.004,z),point(0,y+.0005,z+.004),point(-x,y-.004,z+.008)], .0018);
  }
}

function makeLeg(pelvis,sign,shoe,sole,thread) {
  const hip=joint(pelvis,sign*.091,.93,-.008);
  const knee=joint(hip,0,-.438,0);
  const ankle=joint(knee,0,-.44,0);
  makeShoe(ankle,sign,shoe,sole,thread);
  return {hip,knee,ankle};
}

export function makeMannequin(topMaterial, model = 'female', anatomySource=anatomyLibrary[model]) {
  const male=model === 'male';
  const shoe = new THREE.MeshStandardMaterial({color:0xe7e2d7, roughness:.78});
  const sole = new THREE.MeshStandardMaterial({color:0xc8c2b6, roughness:.91});
  const thread = new THREE.MeshStandardMaterial({color:0xf2ede2, roughness:.86});
  const group = new THREE.Group(), pelvis = joint(group), torso = joint(pelvis);
  group.name='Atelier fitting mannequin';
  makeShirt(torso, topMaterial, male);
  torso.children.forEach(mesh=>{mesh.userData.garmentPart='upper';});
  const head = joint(torso,0,1.52,.002);
  const signs = [-1,1];
  const arms = signs.map(sign => makeArm(torso, sign, topMaterial));
  const limbs = signs.map(sign => makeLeg(pelvis, sign, shoe, sole, thread));
  arms.forEach(({shoulder},i)=>shoulder.children.forEach(mesh=>{
    if (mesh.material === topMaterial) mesh.userData.garmentPart=i ? 'sleeveRight' : 'sleeveLeft';
  }));
  const teeMeshes=[],shoeMeshes=[];
  group.traverse(mesh=>{if(mesh.isMesh && mesh.material===topMaterial) teeMeshes.push(mesh);});
  limbs.forEach(({ankle})=>ankle.traverse(mesh=>{if(mesh.isMesh)shoeMeshes.push(mesh);}));
  const parts={pelvis,torso,head,arms,limbs};
  const anatomy=attachAnatomicalBody(anatomySource,group,parts);
  if(male){torso.scale.set(1.12,1,1.06);head.scale.x=.94;}
  const legs = [ .075,.048,.075,.048 ].map(r => ({a:point(), b:point(), r}));
  const hipsFromPose = point();
  const groupInverse = new THREE.Matrix4();
  const rootPoint = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(groupInverse);
  function pose(phase = 0, walking = true, studyPose = false) {
    const weight = Number(walking) || 0;
    const gait = Math.sin(phase);
    pelvis.position.set(.012 * gait * weight, THREE.MathUtils.lerp(.024, .006 - .005 * Math.cos(2 * phase), weight), 0);
    pelvis.rotation.y = -.065 * gait * weight;
    pelvis.rotation.z=.017*Math.cos(phase)*weight;
    torso.rotation.y = .12 * gait * weight;
    torso.rotation.z=-.011*Math.cos(phase)*weight;
    head.rotation.y = -.035 * gait * weight;
    head.rotation.z = .012 * Math.cos(phase) * weight;
    hipsFromPose.copy(pelvis.position);
    signs.forEach((sign, i) => {
      const t = phase + (i ? Math.PI : 0), stride = -Math.cos(t);
      const {hip, knee, ankle} = limbs[i];
      const forward = .172 * stride * weight;
      const lift = .062 * Math.pow(Math.max(0, Math.sin(t)), 1.6) * weight;
      const down = .93 + pelvis.position.y - (.081 + lift);
      const dist = Math.min(.87799, Math.hypot(down, forward));
      const upper = .438, lower = .44;
      hip.rotation.x = -Math.atan2(forward, down) - Math.acos(THREE.MathUtils.clamp((upper*upper + dist*dist - lower*lower) / (2*upper*dist), -1, 1));
      knee.rotation.x = Math.PI - Math.acos(THREE.MathUtils.clamp((upper*upper + lower*lower - dist*dist) / (2*upper*lower), -1, 1));
      ankle.rotation.x = -hip.rotation.x - knee.rotation.x + (lift / .062) * .15;
      const arm = arms[i];
      const abduction=studyPose&&!walking?1.02:(group.userData.armClearance||.145);
      arm.shoulder.rotation.set(.28*stride*weight,sign*(studyPose&&!walking?-.12:.03),sign*(abduction-.018*gait*weight));
      arm.elbow.rotation.x = -.095 - .085 * (1 - stride) * weight;
      arm.hand.rotation.z = -.035 * sign;
    });
    group.updateWorldMatrix(true,true);
    anatomy.deform();
    groupInverse.copy(group.matrixWorld).invert();
    limbs.forEach(({hip,knee,ankle},i) => {
      const upper=legs[2*i], lower=legs[2*i+1];
      rootPoint(hip,upper.a); rootPoint(knee,upper.b);
      lower.a.copy(upper.b); rootPoint(ankle,lower.b);
    });
  }
  pose(0, false);
  return {model,group,pose,anatomy,legs,hipsFromPose,parts,anchors:parts,teeMeshes,shoeMeshes};
}
