// Wide-fit denim, rebuilt as a tailored pattern instead of two tubes.
//
// Every row is one closed section that runs from the centre front seam, around
// the wearer's own hip contour, to the centre back seam, where it folds back on
// itself. Above the crotch the cloth follows the measured body sections with the
// tape's own ease (spent towards the seat, so the front stays close while the bag
// hangs at the back); below it the section becomes the leg's barrel, whose inner
// wall folds flat against the other leg. The crotch is the wedge the two folded
// walls leave between them, exactly like a Y seam.
//
// Waistband, belt loops, fly, front scoop and coin pockets, back yoke, patch
// pockets, rivets and the hem cuff are surfaces offset from that same grid, so
// they inherit the pose deformation, the solver's secondary motion and the wash
// UVs of the cloth underneath them.
import {pantsFit} from './pants-fit.mjs?v=2026-11-24a';
import {createRowSolver} from './cloth-dynamics.mjs?v=2026-11-24a';

const tau=2*Math.PI, columns=64, rows=96;
const hipJoint=.93,kneeFromHip=.438;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
function smooth(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
const gauss=(x,c,s)=>{const t=(x-c)/s;return Math.exp(-t*t);};

// Perimeter of an ellipse from its semi-axes (Ramanujan) and the second
// semi-axis that wears a flat pattern measure as its circumference.
const perimeterOf=(a,b)=>Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));
function secondAxis(per,first){
  let lo=first*.35,hi=first*4.5;
  for(let i=0;i<48;i++){const m=(lo+hi)*.5;if(perimeterOf(first,m)<per)lo=m;else hi=m;}
  return (lo+hi)*.5;
}
function stops(list){
  return x=>{
    if(x<=list[0][0])return list[0][1];
    for(let i=1;i<list.length;i++)if(x<=list[i][0]){
      const [a,p]=list[i-1],[b,q]=list[i];
      return mix(p,q,smooth(a,b,x));
    }
    return list[list.length-1][1];
  };
}
// Catmull-Rom through control points written as [drop, angle].
function curveThrough(points){
  const n=points.length-1;
  return t=>{
    const f=clamp(t,0,1)*n, i=Math.min(n-1,Math.floor(f)), u=f-i;
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(n,i+2)];
    const cr=(a,b,c,d)=>0.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
    return [cr(p0[0],p1[0],p2[0],p3[0]),cr(p0[1],p1[1],p2[1],p3[1])];
  };
}
const limbAngle=(upper,lower)=>{
  const ax=upper.b.x-upper.a.x,ay=upper.b.y-upper.a.y,az=upper.b.z-upper.a.z;
  const bx=lower.b.x-lower.a.x,by=lower.b.y-lower.a.y,bz=lower.b.z-lower.a.z;
  const dot=ax*bx+ay*by+az*bz,la=Math.hypot(ax,ay,az)||1,lb=Math.hypot(bx,by,bz)||1;
  return Math.acos(clamp(dot/(la*lb),-1,1));
};

