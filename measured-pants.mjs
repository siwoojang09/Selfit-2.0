// Both renderers receive the same closed leg panels, sewn trims and posed
// vertices. X/Z are metres. Y is divided by the wearer's height scale only.
import {pantsFit} from './pants-fit.mjs';

const tau=2*Math.PI, columns=56, rows=80;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
function smooth(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function ellipse(circ,ratio){
  const h=((1-ratio)/(1+ratio))**2;
  const x=circ/(Math.PI*(1+ratio)*(1+3*h/(10+Math.sqrt(4-3*h))));
  return [x,x*ratio];
}

function patternAt(f,side,h,a,lift){
  const drop=h*f.cutLength,s=Math.sin(a),c=Math.cos(a);
  const {w,sy}=f;
  const {hipDrop,forkDrop}=f;
  const seatT=smooth(.025,hipDrop,drop);
  const seatY=f.waistY-Math.min(drop,hipDrop)/sy;
  const skin=w.base.bodyAt(seatY),ratio=clamp(skin.rz/skin.rx,.60,.9);
  const seatCirc=mix(f.waistCirc,f.hipCirc,seatT);
  const [seatRx,seatRz]=ellipse(Math.max(seatCirc,skin.perimeter*w.widthAt(seatY)+.002),ratio);
  const taper=smooth(forkDrop+.008,f.cutLength,drop);
  const legCirc=mix(f.thighCirc,f.hemCirc,taper);
  const [rx,rz]=ellipse(legCirc,mix(1.18,.94,taper));
  const fork=smooth(Math.max(hipDrop,forkDrop-.084),forkDrop+.038,drop);
  const stack=f.stack/100;
  const buckleRegion=Math.min(.32,.12+stack*1.5);
  const ankleGather=smooth(f.cutLength-buckleRegion,f.cutLength,drop);
  const lowerFolds=Math.min(.016,.18*stack)*ankleGather;
  const verticalPleat=Math.sin(5*a+.6*Math.sin(7*h)+.5*side)+.46*Math.sin(9*a+9*h);
  const knee=Math.exp(-((h-.57)**2)/.004)*Math.max(0,-c);
  const wrinkles=fork*(.0029*verticalPleat+.0028*knee*Math.cos(61*h+a*1.7)
    +lowerFolds*Math.sin((drop*93+2.1*Math.cos(a)+Math.sin(2*a))*1.04));
  const fullness=clamp((f.hipEase+5)/40,0,1);
  // Position each wide leg over its foot, preserving a narrow inner-leg gap.
  // The hem opens around the shoe and rolls up higher over the toe.
  const footCentre=.086;
  const legCentre=Math.max(footCentre,rx*.94+.004);
  const gatherRise=stack*ankleGather;
  const contact=clamp(stack/.046,0,1);
  const hemTurn=(.019*Math.max(c,0)**2-.012*Math.max(-c,0)**2)*contact*h**11;
  const sag=.003*Math.sin(3*a+side)*h**12;
  const cutY=f.waistY-(drop-f.sideTakeup*smooth(0,hipDrop,drop)-gatherRise-hemTurn-sag)/sy;
  const seatFold=.0012*Math.sin(9*a+3*h)*seatT*(.35+fullness);
  const seatX=Math.max(s,0)*(seatRx+seatFold+lift),seatZ=(seatRz+seatFold+lift)*c+skin.cz;
  const legX=legCentre+s*(rx+wrinkles+lift),legZ=c*(rz+wrinkles+lift)+mix(.027,.013,taper);
  return [side*mix(seatX,legX,fork),cutY,mix(seatZ,legZ,fork)];
}

function buildSide(T,group,materials,fit,side){
  const batches=new Map();
  function patch(layer,vertical,horizontal,get){
    if(!batches.has(layer))batches.set(layer,{rest:[],uv:[],indices:[]});
    const b=batches.get(layer),base=b.rest.length/3;
    for(let i=0;i<=vertical;i++)for(let j=0;j<=horizontal;j++){
      const [h,a,lift=0]=get(i/vertical,j/horizontal);
      b.rest.push(...patternAt(fit,side,h,a,lift));b.uv.push(a/tau,1-h);
      if(i<vertical && j<horizontal){
        const k=base+i*(horizontal+1)+j,n=k+horizontal+1;
        if(side>0)b.indices.push(k,k+1,n,k+1,n+1,n);
        else b.indices.push(k,n,k+1,k+1,n,n+1);
      }
    }
  }
  const len=fit.cutLength, band=Math.min(.038,len*.08),wh=band/len;
  patch('shell',rows,columns,(v,u)=>[v,tau*u]);
  // Only the exterior half of each upper panel is visible before the fork.
  patch('band',5,32,(v,u)=>[v*wh,Math.PI*u,.0017]);
  // Turned hem with an inward return visible when the leg lifts.
  patch('band',4,columns,(v,u)=>[1-v*.014/len,tau*u,.0013]);
  patch('lining',4,columns,(v,u)=>[1-v*.012/len,tau*u,-.0004-.002*v]);

  function stitch(path,thickness=.00076,lift=.0033,layer='thread'){
    const at=t=>path(clamp(t,0,1));
    patch(layer,42,1,(t,u)=>{
      const [h,a]=at(t),p=at(t-.001),q=at(t+.001);
      const dh=(q[0]-p[0])*len,da=(q[1]-p[1])*.14,n=Math.hypot(dh,da)||1;
      const half=(u-.5)*thickness;
      return [h+half*da/n/len,a-half*dh/n/.14,lift];
    });
  }
  for(const y of [.004,band-.004])stitch(t=>[y/len,t*Math.PI]);
  for(const y of [.005,.010])stitch(t=>[1-y/len,t*tau],.0011,.0028);
  for(const a of [1.548,1.575,4.71])stitch(t=>[mix(wh,.99,t),a],.0010,.0025);
  // A sloping five-pocket opening with two rows of worn topstitch.
  for(const off of [0,.0035])stitch(t=>[(band+.071*Math.sin(t*1.51)+off)/len,.48+t*.96],.0014);
  if(side>0){
    patch('band',5,10,(v,u)=>[(band+.022+.021*v)/len,.73+.38*u,.002]);
    stitch(t=>[(band+.026)/len,.73+.38*t],.0012,.004);
  }
  for(const a of [.36,1.31,2.77]){
    patch('band',6,3,(v,u)=>[(.002+v*(band+.004))/len,a+.065*(u-.5),.004+.002*Math.sin(v*Math.PI)]);
    for(const v of [.006,band])stitch(t=>[v/len,a+(t-.5)*.063],.0015,.0057);
  }
  const pocketWidth=1.05;
  const pocket=(v,u)=>[(band+.071+.116*v+.029*v*(1-Math.abs(2*u-1)))/len,
    1.95+pocketWidth*(.04*v+u*(1-.08*v)),.0037];
  patch('patch',12,18,pocket);
  for(const inset of [.012,.035]){
    stitch(t=>pocket(inset,t),.001,.0049);
    stitch(t=>pocket(1-inset,t),.001,.0049);
    for(const u of [inset,1-inset])stitch(t=>pocket(t,u),.001,.0049);
  }
  for(const v of [0,.004])stitch(t=>[(band+.02+.031*t+v)/len,mix(Math.PI*.55,Math.PI,t)]);
  if(side>0){
    for(const off of [0,.018])stitch(t=>[(band+.135*t)/len,(.18+off)*(1-t**4)],.0014);
  }
  // Rivets and fly button are offset convex patches on the cloth surface.
  const rivet=(h,a,r,half=false)=>patch('metal',3,16,(t,u)=>{
    const angle=u*(half?Math.PI:tau);
    return [h+r*t*Math.cos(angle)/len,a+Math.sin(angle)*r*t/.14,.004+.002*(1-t*t)];
  });
  rivet(.019/len,0,.006,true);
  for(const [h,a] of [[band+.003,.48],[band+.073,1.43]])rivet(h/len,a,.0028);
  const pieces=[];
  for(const [key,b] of batches){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(b.rest,3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));g.setIndex(b.indices);g.computeVertexNormals();
    const mesh=new T.Mesh(g,materials[key]);
    mesh.name='Measured denim '+(side<0?'left ':'right ')+key;
    mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
    mesh.userData.garmentPart=side<0?'legLeft':'legRight';group.add(mesh);
    pieces.push({mesh,rest:g.attributes.position.array.slice()});
  }
  return pieces;
}

