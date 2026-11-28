// Estimated engineering presets. Compliance values are solver parameters (m/N).
const reference = { gsm:390, warp:0.0003, weft:0.0006, shear:0.007, bend:0.035,
  thickness:0.0011, friction:0.55, damping:6, permeability:0.2 };
export const denimPresets = {
  standard:{label:'기본 데님', ...reference},
  light:{label:'경량 데님', ...reference, gsm:235, thickness:0.00065, bend:0.095, damping:4, permeability:0.35},
  stretch:{label:'스트레치 데님', ...reference, gsm:325, weft:0.009, shear:0.014, bend:0.06, damping:8}
};
const bounds={gsm:[10,3000],warp:[0,1],weft:[0,1],shear:[0,1],bend:[0,2],
  thickness:[0.00005,0.02],friction:[0,1],damping:[0,100],permeability:[0,1]};
export function denimProperties(preset, overrides={}) {
  const profile={...(denimPresets[preset] || denimPresets.standard)}, sources={};
  for(const key of Object.keys(reference)){
    const entry=overrides?.[key];
    if(entry && Number.isFinite(entry.value) && entry.value>=bounds[key][0] && entry.value<=bounds[key][1] && ['measured','description'].includes(entry.source)){
      profile[key]=entry.value;sources[key]=entry.source;
    }else sources[key]='default';
  }
  return {...profile,sources};
}

const span=(p,a,b)=>Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2]);
export function makePanel(rest, rows, cols, closed=true, pinnedRows=1){
  const n=rows*cols, position=rest.slice(),previous=rest.slice(),velocity=new Float64Array(3*n);
  const areas=new Float64Array(n),inverseMass=new Float64Array(n), edges=[];
  const add=(a,b,type)=>edges.push({a,b,type,length:span(rest,3*a,3*b),lambda:0});
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=r*cols+c, next=r*cols+(c+1)%cols;
    if(closed||c+1<cols)add(i,next,'weft');
    if(r+1<rows){
      add(i,i+cols,'warp');
      if(closed||c+1<cols){
        add(i,next+cols,'shear');add(next,i+cols,'shear');
        const quarter=span(rest,i*3,next*3)*span(rest,i*3,(i+cols)*3)/4;
        for(const j of [i,next,i+cols,next+cols])areas[j]+=quarter;
      }
    }
    // Second-neighbour distance constraints resist folding along either yarn axis.
    if(r+2<rows)add(i,i+2*cols,'bend');
    if(closed||c+2<cols)add(i,r*cols+(c+2)%cols,'bend');
  }
  let ready=false;
  function step(dt,target,fabric,env,contact){
    if(!ready){position.set(target);previous.set(target);velocity.fill(0);ready=true;}
    if(!(dt>0))return;
    const drag=Math.exp(-fabric.damping*dt),angle=env.direction*Math.PI/180;
    const wind=env.wind*(1+(env.turbulence||0)*Math.sin((env.clock||0)*3.7));
    const wx=wind*Math.cos(angle),wz=wind*Math.sin(angle);
    previous.set(position);
    for(let i=0;i<n;i++){
      const q=i*3, pinned=i<cols*pinnedRows;
      inverseMass[i]=pinned?0:1000/(fabric.gsm*Math.max(areas[i],1e-6));
      if(pinned){for(let k=0;k<3;k++)position[q+k]=target[q+k];continue;}
      const c=i%cols;
      const left=3*(i-c+(closed?(c+cols-1)%cols:Math.max(0,c-1)));
      const right=3*(i-c+(closed?(c+1)%cols:Math.min(cols-1,c+1)));
      const up=q-cols*3;
      const ax=previous[right]-previous[left],ay=previous[right+1]-previous[left+1],az=previous[right+2]-previous[left+2];
      const bx=previous[q]-previous[up],by=previous[q+1]-previous[up+1],bz=previous[q+2]-previous[up+2];
      let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
      const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
      const airflow=(wx-velocity[q])*nx-velocity[q+1]*ny+(wz-velocity[q+2])*nz;
      const pressure=Math.max(-200,Math.min(200,0.6*airflow*Math.abs(airflow)*(1-fabric.permeability)*areas[i]*inverseMass[i]));
      for(let k=0;k<3;k++){
        const acceleration=pressure*(k===0?nx:k===1?ny:nz)-(k===1?env.gravity:0);
        position[q+k]+=velocity[q+k]*drag*dt+acceleration*dt*dt;
      }
    }
    for(const edge of edges)edge.lambda=0;
    for(let iter=0;iter<5;iter++){
      for(const e of edges){
        const a=e.a*3,b=e.b*3,wa=inverseMass[e.a],wb=inverseMass[e.b];
        if(!(wa+wb))continue;
        const x=position[a]-position[b],y=position[a+1]-position[b+1],z=position[a+2]-position[b+2];
        const len=Math.sqrt(x*x+y*y+z*z)||1e-9,alpha=fabric[e.type]/(dt*dt);
        const dl=(e.length-len-alpha*e.lambda)/(wa+wb+alpha);
        e.lambda+=dl;
        const u=wa*dl/len,v=wb*dl/len;
        position[a]+=u*x;position[a+1]+=u*y;position[a+2]+=u*z;
        position[b]-=v*x;position[b+1]-=v*y;position[b+2]-=v*z;
      }
      if(contact)for(let i=cols*pinnedRows;i<n;i++)contact(position,3*i,target,fabric,previous,iter===4);
    }
    for(let q=0;q<position.length;q++)velocity[q]=(position[q]-previous[q])/dt;
  }
  return {position,velocity,step,reset(){ready=false;}};
}

