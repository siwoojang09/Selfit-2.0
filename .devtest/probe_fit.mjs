import {pantsFit} from '../pants-fit.mjs';
import {wearer} from '../hoodie-fit.mjs';

const m={length:105,waist:39.5,hip:57,thigh:40,rise:37.5,hem:28};
const fit=pantsFit(m,'female',null);
const w=fit.w, b=w.base;
const out={keys:{}};
for(const k of Object.keys(fit)) if(typeof fit[k]==='number') out.keys[k]=+fit[k].toFixed(4);
const rows=[];
for(let y=1.20;y>=0.84;y-=.01){
  const s=b.bodyAt(y);
  rows.push({y:+y.toFixed(2),rx:+(s.rx*1000).toFixed(1),rz:+(s.rz*1000).toFixed(1),cz:+(s.cz*1000).toFixed(1),per:+(s.perimeter*1000).toFixed(0)});
}
out.sections=rows;
out.landmarks={hipY:b.hipY,waistY:b.waistY,chestY:b.chestY,height:b.height};
// radial profile at a few angles to size the seat sheet
const prof=[];
for(const y of [1.16,1.12,1.08,1.04,1.00,.96,.92]){
  const line={y};
  for(const deg of [0,30,60,90,120,150,180]) line[deg]=+(b.radialAt(y,deg*Math.PI/180)*1000).toFixed(1);
  prof.push(line);
}
out.radial=prof;
// leg bone positions in rest pose
out.legs=[{a:[0,0,0]}];
console.log(JSON.stringify(out));
