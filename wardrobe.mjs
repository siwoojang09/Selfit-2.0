// All garment dimensions and solver distances are in metres.
import { makeSkirt } from './cloth.mjs?v=2026-11-24n';
import { makeMeasuredPants } from './measured-pants.mjs?v=2026-11-24n';
import { getAvatarFit, bodyWidth } from './fit-body-sections.mjs?v=2026-11-24n';

const TAU = 2 * Math.PI;
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a,b,t) => {const k = clamp((t-a)/(b-a)); return k*k*(3-2*k);};

function panel(T, parent, material, name, sections, sides, at, reverse = false) {
  const vertices = [], uvs = [], indices = [];
  for (let i = 0; i <= sections; ++i) {
    for (let j = 0; j <= sides; ++j) {
      const p = at(i, j / sides, j);
      vertices.push(p[0], p[1], p[2]);
      uvs.push(j / sides, 1 - i / sections);
      if (i < sections && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        if (reverse) indices.push(a,a+1,b,b,a+1,b+1);
        else indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry,material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function seam(T,parent,mat,name,coords,radius,closed=false) {
  const curve = new T.CatmullRomCurve3(coords.map(v => new T.Vector3(...v)), closed);
  const shape = new T.TubeGeometry(curve,Math.max(12,coords.length*2),radius,5,closed);
  const mesh = new T.Mesh(shape,mat);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function makeShirt(T,body,mat,look,ky=1,wide=y=>1) {
  const parts=body.parts || body.anchors;
  const {torso,arms} = parts;
  const formal = look === 'tailored';
  const shirt = new T.Group();
  shirt.name = formal ? 'Tucked poplin shirt' : 'Short sleeve polo';
  torso.add(shirt);
  // Upper-to-lower section profiles. Neck and armhole shaping stays on the moving torso.
  const profile = [
    [1.454,.065,.053],[1.447,.111,.057],[1.439,.15,.060],[1.424,.173,.067],
    [1.404,.177,.074],[1.381,.173,.085],[1.355,.171,.096],[1.329,.171,.105],
    [1.30,.173,.115],[1.275,.172,.121],[1.25,.170,.122],[1.22,.168,.117],
    [1.185,.163,.111],[1.147,.160,.109],[1.112,.159,.107],[1.078,.161,.107],
    [1.055,.157,.101],[1.043,.151,.096],[1.025,.146,.092],[1.008,.14,.09],
  ].map(([y,rx,rz])=>[y*ky,rx*wide(y),rz*wide(y)]);
  function surface(i,a){
    const [y,rx,rz]=profile[i], s=Math.sin(a),c=Math.cos(a);
    const fullness = .0015 + .004 * smooth(1.24,1.03,y);
    const wrinkle = (Math.sin(7*a + y*9) + .44*Math.sin(13*a - y*21)) * fullness;
    const drop = i < 4 ? .036 * Math.max(c,0)**2 * (1-i/4) : 0;
    return [s*(rx+wrinkle), y-drop, c*(rz+wrinkle)+.002];
  }
  const bodice=panel(T,shirt,mat,'Front and back bodice',profile.length-1,64,(i,u)=>surface(i,TAU*u));
  bodice.userData.garmentPart='upper';

  // Center-front placket has two stitched vertical edges and its own raised face.
  const rows=formal ? profile.length-2 : 7;
  const placket=panel(T,shirt,mat,'Button placket',rows-1,3,(i,u)=>{
    const p=surface(i+1,0);
    return [(u-.5)*.023,p[1],p[2]+.0018];
  });
  placket.userData.garmentPart='upper';
  for(const side of [-1,1]){
    const positions=Array.from({length:rows},(_,i)=>{
      const p=surface(i+1,0);return [side*.010,p[1],p[2]+.0017];
    });
    seam(T,shirt,mat,'Placket topstitch',positions,.00064);
  }
  const buttonMat = new T.MeshStandardMaterial({color:formal?'#e4e7df':'#b7baa1',roughness:.56});
  const buttonGeometry=new T.CylinderGeometry(.0036,.0038,.00125,12);
  buttonGeometry.rotateX(Math.PI*.5);
  for(const i of (formal ? [3,6,9,12,14,16] : [3,6])){
    const p=surface(i,0);
    const button=new T.Mesh(buttonGeometry,buttonMat);
    button.name='Shirt button';
    button.position.set(0,p[1],p[2]+.0034);
    shirt.add(button);
  }
  // Under-collar wraps around the neck. Each leaf slopes towards the shirt front.
  const collarStand=panel(T,shirt,mat,'Collar stand',4,48,(i,u)=>{
    const a=u*TAU,c=Math.cos(a),v=i/4;
    return [Math.sin(a)*mix(.056,.080,v),1.471*ky-.029*v-(.020+.015*v)*Math.max(0,c)**2,.001+c*mix(.046,.062,v)];
  });
  collarStand.userData.garmentPart='upper';
  for(const sign of [-1,1]){
    const collar = panel(T,shirt,mat,'Point collar leaf',9,10,(i,u)=>{
      const v=i/9,a=mix(.06,1.95,u);
      const nx=.061*Math.sin(a),nz=.051*Math.cos(a)+.002,ny=1.47-.020*Math.max(0,Math.cos(a))**2;
      const ox=.032+.059*Math.sin(1.65*u),oz=.100-.127*u**1.65;
      const oy=1.376*ky+.068*smooth(0,.9,u)+.018*(1-smooth(0,.14,u));
      return [sign*mix(nx,ox,v),mix(ny,oy,v)+.0035*Math.sin(Math.PI*v),mix(nz,oz,v)+.003*Math.sin(Math.PI*v)];
    },sign<0);
    collar.userData.garmentPart='upper';
  }
  if(formal){
    // Breast pocket has a subtly pointed bottom and a folded upper welt.
    const patch=panel(T,shirt,mat,'Chest patch pocket',8,9,(i,u)=>{
      const v=i/8,x=.035+.066*u;
      const y=1.309*ky-.054*v-.013*v*(1-Math.abs(u*2-1));
      const row= y>1.30?8:y>1.275?9:10;
      const z=surface(row,Math.asin(x/profile[row][1]))[2]+.0023;
      return [x,y,z];
    });
    patch.userData.garmentPart='upper';
  }
  // A single sleeve surface bends around the elbow. Soft-weighted vertices at the joint
  // avoid a visible break between the upper and lower sleeves.
  const flexing=[];
  arms.forEach(({shoulder,elbow},index)=>{
    const sx=index===0?-1:1;
    const profile = formal ? [
      [.036,.009,.018],[.029,.034,.043],[.017,.050,.052],[0,.057,.059],
      [-.022,.060,.062],[-.048,.059,.063],[-.081,.057,.061],[-.114,.056,.061],
      [-.153,.056,.06],[-.197,.053,.058],[-.234,.050,.053],[-.258,.049,.054],
      [-.274,.050,.054],[-.29,.048,.054],[-.312,.047,.051],[-.339,.049,.053],
      [-.367,.049,.052],[-.400,.046,.050],[-.432,.043,.045],[-.451,.043,.044],
      [-.466,.039,.040],[-.472,.033,.034],[-.476,.033,.034],[-.498,.032,.033],
      [-.513,.031,.032],[-.515,.031,.032]
    ] : [[.035,.007,.014],[.026,.038,.044],[.008,.053,.055],[-.026,.059,.063],[-.065,.059,.061],[-.103,.056,.060],[-.143,.054,.058],[-.150,.052,.056],[-.157,.052,.057],[-.159,.052,.057]];
    const sleeve=panel(T,shoulder,mat,'Sleeve and cuff',profile.length-1,40,(i,u)=>{
      const [y,rx,rz]=profile[i],a=TAU*u;
      const fold=.0022*Math.sin(5*a-y*19)+.0014*Math.cos(11*a+y*23);
      const cuff= y<-.471 || (!formal && y<-.146);
      return [Math.sin(a)*(rx+(cuff?0:fold)),y,Math.cos(a)*(rz+(cuff?0:fold))];
    });
    sleeve.userData.garmentPart=sx===-1?'sleeveLeft':'sleeveRight';
    if(formal){
      const pos=sleeve.geometry.attributes.position;
      pos.setUsage(T.DynamicDrawUsage);
      flexing.push({sleeve,elbow,base:Float32Array.from(pos.array),weight:Array.from({length:pos.count},(_,i)=>smooth(.21,.337,-pos.getY(i)))});
    }
  });
  const p=new T.Vector3(),rest=new T.Vector3();
  function pose(){
    for(const {sleeve,elbow,base,weight} of flexing){
      const attr=sleeve.geometry.attributes.position;
      for(let i=0;i<attr.count;i++){
        if(!weight[i]) continue;
        rest.fromArray(base,i*3);
        p.copy(rest).sub(elbow.position).applyQuaternion(elbow.quaternion).add(elbow.position);
        p.lerp(rest,1-weight[i]);
        attr.setXYZ(i,p.x,p.y,p.z);
      }
      attr.needsUpdate=true;sleeve.geometry.computeVertexNormals();
    }
  }
  return {pose};
}

const fabricPhysics={
  linen:{spring:71,drag:13,air:.70},
  cotton:{spring:59,drag:12,air:.78},
  silk:{spring:36,drag:8,air:1.2},
  denim:{spring:109,drag:17,air:.36},
};
function tailorWaist(T,body,mat,male,short,ky=1){
  const parent=(body.parts || body.anchors).pelvis;
  const yoke=new T.Group();
  yoke.name='Waist finish and pockets';
  parent.add(yoke);
  const point=(a,drop,lift=.0018)=>{
    const round=smooth(0,.135,drop);
    const rx=mix(male?.163:.145,male?.189:.177,round);
    const rz=mix(male?.111:.105,.134,round);
    return [Math.sin(a)*(rx+lift),1.039*ky-drop,Math.cos(a)*(rz+lift)-.008];
  };
  for(const h of [.006,.031]){
    seam(T,yoke,mat,'Waistband stitching',Array.from({length:56},(_,i)=>point(i*TAU/56,h)),.00075,true);
  }
  for(const a of [-2.75,-1.38,-.55,.55,1.38,2.75]){
    const loop=panel(T,yoke,mat,'Belt loop',5,3,(i,u)=>point(a+.047*(u-.5),.004+i*.0065,.0031+Math.sin(i*Math.PI/5)*.002));
    loop.userData.garmentPart='lower';
  }
  for(const sign of [-1,1]){
    const welt=Array.from({length:12},(_,i)=>{const t=i/11;return point(sign*mix(.71,1.39,t),.036+.10*t,.0026);});
    seam(T,yoke,mat,'Slanted side pocket',welt,short?.0018:.00125);
    const back=Array.from({length:12},(_,i)=>point(sign*mix(2.09,2.75,i/11),.063+.006*i/11,.002));
    seam(T,yoke,mat,'Rear pocket opening',back,.0015);
  }
  const fly=Array.from({length:16},(_,i)=>{const t=i/15;return point(.11*(1-t**4),.034+.093*t,.0026);});
  seam(T,yoke,mat,'Fly topstitch',fly,.0009);
  const trim=new T.MeshStandardMaterial({color:short?'#857663':'#90897b',roughness:.61,metalness:.31});
  const fastener=new T.Mesh(new T.CylinderGeometry(.0048,.0051,.0019,14),trim);
  fastener.rotation.x=Math.PI/2;
  fastener.position.fromArray(point(0,.017,.003));
  yoke.add(fastener);
}

const rows=34, cols=48;
function makePants(T,group,body,mat,opts,ky=1){
  const short=opts.outfit==='casual',male=opts.model==='male';
  const breadth=male?1.12:1;
  tailorWaist(T,body,mat,male,short,ky);
  // Fitted upper yoke blends into two moving trouser panels below the crotch.
  const hems=short ? .55*ky : .073*ky;
  const waist=1.039*ky, fullLength=waist-hems;
  const widthProfile = short
    ? [[0,.095,.106],[.2,.094,.106],[.5,.094,.103],[.84,.089,.092],[1,.09,.09]]
    : [[0,.100,.113],[.18,.097,.111],[.34,.089,.104],[.49,.083,.095],[.60,.082,.09],[.72,.079,.082],[.91,.075,.074],[1,.076,.072]];
  const levels=Array.from({length:rows+1},(_,i)=>{
    if(i===1)return .006/fullLength;
    if(i===2)return .033/fullLength;
    if(i===rows-1)return 1-.009/fullLength;
    return i/(rows);
  });
  const rings=levels.map(h=>{
    let i=0;while(i<widthProfile.length-2 && h>widthProfile[i+1][0])i++;
    const a=widthProfile[i],b=widthProfile[i+1],s=clamp((h-a[0])/(b[0]-a[0]));
    return {drop:fullLength*h,rx:mix(a[1],b[1],s)*breadth,rz:mix(a[2],b[2],s)};
  });
  const sin=[],cos=[];
  for(let j=0;j<=cols;j++){sin[j]=Math.sin(TAU*j/cols);cos[j]=Math.cos(TAU*j/cols);}
  const pieces=[];
  for(let k=0;k<2;k++){
    const sign=k===0?-1:1;
    const mesh=panel(T,group,mat,short?'Denim Bermuda shorts panel':'Straight trouser panel',rows,cols,()=>[0,0,0],sign<0);
    mesh.userData.garmentPart= k===0?'legLeft':'legRight';
    mesh.frustumCulled=false;
    mesh.geometry.attributes.position.setUsage(T.DynamicDrawUsage);
    const current = Array.from({length:rows+1},()=>({
      x:0,z:0,vx:0,vz:0,seeded:false
    }));
    pieces.push({mesh,sign,current});
  }
  let elapsed=0;
  const radial = (pos,a,b,t) => {pos[0]=mix(a.x,b.x,t);pos[1]=mix(a.y,b.y,t);pos[2]=mix(a.z,b.z,t);};
  const pos=[0,0,0];
  function pose(phase,options,dt){
    const flex=fabricPhysics[options.fabric] || fabricPhysics.linen;
    const g=clamp(Number(options.gravity ?? 9.81),0,30);
    const wind=clamp(Number(options.wind ?? 0),0,30);
    const angle=(options.direction || 0)*Math.PI/180,wx=Math.cos(angle),wz=Math.sin(angle);
    const turbulence=clamp(Number(options.turbulence ?? .2));
    const step=clamp(dt,0,.034);
    elapsed+=step;
    for(let k=0;k<2;k++){
      const {mesh,sign,current}=pieces[k];
      const upper=body.legs[2*k],lower=body.legs[2*k+1],top=upper.a,knee=upper.b,ankle=lower.b;
      const leftHip=body.legs[0].a,rightHip=body.legs[2].a;
      const hipX=(leftHip.x+rightHip.x)*.5,hipZ=(leftHip.z+rightHip.z)*.5;
      const waistY=top.y+(waist-.93*ky);
      // Pelvis local X axis to preserve draping and yoke alignment during rotation.
      const wdx=rightHip.x-leftHip.x,wdz=rightHip.z-leftHip.z,ws=Math.hypot(wdx,wdz)||1;
      const axisX=wdx/ws,axisZ=wdz/ws,frontX=-axisZ,frontZ=axisX;
      const arr=mesh.geometry.attributes.position.array;
      for(let i=0;i<=rows;i++){
        const {drop,rx,rz}=rings[i],h=levels[i], spring=current[i];
        const travel=drop-(waist-.93);
        if(travel<.438*ky) radial(pos,top,knee,clamp(travel/(.438*ky)));
        else radial(pos,knee,ankle,clamp((travel-.438*ky)/(.44*ky),0,1.03));
        const cx=pos[0],cy=travel<0?waistY-drop:pos[1],cz=pos[2];
        if(!spring.seeded){spring.x=cx;spring.z=cz;spring.seeded=true;}
        // Integrate damped transverse hem inertia in world space. Nearby rings are
        // constrained to the thigh/calf envelope, so moving legs remain inside the fabric.
        const loose=smooth(.14,.53,drop)*(.28+.72*h);
        const gust=.75+.19*Math.sin(elapsed*4.1+drop*7+k)*turbulence;
        const force=wind*(.24+wind*.035)*flex.air*gust;
        const rigidity=flex.spring+(1-loose)*130;
        spring.vx+=((cx-spring.x)*rigidity-spring.vx*flex.drag+wx*force*loose)*step;
        spring.vz+=((cz-spring.z)*rigidity-spring.vz*flex.drag+wz*force*loose)*step;
        spring.x+=spring.vx*step;spring.z+=spring.vz*step;
        const dx=clamp(spring.x-cx,-.019,.019)*loose;
        const dz=clamp(spring.z-cz,-.024,.024)*loose;
        const bifurcate=smooth(.064,.245,drop);
        const hipRound=smooth(0,.135,drop);
        const yokeX=male?mix(.163,.189,hipRound):mix(.145,.177,hipRound);
        const yokeZ=mix(male?.111:.105,.134,hipRound);
        for(let j=0;j<=cols;j++){
          const s=sin[j],c=cos[j],a=TAU*j/cols;
          const roll= i===0||i===2||i===rows? .0013:0;
          const outerFold=.0026*Math.cos(6*a+drop*4)+.0021*Math.sin(11*a-drop*6);
          const kneeFold=short?0:.0057*Math.exp(-(((drop-.56)/.085)**2))*Math.sin((drop-.52)*82 + a*1.7+phase*.4)*Math.max(0,-c);
          const cuffFold=.0032*Math.sin(drop*18+3*a+sign*phase*.35)*smooth(.69,1,h);
          const fold=outerFold*smooth(.06,.27,drop)+kneeFold+cuffFold;
          const radialX=sign*s*(rx+fold+roll),radialZ=c*(rz+fold+roll);
          const inside=s<0 && j<cols;
          const seatX=sign*(inside?0:Math.max(0,s))*(yokeX+roll),seatZ=c*(yokeZ+roll);
          const seatEdge=smooth(.105,.23,drop);
          // Lower the inseam at the fork. Both sides share an identical center seam at the waist.
          const fork=-.022*seatEdge*(1-bifurcate)*Math.max(0,-s);
          const wx0=hipX+axisX*seatX+frontX*seatZ;
          const wz0=hipZ+axisZ*seatX+frontZ*seatZ;
          const flatten=smooth(.2,.35,drop)*smooth(.17,.26,Math.abs(knee.z-top.z));
          const lowX=cx+axisX*radialX+frontX*radialZ+dx;
          const lowZ=cz+axisZ*radialX+frontZ*radialZ+dz+.004*flatten*c;
          const t=(i*(cols+1)+j)*3;
          arr[t]=mix(wx0,lowX,bifurcate);
          arr[t+1]=mix(waistY-drop,cy,bifurcate)+fork
            +(.003*cuffFold/.0032+.003*Math.sin(a*4+phase*.5))*smooth(.6,1,h)
            +.009*loose*(9.81-g)/9.81 + .002*force*loose*c;
          arr[t+2]=mix(wz0,lowZ,bifurcate);
        }
      }
      mesh.geometry.attributes.position.needsUpdate=true;
      mesh.geometry.computeVertexNormals();
      // Smooth the duplicate UV seam through flexion.
      const normals=mesh.geometry.attributes.normal.array;
      for(let i=0;i<=rows;i++){
        const a=i*(cols+1)*3,b=a+cols*3;
        for(let n=0;n<3;n++) normals[a+n]=normals[b+n]=(normals[a+n]+normals[b+n])*.5;
      }
      mesh.geometry.attributes.normal.needsUpdate=true;
    }
  }
  function reset(){elapsed=0;for(const p of pieces)for(const r of p.current){r.seeded=false;r.vx=r.vz=0;}}
  return {pose,reset,vertices:2*(rows+1)*(cols+1)};
}

// Wear the photo-mapped mesh in place of the drawn one. The pattern still
// supplies the rest pose and every frame's deformation, so fit, size and walk
// stay exactly as measured; only the surface (and its unwrapped photograph)
// comes from the asset.
function applyPhotoAsset(garment,asset){
  const pieces=garment.parts||[];
  if(pieces.length!==asset.parts.length){
    console.warn('denim asset has',asset.parts.length,'pieces, the pattern has',pieces.length);
    document.documentElement.dataset.denim='pieces '+asset.parts.length+'/'+pieces.length;
    return false;
  }
  let worn=0;
  pieces.forEach((piece,i)=>{
    const part=asset.parts[i];
    if(!part||part.count!==piece.rest.length/3){
      document.documentElement.dataset.denim='verts '+i+' '+part?.count+'/'+(piece.rest.length/3);
      return;
    }
    piece.mesh.geometry=part.geometry.clone();
    piece.mesh.material=part.material;
    worn++;
  });
  return worn===pieces.length;
}

export function createWardrobe(T,body,materials,opts) {
  // The drawn fallbacks below were authored on the 178 cm frame; carry them onto
  // the shaped body with the same two numbers the meshes were shaped with.
  const formModel=opts.model||body.model||'female';
  const ky=getAvatarFit(formModel).ky||1;
  const wide=y=>bodyWidth(formModel,y);
  const group=new T.Group();
  group.name='Garment assembly';
  const classic=opts.outfit==='classic' || !opts.outfit;
  const measured=Boolean(opts.pants);
  // A photo garment is only ever the photograph: its pattern pieces carry no
  // modelled waistband, fly, pockets or topstitch, so the drawn jeans can never
  // be what the body wears, not even for the frames before the file arrives.
  const photoPants=Boolean(opts.photoPants);
  const skirted=!measured && classic && (opts.bottom==='skirt' || (!opts.bottom && opts.model!=='male'));
  let denimAsset=photoPants?(opts.photoAsset||null):null,lastOptions=opts;
  const syncPhotoVisibility=()=>{group.visible=!(photoPants&&!denimAsset);};
  const buildMeasured=options=>{
    const built=makeMeasuredPants(T,group,body,materials.lower,{...options,photoDenim:photoPants||Boolean(denimAsset)});
    if(denimAsset)applyPhotoAsset(built,denimAsset);
    syncPhotoVisibility();
    return built;
  };
  let main=measured?buildMeasured(opts):
    skirted?makeSkirt(materials.lower):makePants(T,group,body,materials.lower,opts,ky);
  if(skirted){
    main.mesh.userData.garmentPart='lower';
    group.add(main.mesh);
  }
  const tee=body.teeMeshes || [];
  const topPieces=Array.isArray(tee)?tee:[tee];
  topPieces.forEach(m=>{m.visible=classic;});
  const shirt=classic?null:makeShirt(T,body,materials.top,opts.outfit,ky,wide);
  const pose=(phase,options,dt)=>{
    shirt?.pose();
    if(skirted){
      main.step(dt,options,body.legs,body.hipsFromPose);
    } else main.pose(phase,options,dt);
  };
  const reset=()=>main.reset();
  pose(0,opts,0);
  const lowerColliders=[];
  for(const part of [group,body.group.getObjectByName('Waist finish and pockets')]){
    part?.traverse(mesh=>{if(mesh.isMesh)lowerColliders.push(mesh);});
  }
  let key=measured?JSON.stringify([opts.pants,opts.person]):'';
  function updatePants(options){
    if(!measured)return;
    lastOptions=options;
    const next=JSON.stringify([options.pants,options.person]);
    if(next===key)return;
    key=next;main.dispose();
    // The deformation palette is bound in the standing pose for every size.
    body.pose(0,false);
    main=buildMeasured(options);
    lowerColliders.length=0;
    group.traverse(mesh=>{if(mesh.isMesh)lowerColliders.push(mesh);});
  }
  function setDenimAsset(asset){
    // Only the photographed pair may wear it: a registered sample that happens
    // to be a denim trouser is cut and shaded from its own pattern.
    if(!measured||!photoPants||denimAsset===asset)return false;
    denimAsset=asset;key='';
    updatePants(lastOptions);
    syncPhotoVisibility();
    return true;
  }
  return {group,pose,reset,lowerColliders,updatePants,setDenimAsset,
    get denimAsset(){return denimAsset;},get secondary(){return main.secondary||null;},
    get probe(){return main.probe||null;},
    get vertices(){return skirted?main.mesh.geometry.attributes.position.count:main.vertices;}};
}
