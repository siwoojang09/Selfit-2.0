// Both renderers receive the same closed leg panels, sewn trims and posed
// vertices. X/Z are metres. Y is divided by the wearer's height scale only.
import {pantsFit} from './pants-fit.mjs';
import {createRowSolver} from './cloth-dynamics.mjs';

const tau=2*Math.PI, columns=56, rows=80;
// The pattern runs from the waistband down; the knee sits .438 m below the hip
// joint, so its distance from the waist has to be measured in garment space.
const hipJoint=.93,kneeFromHip=.438;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
function smooth(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function ellipse(circ,ratio){
  const h=((1-ratio)/(1+ratio))**2;
  const x=circ/(Math.PI*(1+ratio)*(1+3*h/(10+Math.sqrt(4-3*h))));
  return [x,x*ratio];
}
function limbAngle(upper,lower){
  const ax=upper.b.x-upper.a.x,ay=upper.b.y-upper.a.y,az=upper.b.z-upper.a.z;
  const bx=lower.b.x-lower.a.x,by=lower.b.y-lower.a.y,bz=lower.b.z-lower.a.z;
  const dot=ax*bx+ay*by+az*bz,la=Math.hypot(ax,ay,az)||1,lb=Math.hypot(bx,by,bz)||1;
  return Math.acos(clamp(dot/(la*lb),-1,1));
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
    pieces.push({mesh,rest:g.attributes.position.array.slice(),layer:key});
  }
  return pieces;
}

