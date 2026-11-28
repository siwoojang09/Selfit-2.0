import assert from 'node:assert/strict';
import {makePanel,denimProperties} from '../../denim-physics.mjs';

const rows=8,cols=6,dt=1/60;
const base=denimProperties('standard');
assert.equal(base.sources.gsm,'default');
assert.equal(denimProperties('light',{gsm:{value:230,source:'measured'}}).sources.gsm,'measured');

function swatch(fabric, horizontal=false, wind=0){
  const rest=new Float64Array(rows*cols*3);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    rest.set([c*.024,horizontal?0:-r*.024,horizontal?r*.024:0],3*(r*cols+c));
  }
  const cloth=makePanel(rest,rows,cols,false,2);
  const sample=(air,gravity)=>{
    for(let i=0;i<180;i++)cloth.step(dt,rest,fabric,{gravity,wind:air,direction:90});
    const q=3*((rows-1)*cols+2);
    assert(cloth.position.every(Number.isFinite));
    return {drop:rest[q+1]-cloth.position[q+1],deflection:Math.abs(cloth.position[q+2]-rest[q+2])};
  };
  return [sample(wind,9.81),sample(0,0)];
}
const stiff=swatch(base,true)[0],soft=swatch({...base,bend:base.bend*4},true)[0];
assert(soft.drop>stiff.drop);
const rigid=swatch(base)[0];
// Rotate the swatch cut to load the weft vertically.
const stretch=swatch({...base,warp:denimProperties('stretch').weft});
assert(stretch[0].drop>rigid.drop);
assert(stretch[1].drop<stretch[0].drop);
const light=swatch(base,false,4)[0],heavy=swatch({...base,gsm:base.gsm*2},false,4)[0];
assert(light.deflection>heavy.deflection);
console.log({stiff,soft,rigid,stretch,light,heavy});
