// Retail flat widths and length are centimetres. Cut sections are metres.
// waistY and hemY are in the unscaled pelvis frame used by the avatar rig.
import {wearer} from './hoodie-fit.mjs?v=2026-11-23m';

const clamp=(x,low,high)=>Math.min(high,Math.max(low,x));
export function pantsFit(m,model='female',person=null){
  const w=wearer(model,person),sy=w.sy;
  const waistEase=m.waist*2-w.waist,hipEase=m.hip*2-w.hip;
  // A loose waistband settles lower on the upper hip. Bound the travel to a
  // wearable rise, as it would be held there by a belt or the side seams.
  const lowerLimit=w.base.waistY-Math.min(.13,.36*m.rise/100/sy);
  let waistY=w.base.waistY;
  while(waistY>lowerLimit && w.base.bodyAt(waistY).perimeter*w.widthAt(waistY)<m.waist*.02-.006)waistY-=.002;
  waistY=Math.max(waistY,lowerLimit);
  const waistHeight=(waistY+.024)*sy*100;
  const waistCirc=Math.max(m.waist*.02,w.base.bodyAt(waistY).perimeter*w.widthAt(waistY)+.003);
  const hipCirc=Math.max(m.hip*.02,w.hip/100+.006);
  const cutLength=m.length/100;
  // The front-rise tape runs from fly to crotch on the cloth surface.
  const rise=m.rise/100;
  const projection=Math.sqrt(Math.max((rise*.72)**2,rise**2-(hipCirc*.087)**2));
  const forkDrop=Math.min(cutLength*.88,projection);
  const hipDrop=Math.min(forkDrop*.74,clamp((waistY-w.base.hipY)*sy,.115,.23));
  const sideTravel=(hipCirc-waistCirc)*.19;
  const sideTakeup=Math.min(cutLength*.04,Math.hypot(hipDrop,sideTravel)-hipDrop);
  const ankleOffset=.081*sy*100-(waistHeight-m.length+100*sideTakeup);
  // Shoe front lifts the denim higher than the back. Excess outseam becomes
  // localized buckles and gathers above the hem instead of extending below ground.
  const shoeHeight=.047*sy;
  const stack=Math.max(0,shoeHeight*100-(waistHeight-m.length+sideTakeup*100));
  const hemY=waistY-(cutLength-sideTakeup-stack/100)/sy;
  return {w,sy,waistY,waistHeight,waistEase,hipEase,waistCirc,hipCirc,hipDrop,
    forkDrop,ankleOffset,stack,hemY,cutLength,sideTakeup,
    thighCirc:m.thigh*.02,hemCirc:m.hem*.02};
}
