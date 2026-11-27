import {readFileSync} from 'node:fs';
import * as T from '../vendor/three.module.js';
import {attachSample} from '../sample-garment.mjs';

const {measurements,color}=JSON.parse(readFileSync(0,'utf8'));
const group=new T.Group(),torso=new T.Group();
group.add(torso);
const arms=[-1,1].map(side=>{
  const shoulder=new T.Group(),elbow=new T.Group();
  shoulder.position.set(side*.18,1.402,0);
  shoulder.rotation.z=side*.25;
  elbow.position.set(0,-.30,0);
  shoulder.add(elbow);group.add(shoulder);
  return {shoulder,elbow};
});
const body={group,parts:{torso,arms},teeMeshes:[],model:'female',anatomy:{handPoints:null}};
attachSample(body,{type:'ziphoodie',imported:true,topAsset:{byName:{}},color,measurements},[]);
group.updateMatrixWorld(true);
const pieces=[];
for(const [frame,root] of [['body',torso],...arms.map(({shoulder},i)=>['arm'+i,shoulder])]){
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const encode=array=>Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
    const normal=geometry.attributes.normal;
    pieces.push({
      name:mesh.name,frame,color:mesh.material.color.toArray(),metal:mesh.material.metalness,
      position:encode(geometry.attributes.position.array),
      normal:encode(normal.array),uv:encode(geometry.attributes.uv.array),
      index:encode(Uint32Array.from(geometry.index.array))
    });
  });
}
process.stdout.write(JSON.stringify(pieces));
