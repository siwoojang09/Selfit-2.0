// Run the fitting room's M pattern through three steps and a stationary side gust.
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.js';
import {readFile} from 'node:fs/promises';
import {makeMeasuredPants} from '../../measured-pants.mjs';
import {denim} from '../../catalog-data.mjs';

const networkFetch=globalThis.fetch;
globalThis.fetch=async url=>url.protocol==='file:'?new Response(await readFile(url)):networkFetch(url);
const {makeMannequin}=await import('../../mannequin.mjs');
globalThis.fetch=networkFetch;

const mat=new THREE.MeshStandardMaterial();
const body=makeMannequin(mat);
const size=denim.sizes.find(s=>s.label==='M');
const results=[];
for(const denimPreset of ['standard','light','stretch']){
  body.pose(0,false);
  const opts={model:'female',pants:{...denim,measurements:size},photoDenim:true,denimPreset,
    gravity:9.81,wind:0,direction:0,turbulence:0};
  const pants=makeMeasuredPants(THREE,new THREE.Group(),body,mat,opts);
  let phase=0;
  function run(frames,walking,wind){
    let maxHem=0,knee=0,lastMoving=0;
    for(let f=0;f<frames;f++){
      if(walking){phase+=Math.PI/36;body.pose(phase,true);}
      opts.wind=wind;pants.pose(phase,opts,1/60,f===frames-1);
      const stats=pants.secondary;
      maxHem=Math.max(maxHem,stats.hem);knee=Math.max(knee,stats.kneeDisplacement);
      if(stats.hemSpeed>.025)lastMoving=f+1;
    }
    assert(pants.probe.flat(2).every(Number.isFinite));
    assert(maxHem<.45 && Number.isFinite(pants.secondary.hemSpeed));
    return {maxHem,knee,settleSeconds:lastMoving/60,endSpeed:pants.secondary.hemSpeed};
  }
  run(120,false,0);
  const walk=run(108,true,0),stop=run(240,false,0);
  const gust=run(180,false,4),calm=run(240,false,0);
  assert(stop.endSpeed<.025 && calm.endSpeed<.025,JSON.stringify({stop,calm}));
  results.push({denimPreset,walk,stop,gust,calm});
  pants.dispose();
}
assert(new Set(results.map(r=>r.gust.maxHem.toFixed(3))).size===3);
console.log(JSON.stringify(results,null,2));
