// Upper envelope of the rendered sole, upper and laces in foot-local metres.
// Rasterize only once; during gait the map follows the ankle's full transform.
const maps=new WeakMap();
const cell=.004, margin=.006;
function shoeMap(T,foot){
  if(maps.has(foot))return maps.get(foot);
  foot.updateWorldMatrix(true,true);
  const inverse=foot.matrixWorld.clone().invert();
  const triangles=[],bounds=new T.Box3();
  foot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const transform=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    const attr=mesh.geometry.attributes.position,index=mesh.geometry.index;
    const points=Array.from({length:attr.count},(_,v)=>{
      const p=new T.Vector3().fromBufferAttribute(attr,v).applyMatrix4(transform);
      bounds.expandByPoint(p);return p;
    });
    for(let i=0;i<(index?.count??attr.count);i+=3)
      triangles.push([0,1,2].map(k=>points[index?index.getX(i+k):i+k]));
  });
  const x0=bounds.min.x-3*cell,z0=bounds.min.z-3*cell;
  const width=Math.ceil((bounds.max.x-x0)/cell)+4,height=Math.ceil((bounds.max.z-z0)/cell)+4;
  const heights=new Float32Array(width*height).fill(bounds.min.y-margin);
  for(const [a,b,c] of triangles){
    const minX=Math.floor((Math.min(a.x,b.x,c.x)-x0)/cell)-1,maxX=Math.ceil((Math.max(a.x,b.x,c.x)-x0)/cell)+1;
    const minZ=Math.floor((Math.min(a.z,b.z,c.z)-z0)/cell)-1,maxZ=Math.ceil((Math.max(a.z,b.z,c.z)-z0)/cell)+1;
    const top=Math.max(a.y,b.y,c.y)+margin;
    for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++){
      const k=j*width+i;
      heights[k]=Math.max(heights[k],top);
    }
  }
  const map={x0,z0,width,height,heights};
  maps.set(foot,map);return map;
}
export function shoeContacts(T,body,garment){
  const point=new T.Vector3();
  return (body.parts?.limbs??[]).map(({ankle})=>{
    const foot=ankle.children[0],map=shoeMap(T,foot);
    const local=new T.Matrix4(),world=new T.Matrix4();
    let maxY=0;
    return {
      update(){
        garment.updateWorldMatrix(true,false);
        foot.updateWorldMatrix(true,false);
        local.copy(foot.matrixWorld).invert().multiply(garment.matrixWorld);
        world.copy(local).invert();
        // Conservative broad phase, including ankle pitch and garment scale.
        const e=world.elements;
        maxY=e[13]+Math.abs(e[1])*.07+Math.abs(e[5])*.04+Math.abs(e[9])*.19;
      },
      project(array,q){
        if(array[q+1]>maxY)return;
        point.fromArray(array,q).applyMatrix4(local);
        const u=(point.x-map.x0)/cell,v=(point.z-map.z0)/cell;
        if(u<0||v<0||u>=map.width-1||v>=map.height-1)return;
        const i=Math.floor(u),j=Math.floor(v),k=j*map.width+i;
        const h=map.heights,x=u-i,z=v-j;
        const top=(h[k]*(1-x)+h[k+1]*x)*(1-z)+(h[k+map.width]*(1-x)+h[k+map.width+1]*x)*z;
        if(point.y<top){point.y=top;point.applyMatrix4(world).toArray(array,q);}
      }
    };
  });
}