export function makeMeasuredPants(T,group,body,mat,opts){
  const photo=Boolean(opts.photoDenim);
  const fit=pantsFit(opts.pants.measurements,opts.model,opts.person);
  const w=fit.w, S=w.base, sy=w.sy;
  const {waistY,cutLength,forkDrop,hipDrop}=fit;
  const stack=fit.stack/100;   // pantsFit reports the surplus in centimetres
  const bandH=Math.min(.043,cutLength*.055);
  const hipLevel=clamp(S.hipY,.60,waistY-.05);
  const legX=.091, legZ=-.008;      // hip joint in the rest rig
  const web=photo?.0012:.0024;                  // half the fold left between the two legs
  const legLength=cutLength-forkDrop;

  // ---- tape ---------------------------------------------------------------
  // A waistband stands off the skin by its own bulk even where the tape equals
  // the body, and the hip keeps the tape's full circumference: on a wide fit
  // that is a lot of cloth, and it is what makes the seat hang.
  const waistCircle=Math.max(fit.waistCirc,w.base.bodyAt(waistY).perimeter+.026);
  const hipCircle=Math.max(fit.hipCirc,w.base.bodyAt(hipLevel).perimeter+.11);
  const easeWeight=a=>.36+.50*Math.max(0,Math.sin(a))+.72*Math.max(0,-Math.cos(a));
  const easeSamples=200, seatEase=new Float32Array(easeSamples+1);
  for(let s=0;s<=easeSamples;s++){
    const d=cutLength*s/easeSamples;
    if(d>forkDrop+.10){seatEase[s]=seatEase[Math.max(0,s-1)];continue;}
    const y=clamp(waistY-d/sy,hipLevel,waistY);
    const cz=S.bodyAt(y).cz;
    const target=mix(waistCircle,hipCircle,smooth(-.03,hipDrop*.94,d))*.5;
    let lo=0,hi=.18;
    for(let it=0;it<20;it++){
      const e=(lo+hi)*.5;
      let per=0,px=0,pz=0;
      for(let k=0;k<=40;k++){
        const a=Math.PI*k/40, r=w.radialAt(y,a)+e*easeWeight(a);
        const x=r*Math.sin(a), z=cz+r*Math.cos(a);
        if(k)per+=Math.hypot(x-px,z-pz);
        px=x;pz=z;
      }
      if(per<target)lo=e;else hi=e;
    }
    // A very oversized hip hangs in folds rather than inflating a balloon, so
    // the smooth section only takes part of the tape's ease.
    seatEase[s]=clamp((lo+hi)*.5,.0045,.046);
  }
  const easeAt=d=>{
    const f=clamp(d/cutLength,0,1)*easeSamples, i=Math.min(easeSamples-1,Math.floor(f));
    return mix(seatEase[i],seatEase[i+1],f-i);
  };

  // ---- leg profile --------------------------------------------------------
  // The leg holds its full circumference past the knee before closing to the
  // hem: the barrel drape of the reference, not a straight cone.
  const legTaper=stops([[0,0],[.17,.03],[.36,.11],[.54,.22],[.70,.41],[.85,.70],[1,1]]);
  // How round the leg is where it is cut: a wide jean's opening collapses
  // towards a flatter oval over the shoe, so the same tape reads wider from the
  // front than a circular section of that circumference would.
  const legShape=stops([[0,1],[.45,1.0],[.72,1.03],[1,1.06]]);
  const legPerimeter=t=>mix(fit.thighCirc,fit.hemCirc,legTaper(t));
  const legBow=stops([[0,0],[.25,.008],[.5,.011],[.75,.010],[1,.009]]);

  // Excess length has nowhere to go but sideways above the shoe.
  const buckle=.11+Math.min(.18,Math.max(0,stack)*4);
  const buckleFrac=clamp(buckle/cutLength,.10,.30);

  // ---- sections -----------------------------------------------------------
  // The back of a waistband sits higher than the front, and the front arches
  // down over the stomach instead of cutting a horizontal line. The arch stays
  // shallow: a deep dip at the centre front is read as a V-notch cut into the
  // band, because the eye follows the two halves of the top edge down to it.
  const edgeCurve=a=>.0035-.0035*Math.cos(a);
  function surfaceY(d,a){
    const h=d/cutLength;
    const gather=Math.max(0,stack)*smooth(1-buckleFrac,1,h);
    let y=waistY-(d-fit.sideTakeup*smooth(0,hipDrop,d)-gather)/sy;
    y+=edgeCurve(a)*(1-smooth(0,.11,d));
    const hemBlend=smooth(cutLength-.17,cutLength,d);
    const front=Math.max(0,Math.cos(a));
    y+=(.034*front**1.7-.008*Math.max(0,-Math.cos(a)))*hemBlend*(photo?.36:1);
    return y;
  }
  function legGeom(d){
    const t=clamp((d-forkDrop)/legLength,0,1);
    const per=legPerimeter(t);
    const rx=per/tau*legShape(t);
    const rz=secondAxis(per,rx);
    return {t,per,rx,rz,cx:legX+legBow(t),cz:legZ};
  }
  function section(d,a){
    const f=smooth(forkDrop-.10,forkDrop+.035,d);
    const y=clamp(waistY-d/sy,hipLevel,waistY);
    // The measured table is sampled every 10 mm, and a linear read leaves a
    // kink at each step that bands the cloth; a small kernel smooths it.
    const seatCz=(S.bodyAt(y-.008).cz+2*S.bodyAt(y).cz+S.bodyAt(y+.008).cz)*.25;
    // The tape's surplus at a very wide hip hangs in soft vertical folds down
    // the sides of the seat; the front and the centre back stay smooth under
    // the fly and the patch pockets.
    const side=Math.pow(Math.abs(Math.sin(a)),.7);
    const folds=side*(1-f)*(.0125*smooth(.02,hipDrop*.85,d))
      *(Math.sin(4.3*a+1.35)*.62+Math.sin(7.9*a+2.9)*.38);
    const bodyR=(w.radialAt(y-.009,a)+2*w.radialAt(y,a)+w.radialAt(y+.009,a))*.25;
    // Below the hip the tape's surplus leaves the seat as hanging pleats, which
    // is what keeps the crotch from reading as one smooth apron.
    const skirt=(1-f)*smooth(.12,.30,d)*(.0085+ .006*smooth(.30,.40,d))
      *(Math.sin(6.1*a+2.2)*.60+Math.sin(9.4*a-1.3)*.40);
    // A photographed waistband has no modelled band to hide behind: the cloth
    // itself has to clear the wearer's stomach, or the body shows through the
    // top edge in patches. A few extra millimetres at the waist, tapering out
    // below it, keeps the fabric in front of the skin.
    const seatR=bodyR+easeAt(d)*easeWeight(a)+folds+skirt+(photo?.0045*smooth(.06,0,d):0);
    const sx=seatR*Math.sin(a), sz=seatCz+seatR*Math.cos(a);
    const g=legGeom(d);
    const lx=g.cx+g.rx*Math.sin(a), lz=g.cz+g.rz*Math.cos(a);
    let x=mix(sx,lx,f), z=mix(sz,lz,f);
    // The inner wall folds flat against the other leg; the fold softens as the
    // legs part, so they separate below the knee without a crease.
    // The folded inner wall belongs to the leg. Above the fork it would stand
    // as a flat sheet down the middle of the seat, and its own top edge rises
    // to the back of the waist, which reads from the front as a spike sticking
    // up out of the band. The fold is therefore absent at the waist and only
    // gathers in by the crotch, where the leg actually needs it.
    const inner=smooth(.02,.34,-Math.sin(a))*smooth(.02,forkDrop*.82,d);
    if(inner>0){
      const dx=x-web;
      x=mix(x,web+.5*(dx+Math.sqrt(dx*dx+4e-6)),inner);
    }
    const acx=mix(0,g.cx,f), acz=mix(seatCz,g.cz,f);
    let nx=x-acx, nz=z-acz;
    const rad=Math.hypot(nx,nz)||1; nx/=rad; nz/=rad;
    // Baked cloth: soft vertical pleats down the leg, a break at the knee, and
    // the rolls that pile up where the hem meets the shoe.
    const t=g.t;
    // Kept off the centre seams and the waistband, where the hardware sits on a
    // flat panel: a buried stitch line reads as a dashed one.
    const calm=Math.pow(Math.abs(Math.sin(a)),.55)*smooth(.045,.13,d);
    const pleat=.0032*Math.sin(5.4*a+.55*Math.sin(d*23)+1.1+sideSign*.9)
      +.0019*Math.sin(9.2*a-d*7.4)
      +.0011*Math.sin(13.7*a+3.3*d);
    const pleatMask=.35+.65*smooth(.05,.42,t);
    const kneeFold=.0042*gauss(d,forkDrop+.44,.075)*Math.sin(a*1.9+2.2+sideSign*.8);
    const roll=smooth(cutLength-.26,cutLength-.075,d)*(1-smooth(cutLength-.055,cutLength,d));
    const stacking=.0082*(photo?.34:1)*roll*Math.sin((cutLength-d)*86+a*1.35+2.6+sideSign*1.7);
    const frontDrape=.0026*smooth(.05,.30,t)*(1-smooth(.55,.95,t))
      *Math.sin(2.6*a-1.1+d*3.1)*Math.max(0,Math.cos(a))**.8;
    const wobble=((pleat*pleatMask+kneeFold+stacking)*calm*(.55+.45*Math.max(0,Math.cos(a)))
      +frontDrape)*(photo?.5:1);
    return {x:x+nx*wobble,z:z+nz*wobble,y:surfaceY(d,a)+stacking*.5,nx,nz,rad,cz:acz};
  }
  // ---- materials ----------------------------------------------------------
  const tint=new T.Color(opts.pants.color||'#596e74');
  const cloth=(color,roughness=.9,metalness=0)=>{
    const m=new T.MeshPhysicalMaterial({color,roughness,metalness,side:T.DoubleSide});
    if(!metalness){m.sheen=.30;m.sheenRoughness=.64;m.sheenColor=new T.Color('#dfe6ee');}
    return m;
  };
  const materials={
    shell:mat, band:mat, patch:mat,
    lining:cloth(tint.clone().multiplyScalar(.55),.95),
    shadow:cloth(tint.clone().multiplyScalar(.26),1),
    // Core-spun topstitch thread keeps its caramel colour through every wash.
    thread:cloth(new T.Color('#c98a3e').lerp(tint,.10),.78),
    metal:cloth('#b8b2a5',.42,.66)
  };

  // ---- geometry helpers ---------------------------------------------------
  // Winding follows the reference direction each piece should face, so no
  // surface can come out inside-out.
  function geometryFor(pos,uv,idx,ref){
    const build=()=>{
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));
      g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      g.setIndex(idx);g.computeVertexNormals();
      return g;
    };
    const g=build();
    const n=g.attributes.normal.array;
    let dot=0;
    for(let i=0;i<n.length/3;i++)dot+=n[i*3]*ref[i*3]+n[i*3+1]*ref[i*3+1]+n[i*3+2]*ref[i*3+2];
    if(dot<0){
      for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}
      g.setIndex(idx);g.computeVertexNormals();
    }
    return g;
  }
  // The ring is generated with a duplicated column where it closes, so the two
  // sides of the centre seam are shaded as one continuous surface.
  function weldRing(geometry,vertical,horizontal){
    const n=geometry.attributes.normal;
    for(let i=0;i<=vertical;i++){
      const a=i*(horizontal+1),b=a+horizontal;
      const x=n.getX(a)+n.getX(b),y=n.getY(a)+n.getY(b),z=n.getZ(a)+n.getZ(b);
      const l=Math.hypot(x,y,z)||1;
      n.setXYZ(a,x/l,y/l,z/l);n.setXYZ(b,x/l,y/l,z/l);
    }
    n.needsUpdate=true;
  }

  // ---- one side -----------------------------------------------------------
  // The two legs must not share the same wrinkles, so the baked fields are
  // phased per side.
  let sideSign=1;
  // Above the fork each side builds the same closed hip section, so the two
  // legs lay one surface inside the other. With a photograph on it, that seam
  // flickers into a torn edge; the mirrored half tucks itself a millimetre
  // inside the other and disappears. The sink follows the folded half, since
  // that is the half that duplicates the opposite side.
  const seatSink=(d,a)=>.0012*smooth(0,.10,-Math.sin(a))*(1-smooth(forkDrop-.06,forkDrop+.02,d));
  function buildSide(side){
    const flip=side<0;
    sideSign=side;
    const parts=[];
    const rigid=[];

    function emit(vertical,horizontal,get,refSign=1,fullRing=false){
      const pos=[],uv=[],idx=[],ref=[];
      for(let i=0;i<=vertical;i++)for(let j=0;j<=horizontal;j++){
        const item=get(i/vertical,j/horizontal);
        const d=item[0],a=item[1],lift=item[2]||0;
        const p=section(d,a);
        const lift2=lift-seatSink(d,a);
        pos.push(side*(p.x+p.nx*lift2),p.y,p.z+p.nz*lift2);
        ref.push(side*p.nx*refSign,0,p.nz*refSign);
        uv.push(a/tau,1-d/cutLength);
      }
      for(let i=0;i<vertical;i++)for(let j=0;j<horizontal;j++){
        const k=i*(horizontal+1)+j,n=k+horizontal+1;
        if(flip)idx.push(k,k+1,n,k+1,n+1,n);
        else idx.push(k,n,k+1,k+1,n,n+1);
      }
      return {pos,uv,idx,ref,vertical,horizontal,fullRing};
    }
    // A raised strip of thread or a fold, rounded across its width: `width` is
    // a half width in metres, so stitches keep a real gauge at any radius.
    function ribbon(path,total,{width=.0017,lift=.0034,bulge=.0009,layer='thread',refSign=1}={}){
      const across=4;
      const pos=[],uv=[],idx=[],ref=[];
      for(let i=0;i<=total;i++){
        const t=i/total;
        const [d,a]=path(t);
        const p=section(d,a);
        const [d0,a0]=path(Math.max(0,t-.004)),[d1,a1]=path(Math.min(1,t+.004));
        const q0=section(d0,a0),q1=section(d1,a1);
        let tx=q1.x-q0.x,ty=q1.y-q0.y,tz=q1.z-q0.z;
        const tl=Math.hypot(tx,ty,tz)||1;tx/=tl;ty/=tl;tz/=tl;
        let bx=ty*p.nz,by=tz*p.nx-tx*p.nz,bz=-ty*p.nx;
        const bl=Math.hypot(bx,by,bz)||1;bx/=bl;by/=bl;bz/=bl;
        for(let k=0;k<=across;k++){
          const u=k/across*2-1;
          const off=u*width*1.22, up=lift+bulge*(1-u*u);
          pos.push(side*(p.x+p.nx*up+bx*off),p.y+by*off,p.z+p.nz*up+bz*off);
          ref.push(side*p.nx*refSign,0,p.nz*refSign);
          uv.push(a/tau,1-d/cutLength);
        }
      }
      for(let i=0;i<total;i++)for(let k=0;k<across;k++){
        const k0=i*(across+1)+k,n=k0+across+1;
        if(flip)idx.push(k0,k0+1,n,k0+1,n+1,n);
        else idx.push(k0,n,k0+1,k0+1,n,n+1);
      }
      parts.push({pos,uv,idx,ref,layer});
    }
    function rivet(d,a,r,lift){
      const p=section(d,a);
      const pos=[],uv=[],idx=[],ref=[];
      const steps=12;
      for(let ring=0;ring<=2;ring++){
        const t=ring/2;
        for(let k=0;k<=steps;k++){
          const ang=k/steps*tau;
          const rr=r*t, up=lift+r*.42*Math.sqrt(Math.max(0,1-t*t));
          const cx=Math.cos(ang)*rr, cz=Math.sin(ang)*rr;
          pos.push(side*(p.x+p.nx*up+p.nz*cx),p.y+cz,p.z+p.nz*up-p.nx*cx);
          ref.push(side*p.nx,0,p.nz);
          uv.push(a/tau,1-d/cutLength);
        }
      }
      for(let ring=0;ring<2;ring++)for(let k=0;k<steps;k++){
        const k0=ring*(steps+1)+k,n=k0+steps+1;
        if(flip)idx.push(k0,k0+1,n,k0+1,n+1,n);
        else idx.push(k0,n,k0+1,k0+1,n,n+1);
      }
      parts.push({pos,uv,idx,ref,layer:'metal'});
    }

    // ---- shell: waistband top to hem, one closed section per row
    const shell=emit(rows,columns,(v,u)=>[v*cutLength,tau*u,0],1,true);
    shell.layer='shell';
    parts.push(shell);

    // ---- waistband: a band sewn over the shell, rolled at its top edge
    const bandEdge=d=>{
      const v=d/bandH;
      return .0019+.0008*Math.sin(Math.PI*Math.min(1,v*1.1))+.0009*smooth(.88,1,v);
    };
    parts.push(Object.assign(emit(9,columns,(v,u)=>[v*bandH,tau*u,bandEdge(v*bandH)],1,true),{layer:'band'}));
    ribbon(t=>[bandH-.0017,t*tau],columns,{width:.0012,lift:.0017,bulge:.0003,layer:'shadow'});
    ribbon(t=>[bandH+.0023,t*tau],columns,{width:.0013,lift:.0034,bulge:.0005});
    ribbon(t=>[.0032,t*tau],columns,{width:.0013,lift:.0034,bulge:.0005});

    // ---- belt loops: six straps standing off the band
    for(const a0 of [.30,1.06,2.62,3.66,5.22,5.98]){
      const rad=section(bandH*.5,a0).rad||.12;
      const da=.0072/rad;
      const loop=emit(8,5,(v,u)=>{
        const across=u*2-1;
        const taper=1-Math.pow(Math.abs(across),6)*.30;
        const lift=.0034+.0011*gauss(across,0,.65)+.0004*Math.sin(Math.PI*v);
        return [mix(.0014,bandH-.0014,v)*taper,a0+across*da,lift];
      });
      loop.layer='band';
      parts.push(loop);
      for(const v of [.10,.90]){
        const at=v*(bandH-.0028)+.0014;
        ribbon(t=>[at,a0+(t-.5)*da*1.7],8,{width:.0016,lift:.0054,bulge:.0006});
      }
      for(const sign of [-1,1])
        ribbon(t=>[mix(.0016,bandH-.0016,t),a0+sign*da*1.12],8,
          {width:.0009,lift:.0022,bulge:.0002,layer:'shadow'});
    }

    // ---- fly (wearer's right)
    if(flip){
      parts.push(Object.assign(emit(12,6,(v,u)=>[mix(bandH*.96,.152,v),mix(.010,.318,.02+.96*u),
        .0010+.0016*smooth(.55,1,u)]),{layer:'patch'}));
      const flySeam=curveThrough([[bandH+.002,.300],[.050,.298],[.090,.290],[.116,.248],[.130,.174],[.134,.102],[.128,.030],[.114,.003]]);
      ribbon(flySeam,44,{width:.0018,lift:.0042,bulge:.0006});
      ribbon(t=>[mix(bandH,.150,t),mix(.318,.020,t)],10,{width:.0020,lift:.0022,bulge:.0004,layer:'shadow'});
      ribbon(t=>[bandH+.0028,.290],5,{width:.0032,lift:.0044,bulge:.0008});
      rivet(bandH+.012,.286,.0024,.0044);
    }

    // ---- front scoop pocket
    {
      const mouth=curveThrough([[bandH+.004,1.50],[bandH+.012,1.26],[.060,1.06],[.085,.88],[.112,.70],[.138,.545]]);
      ribbon(mouth,44,{width:.0040,lift:.0008,bulge:.0020,layer:'patch'});
      ribbon(t=>{const [d,a]=mouth(t);return [d-.0042,a-.004];},44,{width:.0026,lift:.0020,bulge:.0003,layer:'shadow'});
      ribbon(t=>{const [d,a]=mouth(t);return [d+.0062,a+.012];},44,{width:.0013,lift:.0042,bulge:.0006});
      ribbon(t=>{const [d,a]=mouth(t);return [d+.0150,a+.030];},44,{width:.0012,lift:.0038,bulge:.0005});
      for(const t of [.01,.975]){const [d,a]=mouth(t);rivet(d,a,.0026,.0038);}
    }

    // ---- coin pocket (wearer's right)
    if(flip){
      const coin=emit(9,7,(v,u)=>{
        const d=mix(bandH+.003,.083,v);
        const a=mix(.640,.905,u);
        const inset=Math.pow(Math.abs(u*2-1),4)*.010*v;
        return [d+inset,a,.0010+.0016*smooth(0,.3,v)];
      });
      coin.layer='patch';
      parts.push(coin);
      ribbon(t=>[.049,.646+t*.248],10,{width:.0022,lift:.0018,bulge:.0002,layer:'shadow'});
      const border=[[bandH+.005,.642],[bandH+.005,.900],[.073,.898],[.081,.874],[.078,.642],[bandH+.005,.642]];
      for(let s=0;s<border.length-1;s++){
        const p0=border[s],p1=border[s+1];
        ribbon(t=>[mix(p0[0],p1[0],t),mix(p0[1],p1[1],t)],10,{width:.0012,lift:.0033,bulge:.0005});
      }
      rivet(bandH+.014,.664,.0022,.0036);
      rivet(bandH+.014,.878,.0022,.0036);
    }

    // ---- top button
    if(flip&&!photo){
      const d=bandH*.52, p=section(d,0);
      const disk=new T.CylinderGeometry(.0080,.0082,.0034,22);
      disk.rotateX(Math.PI/2);disk.translate(0,p.y,p.z+.0044);
      const rim=new T.TorusGeometry(.0079,.0010,6,24);
      rim.translate(0,p.y,p.z+.0060);
      for(const g of [disk,rim]){
        const mesh=new T.Mesh(g,materials.metal);
        mesh.name='Denim waistband button';
        mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
        mesh.userData.garmentPart='legLeft';
        group.add(mesh);
        rigid.push({mesh,rest:g.attributes.position.array.slice(),layer:'metal'});
      }
    }

    // ---- back yoke
    {
      const yoke=curveThrough([[.070,1.30],[.080,1.75],[.092,2.30],[.100,2.80],[.104,Math.PI-.002]]);
      ribbon(yoke,36,{width:.0022,lift:.0019,bulge:.0002,layer:'shadow'});
      ribbon(t=>{const [d,a]=yoke(t);return [d-.0052,a];},36,{width:.0013,lift:.0036,bulge:.0005});
      ribbon(t=>{const [d,a]=yoke(t);return [d+.0032,a];},36,{width:.0013,lift:.0038,bulge:.0005});
      parts.push(Object.assign(emit(7,30,(v,u)=>{
        const t=u,[d,a]=yoke(t);
        return [d+.0012-v*.015,a,.0010];
      }),{layer:'patch'}));
    }

    // ---- back patch pocket
    {
      const aC=Math.PI-.44, halfA=.330;
      const dTop=.112, tilt=.013, dCorner=.240, dPoint=.274;
      const dTopAt=u=>dTop+tilt*u;
      const dBotAt=u=>dCorner+(dPoint-dCorner)*(1-Math.pow(Math.abs(u*2-1),.92));
      const body=emit(12,12,(v,u)=>[mix(dTopAt(u),dBotAt(u),v),aC-halfA+halfA*2*u,
        .0011+.0013*smooth(0,.3,v)]);
      body.layer='patch';
      parts.push(body);
      for(const o of [.0032,.0102]){
        const top=t=>[dTopAt(t)+o*(1+.35*Math.abs(t*2-1)),aC-halfA+halfA*2*t];
        const bot=t=>[dBotAt(t)-o*.5,aC-halfA+halfA*2*t];
        const left=t=>[mix(dTopAt(t)+o,dBotAt(t)-o*.5,t),aC-halfA+o*.9*t];
        const right=t=>[mix(dTopAt(t)+o,dBotAt(t)-o*.5,t),aC+halfA-o*.9*t];
        if(o>.004)ribbon(t=>{const [d,a]=top(t);return [d-.0035,a];},16,{width:.0022,lift:.0018,bulge:.0002,layer:'shadow'});
        ribbon(top,16,{width:.0011,lift:.0030,bulge:.0004});
        ribbon(bot,16,{width:.0011,lift:.0030,bulge:.0004});
        ribbon(left,10,{width:.0011,lift:.0030,bulge:.0004});
        ribbon(right,10,{width:.0011,lift:.0030,bulge:.0004});
      }
    }

    // ---- seams: outseam down the side, inseam from the crotch, centre seams
    for(const a of [Math.PI/2]){
      ribbon(t=>[mix(bandH+.002,cutLength-.02,t),a],90,{width:.0018,lift:.0020,bulge:.0003,layer:'shadow'});
      ribbon(t=>[mix(bandH+.002,cutLength-.02,t),a-.004],90,{width:.0012,lift:.0034,bulge:.0005});
    }
    ribbon(t=>[mix(forkDrop+.03,cutLength-.02,t),3*Math.PI/2],70,{width:.0018,lift:.0030,bulge:.0003,layer:'shadow'});
    // The centre front and centre back seams run down to just above the
    // crotch; there the section folds onto the inner wall and the same fabric
    // line carries on as the crotch and inseam seams.
    if(flip){
      ribbon(t=>[mix(bandH+.004,.276,t),.016],44,{width:.0016,lift:.0030,bulge:.0004});
      ribbon(t=>[mix(bandH+.004,.272,t),.009],44,{width:.0022,lift:.0022,bulge:.0002,layer:'shadow'});
    }else{
      ribbon(t=>[mix(bandH+.004,.276,t),Math.PI-.016],44,{width:.0016,lift:.0030,bulge:.0004});
    }

    // ---- hem cuff
    {
      const cuff=.0165;
      parts.push(Object.assign(emit(6,columns,(v,u)=>[cutLength-cuff+v*cuff,tau*u,.0010+.0013*smooth(0,1,v)],1,true),{layer:'band'}));
      parts.push(Object.assign(emit(5,columns,(v,u)=>[cutLength-v*.015,tau*u,-.0006-.0017*v],-1,true),{layer:'lining'}));
      for(const up of [.0044,.0116]){
        ribbon(t=>[cutLength-up,t*tau],columns,{width:.0013,lift:.0030,bulge:.0005});
      }
      ribbon(t=>[cutLength-.0150,t*tau],columns,{width:.0015,lift:.0014,bulge:.0004,layer:'shadow'});
    }

    // ---- photo garment
    // The photograph already carries the waistband, fly, both pocket shapes,
    // the rivets, the topstitch and the hem, so the mesh keeps only the cloth
    // shell plus two narrow facings that close its top and bottom edges. Adding
    // modelled detail on top would draw a second, competing set of lines.
    if(photo){
      parts.length=0;
      parts.push(shell);
      parts.push(Object.assign(emit(4,columns,(v,u)=>[.006+v*.022,tau*u,-.0026-.0022*v],-1,true),{layer:'lining'}));
      parts.push(Object.assign(emit(3,columns,(v,u)=>[cutLength-.005-v*.013,tau*u,-.0022-.0018*v],-1,true),{layer:'lining'}));
    }

    // ---- meshes
    const pieces=[];
    for(const part of parts){
      const g=geometryFor(part.pos,part.uv,part.idx,part.ref);
      if(part.fullRing)weldRing(g,part.vertical,part.horizontal);
      const mesh=new T.Mesh(g,materials[part.layer]||materials.patch);
      mesh.name='Measured denim '+(flip?'right ':'left ')+(part.layer||'piece');
      mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
      mesh.userData.garmentPart=flip?'legLeft':'legRight';
      group.add(mesh);
      pieces.push({mesh,rest:g.attributes.position.array.slice(),layer:part.layer||'patch',
        ring:part.fullRing?[part.vertical,part.horizontal]:null});
    }
    for(const piece of rigid){
      piece.mesh.userData.garmentPart=flip?'legLeft':'legRight';
      piece.mesh.geometry.computeVertexNormals();
      pieces.push(Object.assign({row:null,rigid:true},piece));
    }
    return pieces;
  }

  // ---- assemble -----------------------------------------------------------
  const restAnchors=body.legs.map(leg=>({a:leg.a.clone(),b:leg.b.clone()}));
  const levels=96;
  const fabricName=opts.pants.material||'denim';
  const kneeAt=(waistY-(hipJoint-kneeFromHip))*sy;
  const hipAt=(waistY-hipJoint)*sy+.045;

  const legs=[-1,1].map((side,i)=>{
    const pieces=buildSide(side);
    const low=fit.hemY-.06,high=waistY+.06;
    const frames=Array.from({length:levels+1},(_,j)=>{
      const y=mix(low,high,j/levels),drop=(waistY-y)*sy;
      const travel=hipJoint-y,knee=travel>kneeFromHip;
      return {knee,t:clamp(knee?(travel-kneeFromHip)/.44:travel/kneeFromHip,0,1),
        fork:smooth(hipDrop,forkDrop+.038,drop),loose:smooth(forkDrop,cutLength,drop),
        drop,x:0,y:0,z:0};
    });
    const solver=createRowSolver({rows:frames.length,fabric:fabricName,
      weight:frames.map(f=>f.loose),cap:frames.map(f=>.005+.019*f.loose)});
    const target=new Float32Array(frames.length*3);
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
      else{centreX[j]=centreX[Math.max(0,j-1)];centreZ[j]=centreZ[Math.max(0,j-1)];}
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
        const drop=(waistY-(low+(high-low)*(r+.5)/levels))*sy;
        const front=Math.cos(theta),back=-front;
        const a=(drop-kneeAt)/.105,b=(drop-hipAt)/.11;
        p.zoneKnee[v]=Math.exp(-a*a*1.5)*(.24+.76*Math.max(0,back));
        p.zoneThigh[v]=Math.exp(-b*b*1.5)*(.24+.76*Math.max(0,front))*.62;
        p.baseKnee[v]=a*7.4;p.baseThigh[v]=b*7.4;
        p.ripple[v]=theta*2.6+drop*6.8;
      }
    }
    const probeIndex=[];
    for(let v=0;v<shell.row.length;v++)if(shell.row[v]<=6&&v%6===0)probeIndex.push(v);
    return {side,i,pieces,frames,solver,target,ripple:new Float32Array(frames.length),shell,probeIndex};
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
      const knee=clamp((limbAngle(upper,lower)-.04)/1.02,0,1);
      const thighUp=upper.b.y-upper.a.y,thighRun=Math.hypot(upper.b.x-upper.a.x,upper.b.z-upper.a.z);
      const hip=clamp((Math.atan2(thighRun,Math.max(1e-4,-thighUp))-.03)/.42,0,1);
      kneeBend=Math.max(kneeBend,knee);
      for(let j=0;j<frames.length;j++){
        const f=frames[j];
        const index=2*i+Number(f.knee),limb=body.legs[index],rest=restAnchors[index];
        const boneX=mix(limb.a.x,limb.b.x,f.t),boneY=mix(limb.a.y,limb.b.y,f.t),boneZ=mix(limb.a.z,limb.b.z,f.t);
        const restX=mix(rest.a.x,rest.b.x,f.t),restY=mix(rest.a.y,rest.b.y,f.t),restZ=mix(rest.a.z,rest.b.z,f.t);
        f.x=mix(hipX,boneX-cs*restX+sn*restZ,f.fork);
        f.z=mix(hipZ,boneZ-sn*restX-cs*restZ,f.fork);
        f.y=mix(hipY,boneY-restY+.024,f.fork)+.003*(9.81-gravity)/9.81*f.loose;
        const q=j*3;
        target[q]=f.x;target[q+1]=f.y;target[q+2]=f.z;
      }
      if(live)solver.step(step,target,{wind,direction,gravity,turbulence,clock:time});
      else solver.reset();
      peak=Math.max(peak,solver.peak);hem=Math.max(hem,solver.hem);
      const spec=solver.spec;
      for(let j=0;j<frames.length;j++){
        ripple[j]=Math.min(.0021,.0072*Math.hypot(solver.velocity[j*3],solver.velocity[j*3+2]));
      }
      for(const piece of pieces){
        const {mesh,rest,row,ratio,theta,nx,nz,zoneKnee,zoneThigh,baseKnee,baseThigh}=piece;
        const attr=mesh.geometry.attributes.position,arr=attr.array;
        if(piece.rigid){
          const q=piece.rest;
          for(let k=0;k<row.length;k++){
            const r=row[k],t=ratio[k],fa=frames[r],fb=frames[r+1];
            const x=q[k*3],z=q[k*3+2];
            arr[k*3]=cs*x-sn*z+mix(fa.x,fb.x,t);
            arr[k*3+1]=q[k*3+1]+mix(fa.y,fb.y,t);
            arr[k*3+2]=sn*x+cs*z+mix(fa.z,fb.z,t);
          }
          attr.needsUpdate=true;
          continue;
        }
        for(let k=0;k<row.length;k++){
          const q2=k*3,r=row[k],t=ratio[k];
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
          if(amp>1e-5)de+=amp*Math.sin(piece.ripple[k]-time*3.2);
          if(Math.abs(de)>creaseAmp)creaseAmp=Math.abs(de);
          const x=rest[q2]+nx[k]*de,z=rest[q2+2]+nz[k]*de;
          arr[q2]=cs*x-sn*z+mix(fa.x,fb.x,t)+solver.at(r,t,0);
          arr[q2+1]=rest[q2+1]+mix(fa.y,fb.y,t)+solver.at(r,t,1);
          arr[q2+2]=sn*x+cs*z+mix(fa.z,fb.z,t)+solver.at(r,t,2);
        }
        attr.needsUpdate=true;mesh.geometry.computeVertexNormals();
        // The ring closes on a duplicated column; without this the seam line
        // would be shaded as a hard crease down the centre front.
        if(piece.ring)weldRing(mesh.geometry,piece.ring[0],piece.ring[1]);
      }
    }
  }

  const counts=legs.reduce((n,leg)=>n+leg.pieces.reduce((t,p)=>t+p.rest.length/3,0),0);
  return {pose,reset(){time=0;hem=0;peak=0;creaseAmp=0;for(const leg of legs)leg.solver.reset();},
    // The photo unwrap needs the same section geometry the cloth is built from:
    // where the front/back centre lines sit, how far the seam reaches, and how
    // much of the row is still the seat rather than a single leg. Packed so the
    // texture builder reads the pattern from one source of truth.
    rowGuide(samples=192){
      const out=[];
      for(let k=0;k<=samples;k++){
        const d=cutLength*k/samples;
        const f=smooth(forkDrop-.10,forkDrop+.035,d);
        const front=section(d,0),back=section(d,Math.PI),inner=section(d,3*Math.PI/2);
        let outer=0;
        for(let i=0;i<=24;i++)outer=Math.max(outer,section(d,Math.PI*i/48).x);
        out.push([d/cutLength,f,front.x,back.x,inner.x,outer]);
      }
      return out;
    },
    landmarks:{cutLength,waistY,forkDrop,bandH,legX,columns,rows,length:fit.cutLength},
    get secondary(){return {hem,peak,crease:creaseAmp,knee:kneeBend};},
    get probe(){return legs.map(leg=>leg.probeIndex.map(v=>{
      const a=leg.shell.mesh.geometry.attributes.position.array;
      return [a[v*3],a[v*3+1],a[v*3+2]];
    }));},
    vertices:counts,
    // The cloth pieces in build order: the photo-mapped asset supplies one
    // geometry per piece, so the runtime can wear the baked texture mesh while
    // the solver keeps placing its vertices.
    get parts(){return legs.flatMap(leg=>leg.pieces.filter(p=>!p.rigid));},
    dispose(){
      for(const leg of legs)for(const p of leg.pieces){p.mesh.removeFromParent();p.mesh.geometry.dispose();}
      for(const material of new Set(Object.values(materials)))if(material!==mat)material.dispose();
    }};
}
