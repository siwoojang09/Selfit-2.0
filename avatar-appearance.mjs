import * as THREE from './vendor/three.module.js';

const {lerp, smoothstep} = THREE.MathUtils;
const TAU = 2 * Math.PI;
const hairstyles = new Map();
const fittingTextures = new Map();
const gaussian = (x, y, cx, cy, width, height) =>
  Math.exp(-(((x-cx)/width)**2 + ((y-cy)/height)**2));

const palettes = {
  female: {skin:'#ba8269',warm:'#bb7862',cool:'#be9680',flush:'#a85f55',
    hair:'#322520',light:'#614639'},
  male: {skin:'#ae775d',warm:'#b57759',cool:'#b48d74',flush:'#99574a',
    hair:'#2d2521',light:'#514035'}
};
function palette(model) {
  return Object.fromEntries(Object.entries(palettes[model]||palettes.female)
    .map(([name, color]) => [name, new THREE.Color(color)]));
}

const outfitUV = (x,y) => [(x+.24)/.48, y/1.8];

function fittingTexture(model, top, bottom) {
  const key=[model,top,bottom].join(':');
  if (fittingTextures.has(key)) return fittingTextures.get(key);
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=1024;
  const context=canvas.getContext('2d');
  context.fillStyle='#fff';
  context.fillRect(0,0,canvas.width,canvas.height);
  const male=model==='male';
  const point=(x,y)=>{
    const [u,v]=outfitUV(x,y);
    return [u*canvas.width,(1-v)*canvas.height];
  };
  if (top) {
    const hem=male?1.035:1.113;
    context.beginPath();
    context.moveTo(...point(-.171,hem));
    context.lineTo(...point(-.172,1.26));
    context.bezierCurveTo(...point(-.131,1.289),...point(-.103,1.371),...point(-.121,1.471));
    context.lineTo(...point(-.071,1.471));
    context.bezierCurveTo(...point(-.069,1.393),...point(-.057,1.356),...point(0,1.356));
    context.bezierCurveTo(...point(.057,1.356),...point(.069,1.393),...point(.071,1.471));
    context.lineTo(...point(.121,1.471));
    context.bezierCurveTo(...point(.103,1.371),...point(.131,1.289),...point(.172,1.26));
    context.lineTo(...point(.171,hem));
    context.closePath();
    context.fillStyle=male?'#556e83':'#4f667b';
    context.fill();
    context.lineWidth=2;
    context.strokeStyle=male?'#5d7990':'#566f83';
    context.stroke();
    context.beginPath();
    context.moveTo(...point(-.171,hem+.012));
    context.lineTo(...point(.171,hem+.012));
    context.stroke();
  }
  if (bottom) {
    const waist=male?1.009:1.040, hem=male?.719:.731;
    const [x,y]=point(-.200,waist);
    const [right,height]=point(.200,hem);
    context.fillStyle=male?'#465d70':'#43596c';
    context.fillRect(x,y,right-x,height-y);
    context.fillStyle=male?'#405668':'#3e5365';
    context.fillRect(x,y,right-x,canvas.height*.020/1.8);
    context.strokeStyle=male?'#577085':'#51697c';
    context.lineWidth=1.6;
    for (const edge of [waist-.020,hem+.013]) {
      context.beginPath();
      context.moveTo(...point(-.200,edge));
      context.lineTo(...point(.200,edge));
      context.stroke();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  fittingTextures.set(key,texture);
  return texture;
}

export function applyAvatarSkin(geometry, material, regions, ky, model) {
  const colors=palette(model);
  const position=geometry.attributes.position;
  const skin=new Float32Array(position.count*3), uv=new Float32Array(position.count*2);
  const sample=new THREE.Color();
  for (let i=0;i<position.count;i++) {
    const x=position.getX(i), a=Math.abs(x), y=position.getY(i)/ky, z=position.getZ(i);
    const arm=smoothstep(a,.17,.215)*(1-smoothstep(y,.96,1.01));
    const knees=gaussian(a,y,.090,.487,.050,.045)*smoothstep(z,.018,.092);
    const subtle=.5+.5*Math.sin(331*x+298*y)*Math.sin(247*y-190*z);
    sample.copy(colors.skin).lerp(colors.cool,.20*smoothstep(y,.24,1.33))
      .lerp(colors.warm,.25*(arm+knees))
      .lerp(colors.flush,.17*knees)
      .multiplyScalar(.98+.043*subtle);
    sample.toArray(skin,i*3);

    // Below the armhole the arms have their own blank area on the atlas.
    // At the shoulder the projection joins continuously with the torso.
    const armOffset=regions[i]===1 ? (1-smoothstep(y,1.27,1.36)) : 0;
    const shirtX=lerp(x,Math.sign(x)*Math.max(.222,a),armOffset);
    const [u,v]=outfitUV(shirtX,y);
    uv[i*2]=u;uv[i*2+1]=v;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(skin,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return (top,bottom)=>{
    material.map=top||bottom ? fittingTexture(model,top,bottom) : null;
    material.needsUpdate=true;
  };
}

// Hair is attached to the head joint so it follows the avatar through poses.
export function attachAvatarHair(head, ky, model) {
  if (!hairstyles.has(model)) hairstyles.set(model, buildHair(ky,model));
  const group=hairstyles.get(model).clone();
  head.add(group);
  return value=>{
    group.traverse(object=>{if(object.isMesh)object.material.wireframe=value;});
  };
}

function buildHair(ky, model) {
  const colors=palette(model), male=model==='male';
  const group=new THREE.Group();
  group.name='Avatar hair';
  const position=(x,y,z)=>[x,(y-1.52)*ky,z-.002];
  const makeMaterial=(color, roughness=.73)=>new THREE.MeshStandardMaterial({color,roughness});
  function add(name,geometry,material) {
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=name;
    mesh.layers.enable(1);
    group.add(mesh);
    return mesh;
  }

  const hairMat=makeMaterial(0xffffff,.73);
  hairMat.vertexColors=true;hairMat.side=THREE.DoubleSide;
  const hairTone=[], tone=new THREE.Color();
  const points=[], indices=[];
  const rows=30, columns=72;
  for(let row=0;row<=rows;row++) for(let column=0;column<=columns;column++){
    const r=row/rows,u=column/columns;
    const a=u*TAU,s=Math.sin(a),c=Math.cos(a);
    const front=Math.max(0,c), back=Math.max(0,-c);
    const part=Math.exp(-(((s+.31)/.23)**2))*front;
    const wave=Math.sin(a*62+r*7+.8*Math.sin(a*5))*.00052;
    const edge=(male?1.651:1.643)+front*(male?.052:.061)-back*(male?.042:.071)
      -Math.abs(s)**6*(male?.003:.006)+.006*part;
    const latitude=r*Math.acos((edge-1.644)/.133);
    const shell=Math.sin(latitude);
    const taper=smoothstep(r,.94,1);
    const lift=(male?.007:.010)*(1-taper*.67)*(.52+.48*front);
    const x=shell*s*((male?.081:.079)+lift+wave);
    const y=1.644+(.132+lift*smoothstep(r,.02,.30)-taper*.003)*Math.cos(latitude)+
      .008*Math.sin(a-.9)*front*Math.sin(latitude)*(1-taper);
    const z=-.005+c*shell*((male?.093:.090)+lift+wave)-back*.007;
    const highlights=Math.min(.68,.15+.17*(.5+.5*Math.sin(a*16+r*5))+.09*front+.15*part);
    tone.copy(colors.hair).lerp(colors.light,highlights).toArray(hairTone,hairTone.length);
    points.push(...position(x,y,z));
    if(row<rows&&column<columns){
      const a=row*(columns+1)+column,b=a+columns+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(hairTone,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  add('Sculpted hair',geometry,hairMat);
  if(!male) {
    const bun=add('Pulled-back bun',new THREE.SphereGeometry(1,24,16),
      makeMaterial(colors.hair.clone().lerp(colors.light,.29)));
    bun.position.fromArray(position(0,1.637,-.091));
    bun.scale.set(.047,.039*ky,.040);
    bun.rotation.x=-.18;
  }
  return group;
}
