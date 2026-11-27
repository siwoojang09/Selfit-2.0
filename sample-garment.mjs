// Panel dimensions are expressed in metres; the catalog records retail flat-lay measurements in centimetres.
import * as T from './vendor/three.module.js';
import {createGarmentContact} from './garment-contact.mjs?v=2026-11-27g';
import {wearer,cutHoodie} from './hoodie-fit.mjs?v=2026-11-27g';
import {applyHoodieTextile} from './hoodie-textile.mjs?v=2026-11-27g';
import {StitchLines,addFoldedEdge,addPocketFinish,addZipHardware} from './hoodie-finishes.mjs?v=2026-11-27g';
import {createRowSolver} from './cloth-dynamics.mjs?v=2026-11-27g';
import {pieceKey} from './photo-hoodie.mjs?v=2026-11-27g';

const tau=2*Math.PI;
// Secondary motion is solved on short chains of bands: the bodice hem and each
// sleeve cuff. Everything above them stays sewn to the pose.
const hemBands=10,sleeveBands=8;
const textiles={
  cotton:{roughness:.90,sway:.88},linen:{roughness:.84,sway:1.05},
  silk:{roughness:.43,sway:1.46},denim:{roughness:.96,sway:.59}
};
const clamp=T.MathUtils.clamp;
const lerp=T.MathUtils.lerp;
const smooth=T.MathUtils.smoothstep;
const point=(x,y,z)=>new T.Vector3(x,y,z);

// The photographed hoodie: each panel takes its surface from the asset. The
// positions stay the pattern's (so every size and every frame of the walk is
// cut exactly as measured); the UVs and the material are the photographs'.
let photoParts=null,photoUsed={};
function panel(parent,mat,name,rows,cols,at) {
  const positions=[],uvs=[],indices=[];
  for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++) {
    const t=i/rows,u=j/cols;
    positions.push(...at(t,u));
    uvs.push(u,1-t);
    if(i<rows && j<cols) {
      const a=i*(cols+1)+j,b=a+cols+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,mat);
  mesh.name=name;
  mesh.castShadow=mesh.receiveShadow=true;
  const photoKey=photoParts?pieceKey(name):'';
  if(photoParts&&photoParts[photoKey]) {
    const list=photoParts[photoKey],k=photoUsed[photoKey]||0,part=list[k];
    if(part&&part.uv.count===positions.length/3) {
      photoUsed[photoKey]=k+1;
      geometry.setAttribute('uv',part.uv);
      mesh.material=part.material;
    }
  }
  parent.add(mesh);
  return mesh;
}

function sampleProfile(rows,t) {
  const at=rows.findIndex(r=>r[0]>=t);
  if(at<1)return (at===0?rows[0]:rows[rows.length-1]).slice(1);
  const a=rows[at-1],b=rows[at],u=(t-a[0])/(b[0]-a[0]);
  return a.slice(1).map((v,i)=>lerp(v,b[i+1],u));
}

function actual(value,fallback,min,max){
  return clamp(Number(value)>0 ? Number(value) : fallback,min,max);
}

function dye(value) {
  return /^#[0-9a-f]{6}$/i.test(value)?value:'#29292c';
}

// Lay narrow shoulder tapes on the topmost panel. Only nearby shoulder
// triangles need to be tested when tracing a tape, even on a dense sleeve.
function shoulderGuide(bodice,sleeve,mount){
  const cells=new Map(),tile=.025,ray=new T.Ray(),hit=new T.Vector3();
  ray.direction.set(0,-1,0);
  for(const mesh of [bodice,sleeve]){
    const arm=mesh===sleeve,positions=mesh.geometry.attributes.position;
    const vertices=Array.from({length:positions.count},(_,i)=>{
      const p=new T.Vector3().fromBufferAttribute(positions,i);
      return arm?p.applyMatrix4(mount):p;
    });
    const indices=mesh.geometry.index.array;
    for(let i=0;i<indices.length;i+=3){
      const a=vertices[indices[i]],b=vertices[indices[i+1]],c=vertices[indices[i+2]];
      if(Math.max(a.y,b.y,c.y)<1.18)continue;
      const tri={a,b,c,arm};
      for(let ix=Math.floor(Math.min(a.x,b.x,c.x)/tile);ix<=Math.floor(Math.max(a.x,b.x,c.x)/tile);ix++){
        for(let iz=Math.floor(Math.min(a.z,b.z,c.z)/tile);iz<=Math.floor(Math.max(a.z,b.z,c.z)/tile);iz++){
          const key=ix+','+iz;
          if(!cells.has(key))cells.set(key,[]);
          cells.get(key).push(tri);
        }
      }
    }
  }
  return (x,z)=>{
    const nearby=cells.get(Math.floor(x/tile)+','+Math.floor(z/tile))||[];
    ray.origin.set(x,1.8,z);
    let y=-Infinity,arm=false;
    for(const tri of nearby){
      if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,hit)&&hit.y>y){y=hit.y;arm=tri.arm;}
    }
    return Number.isFinite(y)?{y,arm}:null;
  };
}

// The thumb and palm extend beyond the forearm when a long cuff reaches the
// hand. Drape each sleeve ring around both its cut shape and that hand section.
function handGuide(points,joint,mount){
  if(!points?.length)return null;
  const count=32,rows=36,start=.60,step=.011;
  const dx=Array.from({length:count},(_,i)=>Math.sin(i*tau/count));
  const dz=Array.from({length:count},(_,i)=>Math.cos(i*tau/count));
  const support=new Float32Array(rows*count).fill(-1);
  for(const [px,py,pz] of points){
    const x=(px-joint.position.x)/mount.scale.x,z=(pz-joint.position.z)/mount.scale.z;
    const row=(py-start)/step;
    for(let j=Math.max(0,Math.ceil(row-1.6));j<=Math.min(rows-1,Math.floor(row+1.6));j++){
      for(let d=0;d<count;d++){
        const k=j*count+d;
        support[k]=Math.max(support[k],x*dx[d]+z*dz[d]+.0075);
      }
    }
  }
  return (y,x,z,rx,rz)=>{
    const h=(y+joint.position.y-start)/step;
    if(h<0||h>=rows-1)return 1;
    const row=Math.floor(h),t=h-row;
    let factor=Infinity;
    for(let d=0;d<count;d++){
      const projection=x*dx[d]+z*dz[d];
      if(projection<.001)continue;
      const k=row*count+d,hand=lerp(support[k],support[k+count],t);
      const cloth=Math.hypot(rx*dx[d],rz*dz[d]);
      factor=Math.min(factor,Math.max(hand,cloth)/projection);
    }
    return Math.max(1,factor);
  };
}

// Wrap the central front panel of a flat-lay photograph onto the front half of the torso.
// The rear and sleeves use the registered solid colour where no photograph is available.
async function printFront(source,type,color){
  const img=new Image();
  img.decoding='async';
  img.src=source;
  await img.decode();
  const input=document.createElement('canvas');
  const scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight));
  const w=input.width=Math.max(1,Math.round(img.naturalWidth*scale));
  const h=input.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=input.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h).data;
  const bg=[0,1,2,3].map(c=>[0,w-1,w*(h-1),w*h-1].map(i=>pixels[i*4+c]).sort((a,b)=>a-b)[1]);
  let l=w,r=0,b=0,top=h;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
    const i=4*(y*w+x);
    if(pixels[i+3]<60 || (bg[3]>100 && Math.abs(pixels[i]-bg[0])+Math.abs(pixels[i+1]-bg[1])+Math.abs(pixels[i+2]-bg[2])<64))continue;
    l=Math.min(l,x);r=Math.max(r,x);top=Math.min(top,y);b=Math.max(b,y);
  }
  if(r-l<w*.12 || b-top<h*.12){l=0;r=w;top=0;b=h;}
  const output=document.createElement('canvas');output.width=640;output.height=448;
  const outputCtx=output.getContext('2d');
  outputCtx.fillStyle=color;outputCtx.fillRect(0,0,640,448);
  const outputImage=outputCtx.getImageData(0,0,640,448),out=outputImage.data;
  const neck=type==='ziphoodie'?.22:.08;
  const width=r-l,height=b-top;
  for(let y=0;y<448;y++){
    const t=y/447;
    const sy=Math.round(clamp(top+(neck+(1-neck)*t*.985)*height,0,h-1));
    for(let x=0;x<640;x++){
      const a=x/639*tau,front=Math.cos(a);
      if(front<.02)continue;
      const halfWidth=(type==='tee'||type==='polo'?.32:.29)*width;
      const sx=Math.round(clamp((l+r)/2+halfWidth*Math.sin(a),0,w-1));
      const i=4*(sy*w+sx),j=4*(640*y+x);
      const mix=smooth(front,.03,.49)*(pixels[i+3]/255);
      for(let c=0;c<3;c++)out[j+c]=lerp(out[j+c],pixels[i+c],mix);
    }
  }
  outputCtx.putImageData(outputImage,0,0);
  const texture=new T.CanvasTexture(output);
  texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}