// Each cuff owns one side of the bisector between the two posed leg axes.
// This coarse contact surface keeps opposing inner seams apart during a stride.
export function legContact(limbs,sideIndex){
  function centreAt(limb,y,key){
    const t=Math.max(0,Math.min(1,(y-limb.a.y)/(limb.b.y-limb.a.y||-1e-6)));
    return limb.a[key]+t*(limb.b[key]-limb.a[key]);
  }
  return (p,q,target,fabric,prev,last)=>{
    // A coarse ring omits the folds between particles. Bound its excursion
    // about the fitted leg so a long stride cannot turn the cuff inside out.
    const leash=.085;
    const ex=p[q]-target[q],ey=p[q+1]-target[q+1],ez=p[q+2]-target[q+2];
    const offset=Math.sqrt(ex*ex+ey*ey+ez*ez);
    if(offset>leash){
      const ratio=leash/offset;
      p[q]=target[q]+ex*ratio;p[q+1]=target[q+1]+ey*ratio;p[q+2]=target[q+2]+ez*ratio;
    }
    const pad=fabric.thickness, y=p[q+1],own=2*sideIndex,other=2-own;
    const leg=limbs[own+Number(y<limbs[own].b.y)],peer=limbs[other+Number(y<limbs[other].b.y)];
    const cx=centreAt(leg,y,'x'),cz=centreAt(leg,y,'z');
    const px=centreAt(peer,y,'x'),pz=centreAt(peer,y,'z');
    let dx=p[q]-cx,dz=p[q+2]-cz;
    const distance=Math.hypot(dx,dz)||1e-6, radius=leg.r+pad;
    let hit=false;
    if(distance<radius){p[q]+=dx*(radius/distance-1);p[q+2]+=dz*(radius/distance-1);hit=true;}
    dx=cx-px;dz=cz-pz;
    const gap=Math.hypot(dx,dz)||1;
    const plane=((p[q]-(cx+px)/2)*dx+(p[q+2]-(cz+pz)/2)*dz)/gap;
    if(plane<pad){p[q]+=(pad-plane)*dx/gap;p[q+2]+=(pad-plane)*dz/gap;hit=true;}
    const foot=limbs[own+1].b;
    const rx=.052+pad,ry=.052+pad,rz=.13+pad;
    const sx=(p[q]-foot.x)/rx,sy=(p[q+1]-foot.y+.038)/ry,sz=(p[q+2]-foot.z-.045)/rz;
    const norm=Math.sqrt(sx*sx+sy*sy+sz*sz);
    if(norm<1 && norm>1e-8){
      const gain=1/norm-1;
      p[q]+=rx*sx*gain;p[q+1]+=ry*sy*gain;p[q+2]+=rz*sz*gain;hit=true;
    }
    if(p[q+1]<pad){p[q+1]=pad;hit=true;}
    if(hit && last){
      // Dissipate sliding velocity without reversing the collision correction.
      prev[q]+=fabric.friction*(p[q]-prev[q]);prev[q+2]+=fabric.friction*(p[q+2]-prev[q+2]);
    }
  };
}
