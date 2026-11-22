// Construction details use metres. Every piece is attached to the same moving
// parent as its fabric, including the reverse faces visible at an open cuff.
import * as T from './vendor/three.module.js';

const tau=Math.PI*2;
const lerp=T.MathUtils.lerp;

function shifted(p,a,offset){
  return [p[0]+offset*Math.sin(a),p[1],p[2]+offset*Math.cos(a)];
}

function length(a,b){
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
}

class PatchBatch{
  constructor(){this.positions=[];this.indices=[];}
  quad(a,b,c,d){
    const i=this.positions.length/3;
    this.positions.push(...a,...b,...c,...d);
    this.indices.push(i,i+1,i+2,i,i+2,i+3);
  }
  attach(parent,material,name){
    if(!this.indices.length)return;
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(this.positions,3));
    geo.setIndex(this.indices);
    geo.computeVertexNormals();
    const mesh=new T.Mesh(geo,material);
    mesh.name=name;
    parent.add(mesh);
  }
}

// arc(t, side) supplies the two edges of a needle line. Accumulated length keeps
// the stitch pitch constant on curved hems and across different garment sizes.
export class StitchLines extends PatchBatch{
  line(arc,pitch=.0039){
    const steps=48,distances=[0];
    let previous=arc(0,0),distance=0;
    for(let i=1;i<=steps;i++){
      const p=arc(i/steps,0);
      distance+=length(p,previous);
      distances.push(distance);previous=p;
    }
    if(distance<.0005)return;
    const count=Math.max(1,Math.round(distance/pitch));
    let section=1;
    function at(d){
      while(section<steps && distances[section]<d)section++;
      const t=(d-distances[section-1])/Math.max(.000001,distances[section]-distances[section-1]);
      return (section-1+t)/steps;
    }
    for(let i=0;i<count;i++){
      const a=at((i+.11)*distance/count),b=at((i+.85)*distance/count);
      this.quad(arc(a,-.0004),arc(a,.0004),arc(b,.0004),arc(b,-.0004));
    }
  }
}

export function addFoldedEdge({panel,parent,material,name,around,span,sewnAt,offset,columns,stitches,thick}){
  const thickness=thick?.0032:.0018;
  // Position against the cut edge, round underneath, then face back up inside.
  const profile=[[.003,offset],[.0008,offset+.00025],[0,offset],
    [0,offset-thickness*.55],[.0009,offset-thickness],[.003,offset-thickness-.0003],
    [thick?.009:.006,offset-thickness-.0003]];
  panel(parent,material,name,profile.length-1,columns,(v,u)=>{
    const [rise,radial]=profile[Math.round(v*(profile.length-1))],a=tau*u;
    return shifted(around(1-rise/span,a),a,radial);
  });
  // Twin needle sewing on the rib-to-shell join or the return of a plain hem.
  for(const below of [.0015,.0041]){
    stitches.line((u,side)=>{
      const a=tau*u,t=sewnAt+(below+side)/span;
      return shifted(around(t,a),a,offset+.0009);
    });
  }
}

export function addPocketFinish({panel,parent,material,thread,frontAt,outerX,sign}){
  const pocket=(v,back,lift)=>frontAt(lerp(.712,.91,v),outerX(v)-sign*back,lift);
  // The facing goes inside the opening; its raised outer lip wraps back onto
  // the patch. This thickness remains visible from an oblique viewing angle.
  const profile=[[-.0006,.0034],[-.0006,.0056],[.0005,.0070],[.0022,.0073],[.006,.0057]];
  panel(parent,material,'Pocket opening facing',18,profile.length-1,(v,u)=>{
    const [inset,lift]=profile[Math.round(u*(profile.length-1))];
    return pocket(v,inset,lift);
  });
  thread.line((v,side)=>pocket(v,.003+side,.0076),.0033);
  thread.line((v,side)=>pocket(v,.0073+side,.0054),.0033);
  // Small reinforcement stitches across each end of the pocket mouth.
  for(const v of [.014,.984]){
    for(let i=0;i<3;i++)thread.line((u,side)=>pocket(v+i*.003+side*4,lerp(.0003,.0075,u),.0078),.008);
  }
}

export function addZipHardware({panel,parent,frontAt,metal,bodyLength,stitches}){
  const teeth=new PatchBatch(),step=.0032;
  const n=Math.max(12,Math.floor(bodyLength*.974/step));
  // Each tooth joins the opposing half a pitch later. One mesh contains the
  // whole chain so the two-way closure costs one draw call at any zoom.
  for(let i=0;i<n;i++){
    for(const s of [-1,1]){
      const t=.012+(i+(s>0?.5:0))*.974/n;
      const p=frontAt(t,0,.0069),y=p[1],z=p[2];
      const x=p[0],w=.0022*s;
      teeth.quad([x+w,y+.0007,z],[x+w,y-.00085,z],[x+.00035*s,y-.0012,z+.00055],[x-.00018*s,y+.00012,z+.00055]);
    }
  }
  teeth.attach(parent,metal,'Interlocking zipper teeth');
  for(const s of [-1,1]){
    stitches.line((v,side)=>frontAt(lerp(.016,.988,v),s*(.0063+side),.0055),.0033);
  }
  function slider(t,direction,lower){
    const anchor=frontAt(t,0,.0078);
    const name=lower?'Lower zipper':'Zipper';
    panel(parent,metal,name+' slider',6,12,(v,u)=>{
      const a=tau*u,round=.70+.30*Math.sin(Math.PI*v);
      return [anchor[0]+Math.sin(a)*.0039*round,anchor[1]-direction*.009*v,anchor[2]+(.0018+.0016*Math.cos(a))*round];
    });
    const pullAt=(a,u)=>{
      const x=Math.sin(a)*(.0020+u*.0011);
      const down=.009+.0072-(.0061+.0011*u)*Math.cos(a);
      return [anchor[0]+x,anchor[1]-direction*down,anchor[2]+.0036+.0014*(1-Math.cos(a))+.00035*u];
    };
    panel(parent,metal,name+' pull',20,3,(v,u)=>pullAt(v*tau,u));
  }
  slider(.013,1,false);
  slider(.979,1,true);
}