export function makeMeasuredPants(T,group,body,mat,opts){
  const fit=pantsFit(opts.pants.measurements,opts.model,opts.person);
  const tint=new T.Color(opts.pants.color||'#596e74');
  // Denim trim keeps the physical sheen of the shell; hardware does not.
  const material=(color,roughness=.88,metalness=0)=>{
    const m=new T.MeshPhysicalMaterial({color,roughness,metalness,side:T.DoubleSide});
    if(!metalness){m.sheen=.34;m.sheenRoughness=.62;m.sheenColor=new T.Color('#dfe6ee');}
    return m;
  };
  const materials={shell:mat,patch:mat,band:material(tint.clone().multiplyScalar(.90)),
    lining:material(tint.clone().multiplyScalar(.66)),thread:material(tint.clone().lerp(new T.Color('#a79a72'),.36)),
    metal:material('#a8a399',.51,.48)};
  const restAnchors=body.legs.map(leg=>({a:leg.a.clone(),b:leg.b.clone()}));
  const levels=96;
  const fabricName=opts.pants.material||'denim';
  // Where the knee and the hip fold actually fall on this pair, in metres of
  // pattern length from the waistband. Crease fields are centred on them.
  const kneeAt=(fit.waistY-(hipJoint-kneeFromHip))*fit.sy,hipAt=(fit.waistY-hipJoint)*fit.sy+.045;
  const legs=[-1,1].map((side,i)=>{
    const pieces=buildSide(T,group,materials,fit,side);
    const low=fit.hemY-.05,high=fit.waistY+.03;
    const frames=Array.from({length:levels+1},(_,j)=>{
      const y=mix(low,high,j/levels),drop=(fit.waistY-y)*fit.sy;
      const travel=hipJoint-y,knee=travel>kneeFromHip;
      return {knee,t:clamp(knee?(travel-kneeFromHip)/.44:travel/kneeFromHip,0,1),
        fork:smooth(fit.hipDrop,fit.forkDrop+.038,drop),loose:smooth(fit.forkDrop,fit.cutLength,drop),
        drop,x:0,y:0,z:0};
    });
    // Weight released towards the hem decides how much of the hem's own inertia
    // survives: the waistband stays sewn to the pose, the lower leg does not.
    const solver=createRowSolver({rows:frames.length,fabric:fabricName,
      weight:frames.map(f=>f.loose),cap:frames.map(f=>.005+.019*f.loose)});
    const target=new Float32Array(frames.length*3);
    // A row's own centre gives every vertex its outward direction, so creases
    // and the hem ripple bulge away from the limb instead of shearing it.
    const centreX=new Float32Array(frames.length),centreZ=new Float32Array(frames.length);
    const tally=new Int32Array(frames.length);
    const shell=pieces.find(p=>p.layer==='shell')||pieces[0];
    for(let v=0;v<shell.rest.length/3;v++){
      const y=shell.rest[v*3+1];
      const j=clamp(Math.round((y-low)/(high-low)*levels),0,levels);
      centreX[j]+=shell.rest[v*3];centreZ[j]+=shell.rest[v*3+2];tally[j]++;
    }
    for(let j=0;j<frames.length;j++){
      if(tally[j]){centreX[j]/=tally[j];centreZ[j]/=tally[j];}
      else {centreX[j]=centreX[Math.max(0,j-1)];centreZ[j]=centreZ[Math.max(0,j-1)];}
    }
    for(const p of pieces){
      const n=p.rest.length/3;
      p.row=new Uint8Array(n);p.ratio=new Float32Array(n);
      p.theta=new Float32Array(n);p.nx=new Float32Array(n);p.nz=new Float32Array(n);
      p.zoneKnee=new Float32Array(n);p.zoneThigh=new Float32Array(n);
      p.baseKnee=new Float32Array(n);p.baseThigh=new Float32Array(n);p.ripple=new Float32Array(n);
      for(let v=0;v<n;v++){
        const f=clamp((p.rest[v*3+1]-low)/(high-low)*levels,0,levels-.00001);
        const r=Math.floor(f);
        p.row[v]=r;p.ratio[v]=f-r;
        const x=p.rest[v*3]-centreX[r],z=p.rest[v*3+2]-centreZ[r],len=Math.hypot(x,z)||1;
        p.nx[v]=x/len;p.nz[v]=z/len;
        const theta=Math.atan2(p.rest[v*3],p.rest[v*3+2]);
        p.theta[v]=theta;
        const drop=(fit.waistY-(low+(high-low)*(r+.5)/levels))*fit.sy;
        const front=Math.cos(theta),back=-front;
        const a=(drop-kneeAt)/.105,b=(drop-hipAt)/.11;
        // Creases form behind the closing knee; the hip's forward fold drags
        // diagonal ridges across the front of the thigh.
        p.zoneKnee[v]=Math.exp(-a*a*1.5)*(.24+.76*Math.max(0,back));
        p.zoneThigh[v]=Math.exp(-b*b*1.5)*(.24+.76*Math.max(0,front))*.62;
        p.baseKnee[v]=a*7.4;p.baseThigh[v]=b*7.4;
        p.ripple[v]=theta*2.6+drop*6.8;
      }
    }
    const shellPiece=pieces.find(p=>p.layer==='shell')||pieces[0];
    const probeIndex=[];
    // The frame grid starts 5 cm below the hem, so the bottom ring sits at row 4-5.
    for(let v=0;v<shellPiece.row.length;v++)if(shellPiece.row[v]<=6&&v%6===0)probeIndex.push(v);
    return {side,i,pieces,frames,solver,target,ripple:new Float32Array(frames.length),shell:shellPiece,probeIndex};
  });
  let time=0,hem=0,peak=0,creaseAmp=0,kneeBend=0;

  function pose(phase,opt,dt){
    const step=clamp(dt||0,0,.034);time+=step;
    const wind=clamp(Number(opt.wind)||0,0,30),direction=Number(opt.direction)||0;
    const gravity=clamp(Number(opt.gravity??9.81),0,30);
    const turbulence=clamp(Number(opt.turbulence??.2),0,1);
    const live=opt.clothPhysics!==false;
    const a=body.legs[0].a,b=body.legs[2].a;
    const axis=Math.atan2(b.z-a.z,b.x-a.x),cs=Math.cos(axis),sn=Math.sin(axis);
    const hipX=(a.x+b.x)*.5,hipZ=(a.z+b.z)*.5,hipY=(a.y+b.y)*.5-.93;
    hem=0;peak=0;creaseAmp=0;kneeBend=0;
    for(const leg of legs){
      const {i,pieces,frames,solver,target,ripple}=leg;
      const upper=body.legs[2*i],lower=body.legs[2*i+1];
      // Knee closure and hip flexion are read from the posed skeleton, so the
      // crease depth follows the stride even on a paused, scrubbed frame.
      const knee=clamp((limbAngle(upper,lower)-.04)/1.02,0,1);
      const thighUp=upper.b.y-upper.a.y,thighRun=Math.hypot(upper.b.x-upper.a.x,upper.b.z-upper.a.z);
      const hip=clamp((Math.atan2(thighRun,Math.max(1e-4,-thighUp))-.03)/.42,0,1);
      kneeBend=Math.max(kneeBend,knee);
      for(let j=0;j<frames.length;j++){
        const f=frames[j];
        const index=2*i+Number(f.knee),limb=body.legs[index],rest=restAnchors[index];
        const boneX=mix(limb.a.x,limb.b.x,f.t),boneY=mix(limb.a.y,limb.b.y,f.t),boneZ=mix(limb.a.z,limb.b.z,f.t);
        const restX=mix(rest.a.x,rest.b.x,f.t),restY=mix(rest.a.y,rest.b.y,f.t),restZ=mix(rest.a.z,rest.b.z,f.t);
        // Kinematic offset of this row: what the pose alone would do.
        f.x=mix(hipX,boneX-cs*restX+sn*restZ,f.fork);
        f.z=mix(hipZ,boneZ-sn*restX-cs*restZ,f.fork);
        f.y=mix(hipY,boneY-restY+.024,f.fork)+.003*(9.81-gravity)/9.81*f.loose;
        const q=j*3;
        target[q]=f.x;target[q+1]=f.y;target[q+2]=f.z;
      }
      if(live) solver.step(step,target,{wind,direction,gravity,turbulence,clock:time});
      else solver.reset();
      peak=Math.max(peak,solver.peak);hem=Math.max(hem,solver.hem);
      const spec=solver.spec;
      // Travelling ripple carried by each row's own secondary velocity.
      for(let j=0;j<frames.length;j++){
        ripple[j]=Math.min(.0021,.0072*Math.hypot(solver.velocity[j*3],solver.velocity[j*3+2]));
      }
      for(const piece of pieces){
        const {mesh,rest,row,ratio,theta,nx,nz,zoneKnee,zoneThigh,baseKnee,baseThigh}=piece;
        const attr=mesh.geometry.attributes.position,arr=attr.array;
        for(let k=0;k<row.length;k++){
          const q=k*3,r=row[k],t=ratio[k];
          const fa=frames[r],fb=frames[r+1];
          let de=0;
          if(live&&(knee>.001||hip>.001)){
            const th=theta[k],ph=phase*.16;
            const kneeRidge=Math.sin(baseKnee[k]*(1+1.5*knee)+th*1.15+ph)*.66
              +Math.sin(baseKnee[k]*.446-th*2.1-phase*.11)*.34;
            const hipRidge=Math.sin(baseThigh[k]*(1+1.5*hip)+th*1.15+ph+2.4)*.66
              +Math.sin(baseThigh[k]*.446-th*2.1-phase*.11+2.4)*.34;
            de=spec.crease*spec.creaseScale*(knee*zoneKnee[k]*kneeRidge+hip*zoneThigh[k]*hipRidge);
          }
          const amp=mix(ripple[r],ripple[r+1],t);
          if(amp>1e-5) de+=amp*Math.sin(piece.ripple[k]-time*3.2);
          if(Math.abs(de)>creaseAmp) creaseAmp=Math.abs(de);
          const x=rest[q]+nx[k]*de,z=rest[q+2]+nz[k]*de;
          arr[q]=cs*x-sn*z+mix(fa.x,fb.x,t)+solver.at(r,t,0);
          arr[q+1]=rest[q+1]+mix(fa.y,fb.y,t)+solver.at(r,t,1);
          arr[q+2]=sn*x+cs*z+mix(fa.z,fb.z,t)+solver.at(r,t,2);
        }
        attr.needsUpdate=true;mesh.geometry.computeVertexNormals();
      }
    }
  }
  return {pose,reset(){time=0;hem=0;peak=0;creaseAmp=0;for(const leg of legs)leg.solver.reset();},
    get secondary(){return {hem,peak,crease:creaseAmp,knee:kneeBend};},
    // Live positions of the bottom ring of each leg: the hem's own displacement.
    get probe(){return legs.map(leg=>leg.probeIndex.map(v=>{
      const a=leg.shell.mesh.geometry.attributes.position.array;
      return [a[v*3],a[v*3+1],a[v*3+2]];
    }));},
    vertices:legs.reduce((n,leg)=>n+leg.pieces.reduce((t,p)=>t+p.rest.length/3,0),0),
    dispose(){for(const leg of legs)for(const p of leg.pieces){p.mesh.removeFromParent();p.mesh.geometry.dispose();}
      for(const material of new Set(Object.values(materials)))if(material!==mat)material.dispose();}};
}
