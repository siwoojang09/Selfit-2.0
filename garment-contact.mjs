// Sample the worn lower layer in the moving bodice's coordinate system. A convex
// support section bridges the gap between trouser legs like an untucked top.
import {Matrix4,MathUtils} from './vendor/three.module.js';

const tau=Math.PI*2, directions=32, sectors=64, step=.022, ceiling=1.15;
const sin=Array.from({length:sectors},(_,i)=>Math.sin(i*tau/sectors));
const cos=Array.from({length:sectors},(_,i)=>Math.cos(i*tau/sectors));
const mix=MathUtils.lerp, clamp=MathUtils.clamp;

export function createGarmentContact(upper,bodyAt,hemY,colliders){
  if(!colliders?.length || hemY>=ceiling)return null;
  const bottom=hemY-.025,count=Math.ceil((ceiling-bottom)/step)+1;
  const rest=new Float32Array(count*sectors),offset=new Float32Array(rest.length);
  const support=new Float32Array(count*directions);
  const matrix=new Matrix4(),inv=new Matrix4();
  const shell=Array.from({length:49},(_,i)=>Array.from({length:sectors+1},(_,j)=>bodyAt(i/48,tau*j/sectors)));
  // Get each facing's reference distance from the centre, including front hem rise.
  for(let a=0;a<sectors;a++){
    const x=sin[a],z=cos[a];
    const line=shell.map(row=>{
      for(let j=0;j<sectors;j++){
        const p=row[j],q=row[j+1],s=p[0]*z-p[2]*x,e=q[0]*z-q[2]*x;
        if(s>1e-8 || e< -1e-8 || e-s<1e-9)continue;
        const t=clamp(-s/(e-s),0,1);
        return [mix(p[1],q[1],t),mix(p[0],q[0],t)*x+mix(p[2],q[2],t)*z];
      }
      const p=row[a];return [p[1],Math.hypot(p[0],p[2])];
    }).reverse();
    let j=0;
    for(let h=0;h<count;h++){
      const y=bottom+h*step;
      while(j+2<line.length && line[j+1][0]<y)j++;
      const p=line[j],q=line[j+1];
      rest[h*sectors+a]=mix(p[1],q[1],clamp((y-p[0])/(q[0]-p[0]||1),0,1));
    }
  }

  // Store angular & vertical interpolation coordinates once, shared by body
  // panels, zipper teeth, stitching and the folded return inside the hem.
  function bind(piece){
    const p=piece.rest,n=p.length/3;
    const cells=new Int32Array(n).fill(-1),coordinates=new Float32Array(n*4);
    for(let i=0;i<n;i++){
      const x=p[3*i],y=p[3*i+1],z=p[3*i+2],r=Math.hypot(x,z);
      if(y>=ceiling||r<.001)continue;
      const a=((Math.atan2(x,z)/tau+1)%1)*sectors,h=clamp((y-bottom)/step,0,count-1.001);
      cells[i]=Math.floor(h)*sectors+Math.floor(a);
      coordinates.set([a%1,h%1,x/r,z/r],4*i);
    }
    piece.contact={cells,coordinates};
  }

  let rise=0;
  function update(swayX,swayZ){
    upper.updateWorldMatrix(true,false);inv.copy(upper.matrixWorld).invert();
    support.fill(-Infinity);
    for(const mesh of colliders){
      mesh.updateWorldMatrix(true,false);
      const m=matrix.multiplyMatrices(inv,mesh.matrixWorld).elements;
      const p=mesh.geometry.attributes.position.array;
      for(let j=0;j<p.length;j+=3){
        const vx=p[j],vy=p[j+1],vz=p[j+2],y=m[1]*vx+m[5]*vy+m[9]*vz+m[13];
        if(y<bottom-2*step || y>ceiling)continue;
        const x=m[0]*vx+m[4]*vy+m[8]*vz+m[12],z=m[2]*vx+m[6]*vy+m[10]*vz+m[14];
        // Adjacent slices overlap so contact stays conservative between trouser rings.
        const row=Math.floor((y-bottom)/step);
        const lo=Math.max(row-1,0),hi=Math.min(row+2,count-1);
        for(let d=0;d<directions;d++){
          const projection=x*sin[2*d]+z*cos[2*d];
          for(let h=lo;h<=hi;h++){const k=h*directions+d;if(projection>support[k])support[k]=projection;}
        }
      }
    }
    offset.fill(0);
    let hemDepth=0;
    for(let h=0;h<count;h++){
      if(!Number.isFinite(support[h*directions]))continue;
      for(let a=0;a<sectors;a++){
        let radius=Infinity;
        for(let d=0;d<directions;d++){
          const along=cos[(a-2*d+sectors)%sectors];
          if(along>.07)radius=Math.min(radius,support[h*directions+d]/along);
        }
        const k=h*sectors+a;
        const windMargin=Math.max(0,-swayX*sin[a]-swayZ*cos[a]);
        offset[k]=Math.max(0,radius+.006+windMargin-rest[k]);
        if(h<5)hemDepth=Math.max(hemDepth,offset[k]);
      }
    }
    // Spread contact over the fabric above and below the waistband. Do not
    // form a sharp shelf at the top edge of belt loops or pocket welts.
    for(let k=sectors;k<offset.length;k++)offset[k]=Math.max(offset[k],offset[k-sectors]-.014);
    for(let k=offset.length-sectors-1;k>=0;k--)offset[k]=Math.max(offset[k],offset[k+sectors]-.014);
    rise=Math.min(.016,hemDepth*.25);
  }
  function apply(piece,attr){
    const {cells,coordinates:c}=piece.contact,p=attr.array;
    for(let i=0;i<cells.length;i++){
      const k=cells[i];if(k<0)continue;
      const next=k%sectors===sectors-1?k-sectors+1:k+1;
      const j=i*4,t=c[j];
      const d=mix(mix(offset[k],offset[next],t),mix(offset[k+sectors],offset[next+sectors],t),c[j+1]);
      p[i*3]+=d*c[j+2];p[i*3+2]+=d*c[j+3];
      p[i*3+1]+=rise*piece.weights[i];
    }
  }
  return {bind,update,apply,get rise(){return rise;}};
}