export function makeMeasuredPants(T,group,body,mat,opts){
  const fit=pantsFit(opts.pants.measurements,opts.model,opts.person);
  const tint=new T.Color(opts.pants.color||'#596e74');
  const material=(color,roughness=.88,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide});
  const materials={shell:mat,patch:mat,band:material(tint.clone().multiplyScalar(.90)),
    lining:material(tint.clone().multiplyScalar(.66)),thread:material(tint.clone().lerp(new T.Color('#a79a72'),.36)),
    metal:material('#a8a399',.51,.48)};
  const restAnchors=body.legs.map(leg=>({a:leg.a.clone(),b:leg.b.clone()}));
  const levels=96;
  const legs=[-1,1].map((side,i)=>{
    const pieces=buildSide(T,group,materials,fit,side);
    const low=fit.hemY-.05,high=fit.waistY+.03;
    const frames=Array.from({length:levels+1},(_,j)=>{
      const y=mix(low,high,j/levels),drop=(fit.waistY-y)*fit.sy;
      const travel=.93-y,knee=travel>.438;
      return {knee,t:clamp(knee?(travel-.438)/.44:travel/.438,0,1),
        fork:smooth(fit.hipDrop,fit.forkDrop+.038,drop),loose:smooth(fit.forkDrop,fit.cutLength,drop),
        x:0,y:0,z:0,sx:0,sz:0,vx:0,vz:0,seeded:false};
    });
    for(const p of pieces){
      const n=p.rest.length/3;
      p.row=new Uint8Array(n);p.ratio=new Float32Array(n);
      for(let v=0;v<n;v++){
        const f=clamp((p.rest[v*3+1]-low)/(high-low)*levels,0,levels-.00001);
        p.row[v]=Math.floor(f);p.ratio[v]=f-p.row[v];
      }
    }
    return {side,i,pieces,frames};
  });
  let time=0;
  function pose(phase,opt,dt){
    const step=clamp(dt||0,0,.034);time+=step;
    const wind=clamp(Number(opt.wind)||0,0,30),direction=(Number(opt.direction)||0)*Math.PI/180;
    const gravity=clamp(Number(opt.gravity??9.81),0,30);
    const a=body.legs[0].a,b=body.legs[2].a;
    const axis=Math.atan2(b.z-a.z,b.x-a.x),cs=Math.cos(axis),sn=Math.sin(axis);
    const hipX=(a.x+b.x)*.5,hipZ=(a.z+b.z)*.5,hipY=(a.y+b.y)*.5-.93;
    for(const {i,pieces,frames} of legs){
      for(const f of frames){
        const index=2*i+Number(f.knee),limb=body.legs[index],rest=restAnchors[index];
        const boneX=mix(limb.a.x,limb.b.x,f.t),boneY=mix(limb.a.y,limb.b.y,f.t),boneZ=mix(limb.a.z,limb.b.z,f.t);
        const restX=mix(rest.a.x,rest.b.x,f.t),restY=mix(rest.a.y,rest.b.y,f.t),restZ=mix(rest.a.z,rest.b.z,f.t);
        const x=mix(hipX,boneX-cs*restX+sn*restZ,f.fork);
        const z=mix(hipZ,boneZ-sn*restX-cs*restZ,f.fork);
        if(!f.seeded){f.sx=x;f.sz=z;f.seeded=true;}
        const gust=1+(Number(opt.turbulence)||0)*.22*Math.sin(3.8*time+f.t*5+i);
        const pull=115+gravity*2;
        f.vx+=((x-f.sx)*pull-f.vx*19+.40*wind*gust*Math.cos(direction)*f.loose)*step;
        f.vz+=((z-f.sz)*pull-f.vz*19+.40*wind*gust*Math.sin(direction)*f.loose)*step;
        f.sx+=f.vx*step;f.sz+=f.vz*step;
        f.x=x+f.loose*clamp(f.sx-x,-.020,.020);
        f.z=z+f.loose*clamp(f.sz-z,-.026,.026);
        f.y=mix(hipY,boneY-restY+.024,f.fork)+.003*(9.81-gravity)/9.81*f.loose;
      }
      for(const piece of pieces){
        const {mesh,rest,row,ratio}=piece,p=mesh.geometry.attributes.position;
        for(let k=0;k<row.length;k++){
          const q=k*3,f=frames[row[k]],g=frames[row[k]+1],t=ratio[k],x=rest[q],z=rest[q+2];
          p.array[q]=cs*x-sn*z+mix(f.x,g.x,t);
          p.array[q+1]=rest[q+1]+mix(f.y,g.y,t);
          p.array[q+2]=sn*x+cs*z+mix(f.z,g.z,t);
        }
        p.needsUpdate=true;mesh.geometry.computeVertexNormals();
      }
    }
  }
  return {pose,reset(){time=0;for(const leg of legs)for(const f of leg.frames){f.seeded=false;f.vx=f.vz=0;}},
    vertices:legs.reduce((n,leg)=>n+leg.pieces.reduce((t,p)=>t+p.rest.length/3,0),0),
    dispose(){for(const leg of legs)for(const p of leg.pieces){p.mesh.removeFromParent();p.mesh.geometry.dispose();}
      for(const material of new Set(Object.values(materials)))if(material!==mat)material.dispose();}};
}
