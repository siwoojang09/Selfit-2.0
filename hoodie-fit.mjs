// All pattern lengths are metres. Public measurements and wearer inputs use cm.
import {getAvatarFit} from './fit-body-sections.mjs?v=2026-11-22m7';

const tau=2*Math.PI;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
function blendStops(stops,y){
  for(let i=1;i<stops.length;i++)if(y<=stops[i][0]){
    const [a,p]=stops[i-1],[b,q]=stops[i],u=clamp((y-a)/(b-a),0,1);
    return mix(p,q,u*u*(3-2*u));
  }
  return stops[stops.length - 1][1];
}

export function wearer(model,custom={}){
  const base=getAvatarFit(model);
  const measure=k=>Number(custom?.[k])>0?Number(custom[k]):base[k];
  const height=measure('height'),chest=measure('chest'),waist=measure('waist'),hip=measure('hip');
  const sy=height/base.height;
  const stops=[[.52,1],[base.hipY,hip/base.hip],[base.waistY,waist/base.waist],[base.chestY,chest/base.chest],[1.455,1]];
  const widthAt=y=>blendStops(stops,y);
  return {base,height,chest,waist,hip,sy,widthAt,shoulder:base.shoulder,armLength:base.armLength*sy,
    radialAt(y,a){return widthAt(y)*base.radialAt(y,a);},centerAt(y){return base.bodyAt(y).cz;}};
}

export function hoodieFit(m,w){
  // 밑단단면은 상품 실측표에 없는 경우가 많아 가슴단면에서 0.845로 잡습니다.
  // 무신사 플랫레이 실물 사진에서 잰 비율입니다(가슴 60.5 cm, 밑단 51 cm).
  const chestM=2*m.chest/100,hemM=2*(m.hem??m.chest*.845)/100;
  const ease=m.chest*2-w.chest;
  const shoulderPath=m.shoulder/100,shoulderSurplus=(shoulderPath-w.shoulder/100)/2;
  // The high shoulder point sits at the neck/shoulder junction on this asset,
  // appreciably higher than the shoulder joint used to rotate the upper arm.
  let apex=1.475;
  while(apex<1.53 && w.base.bodyAt(apex).rx>.068)apex+=.001;
  const neckHalf=w.base.bodyAt(apex).rx;
  const halfSpan=neckHalf+Math.hypot(w.shoulder/200-neckHalf,(apex-w.base.shoulderY)*w.sy);
  const seamDrop=clamp(shoulderPath/2-halfSpan,0,.19);
  // A close-fitting rib starts gathering fabric at the wrist. Progressively more
  // of the available length settles into folds as the cuff reaches the hand.
  const arm=w.armLength/100,flatSleeve=m.sleeve/100;
  const excess=flatSleeve+seamDrop-arm;
  const handReach=.120*w.sy;
  const cuffOffset=excess<=0?excess:-handReach*Math.expm1(-excess/handReach);
  const sleeveStack=Math.max(0,excess-cuffOffset);
  const sleeveProjection=flatSleeve-sleeveStack;
  const chestSupportY=w.base.chestY;
  const bustRadius=w.radialAt(chestSupportY,0);
  const frontTravel=Math.max(0,bustRadius-.06);
  const chestDepth=(apex-chestSupportY)*w.sy;
  const frontRise=clamp(Math.hypot(chestDepth,frontTravel)-chestDepth,.003,.055);
  const hemY=apex-m.length/100/w.sy;
  return {chestM,hemM,ease,seamDrop,shoulderSurplus,flatSleeve,sleeveStack,sleeveProjection,cuffOffset,
    hemY,frontRise,length:m.length/100,frontHemY:hemY+frontRise/w.sy,apex,
    hemMeasured:m.hem!=null,
    fitLabel:ease<0?'가슴에서 늘어남':ease<8?'몸에 가까움':ease<18?'보통 여유':ease<30?'넉넉함':'큰 여유'};
}

const ringCount=64;
const angles=Array.from({length:ringCount},(_,i)=>tau*i/ringCount);
const sins=angles.map(Math.sin),coss=angles.map(Math.cos);
function perimeter(r){
  let p=0;
  for(let i=0;i<ringCount;i++){const j=(i+1)%ringCount;p+=Math.hypot(r[i]*sins[i]-r[j]*sins[j],r[i]*coss[i]-r[j]*coss[j]);}
  return p;
}

// Reconstruct horizontal pattern sections under two constraints: enclose the body and
// retain the flat pattern perimeter. Excess cloth is distributed around sides and back.
export function cutHoodie(m,w){
  const fit=hoodieFit(m,w),N=48;
  const rings=[];
  const chestT=.25;
  const chestExtra=Math.max(0,fit.ease)/100;
  for(let i=0;i<=N;i++){
    const t=i/N;
    const y=fit.apex-fit.length*t/w.sy;
    const center=w.centerAt(y);
    const base=[];
    const weights=[];
    const topT=clamp(t/.17,0,1);
    const lower=clamp((t-.68)/(.94-.68),0,1);
    const target=t<chestT?mix(.37,fit.chestM,Math.sin(t/chestT*Math.PI/2)**.76):
      mix(fit.chestM,fit.hemM,lower*lower*(3-2*lower));
    for(let j=0;j<ringCount;j++){
      const a=angles[j],c=coss[j],s=sins[j];
      const tilt=.025*Math.max(0,c)**2*(1-topT);
      const lift=fit.frontRise*Math.max(0,c)**2*t*t;
      const surfaceY=y+(lift-tilt)/w.sy;
      const skin=w.radialAt(surfaceY,a);
      const contact=skin+Math.abs(w.centerAt(surfaceY)-center)+.003;
      base.push(contact);
      const waistFold=Math.max(0,Math.sin(Math.PI*clamp((t-.22)/.73,0,1)));
      const side=.36+.64*s*s;
      const gathers=(Math.sin(8*a+1.7*t)+.43*Math.sin(13*a-2.8*t))*
        clamp(chestExtra*3,.14,1.2)*side*waistFold;
      weights.push(Math.max(.09,1+.44*s*s+.20*(1-c)-.24*Math.max(c,0)**20+gathers*.64));
    }
    let lo=0,hi=.3;
    const r=base.slice();
    for(let it=0;it<20;it++){
      const gap=(lo+hi)*.5;
      for(let j=0;j<ringCount;j++)r[j]=base[j]+gap*weights[j];
      if(perimeter(r)<target)lo=gap;else hi=gap;
    }
    const mean=(lo+hi)*.5;
    for(let j=0;j<ringCount;j++)r[j]=base[j]+mean*weights[j];
    rings.push({r,y,cz:center});
  }
  function atRing(i,u){
    const r=rings[i],a=u*tau,idx=(u%1+1)%1*ringCount,j=Math.floor(idx);
    const radius=mix(r.r[j],r.r[(j+1)%ringCount],idx-j);
    const c=Math.cos(a),t=i/N;
    const neckDip=.025*Math.max(0,c)**2*Math.max(0,1-t/.17);
    const hemLift=fit.frontRise*Math.max(0,c)**2*t*t;
    return [radius*Math.sin(a),r.y+(hemLift-neckDip)/w.sy,r.cz+radius*c];
  }
  return {fit,point(t,a){
    const k=clamp(t,0,1)*N,i=Math.floor(k),p=atRing(i,a/tau),q=atRing(Math.min(i+1,N),a/tau);
    return p.map((x,j)=>mix(x,q[j],k-i));
  }};
}
