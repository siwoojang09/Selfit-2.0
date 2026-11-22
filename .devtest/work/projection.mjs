import * as THREE from './vendor/three.module.js';

// Row endpoints in the studio photographs, ordered from garment hem to collar.
// Mapping each pattern piece independently avoids baking an arm onto the torso.
const femaleTop = {
  classic:[[358,699,819],[333,691,831],[304,684,837],[265,675,840],[235,672,844],[202,671,848],[179,710,821],[177,732,803]],
  tailored:[[367,690,826],[342,684,827],[310,686,827],[265,682,831],[230,681,840],[199,685,843],[178,709,822],[174,731,804]],
  casual:[[371,691,827],[348,685,827],[313,689,824],[265,683,835],[227,681,840],[200,681,846],[179,712,820],[175,732,805]]
};
const maleTop = {
  classic:[[417,700,843],[385,702,840],[342,699,852],[300,687,856],[248,679,870],[211,692,867],[189,730,831],[187,745,808]],
  tailored:[[416,699,849],[384,701,853],[343,696,855],[302,696,855],[249,690,860],[215,690,862],[187,735,825],[186,751,815]],
  casual:[[419,700,850],[386,700,852],[343,697,851],[302,689,859],[252,687,868],[220,692,865],[192,729,833],[187,748,816]]
};
const trousers = {
  female:{
    tailored:[[943,713,757,854,746],[890,718,754,856,752],[816,709,751,794,748],[735,683,736,805,738],[641,673,738,830,748],[560,669,743,844,748],[474,673,745,841,748],[387,694,752,828,752]],
    casual:[[666,680,730,819,753],[642,676,732,826,750],[601,669,736,831,748],[551,666,745,838,750],[488,670,745,844,753],[417,680,743,833,752],[382,691,751,827,751]]
  },
  male:{
    classic:[[922,706,735,815,753],[866,700,730,827,754],[783,686,753,842,765],[690,680,757,850,768],[600,680,760,856,768],[530,681,760,857,763],[463,697,758,852,762],[418,705,762,842,762]],
    tailored:[[921,712,735,804,750],[866,705,737,806,749],[792,694,752,821,759],[711,689,753,841,761],[622,686,758,849,763],[543,682,760,858,763],[476,697,762,853,764],[427,704,764,841,764]],
    casual:[[660,689,750,845,774],[632,687,750,850,774],[593,685,756,854,773],[539,685,761,855,770],[482,697,758,852,766],[428,705,762,843,764]]
  }
};
const femaleSkirt=[[804,547,909],[760,568,889],[703,594,881],[642,612,875],[564,638,865],[491,664,847],[422,678,833],[382,694,820],[363,701,815]];
const upperColours={classic:'#aa532e', tailored:'#9aafcd', casual:'#79836b'};
const lowerColours={classic:'#e6ddc9', tailored:'#494b4b', casual:'#465467'};
const photos=new Map();
export function garmentColors(outfit) {
  return {top:upperColours[outfit], lower:lowerColours[outfit]};
}

function getPhoto(url, invalidate) {
  if (!photos.has(url)) {
    const texture = new THREE.TextureLoader().load(url, () => invalidate());
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;
    photos.set(url,texture);
  }
  return photos.get(url);
}

