// Both renderers consume the same deformed vertices. Keep bind-pose data immutable
// because several cached outfits can share the same anatomical source mesh.
import * as THREE from './vendor/three.module.js';
import {wearer,hoodieFit} from './hoodie-fit.mjs?v=2026-11-23p';
import {pantsFit} from './pants-fit.mjs?v=2026-11-23p';

export function attachAnatomicalBody(source, root, parts) {
  const named={pelvis:parts.pelvis,torso:parts.torso,head:parts.head};
  for(const [i,side] of ['L','R'].entries()){
    for(const [name,node] of Object.entries(parts.arms[i]))named[name+side]=node;
    for(const [name,node] of Object.entries(parts.limbs[i]))named[name+side]=node;
  }
  const anchors=source.jointNames.map(name=>{
    if(!named[name])throw Error('Unsupported anatomical joint '+name);
    return named[name];
  });
  root.updateWorldMatrix(true,true);
  const inverseRoot=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const inverseBind=anchors.map(node=>new THREE.Matrix4().multiplyMatrices(inverseRoot,node.matrixWorld).invert());
  const palette=new Float32Array(anchors.length*16);
  const normalPalette=new Float32Array(anchors.length*9);
  const matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
  const {geometry:base,joints,weights}=source;
  const geometry=base.clone();
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  const position=geometry.attributes.position,normal=geometry.attributes.normal;
  position.setUsage(THREE.DynamicDrawUsage);normal.setUsage(THREE.DynamicDrawUsage);
  const rest=position.array.slice(),restNormal=normal.array.slice();
  const material=new THREE.MeshStandardMaterial({color:'#d7d8d5',roughness:.8,metalness:0});
  material.userData.clay=true;
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Anatomical fitting form';mesh.userData.anatomicalBody=true;
  mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.layers.enable(1);
  root.add(mesh);

  // Only remove triangles wholly inside the closed garment or shoe. Keep a margin
  // inside each opening, so a moving cuff never exposes an empty seam.
  const full=geometry.index;
  const region=new Uint8Array(position.count);
  const handPoints=[[],[]];
  for(let i=0;i<region.length;i++){
    let best=0;
    for(let j=1;j<4;j++)if(weights[4*i+j]>weights[4*i+best])best=j;
    const n=source.jointNames[joints[4*i+best]];
    region[i]=/shoulder|elbow|hand/i.test(n)?1:/hip|knee|ankle/i.test(n)?2:0;
    const k=3*i;
    if(region[i]===1 && rest[k+1]<.99){
      handPoints[n.endsWith('L')?0:1].push([rest[k],rest[k+1],rest[k+2]]);
    }
  }
  let coverageKey='';
  function setCoverage(bare,options){
    const sample=options.sample;
    const type=sample?.type||(options.outfit==='tailored'?'shirt':'tee');
    const sleeve=Number(sample?.measurements?.sleeve)||(['shirt','sweatshirt','ziphoodie'].includes(type)?56:20);
    const length=Number(sample?.measurements?.length)||63;
    const bottom=options.bottom||(options.outfit==='casual'?'shorts':'trousers');
    const trouser=options.pants?.measurements?pantsFit(options.pants.measurements,options.model,options.person):null;
    const hemEdge=trouser?trouser.hemY+.025:bottom==='shorts'?.60:bottom==='skirt'?.52:.13;
    const waistEdge=trouser?trouser.waistY-.025:1.008;
    // Skin is only on show between the top's hem and the waistband when the top
    // really stops above the band. The hem is measured from the same apex the
    // garment is cut from; a top that overlaps the band leaves no belly to show,
    // and leaving that strip drawn put a bare patch between the hem and a
    // waistband the top was already covering.
    const topHem=1.460-length*.00955;
    const bareWaist=Boolean(trouser && topHem>trouser.waistY+.004);
    let sleeveEdge=1.402-THREE.MathUtils.clamp(sleeve*.0094,.07,.59)+.065;
    if(sample?.id==='KC9315' && sample.measurements){
      const w=wearer(options.model,options.person),fit=hoodieFit(sample.measurements,w);
      sleeveEdge=w.base.shoulderY-(fit.seamDrop+fit.sleeveProjection)/w.sy+.034;
    }
    const key=[bare,type,sleeveEdge,length,bottom,hemEdge,waistEdge,bareWaist].join('|');
    if(key===coverageKey)return;
    coverageKey=key;
    if(bare){geometry.setIndex(full);return;}
    const visible=new Uint8Array(position.count);
    for(let i=0;i<visible.length;i++){
      const x=Math.abs(rest[3*i]),y=rest[3*i+1];
      if(region[i]===1){visible[i]=y<sleeveEdge;continue;}
      if(region[i]===2){
        visible[i]=y<hemEdge && y>.06 || (bareWaist && y>waistEdge && y<topHem);
        continue;
      }
      visible[i]=y>1.49 || (y>1.458 && x<.052) || (bareWaist && y<topHem && y>waistEdge);
    }
    const a=full.array,kept=[];
    // A triangle with a single visible corner is a spike: at the neckline it
    // showed as a sawtooth of skin above a collar that is higher at the sides.
    // Keeping a triangle only when two of its corners are bare trims the
    // boundary to something the eye reads as the edge of the garment.
    for(let i=0;i<a.length;i+=3)if((visible[a[i]]+visible[a[i+1]]+visible[a[i+2]])>=2)kept.push(a[i],a[i+1],a[i+2]);
    geometry.setIndex(new THREE.BufferAttribute(new a.constructor(kept),1));
  }

  // Morph the undressed mesh from the same levels used by the tape and cloth sections.
  let morphed=rest;
  function setWearer(person){
    morphed=person?rest.slice():rest;
    if(!person)return;
    for(let i=0;i<position.count;i++){
      const k=3*i,y=rest[k+1];
      if(region[i]===1||y>1.457||y<.52)continue;
      const ratio=person.widthAt(y),center=person.centerAt(y);
      morphed[k]=rest[k]*ratio;
      morphed[k+2]=center+(rest[k+2]-center)*ratio;
    }
  }
  function deform(){
    inverseRoot.copy(root.matrixWorld).invert();
    for(let i=0;i<anchors.length;i++){
      matrix.multiplyMatrices(inverseRoot,anchors[i].matrixWorld).multiply(inverseBind[i]);
      matrix.toArray(palette,i*16);
      normalMatrix.getNormalMatrix(matrix).toArray(normalPalette,i*9);
    }
    const dst=position.array,dstNormal=normal.array;
    for(let i=0;i<position.count;i++){
      const k=i*3,x=morphed[k],y=morphed[k+1],z=morphed[k+2];
      const nx=restNormal[k],ny=restNormal[k+1],nz=restNormal[k+2];
      let px=0,py=0,pz=0,dx=0,dy=0,dz=0;
      for(let j=i*4;j<i*4+4;j++){
        if(!weights[j])continue;
        const w=weights[j]/255,p=joints[j]*16,n=joints[j]*9;
        px+=w*(palette[p]*x+palette[p+4]*y+palette[p+8]*z+palette[p+12]);
        py+=w*(palette[p+1]*x+palette[p+5]*y+palette[p+9]*z+palette[p+13]);
        pz+=w*(palette[p+2]*x+palette[p+6]*y+palette[p+10]*z+palette[p+14]);
        dx+=w*(normalPalette[n]*nx+normalPalette[n+3]*ny+normalPalette[n+6]*nz);
        dy+=w*(normalPalette[n+1]*nx+normalPalette[n+4]*ny+normalPalette[n+7]*nz);
        dz+=w*(normalPalette[n+2]*nx+normalPalette[n+5]*ny+normalPalette[n+8]*nz);
      }
      dst[k]=px;dst[k+1]=py;dst[k+2]=pz;
      dstNormal[k]=dx;dstNormal[k+1]=dy;dstNormal[k+2]=dz;
    }
    position.needsUpdate=true;normal.needsUpdate=true;
  }
  return {mesh,deform,setCoverage,setWearer,handPoints};
}