export function attachSample(body,initial={},lowerColliders=[]) {
  const {torso,arms}=body.parts;
  const hidden=new Map();
  body.group.traverse(mesh=>{
    const piece=mesh.userData.garmentPart;
    if(body.teeMeshes.includes(mesh)||['upper','sleeveLeft','sleeveRight'].includes(piece)||
       ['Tucked poplin shirt','Short sleeve polo'].includes(mesh.name) || mesh.name==='Sleeve and cuff'){
      hidden.set(mesh,mesh.visible);mesh.visible=false;
    }
  });
  let members=[],materials=[],flexing=[],blowing=[],opts={},signature='',revision=0,time=0;
  let contact=null,shoulderBridges=[];
  let swayX=0,swayZ=0,disposed=false;
  let hemSolver=null,bodice=null;
  const sleeveSolvers=[],sleeveProbes=[],sleeveState=[],probePieces=[];
  const hemProbe=new T.Vector3(),hemWorld=new T.Vector3(),hemPrev=new T.Vector3(),hemBefore=new T.Vector3();
  const frameQuat=new T.Quaternion(),accelVector=new T.Vector3(),localAccel=new T.Vector3();
  let hemSamples=0,creaseAmp=0;
  // The lowest ring of a panel, sampled around its circumference: the cuffs and
  // the bodice hem, whose own displacement the secondary solver is judged on.
  function probeRing(mesh){
    const attr=mesh.geometry.attributes.position;
    let low=Infinity;
    for(let i=0;i<attr.count;i++)low=Math.min(low,attr.getY(i));
    const index=[];
    for(let i=0;i<attr.count;i++)if(attr.getY(i)<low+.028)index.push(i);
    return {mesh,index:index.filter((_,k)=>k%3===0)};
  }
  const v=new T.Vector3(),rotated=new T.Vector3(),bridgeMatrix=new T.Matrix4();
  function material(color,roughness=.92,metalness=0) {
    // Physical materials give every cloth piece the grazing-angle sheen veil;
    // metal hardware stays standard-looking with sheen off.
    const mat=new T.MeshPhysicalMaterial({color,roughness,metalness,side:T.DoubleSide});
    if(!metalness){mat.sheen=.5;mat.sheenRoughness=.85;mat.sheenColor=new T.Color('#c9ccd4');}
    materials.push(mat);
    return mat;
  }
  function group(parent) {
    const g=new T.Group();
    parent.add(g);members.push(g);
    return g;
  }
  function clear() {
    for(const g of members) {
      g.traverse(mesh=>mesh.geometry?.dispose());
      g.removeFromParent();
    }
    materials.forEach(m=>{m.map?.dispose();m.normalMap?.dispose();m.roughnessMap?.dispose();m.dispose();});
    members=[];materials=[];flexing=[];blowing=[];shoulderBridges=[];
    sleeveSolvers.length=0;sleeveProbes.length=0;sleeveState.length=0;probePieces.length=0;
    hemSolver=null;hemSamples=0;swayX=swayZ=0;
  }
  function build() {
    const id=String(opts.id||opts.sampleId||'');
    const adidas=/kc9315/i.test(id)||opts.adidas===true;
    // The photographed hoodie wears only its own asset: the drawn pockets,
    // stripe tapes, embroidery and topstitching are left out, because every one
    // of them is in the photograph already and a second set of lines laid over
    // the photo reads as a ghost of the pattern.
    const imported=opts.imported===true&&(opts.type||opts.template)==='ziphoodie';
    const photoHoodie=(adidas&&opts.photoHoodie!==false)||imported;
    const photoTop=Boolean(opts.topAsset)||Boolean(photoHoodie&&opts.hoodieAsset);
    photoParts=photoHoodie&&opts.hoodieAsset?opts.hoodieAsset.byName:(opts.topAsset?opts.topAsset.byName:null);
    photoUsed={};
    const raw=opts.type||opts.template||'ziphoodie';
    const type=['ziphoodie','hoodie','halfzip','tee','shirt','polo','sweatshirt','puffer','workjacket'].includes(raw)?raw:'ziphoodie';
    // A hooded work jacket closes on the same zip as a hoodie, but the cloth is
    // heavier, the cut is cropped and boxy, and the front carries one pouch
    // pocket across the belly instead of two hand pockets.
    const workjacket=type==='workjacket';
    const hoodie=type==='ziphoodie'||workjacket,pullover=type==='hoodie',halfzip=type==='halfzip';
    // A down jacket: sewn in horizontal channels that each swell with filling,
    // closed by a two-way zip under a stand collar and a quilted hood.
    const puffer=type==='puffer';
    // A pullover hood and a half-zip knit are both cut like the sweat: ribbed
    // hem and cuffs, long sleeves, a neck that a band closes.
    const sweat=type==='sweatshirt'||pullover||halfzip,hooded=hoodie||pullover;
    const long=hooded||sweat||type==='shirt'||puffer;
    const striped=type==='tee' && opts.pattern==='stripes';
    const measured=opts.measurements||{};
    const chest=actual(measured.chest,hoodie?60.5:53,32,94);
    const shoulder=actual(measured.shoulder,hoodie?62:47,28,96);
    // The body the top is cut for: its stature factor carries every height that
    // was authored on the 178 cm frame onto the shaped mannequin.
    const frame=wearer(body.model||'female',opts.person);
    const KY=frame.base.ky||1;
    // A photographed work jacket is measured like the adidas hoodie: its
    // dropped shoulder only makes sense once the cloth is cut onto a body, so
    // the pattern encloses the wearer and the flat measurements survive.
    const fitted=adidas||imported||workjacket;
    const anatomy=fitted?frame:null;
    // A dropped shoulder's sleeve is measured from the shoulder point out on
    // the arm; the pattern hangs it from the joint, so the runway between the
    // two comes off the length or the sleeve spends it in balloon folds.
    const sleeveRun=workjacket?clamp((shoulder-43)*.48,2,9):0;
    const pattern=fitted?cutHoodie({...measured,chest,shoulder,length:actual(measured.length,62,33,99),
      sleeve:actual(measured.sleeve,58,7,85)-sleeveRun},anatomy,workjacket?{gather:.38}:{}):null;
    const fit=pattern?.fit, sy=anatomy?.sy||1;
    const bodyLength=fit?fit.length/sy:actual(measured.length,hoodie?62:65,33,99)*.00955;
    const sleeve=actual(measured.sleeve,long?58:22,7,85)*.0094;
    const shoulderDrop=clamp((shoulder-43)*.0025,-.024,.087);
    const shoulderRise=fit?anatomy.base.shoulderY-1.402*(anatomy.base.ky||1):0;
    const projectedSleeve=sleeve+shoulderDrop*.37;
    const sleeveLength=fit?(fit.seamDrop+fit.sleeveProjection)/sy-shoulderRise:
      // A shirt's cuff closes on the wrist, so it stops a little above the hand
      // rather than being dragged over the fingers.
      long?Math.max(.075,projectedSleeve*(type==='shirt'?.94:1)):clamp(projectedSleeve,.075,.37);
    // Bearing circumference is twice the flat chest measurement. Convert it to an elliptical section.
    // A padded garment's girth goes mostly into its depth: the arms hang at
    // the sides, so the width cannot grow with the chest the way a shirt's does.
    const width=clamp(chest*(puffer?.00330:.00373),.166,.33);
    const cuffHem=actual(measured.hem,chest*(hoodie?.845:.96),30,95);
    const hemWidth=clamp(cuffHem*(puffer?.00345:.00391),.159,.33);
    // A down jacket is filled all round, so its section is rounder than the
    // flat ellipse a sweatshirt is cut to.
    const depth=puffer?clamp(width*.82,.14,.26):clamp(width*.69,.112,.21);
    const upper=group(torso);
    bodice=upper;
    if(fit)upper.scale.set(1/torso.scale.x,1,1/torso.scale.z);
    upper.name=adidas?'KC9315 zip-up hoodie':'Registered '+type;
    const mainColor=dye(opts.color);
    const textile=textiles[opts.material]||textiles.cotton;
    const shell=material(mainColor,textile.roughness),frontMat=material(mainColor,textile.roughness);
    const rgb=new T.Color(mainColor);
    const rib=material(rgb.clone().multiplyScalar(.86)),trim=material(rgb.clone().multiplyScalar(.68));
    const shine=material('#a0a0a1',.41,.34),cream=material('#e9e4d5');
    const pocketMat=adidas?material(rgb.clone().multiplyScalar(1.18)):shell;
    const sleeveMat=adidas?material(mainColor):shell, cuffMat=adidas?material(rgb.clone().multiplyScalar(.86)):rib;
    const bandMat=adidas?material('#e9e4d5'):cream;
    const threadColor=rgb.clone().multiplyScalar(.74).lerp(new T.Color('#737473'),.12);
    const threadMat=material(threadColor,.86);
    const bodyThread=new StitchLines();
    if(fit&&!workjacket){
      // The adidas hoodie wears its own knitted surface; a photographed work
      // jacket takes its surface from the asset instead.
      const fabric=(mat,role,width,height)=>applyHoodieTextile(T,mat,role,width,height,opts.onReady);
      fabric(frontMat,'shell',fit.chestM,fit.length);
      fabric(shell,'shell',.52,.21);
      fabric(pocketMat,'shell',fit.chestM*.16,fit.length*.24);
      fabric(sleeveMat,'shell',.38*chest/60.5,fit.flatSleeve+fit.seamDrop);
      fabric(rib,'rib',fit.hemM,fit.length*.075);
      fabric(cuffMat,'rib',.20,.052);
      fabric(bandMat,'tape',.008,fit.flatSleeve);
    }
    const topY=fit?.apex||1.460*KY,hemY=topY-bodyLength;
    const bodiceRows=puffer?[
      // A padded shoulder is a rolled edge, not a shelf: the flare from the
      // neck to the shoulder is taken over four rows so the seam is round.
      [0,.068,.058],[.018,.094,.069],[.036,.132,.083],[.056,.163,.097],
      [.076,.177,.106],[.104,Math.min(width,.184+shoulderDrop*.55),depth*.82],
      [.21,width*.965,depth*.975],[.35,width,depth],
      [.53,width*.992,depth*.975],[.72,width*.975,depth*.935],
      [.845,Math.max(width*.955,hemWidth*1.02),Math.max(depth*.92,hemWidth*.61)],
      [.925,hemWidth*1.012,hemWidth*.629],[.962,hemWidth,hemWidth*.625],[1,hemWidth*.995,hemWidth*.622]
    ]:[
      // The neckline spreads to the shoulder over the first centimetres
      // instead of flaring into a flat shelf at the throat.
      [0,.058,.051],[.024,.075,.060],[.049,.112,.074],
      [.085,Math.max(.177,Math.min(width,.169+shoulderDrop*.63)),.092],[.14,width*.92,depth*.8],
      [.23,width,depth*.99],[.39,width*.988,depth],[.60,width*.972,depth*.94],
      [.82,Math.max(width*.96,hemWidth*1.02),Math.max(depth*.92,hemWidth*.61)],
      [.90,Math.max(width*.94,hemWidth*1.035),Math.max(depth*.91,hemWidth*.615)],
      [.929,hemWidth*1.012,hemWidth*.629],[.94,hemWidth,hemWidth*.63],[1,hemWidth*.995,hemWidth*.628]
    ];
    // The channels of a down jacket. Four seams run round the body; between
    // them the filling swells and at every seam the cloth is drawn in, so the
    // silhouette is a stack of sausages rather than a painted stripe.
    const pufferSeams=[.135,.365,.595,.825];
    const sleeveSeams=[.30,.58,.84];
    // Smallest angle between two bearings, always in [0, pi].
    const bearingGap=(x,y)=>{let e=(x-y)%tau;if(e<0)e+=tau;return Math.min(e,tau-e);};
    function puffAt(t,seams,out,pinch,edge){
      let k=0;
      while(k<seams.length&&t>seams[k])k++;
      const a=k===0?0:seams[k-1],b=k<seams.length?seams[k]:1;
      const f=clamp((t-a)/Math.max(1e-4,b-a),0,1);
      let h=out*Math.pow(Math.sin(Math.PI*f),.62);
      for(const s of seams)h-=pinch*Math.exp(-Math.pow((t-s)/.017,2));
      return h*edge;
    }
    // The neck opening is sewn flat and the hem is a narrow bound channel, so
    // neither end carries the full loft of the body panels.
    const channelPuff=(t,a)=>{
      const da=bearingGap(a,0);
      // The two front panels are separate pieces seamed to the zip, so the
      // loft is squeezed out where the placket runs: the channels swell on
      // either side of it and the zip sits in the valley between them.
      const placket=1-.82*Math.exp(-Math.pow(da/.23,2));
      return puffer?puffAt(t,pufferSeams,.027,.0125,
        smooth(t,.010,.070)*(1-.85*smooth(t,.875,1)))*placket:0;
    };
    function bodyAt(t,a) {
      if(pattern)return pattern.point(t,a);
      let [rx,rz]=sampleProfile(bodiceRows,t);
      if(puffer){const p=channelPuff(t,a);rx+=p;rz+=p;}
      const s=Math.sin(a),c=Math.cos(a),gather=Math.sin(8*a+3.2*t)+.47*Math.sin(15*a-6*t);
      const binding=(hooded||sweat) && t>.926;
      // The neck ring is sewn flat. Any fold left there opens as a ring of
      // teeth against the binding, so the gather fades out at the very top.
      const fold=(.0012+.0043*t*t)*gather*(binding?.22:1)*smooth(t,.004,.07);
      const shoulderSlope=.028*Math.max(0,c)**2*(1-smooth(t,0,.12));
      // A shirt's tail is cut longer at the centre front and back than at the
      // sides; the bias shows in the flat-lay and in the mirror.
      const tail=type==='shirt'?(.032-.052*(.5+.5*Math.cos(2*a)))*smooth(t,.62,1)**2:0;
      // A shirt's neckline drops at the centre front; a crew's does not.
      const neckDip=type==='shirt'?.050*Math.max(0,c)**2*(1-smooth(t,0,.11)):0;
      return [s*(rx+fold),lerp(topY,hemY,t)-shoulderSlope+tail-neckDip,c*(rz+fold)+.003];
    }
    const torsoMesh=panel(upper,frontMat,'Measured garment body',puffer?96:fit?48:38,puffer?96:fit?64:68,(t,u)=>bodyAt(t,tau*u));
    if(striped){
      for(let t=.17;t<.975;t+=.094)panel(upper,cream,'Woven Breton band',3,68,(v,u)=>{
        const a=tau*u,p=bodyAt(t+.025*v,a);
        p[0]+=.00085*Math.sin(a);p[2]+=.00085*Math.cos(a);return p;
      });
    }
    const source=opts.image||opts.photo;
    if(!adidas && !imported && source && typeof document!=='undefined'){
      const generation=revision;
      printFront(source,type,mainColor).then(tex=>{
        if(disposed||generation!==revision){tex.dispose();return;}
        frontMat.color.set(0xffffff);frontMat.map=tex;frontMat.needsUpdate=true;
        opts.onReady?.();
      }).catch(()=>{});
    }
    function frontAt(t,x,lift=.002){
      if(pattern){
        let l=-Math.PI/2,r=Math.PI/2;
        for(let k=0;k<15;k++){const a=(l+r)/2;if(bodyAt(t,a)[0]<x)l=a;else r=a;}
        const p=bodyAt(t,(l+r)/2);return [p[0],p[1],p[2]+lift];
      }
      const rx=sampleProfile(bodiceRows,t)[0];
      const p=bodyAt(t,Math.asin(clamp(x/rx,-.99,.99)));
      return [x,p[1],p[2]+lift];
    }
    function tape(name,mat,t0,t1,x0,x1,lift){
      return panel(upper,mat,name,fit?96:30,2,(v,u)=>frontAt(lerp(t0,t1,v),lerp(x0,x1,u),lift));
    }
    if((hoodie||sweat)&&!puffer) {
      panel(upper,rib,'Ribbed waistband',6,68,(v,u)=>{
        const a=u*tau,p=bodyAt(lerp(.925,1,v),a);
        p[0]+=.0019*Math.sin(a);p[2]+=.0019*Math.cos(a);return p;
      });
    }
    const ribHem=(hoodie||sweat)&&!puffer;
    addFoldedEdge({panel,parent:upper,material:ribHem?rib:trim,name:'Folded bottom hem',around:bodyAt,
      span:bodyLength,sewnAt:ribHem?.925:1-.014/bodyLength,offset:ribHem?.0019:0,
      columns:fit?64:68,stitches:bodyThread,thick:ribHem});
    if(hooded){
      // Hood worn down: lined cloth sewn along the neckline, hanging on the back.
      //
      // A pullover's hood is a bag of doubled fleece: its mouth edge is one
      // closed loop around the throat, so worn down that loop lies at the base
      // of the neck in front and falls away to the middle of the back behind,
      // with the cloth between the neckline seam and the mouth hanging in
      // folds as it widens over the shoulder blades.
      const hoodSeamY=1.4560*KY;
      const hoodSeamHalf=.050;   // half the neckline's width across the back
      const hoodHalf=.145;       // half the mouth's width: some 29 cm of cloth
      // The back of the panel at a height, as an ellipse: this is what the
      // drape lies on, so no row of it can sink into the body underneath.
      const hoodBack=(x,y)=>{
        const t=clamp((topY-y)/bodyLength,0,.965);
        const rx=sampleProfile(bodiceRows,t)[0],rz=sampleProfile(bodiceRows,t)[1];
        const q=clamp(Math.abs(x)/Math.max(rx,.02),0,.985);
        return [x,y,-rz*Math.sqrt(1-q*q)+.003];
      };
      // A worn-down hood is a curtain of doubled fleece hung from the neckline:
      // its mouth edge is lowest at the middle of the back and rises to the
      // collarbones at both ends, where the cloth disappears into the binding.
      function hoodDrape(v,u){
        const s=u*2-1, edge=Math.abs(s);
        // The cloth leaves the neckline narrow, widens as it falls over the
        // shoulder blades, and comes to a shallow point at the middle of the
        // back, which is where the crown of the hood ends up.
        const widen=smooth(v,.02,.40);
        // The hood's side edges turn in against the shoulder seam, so the cloth
        // ends in a fold rather than a cut line down the side of the back.
        const x=s*lerp(hoodSeamHalf,hoodHalf,widen)*(1-.13*Math.pow(edge,6));
        const drop=.206+.052*Math.pow(Math.cos(edge*Math.PI*.5),1.5);
        // Creases gather the hem, so the bottom edge is a row of soft scallops
        // rather than a cut line.
        const creaseAmt=(.0020+.0058*Math.max(0,1-edge*edge))*smooth(v,.04,.42);
        const foldA=.5+.5*Math.sin(s*Math.PI*1.7+v*.55+.5);
        const foldB=.36*(.5+.5*Math.sin(s*Math.PI*3.1-v*.9+2.2));
        const crease=Math.min(1,foldA+foldB);
        const lift=creaseAmt*(.35-1.05*crease);
        const y=hoodSeamY-drop*Math.pow(v,.90)+lift*.9;
        const back=hoodBack(x,y);
        // Its own bulk: doubled cloth standing off the back, most of it in the
        // middle of the fall where the bag has body, and along the bottom edge.
        const standoff=.0060+(.008+.030*Math.max(0,1-edge*edge))*Math.pow(Math.sin(Math.PI*Math.min(1,v)),.85)
          +.020*Math.max(0,1-edge*edge)*smooth(v,.70,1);
        return [x,y,back[2]-standoff+lift];
      }
      if(pullover&&!pattern){
        panel(upper,shell,'Folded hood',30,96,hoodDrape);
      } else panel(upper,shell,'Folded hood',18,64,(v,u)=>{
        const a=u*tau,s=Math.sin(a),c=Math.cos(a),back=(1-c)*.5;
        const bulge=Math.sin(Math.PI*v);
        if(pattern){          // The hood is worn down, so what the back shows is the shell laid
          // over the shoulder blades: a wide triangle, its top edge along the
          // shoulder line and its point at the middle of the back, standing a
          // few centimetres off the cloth. The drop is deeper at the centre
          // back and shallower at the sides, which is what makes the triangle.
          const drop=.014+.28*Math.max(0,back-.06)**1.55;
          const inner=bodyAt(0,a),outer=bodyAt(drop,a);
          outer[0]=clamp(outer[0],-.155,.155);
          return [lerp(inner[0],outer[0],v)+s*(.004+.026*bulge),
            lerp(inner[1],outer[1],v)+bulge*(.016+.040*back)/sy,
            lerp(inner[2],outer[2],v)+c*(.004+.030*bulge)*Math.max(.25,back)];
        }
        const rx=(lerp(.060,.080+.035*back,v)+.019*bulge);
        const rz=(lerp(.050,.060+.05*back,v)+.027*bulge);
        const base=1.452*KY-.038*Math.max(c,0)**2;
        return [s*rx,base+(.023+.042*back)*bulge-.115*back**2*v+.011*c*v,
          rz*c-.020*back*v+.002*Math.sin(a*5)*bulge];
      });
      if(pullover) panel(upper,shell,'Lined hood opening',12,96,(v,u)=>{
        // The hood is sewn to the body at its own mouth: that edge is doubled
        // cloth turned over, the channel the drawcord runs in. Worn down it is
        // what stands behind the neck, and it is the only part of the hood the
        // front of the garment shows.
        const a=tau*u,c=Math.cos(a),back=(1-c)*.5,phi=Math.PI*v;
        const ring=.0625+.0035*back, tube=.0115+.0055*back;
        const r=ring+tube*Math.cos(phi);
        const lift=.0135+.0085*back;
        return [Math.sin(a)*r,
          1.4515*KY+lift*Math.sin(phi)*(1-.30*Math.max(0,c))-.004*back*Math.max(0,-Math.cos(phi)),
          Math.cos(a)*r+.003];
      });
      if(hoodie) panel(upper,rib,'Lined hood opening',6,60,(v,u)=>{
        const a=u*tau,c=Math.cos(a),back=(1-c)*.5;
        if(pattern){
          const p=bodyAt(0,a);
          return [p[0]+Math.sin(a)*(.002+v*.006),p[1]+(.004+.003*back)*Math.sin(v*Math.PI)/sy,p[2]+c*(.002+v*.006)];
        }
        return [Math.sin(a)*lerp(.054,.081+.035*back,v),1.47*KY-.037*Math.max(c,0)**2-.132*back**2*v,Math.cos(a)*lerp(.048,.061+.05*back,v)-.020*back*v];
      });
      // Through a pullover's neck the lining shows behind the neck; without it
      // the gap between binding and body reads as the wearer's own mesh.
      panel(upper,rib,'Neck lining',4,48,(v,u)=>{
        const a=u*tau,c=Math.cos(a);
        return [Math.sin(a)*lerp(.0575,.056,v),1.463*KY-.030*Math.max(c,0)**2-.024*v,Math.cos(a)*lerp(.0495,.048,v)+.0030];
      });
      for(const side of [-1,1]){
        if(pullover||workjacket) break;
        if(photoHoodie) continue;
        panel(upper,pocketMat,'Split hand pocket',13,9,(v,u)=>{
          const x=side*lerp(.014,width*lerp(.44,.77,smooth(v,0,.8)),u);
          const t=lerp(.666+.046*u,.91,v);
          return frontAt(t,x,.0032+.0037*Math.sin(u*Math.PI)*Math.sin(v*Math.PI));
        });
        if(adidas)addPocketFinish({panel,parent:upper,material:pocketMat,thread:bodyThread,frontAt,
          outerX:v=>side*width*lerp(.44,.77,smooth(v,0,.8)),sign:side});
        else panel(upper,trim,'Pocket opening binding',12,1,(v,u)=>{
          const x=side*(width*lerp(.44,.77,smooth(v,0,.8))-.004*u);
          return frontAt(lerp(.712,.91,v),x,.0054);
        });
      }
      if(pullover||workjacket){
        // A kangaroo pocket is one piece across the belly, its mouth cut in at
        // both sides. The pocket cloth lifts off the body so the opening casts
        // its own thin edge in the light.
        const pocketLift=workjacket?.0210:.0032;
        panel(upper,pocketMat,'Kangaroo pocket',16,40,(v,u)=>{
          const x=lerp(-width*.60,width*.60,u);
          const mouth=.640+.020*Math.abs(u-.5)*2;
          const t=lerp(mouth,.912,v);
          return frontAt(t,x,pocketLift+(workjacket?.0030:.0034)*Math.sin(Math.PI*u)*Math.sin(Math.PI*v));
        });
        for(const side of [-1,1]) panel(upper,trim,'Pocket opening lip',13,2,(v,u)=>{
          const x=side*width*lerp(.60,.30,smooth(v,0,1));
          return frontAt(lerp(.660,.640,v)+.004*u,x,workjacket?.0222:.0056);
        });
        panel(upper,threadMat,'Pocket mouth topstitch',2,40,(v,u)=>{
          const x=lerp(-width*.60,width*.60,u);
          const mouth=.640+.020*Math.abs(u-.5)*2;
          return frontAt(mouth+.006+v*.0025,x,workjacket?.0226:.0064);
        });
        // Two flat drawcords drop from the hood's mouth; their waxed tips are
        // the only hard parts on the front.
        for(const side of [-1,1]){
          const cord=[];
          for(let k=0;k<=28;k++){
            const s=k/28,x=side*(.031+.010*s+.0045*Math.sin(s*3.1)),t=.012+.255*s;
            const p=frontAt(t,x,.0075);
            cord.push([p[0],p[1]-.004*s*s,p[2]+.003]);
          }
          panel(upper,trim,'Drawstring',28,5,(v,u)=>{
            const p=cord[Math.min(28,Math.round(v*28))],a=u*tau;
            return [p[0]+.0031*Math.sin(a),p[1],p[2]+.0026*Math.cos(a)];
          });
          const tip=cord[28];
          panel(upper,shine,'Drawstring tip',4,5,(v,u)=>{
            const a=u*tau;
            return [tip[0]+.0034*Math.sin(a),tip[1]-.016*v,tip[2]+.0029*Math.cos(a)];
          });
        }
      }
      if(hoodie){
        tape('Zip tape',trim,.008,.996,-.0068,.0068,.004);
        const coil=adidas?material('#68696b',.44,.28):shine;
        tape('Silver coil zipper',coil,.002,.996,-.0016,.0016,.0065);
        if(adidas){
          addZipHardware({panel,parent:upper,frontAt,metal:shine,bodyLength:fit.length,stitches:bodyThread});
        }else{
          const tp=frontAt(.05,.002,.006);
          panel(upper,shine,'Zipper slider',6,6,(v,u)=>[tp[0]+(u-.5)*.0075,tp[1]-v*.009,tp[2]+.0013*Math.sin(u*Math.PI)]);
          panel(upper,shine,'Zipper pull',13,6,(v,u)=>{const a=v*tau;return [tp[0]+.0020*Math.cos(a)*(1+.35*u),tp[1]-.011+.006*Math.sin(a)*(1+.15*u),tp[2]+.0019+u*.0005];});
        }
        if(workjacket){
          // A two-way zip opens from the hem as well as from the chin: a second
          // slider sits at the bottom stop and its pull hangs past the hem.
          const bp=frontAt(.952,.002,.006);
          panel(upper,shine,'Lower zipper slider',6,6,(v,u)=>[bp[0]+(u-.5)*.0075,bp[1]+v*.009,bp[2]+.0013*Math.sin(u*Math.PI)]);
          panel(upper,shine,'Lower zipper pull',13,6,(v,u)=>{const a=v*tau;return [bp[0]+.0020*Math.cos(a)*(1+.35*u),bp[1]+.011-.006*Math.sin(a)*(1+.15*u),bp[2]+.0019+u*.0005];});
        }
      }
    } else if(puffer){
      // A down jacket closes at a tall stand collar, with the hood worn up: its
      // mouth frames the face and its crown stands a hand's width over the head.
      const collarBase=topY-.004;
      panel(upper,shell,'Stand collar',16,72,(v,u)=>{
        const a=u*tau,s=Math.sin(a),c=Math.cos(a);
        // One stitch line crosses the stand; above and below it the cloth
        // swells, so the collar reads as filled rather than rolled.
        const f=v<.55?v/.55:(v-.55)/.45;
        const r=lerp(.0680,.0810,smooth(v,0,1))+.0050*Math.pow(Math.sin(Math.PI*f),.7);
        return [s*r,collarBase+v*.128*KY-.004*Math.max(0,c)*v,c*(r-.0055)+.0034];
      });
      panel(upper,shell,'Collar top edge',6,72,(v,u)=>{
        const a=u*tau,phi=Math.PI*v,s=Math.sin(a),c=Math.cos(a);
        const r=.0810+.0046*Math.sin(phi);
        return [s*r,collarBase+.128*KY-.004*Math.max(0,c)+.0038*Math.sin(phi),c*(r-.0055)+.0034];
      });
      // The hood is a bag of cloth sewn round the collar. Its boundary is one
      // loop: the mouth, standing off the brow and the cheeks, and then the
      // seam along the nape. From that loop the cloth closes over the crown,
      // so the padding lies on the head and the face looks out of its window.
      const headC=[0,1.648*KY,-.008];
      const headR=[.079,.113,.092];
      const crownTheta=.17;
      const hoodQuiltV=[.34,.60,.84],hoodQuiltU=[0,.72,-.72,1.55,-1.55];
      // Polar angle of the boundary: high over the brow, down past the cheeks,
      // and low at the nape where it goes under the collar.
      const edgeTheta=phi=>{
        const a=Math.min(phi,tau-phi);          // bearing from the centre front
        if(a<=1.05)return .95+.95*Math.pow(a/1.05,1.15);
        return 1.73+.84*smooth(a,1.05,2.30);
      };
      const hoodPad=(v,phi)=>{
        let pad=.020+.034*Math.pow(Math.sin(Math.PI*clamp(v,0,1)),.55);
        // The filling runs out towards the seam at the nape, where the hood is
        // only cloth turned under the collar.
        pad*=1-.55*smooth(Math.min(phi,tau-phi),1.35,2.20);
        let k=0;
        while(k<hoodQuiltV.length&&v>hoodQuiltV[k])k++;
        const lo=k===0?0:hoodQuiltV[k-1],hi=k<hoodQuiltV.length?hoodQuiltV[k]:1;
        const f=clamp((v-lo)/Math.max(1e-4,hi-lo),0,1);
        let near=Math.PI;
        for(const q of hoodQuiltU)near=Math.min(near,bearingGap(phi,q));
        pad+=.011*Math.pow(Math.sin(Math.PI*f),.6)*Math.pow(Math.sin(Math.PI*clamp(near/.42,0,1)),.6);
        // The crown is filled deeper than the cheeks, so the hood stands over
        // the head instead of ringing the face.
        pad+=.014*smooth(v,.5,1)*(1-.4*smooth(Math.min(phi,tau-phi),1.3,2.2));
        for(const s of hoodQuiltV)pad-=.0052*Math.exp(-Math.pow((v-s)/.030,2));
        for(const q of hoodQuiltU)pad-=.0052*Math.exp(-Math.pow(bearingGap(phi,q)/.12,2));
        return pad;
      };
      const headSurface=d=>1/Math.hypot(d[0]/headR[0],d[1]/headR[1],d[2]/headR[2]);
      function hoodAt(v,u){
        const phi=u*tau;
        const th=lerp(edgeTheta(phi),crownTheta,v);
        const d=[Math.sin(th)*Math.sin(phi),Math.cos(th),Math.sin(th)*Math.cos(phi)];
        const r=headSurface(d)+hoodPad(v,phi);
        // The bag of the hood hangs back off the head: that bulk is what the
        // eye reads as a hood from the side, not the padding on the skull.
        const back=.056*Math.pow(Math.sin(Math.PI*clamp(v,0,1)),.7)*Math.max(0,-d[2]);
        const p=[d[0]*r,headC[1]+d[1]*r,headC[2]+d[2]*r-back];
        // Away from the mouth the edge dives in under the collar, so the hood is
        // sewn into the collar rather than floating above it.
        const dive=smooth(Math.min(phi,tau-phi),.78,1.30)*(1-smooth(v,0,.30));
        if(dive<=0)return p;
        const ring=[Math.sin(phi)*.0745,collarBase+.124*KY,Math.cos(phi)*.0745-.0021];
        return [lerp(p[0],ring[0],dive),lerp(p[1],ring[1],dive),lerp(p[2],ring[2],dive)];
      }
      panel(upper,shell,'Quilted hood',56,96,(v,u)=>hoodAt(v,u));
      panel(upper,shell,'Hood crown',5,96,(v,u)=>{
        // The last turn of the crown closes the bag over the top of the head.
        const phi=u*tau,th=crownTheta*(1-v);
        const d=[Math.sin(th)*Math.sin(phi),Math.cos(th),Math.sin(th)*Math.cos(phi)];
        const r=headSurface(d)+hoodPad(1,phi);
        return [d[0]*r,headC[1]+d[1]*r,headC[2]+d[2]*r];
      });
      panel(upper,shell,'Hood mouth edge',7,96,(v,u)=>{
        // The mouth is a piped edge: doubled cloth turned over the cord.
        const phi=Math.PI*v,p=hoodAt(0,u),q=hoodAt(.05,u);
        const t=[q[0]-p[0],q[1]-p[1],q[2]-p[2]];
        const tn=Math.hypot(t[0],t[1],t[2])||1;
        const n=[p[0]-headC[0],p[1]-headC[1],p[2]-headC[2]];
        const nn=Math.hypot(n[0],n[1],n[2])||1;
        const r=.0062*Math.cos(phi),w=.0062*Math.sin(phi);
        return [p[0]+r*n[0]/nn+w*t[0]/tn,p[1]+w*t[1]/tn,p[2]+r*n[2]/nn+w*t[2]/tn];
      });
      // --- two-way zip
      const zipAt=(t,x,lift)=>{
        const [rx]=sampleProfile(bodiceRows,t);
        const q=clamp(x/Math.max(rx+.03,.02),-.985,.985);
        const p=bodyAt(t,Math.asin(q));
        return [p[0],p[1],p[2]+lift];
      };
      panel(upper,trim,'Zip tape',64,2,(v,u)=>zipAt(lerp(.004,.992,v),lerp(-.0080,.0080,u),.0045));
      panel(upper,shine,'Silver coil zipper',64,2,(v,u)=>zipAt(lerp(.006,.990,v),lerp(-.0019,.0019,u),.0074));
      panel(upper,trim,'Collar zip',12,2,(v,u)=>{
        const y=collarBase+v*.124*KY,r=lerp(.0700,.0820,v);
        return [(u-.5)*.0160,y,r-.0055+.0034+.0048];
      });
      // Two sliders on one zip: it opens from the hem as well as from the chin.
      const slider=(t,name,drop)=>{
        const tp=zipAt(t,.002,.0088);
        panel(upper,shine,name,7,7,(v,u)=>[tp[0]+(u-.5)*.0090,tp[1]-v*drop,
          tp[2]+.0016*Math.sin(u*Math.PI)]);
        panel(upper,shine,name+' pull',12,5,(v,u)=>{
          const a=v*tau;
          return [tp[0]+.0022*Math.cos(a),tp[1]-drop-.003-.021*Math.sin(a*.5+.25*(u-.5)),
            tp[2]+.0024+.0011*Math.sin(a)];
        });
      };
      slider(.040,'Zipper slider',.0105);
      slider(.928,'Lower zipper slider',-.0095);
      // --- hem drawcord: a loop of round cord through the channel's stopper
      for(const side of [-1,1]){
        const x0=side*.108;
        const foot=bodyAt(.985,Math.asin(clamp(x0/Math.max(width,.05),-.9,.9)));
        const zc=foot[2]+.020,hem=foot[1];
        const cord=k=>{
          const phi=Math.PI*k;
          return [x0-.015*Math.cos(phi),hem+.010-.070*Math.sin(phi)];
        };
        panel(upper,trim,'Hem drawcord',40,7,(v,u)=>{
          const p=cord(v),phi=u*tau;
          const nx=p[0]-x0,ny=p[1]-(hem-.028);
          const n=Math.hypot(nx,ny)||1;
          return [p[0]+.0034*Math.cos(phi)*nx/n,p[1]+.0034*Math.cos(phi)*ny/n,zc+.0034*Math.sin(phi)];
        });
        panel(upper,shine,'Drawcord stopper',6,8,(v,u)=>{
          const p=cord(.5),phi=u*tau;
          return [p[0]+.0052*Math.sin(phi),p[1]-.006*v,zc+.0048*Math.cos(phi)];
        });
      }
    } else {
      const collar=type==='tee'||sweat;
      // A shirt closes at a collar band, not at a knitted ring: the ring would
      // float around the neck above the collar.
      if(type!=='shirt') panel(upper,rib,'Neck binding',7,40,(v,u)=>{
        const a=u*tau,c=Math.cos(a);
        // A hair outside the body panel's own top ring: the binding used to sit
        // on the same circle, and the two coplanar surfaces fizzed into a ring of
        // teeth around the neck.
        // A rolled binding: a tube of cloth turned over the cut edge, so the
        // neck's silhouette is round instead of a cut edge with a sawtooth.
        const phi=Math.PI*v,rt=collar?.0042:.0055,rc=.0645;
        const rr=rc-rt*Math.cos(phi);
        return [Math.sin(a)*rr,1.4615*KY-.026*Math.max(c,0)**2+rt*Math.sin(phi),
          Math.cos(a)*(rr-.0105)+.0034];
      });
      // Through the neck of a crew garment the inside of the collar is what the
      // eye meets. A shallow lining ring fills it with cloth instead of the
      // wearer's own mesh seam, which otherwise shows as a row of teeth.
      if(type==='tee'||type==='polo') panel(upper,rib,'Neck lining',4,40,(v,u)=>{
        const a=u*tau,c=Math.cos(a);
        // Well inside the body's own neck ring: sitting on it made the two
        // surfaces z-fight into a ring of teeth.
        return [Math.sin(a)*lerp(.0495,.0485,v),1.458*KY-.030*Math.max(c,0)**2-.020*v,Math.cos(a)*lerp(.0415,.0405,v)+.0030];
      });
      if(halfzip){
        // The half-zip knit stands up in its own ribbed collar; the zip runs
        // from the throat to the sternum and stops there.
        panel(upper,rib,'Ribbed stand collar',9,48,(v,u)=>{
          const a=u*tau,s=Math.sin(a),c=Math.cos(a);
          const r=lerp(.0635,.0705,smooth(v,0,1));
          return [s*r,1.464*KY-.026*Math.max(c,0)**2+v*.057-.006*Math.max(c,0)*v,c*r+.0032];
        });
        panel(upper,rib,'Collar fold edge',5,48,(v,u)=>{
          const a=u*tau,s=Math.sin(a),c=Math.cos(a);
          // A hair outside the collar's own top ring: coplanar rims z-fight
          // into a jagged edge along the neck.
          const r=lerp(.0725,.0745,smooth(v,0,1));
          return [s*r,1.522*KY-.026*Math.max(c,0)**2+.004*v-.012*smooth(v,0,1),c*r+.0032];
        });
        tape('Zip tape',trim,.004,.300,-.0060,.0060,.0044);
        tape('Zip teeth',shine,.010,.294,-.0015,.0015,.0068);
        const tp=frontAt(.284,.001,.0080);
        panel(upper,shine,'Zipper slider',7,6,(v,u)=>[tp[0]+(u-.5)*.0080,tp[1]-.010*v,tp[2]+.0014*Math.sin(u*Math.PI)]);
        panel(upper,shine,'Zipper pull',13,5,(v,u)=>{const a=v*tau;return [tp[0]+.0022*Math.cos(a),tp[1]-.008-.015*v,tp[2]+.0028+.0010*Math.sin(a)];});
      }
      if(!collar){
        if(type==='shirt'){
          // A proper two-piece collar: a stand that rises from the neckline and
          // closes at the top button, and two leaves folded down over it. The
          // leaves are what you see; the stand is what makes the collar stand
          // up at the back of the neck instead of lying flat like a lapel.
          const collarGap=.1537;                 // half the front opening, rad
          const foldR=.0668, foldY=1.4835*KY;       // where the leaf turns over
          const neckR=.0602, neckZ=.0538;        // where the stand is sewn in
          panel(upper,shell,'Collar band',7,60,(v,u)=>{
            const a=collarGap+u*(tau-2*collarGap),s2=Math.sin(a),c=Math.cos(a);
            // The band leans out as it rises, so the fold line is a little
            // wider than the neck and the collar does not cut into the throat.
            const rx=lerp(neckR,foldR,v),rz=lerp(neckZ,foldR,v);
            const y=lerp(1.4562*KY,foldY,v)-.0045*Math.max(0,c)*(1-v);
            return [s2*rx,y,c*rz+.0032];
          });
          for(const sign of [-1,1]) panel(upper,shell,'Point collar',10,40,(v,u)=>{
            // u runs along the fold from the collar's point at the top button
            // round to the middle of the back; v crosses the leaf from the fold
            // to its free edge. The tip is the corner at u=0, where the leaf's
            // front edge meets its outer edge: a point, not a cut corner.
            const a=collarGap+u*(Math.PI-collarGap);
            // The free edge is cut wider than the fold it hangs from, so the
            // front of the leaf swings out across the chest and its point ends
            // beside the placket instead of under the chin.
            const ae=a+(.60-.154)*Math.pow(1-u,1.6);
            const s2=sign*Math.sin(a),c=Math.cos(a);
            const fx=s2*foldR, fz=c*foldR+.0032;
            // The leaf hangs from the fold rather than spreading over the
            // shoulders: it falls most of its width and stands only a couple of
            // centimetres off the neck, which is what a shirt collar does.
            const edgeR=foldR+.0215+.0140*(1-u);
            const edgeY=foldY-.0520-.0090*(1-u);
            const ex=sign*Math.sin(ae)*edgeR, ez=Math.cos(ae)*edgeR+.0032;
            const t=Math.pow(v,.92);
            // A soft roll just under the fold, where the cloth turns over the
            // stand: without it the leaf reads as a plate laid on the chest.
            const roll=.0032*Math.sin(Math.PI*Math.pow(v,.75));
            let x=lerp(fx,ex,t), z=lerp(fz,ez,t), y=lerp(foldY,edgeY,t);
            let r=Math.hypot(x,z-.0032)+roll;
            // A leaf may not pass through the chest it lies on.
            const under=bodyAt(clamp((topY-y)/bodyLength,0,.97),a);
            const floor=Math.hypot(under[0],under[2]-.0032)+.0045;
            if(r<floor)r=floor;
            const face=Math.atan2(x,z-.0032);
            return [Math.sin(face)*r,y,Math.cos(face)*r+.0032];
          });
        } else {
          for(const sign of [-1,1]){
            panel(upper,shell,'Point collar',8,12,(v,u)=>{
              const a=.10+1.72*u;
              return [sign*lerp(.059*Math.sin(a),.031+.064*Math.sin(1.65*u),v),
                lerp(1.463*KY-.023*Math.max(0,Math.cos(a))**2,1.37*KY+.071*smooth(u,.06,.9),v),
                lerp(.054*Math.cos(a),.103-.125*u**1.5,v)+.002*Math.sin(v*Math.PI)];
            });
          }
        }
        const extent=type==='shirt'?.984:.28;
        tape('Button placket',rib,.057,extent,-.009,.009,.003);
        for(let t=.10;t<extent;t+=.135) {
          const p=frontAt(t,.0002,.005);
          panel(upper,cream,'Button',7,3,(v,u)=>[p[0]+Math.cos(v*tau)*.003*u,p[1]+Math.sin(v*tau)*.003*u,p[2]+.001]);
        }
        if(type==='shirt'){
          // Patch pocket on the wearer's left breast, cut on the same stripe
          // as the body and sewn flat with a narrow topstitch.
          const x0=width*.13,x1=width*.13+.108;
          panel(upper,shell,'Chest pocket',10,10,(v,u)=>{
            const x=lerp(x0,x1,u),t=lerp(.235,.505,v);
            return frontAt(t,x,.0028+.0014*Math.sin(Math.PI*u)*Math.sin(Math.PI*v));
          });
          panel(upper,threadMat,'Pocket topstitch',2,10,(v,u)=>frontAt(.241+v*.003,lerp(x0,x1,u),.0042));
        }
      }
    }
    if(workjacket){
      // A small square label patch is sewn above the mouth of the pouch on the
      // wearer's left panel: the one hard-edged rectangle on an otherwise soft
      // front, and the reason the pocket reads as a work pocket rather than a
      // hoodie's.
      const patchX=[.044,.098],patchT=[.562,.636];
      panel(upper,trim,'Patch label',10,10,(v,u)=>{
        const x=lerp(patchX[0],patchX[1],u),t=lerp(patchT[0],patchT[1],v);
        return frontAt(t,x,.0155+.0022*Math.sin(Math.PI*u)*Math.sin(Math.PI*v));
      });
      panel(upper,threadMat,'Patch stitch',2,10,(v,u)=>frontAt(patchT[0]+.005+v*.0016,
        lerp(patchX[0]+.004,patchX[1]-.004,u),.0172));
      panel(upper,threadMat,'Patch stitch',2,10,(v,u)=>frontAt(patchT[1]-.006-v*.0016,
        lerp(patchX[0]+.004,patchX[1]-.004,u),.0172));
    }
    if(adidas&&!photoHoodie){
      // Small three-leaf chest embroidery, cut by three horizontal stitch bars.
      const x0=width*.41,t0=.28,p=frontAt(t0,x0,.006);
      for(const d of [-1,0,1]){
        panel(upper,cream,'Leaf embroidery',10,4,(v,u)=>{
          const x=x0+d*.013*v+(u-.5)*.011*Math.sin(Math.PI*v);
          return [x,p[1]+(.019-.003*Math.abs(d))*v,frontAt(t0-.024*v,x,.0065)[2]];
        });
      }
      for(let i=0;i<3;i++)panel(upper,trim,'Embroidered separation',1,1,(v,u)=>{
        const x=x0+(u-.5)*.028;return [x,p[1]+.002+i*.0023-v*.00093,frontAt(t0-.004*i,x,.0075)[2]];
      });
    }

    // The photographs already carry every stitch; a second set of tubes laid
    // over them reads as a halo of white lines exactly at the seams, and at the
    // neckline as a ring of teeth. So a photographed garment draws none.
    if(bodyThread.indices.length&&!photoTop) bodyThread.attach(upper,threadMat,'Body finish topstitching');
    for(let armIndex=0;armIndex<arms.length;armIndex++){
      const {shoulder:joint,elbow}=arms[armIndex],sign=armIndex===0?-1:1;
      // A short sleeve's cap sits inside the bodice's shoulder line. Raised
      // above it, the cap reads as a puff sleeve rather than a grown-on sleeve.
      // A padded sleeve is set into the shoulder seam, not balanced on top of
      // the joint: the cap hangs a little below the pivot. A dropped shoulder's
      // armhole is out on the upper arm, so its sleeve is mounted out along the
      // shoulder line and a little under it, where the cloth actually hangs.
      // A work jacket's dropped armhole is out on the upper arm: the sleeve is
      // hung from the body's own shoulder edge instead of the joint inside it,
      // so it falls down the side of the cloth rather than through it.
      const armhole=workjacket&&pattern?pattern.point(.085,Math.PI/2):null;
      const dropX=armhole?clamp(Math.abs(armhole[0])-.18,0,.14):0;
      const mount=group(joint),cap=armhole?armhole[1]-anatomy.base.shoulderY-.010:puffer?-.050:fit?shoulderRise+.002:(long?.014:.017),loose=clamp(chest/54,.82,1.3);
      if(dropX)mount.position.x=sign*dropX;
      if(fit)mount.scale.set(1/torso.scale.x,1,1/torso.scale.z);
      // A shirt's cuff ends on the wrist; the hand guide is for a knit's ribbed
      // cuff, and at the palm it pulls stray facets out of the sleeve.
      const hand=long&&type!=='shirt'?handGuide(body.anatomy?.handPoints?.[armIndex],joint,mount):null;
      const seamT=fit?(cap+fit.seamDrop/sy-shoulderRise)/(cap+sleeveLength):0;
      const rings=[[0,.014,.017],[.03,.040,.044],[.075,.060,.064],[.14,.065,.070],
        [.28,.065,.069],[.46,.057,.064],[.57,.055,.061],[.64,.058,.062],[.72,.055,.059],
        [.81,.052,.055],[.89,.049,.052],[.908,.043,.045],[.92,.036,.039],[1,.034,.035]];
      let foldAmplitude=0;
      const folds=fit?3.7+Math.min(2.4,fit.sleeveStack*14):4;
      function sleeveAt(t,a,lift=0){
        let [rx,rz]=sampleProfile(rings,long?t:t*.36+.02);
        let tuck=0;
        if(fit){
          const u=clamp((t-seamT)/(1-seamT),0,1);
          const seamFullness=.011*clamp((fit.ease+5)/35,0,1.35);
          const upperFold=seamFullness*Math.sin(Math.PI*clamp(t/.38,0,1));
          const gather=smooth(u,.22,.60)*(1-smooth(u,.86,.923));
          const phase=(u*folds+.33*Math.sin(a+u*3)+.09*Math.sin(2*a-u*5))*tau;
          // Nested folds return some fabric along the arm. Their shallow radial relief
          // keeps the silhouette soft even when the cuff takes up considerable slack.
          tuck=foldAmplitude*Math.cos(phase)*gather/sy;
          // Heavy canvas folds rather than puffs: the radial part of the
          // sleeve's own relief is held back, so the arm does not read as a
          // stack of rings.
          const bunch=foldAmplitude*(workjacket?.10:.27)*Math.sin(phase)*gather;
          rx+=upperFold+bunch;rz+=upperFold+bunch;

        }
        const ruffle=(.0023*Math.sin(a*5-t*8)+.0013*Math.sin(9*a+13*t))*smooth(t,.035,.15)*(1-smooth(t,.89,.92));
        const y=lerp(cap,-sleeveLength,t)+tuck;
        rx=rx*loose+ruffle;rz=rz*loose+ruffle;
        if(puffer){
          // A sleeve is three channels round the arm, widest over the bicep,
          // gathered into the rib at the wrist.
          const loft=puffAt(t,sleeveSeams,.019,.010,smooth(t,.055,.19)*(1-smooth(t,.79,.90)))+.013*loose;
          rx+=loft;rz+=loft;
        }
        const s=Math.sin(a),c=Math.cos(a),x=rx*s,z=rz*c;
        const factor=hand && t>.60?hand(y,x,z,rx,rz):1;
        return [x*factor+lift*s,y,z*factor+lift*c];
      }
      if(fit){
        let low=0,high=.033;
        for(let k=0;k<15;k++){
          foldAmplitude=(low+high)/2;
          let arc=0,prev=sleeveAt(seamT,sign*1.1);
          for(let j=1;j<=96;j++){
            const p=sleeveAt(lerp(seamT,1,j/96),sign*1.1);
            arc+=Math.hypot(p[0]-prev[0],(p[1]-prev[1])*sy,p[2]-prev[2]);prev=p;
          }
          if(arc<fit.flatSleeve)low=foldAmplitude;else high=foldAmplitude;
        }
      }
      const sleeveMesh=panel(mount,sleeveMat,'Sleeve',puffer?72:fit?80:28,puffer?56:34,(t,u)=>sleeveAt(t,tau*u));
      if(fit)panel(mount,trim,'Dropped shoulder seam',2,36,(v,u)=>sleeveAt(seamT+(v-.5)*.003,tau*u,.0013));

      panel(mount,cuffMat,'Sleeve cuff',4,36,(v,u)=>sleeveAt(lerp(long?.917:.952,1,v),tau*u,.00095));
      const sleeveThread=new StitchLines();
      addFoldedEdge({panel,parent:mount,material:cuffMat,name:'Turned cuff edge',around:sleeveAt,
        span:cap+sleeveLength,sewnAt:long?.917:.952,offset:.00095,columns:36,stitches:sleeveThread,thick:hoodie||sweat});
      if(!photoTop)sleeveThread.attach(mount,threadMat,'Cuff join stitching');
      if(striped){
        for(const t of [.37,.66,.91])panel(mount,cream,'Sleeve stripe',3,36,(v,u)=>sleeveAt(t+.052*v,tau*u,.0008));
      }
      if(adidas&&!photoHoodie){
        // Lay the tape along the union of the two sewn panels in their standing
        // pose. Its outer end follows the upper arm when the wearer moves.
        const rotation=new T.Quaternion().setFromEuler(new T.Euler(0,sign*.03,sign*(body.group.userData.armClearance||.145)));
        const restMount=new T.Matrix4().makeScale(torso.scale.x,1,torso.scale.z)
          .multiply(new T.Matrix4().compose(joint.position,rotation,mount.scale));
        const surface=shoulderGuide(torsoMesh,sleeveMesh,restMount),end=new T.Vector3();
        for(const track of [-1,0,1]){
          const baseA=sign*(.85+.225*track);
          panel(mount,bandMat,'Three stripe sleeve tape',68,3,(v,u)=>
            sleeveAt(lerp(.075,.909,v),baseA+sign*(u-.5)*.138,.0018));
          const follows=[];
          const bridge=panel(upper,bandMat,'Three stripe shoulder tape',32,2,(v,u)=>{
            const angle=baseA+sign*(u-.5)*.138;
            end.fromArray(sleeveAt(.21,angle,.0018)).applyMatrix4(restMount);
            const x=lerp(sign*.063,end.x,v),z=lerp(.024-track*.010+(u-.5)*.005,end.z,v);
            const hit=surface(x,z);
            follows.push(hit?.arm?smooth(v,.22,.92):0);
            return [x,(hit?.y??lerp(fit.apex,end.y,v))+.0018,z+.0009];
          });
          shoulderBridges.push({mesh:bridge,mount,upper,bind:restMount.clone().invert(),rest:bridge.geometry.attributes.position.array.slice(),follows});
        }
      }
      // One release profile for the whole arm, shared by the sleeve, its cuff,
      // its turn-back edge and the three stripes, so nothing slides apart.
      const armTop=cap,armSpan=Math.max(.02,cap+sleeveLength);
      mount.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const attr=mesh.geometry.attributes.position;
        attr.setUsage(T.DynamicDrawUsage);
        const rest=attr.array.slice(),count=attr.count;
        // Bands run from the shoulder seam (anchored) to the cuff (released),
        // and each vertex keeps its outward direction for the crease fan.
        const bands=new Float32Array(count),theta=new Float32Array(count),
          nx=new Float32Array(count),nz=new Float32Array(count),along=new Float32Array(count);
        for(let i=0;i<count;i++){
          const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i),r=Math.hypot(x,z)||1;
          bands[i]=clamp((armTop-y)/armSpan,0,1)*sleeveBands;
          theta[i]=Math.atan2(x,z);nx[i]=x/r;nz[i]=z/r;
          along[i]=(y-elbow.position.y)/.072;
        }
        flexing.push({mesh,elbow,arm:armIndex,rest,bands,theta,nx,nz,along,
          weights:Array.from({length:count},(_,i)=>smooth(-attr.getY(i),.22,.332))});
        if(mesh.name==='Sleeve')probePieces.push(probeRing(mesh));
      });
      // A worn cuff is held by the hand, so the sleeve releases later and less
      // than a loose hem does, and its stiffness is raised to match.
      sleeveSolvers.push(createRowSolver({rows:sleeveBands+1,fabric:opts.material,gain:1.7,
        weight:Array.from({length:sleeveBands+1},(_,k)=>Math.pow(k/sleeveBands,2.2)),
        cap:Array.from({length:sleeveBands+1},(_,k)=>.0015+.0045*k/sleeveBands)}));
      // The cuff rings the wrist, so its own world acceleration is what the
      // released sleeve rows have to fight on the way through the stride.
      sleeveProbes.push(new T.Vector3(0,-sleeveLength*.94,0));
      sleeveState.push({world:new T.Vector3(),prev:new T.Vector3(),before:new T.Vector3(),samples:0});
    }
    upper.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const attr=mesh.geometry.attributes.position;
      const count=attr.count;
      const weights=Array.from({length:count},(_,i)=>smooth((topY-attr.getY(i))/bodyLength,.38,1));
      if(!weights.some(w=>w>0))return;
      attr.setUsage(T.DynamicDrawUsage);
      const bands=new Float32Array(count),theta=new Float32Array(count),
        nx=new Float32Array(count),nz=new Float32Array(count),zone=new Float32Array(count);
      for(let i=0;i<count;i++){
        const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i),r=Math.hypot(x,z)||1;
        bands[i]=weights[i]*hemBands;
        theta[i]=Math.atan2(x,z);nx[i]=x/r;nz[i]=z/r;
        const drop=(topY-y)/bodyLength;
        zone[i]=Math.exp(-(((drop-.86)/.16)**2)*1.7)*(.32+.68*Math.max(0,Math.cos(theta[i])));
      }
      blowing.push({mesh,rest:attr.array.slice(),weights,bands,theta,nx,nz,zone});
      if(mesh.name==='Measured garment body'||!probePieces.length)probePieces.push(probeRing(mesh));
    });
    // The hem is the released end of the bodice: anchored at the waistband
    // weight line, free and heavy at the bottom edge.
    hemSolver=createRowSolver({rows:hemBands+1,fabric:opts.material,
      weight:Array.from({length:hemBands+1},(_,k)=>k/hemBands),
      cap:Array.from({length:hemBands+1},(_,k)=>.004+.019*k/hemBands)});
    hemProbe.set(0,-bodyLength*.9,0);
    hemSamples=0;
    contact=createGarmentContact(upper,bodyAt,hemY,lowerColliders);
    if(contact)blowing.forEach(piece=>contact.bind(piece));
    torsoMesh.userData.sampleGarment=true;
  }
  function update(changes) {
    opts={...opts,...changes};
    const key=JSON.stringify([opts.id,opts.sampleId,opts.type,opts.template,opts.adidas,opts.pattern,opts.color,opts.material,opts.measurements,opts.person,opts.imported,opts.image||opts.photo,Boolean(opts.hoodieAsset),Boolean(opts.topAsset)]);
    if(key===signature)return;
    signature=key;revision++;clear();build();
  }
  function pose(phase,options={},dt=0) {
    const step=clamp(dt,0,.035);
    time+=step;
    const air=clamp(Number(options.wind)||0,0,30);
    const direction=(Number(options.direction)||0)*Math.PI/180;
    const turbulence=clamp(Number(options.turbulence)||0,0,1);
    const gravity=clamp(Number(options.gravity??9.81),0,30);
    const live=options.clothPhysics!==false;
    const env={wind:air,direction:direction*180/Math.PI,gravity,turbulence,clock:time};
    creaseAmp=0;
    // The released rows ride a moving frame, so their inertia comes from the
    // acceleration of the point they hang from, rotated into that frame.
    localAccel.set(0,0,0);
    if(live&&step>1e-5){
      bodice.updateWorldMatrix(true,false);
      hemWorld.copy(hemProbe).applyMatrix4(bodice.matrixWorld);
      if(hemSamples>=2){
        accelVector.copy(hemWorld).addScaledVector(hemPrev,-2).add(hemBefore).multiplyScalar(1/(step*step));
        const span=accelVector.length();
        if(span>20)accelVector.multiplyScalar(20/span);
      }else accelVector.set(0,0,0);
      hemBefore.copy(hemPrev);hemPrev.copy(hemWorld);hemSamples++;
      bodice.getWorldQuaternion(frameQuat).invert();
      localAccel.copy(accelVector).applyQuaternion(frameQuat);
      env.inertiaX=-localAccel.x;env.inertiaY=-localAccel.y;env.inertiaZ=-localAccel.z;
      hemSolver.step(step,null,env);
    }else{
      hemSolver.reset();hemSamples=0;
    }
    const hemRow=hemBands*3;
    swayX=hemSolver.offset[hemRow];swayZ=hemSolver.offset[hemRow+2];
    for(let arm=0;arm<sleeveSolvers.length;arm++){
      const solver=sleeveSolvers[arm],state=sleeveState[arm],mount=arms[arm]?.shoulder;
      const probe=sleeveProbes[arm];
      env.inertiaX=env.inertiaY=env.inertiaZ=0;
      if(live&&step>1e-5&&mount&&probe){
        mount.updateWorldMatrix(true,false);
        state.world.copy(probe).applyMatrix4(mount.matrixWorld);
        if(state.samples>=2){
          accelVector.copy(state.world).addScaledVector(state.prev,-2).add(state.before).multiplyScalar(1/(step*step));
          const span=accelVector.length();
          if(span>20)accelVector.multiplyScalar(20/span);
        }else accelVector.set(0,0,0);
        state.before.copy(state.prev);state.prev.copy(state.world);state.samples++;
        mount.getWorldQuaternion(frameQuat).invert();
        localAccel.copy(accelVector).applyQuaternion(frameQuat);
        env.inertiaX=-localAccel.x;env.inertiaY=-localAccel.y;env.inertiaZ=-localAccel.z;
        solver.step(step,null,env);
      }else{
        solver.reset();state.samples=0;
      }
    }
    // A padded sleeve is a tube of filling: it bends but it does not gather
    // into the fan of creases a knit sleeve does.
    const creaseGain=String(opts.type)==='puffer'?.35:1;
    for(const {mesh,elbow,arm,rest,bands,theta,nx,nz,along,weights} of flexing) {
      const attr=mesh.geometry.attributes.position;
      const arr=attr.array;
      const solver=sleeveSolvers[arm];
      // Elbow closure opens a fan of creases on the inner side of the sleeve.
      const bend=clamp(Math.abs(elbow.rotation.x)/.30,0,1);
      for(let i=0;i<arr.length/3;i++){
        const j=i*3,w=weights[i],b=bands[i];
        if(w<=0&&b<=0)continue;
        v.fromArray(rest,j);
        if(w>0){
          rotated.copy(v).sub(elbow.position).applyQuaternion(elbow.quaternion).add(elbow.position);
          v.lerp(rotated,w);
        }
        const r=Math.min(sleeveBands,b|0),f=b-r;
        v.x+=solver.at(r,f,0);v.y+=solver.at(r,f,1);v.z+=solver.at(r,f,2);
        if(live&&bend>.01&&w>0){
          const a=along[i],side=theta[i];
          const zone=Math.exp(-a*a*1.2)*(.30+.70*Math.max(0,Math.cos(side)));
          const ridge=Math.sin(a*6.8*(1+1.4*bend)+side*1.2+phase*.16)*.62
            +Math.sin(a*3.1-side*2.0-phase*.1)*.38;
          const de=solver.spec.crease*solver.spec.creaseScale*bend*zone*ridge*creaseGain;
          if(Math.abs(de)>creaseAmp)creaseAmp=Math.abs(de);
          v.x+=nx[i]*de;v.z+=nz[i]*de;
        }
        attr.setXYZ(i,v.x,v.y,v.z);
      }
      attr.needsUpdate=true;mesh.geometry.computeVertexNormals();
    }
    for(const bridge of shoulderBridges){
      bridge.upper.updateWorldMatrix(true,false);bridge.mount.updateWorldMatrix(true,false);
      const transform=bridgeMatrix.copy(bridge.upper.matrixWorld).invert().multiply(bridge.mount.matrixWorld).multiply(bridge.bind);
      const attr=bridge.mesh.geometry.attributes.position;
      for(let i=0;i<attr.count;i++){
        if(!bridge.follows[i])continue;
        v.fromArray(bridge.rest,i*3);rotated.copy(v).applyMatrix4(transform);v.lerp(rotated,bridge.follows[i]);
        attr.setXYZ(i,v.x,v.y,v.z);
      }
      attr.needsUpdate=true;bridge.mesh.geometry.computeVertexNormals();
    }
    contact?.update(swayX,swayZ);
    for(const piece of blowing){
      const {mesh,rest,bands,theta,nx,nz,zone}=piece;
      const attr=mesh.geometry.attributes.position;
      const arr=attr.array;
      // Fabric gathered by the hem's own swing creases where the sway is largest.
      const gather=clamp(Math.hypot(swayX,swayZ)/.012,0,1);
      for(let i=0;i<arr.length/3;i++){
        const j=i*3,b=bands[i];
        const r=Math.min(hemBands,b|0),f=b-r;
        const ox=hemSolver.at(r,f,0),oy=hemSolver.at(r,f,1),oz=hemSolver.at(r,f,2);
        let de=0;
        if(gather>.02){
          const a=zone[i];
          const ridge=Math.sin((b*.6+theta[i]*1.1+phase*.2)*2.1)*.6
            +Math.sin(b*.9-theta[i]*2.3-phase*.13)*.4;
          de=hemSolver.spec.crease*hemSolver.spec.creaseScale*gather*a*ridge;
          if(Math.abs(de)>creaseAmp)creaseAmp=Math.abs(de);
        }
        arr[j]=rest[j]+ox+nx[i]*de;
        arr[j+1]=rest[j+1]+oy+.055*Math.abs(ox+oz);
        arr[j+2]=rest[j+2]+oz+nz[i]*de;
      }
      if(contact){contact.apply(piece,attr);}
      if(mesh.userData.sampleGarment)mesh.geometry.computeVertexNormals();
      attr.needsUpdate=true;
    }
    materials.forEach(m=>{m.wireframe=!!options.wireframe;});
  }
  update(initial);
  return {update,pose,
    inspect(){
      const out=[];
      for(const g of members) g.traverse(m=>{ if(m.isMesh) out.push({name:m.name,
        hasUv:Boolean(m.geometry.attributes.uv), uvCount:m.geometry.attributes.uv?.count||0,
        count:m.geometry.attributes.position.count, material:m.material?.name||'',
        map:m.material?.map?.image?.width||0}); });
      return out;
    },
    get hemRise(){return contact?.rise||0;},
    get secondary(){return {hem:hemSolver?hemSolver.hem:0,peak:hemSolver?hemSolver.peak:0,
      sleeve:sleeveSolvers.reduce((m,s)=>Math.max(m,s.peak),0),crease:creaseAmp};},
    get probe(){return probePieces.map(p=>p.index.map(i=>{
      const a=p.mesh.geometry.attributes.position.array;return [a[i*3],a[i*3+1],a[i*3+2]];}));},
    resetCloth(){hemSolver?.reset();hemSamples=0;for(const s of sleeveSolvers)s.reset();
      for(const s of sleeveState)s.samples=0;swayX=swayZ=0;},
    dispose(){
    disposed=true;revision++;clear();
    for(const [mesh,wasVisible] of hidden)mesh.visible=wasVisible;
  }};
}