function bindPhoto(mat,texture,base) {
  mat.userData.referenceMap=texture;
  mat.userData.referenceBase=new THREE.Color(base);
  mat.onBeforeCompile=shader=>{
    shader.uniforms.lookMap={value:texture};
    shader.uniforms.lookBase={value:mat.userData.referenceBase};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 referenceUv; attribute float referenceWeight; varying vec2 garmentPhotoUv; varying float garmentPhotoWeight;');
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\ngarmentPhotoUv=referenceUv; garmentPhotoWeight=referenceWeight;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D lookMap; uniform vec3 lookBase; varying vec2 garmentPhotoUv; varying float garmentPhotoWeight;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 photograph = texture2D(lookMap,garmentPhotoUv).rgb;
      vec3 photographedAlbedo = photograph * diffuseColor.rgb / max(lookBase*.83,vec3(.007));
      diffuseColor.rgb=mix(diffuseColor.rgb,photographedAlbedo,clamp(garmentPhotoWeight,0.,1.));
    `);
  };
  mat.customProgramCacheKey=()=> 'garment-photo-v1';
  mat.needsUpdate=true;
}

function sourceRows(model,outfit,part) {
  const male=model==='male';
  if(part==='upper') return (male ? maleTop : femaleTop)[outfit];
  if(part==='lower'&&outfit==='classic'&&!male) return femaleSkirt;
  if(part==='sleeveLeft'||part==='sleeveRight') {
    const left=part==='sleeveLeft';
    if(outfit==='tailored') {
      if(male) return left ? [[459,619,647],[411,631,664],[357,645,675],[303,661,685],[249,672,699],[217,685,704],[208,703,714]] : [[497,899,916],[446,884,903],[399,872,891],[347,863,881],[300,853,869],[245,840,862],[213,839,854]].map(r=>left?[r[0],1531-r[2],1531-r[1]]:r);
      return [[535,894,912],[467,881,902],[396,865,885],[320,856,874],[256,853,868],[215,837,857],[209,828,838]];
    }
    const topY=male?212:194, hemY=male ? (outfit==='casual'?315:297) : (outfit==='casual'?270:250);
    return left ? [[hemY,male?648:645,male?679:672],[hemY-17,male?654:650,male?686:677],[topY+17,male?668:661,male?695:681],[topY,male?687:678,male?703:693]] : [[hemY,male?861:843,male?890:873],[hemY-16,male?858:843,male?887:872],[topY+17,male?853:842,male?877:867],[topY,male?844:834,male?858:850]];
  }
  const pants=trousers[model]?.[outfit];
  if(!pants) return null;
  if(part==='legLeft') return pants.map(([y,l,mid])=>[y,l,mid]);
  if(part==='legRight') return pants.map(([y,, ,r,mid])=>[y,mid,r]);
  return pants.slice(-3).map(([y,l,,r])=>[y,l,r]);
}

function photoSpan(rows,t) {
  const bottom=rows[0][0], top=rows[rows.length-1][0];
  const y=THREE.MathUtils.lerp(bottom,top,t);
  let i=1;
  while(i<rows.length-1 && y<rows[i][0])i++;
  const a=rows[i-1],b=rows[i],w=(y-a[0])/(b[0]-a[0]||1);
  return [y,THREE.MathUtils.lerp(a[1],b[1],w),THREE.MathUtils.lerp(a[2],b[2],w)];
}

export function projectWardrobe(body,wardrobe,model,outfit,materials,invalidate) {
  const ref=model==='female'&&outfit==='classic'?'hero.webp':'looks/'+model+'-'+outfit+'.webp';
  const texture=getPhoto(new URL(ref,import.meta.url).href,invalidate);
  const colors=garmentColors(outfit);
  bindPhoto(materials.top,texture,colors.top);
  bindPhoto(materials.lower,texture,colors.lower);
  const pieces=new Map();
  for(const root of [body.group,wardrobe.group]) {
    root.updateWorldMatrix(true,true);
    root.traverseVisible(mesh=>{
      if(!mesh.isMesh) return;
      const part=mesh.userData.garmentPart;
      if(!part || !sourceRows(model,outfit,part)) return;
      if(!pieces.has(part)) pieces.set(part,[]);
      pieces.get(part).push(mesh);
    });
  }
  const p=new THREE.Vector3(),n=new THREE.Vector3(),normals=new THREE.Matrix3();
  // Estimate each pattern piece's cross-section in the photographed neutral pose.
  const binCount=40, clamp=THREE.MathUtils.clamp;
  for(const [part,meshes] of pieces) {
    const rows=sourceRows(model,outfit,part);
    const samples=[];
    let bottom=Infinity,top=-Infinity;
    for(const mesh of meshes) {
      const pos=mesh.geometry.attributes.position, norm=mesh.geometry.attributes.normal;
      const xyz=new Float32Array(pos.count*3), facing=new Float32Array(pos.count);
      normals.getNormalMatrix(mesh.matrixWorld);
      for(let i=0;i<pos.count;i++) {
        p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
        p.toArray(xyz,3*i); bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
        n.fromBufferAttribute(norm,i).applyMatrix3(normals).normalize(); facing[i]=n.z;
      }
      samples.push({mesh,xyz,facing});
    }
    const span=Math.max(.001,top-bottom);
    const xMin=new Float32Array(binCount).fill(Infinity), xMax=new Float32Array(binCount).fill(-Infinity);
    const bin=y=>clamp(Math.round((y-bottom)/span*(binCount-1)),0,binCount-1);
    for(const {xyz} of samples)for(let i=0;i<xyz.length;i+=3) {
      const b=bin(xyz[i+1]); xMin[b]=Math.min(xMin[b],xyz[i]);xMax[b]=Math.max(xMax[b],xyz[i]);
    }
    for(let b=0;b<binCount;b++)if(!Number.isFinite(xMin[b])) {
      let a=b-1,c=b+1;
      while(a>=0&&!Number.isFinite(xMin[a]))a--;
      while(c<binCount&&!Number.isFinite(xMin[c]))c++;
      if(a<0)a=c;if(c===binCount)c=a;
      const u=(b-a)/(c-a||1);
      xMin[b]=THREE.MathUtils.lerp(xMin[a],xMin[c],u);
      xMax[b]=THREE.MathUtils.lerp(xMax[a],xMax[c],u);
    }
    for(const {mesh,xyz,facing} of samples) {
      const uv=new Float32Array(facing.length*2),weight=new Float32Array(facing.length);
      for(let i=0;i<facing.length;i++) {
        const x=xyz[3*i],y=xyz[3*i+1],t=clamp((y-bottom)/span,0,1),b=bin(y);
        const [v,left,right]=photoSpan(rows,t);
        const u=clamp((x-xMin[b])/Math.max(.001,xMax[b]-xMin[b]),.018,.982);
        uv[2*i]=THREE.MathUtils.lerp(left,right,u)/1536;
        uv[2*i+1]=1-v/1024;
        // Keep the unseen back physically shaded and blend the source across side seams.
        weight[i]=.89*THREE.MathUtils.smoothstep(facing[i],-.18,.55);
        if(part==='upper' && t>.89)weight[i]*=clamp((1-t)*9,0,1);
      }
      mesh.geometry.setAttribute('referenceUv',new THREE.BufferAttribute(uv,2));
      mesh.geometry.setAttribute('referenceWeight',new THREE.BufferAttribute(weight,1));
    }
  }
}
