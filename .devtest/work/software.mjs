import * as THREE from './vendor/three.module.js';

// Keep decoded texture pixels and filtered mip levels beside their source image.
const imageCache = new WeakMap();
function texturePixels(texture) {
  const image = texture?.image;
  if (!image) return null;
  const cached = imageCache.get(image);
  if (cached && cached.version === texture.version) return cached;
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  if (!w || !h || image.complete === false) return null;
  const levels = [];
  let source = image;
  let width = w, height = h;
  do {
    const tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;
    const ctx = tile.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(source, 0, 0, width, height);
    const bytes = ctx.getImageData(0, 0, width, height).data;
    levels.push({width, height, rgba:new Uint32Array(bytes.buffer, bytes.byteOffset, width * height)});
    if (width === 1 && height === 1) break;
    source = tile;
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
  } while (true);
  const result = {width:w, height:h, levels, version:texture.version};
  imageCache.set(image, result);
  return result;
}

function wrap(value, mode) {
  if (mode === THREE.RepeatWrapping) return value - Math.floor(value);
  if (mode === THREE.MirroredRepeatWrapping) {
    const tile = Math.floor(value);
    return (tile & 1) ? 1 - (value - tile) : value - tile;
  }
  return Math.min(1, Math.max(0, value));
}

function texel(texture, level, u, v) {
  u = wrap(u, texture.wrapS);
  v = wrap(v, texture.wrapT);
  if (texture.flipY) v = 1 - v;
  const x = Math.min(level.width - 1, Math.floor(u * level.width));
  const y = Math.min(level.height - 1, Math.floor(v * level.height));
  return level.rgba[y * level.width + x];
}

const stride = 10;
function encodeUvs(buffer, j, attr, i, texture, iw) {
  const u = attr.getX(i), v = attr.getY(i), m = texture.matrix.elements;
  buffer[j] = (m[0] * u + m[3] * v + m[6]) * iw;
  buffer[j + 1] = (m[1] * u + m[4] * v + m[7]) * iw;
}

function mipForTriangle(image, verts, a, b, c, offset, denominator) {
  const au = verts[a + offset] / verts[a + 4], av = verts[a + offset + 1] / verts[a + 4];
  const du1 = (verts[b + offset] / verts[b + 4] - au) * image.width;
  const dv1 = (verts[b + offset + 1] / verts[b + 4] - av) * image.height;
  const du2 = (verts[c + offset] / verts[c + 4] - au) * image.width;
  const dv2 = (verts[c + offset + 1] / verts[c + 4] - av) * image.height;
  const dx1 = verts[b] - verts[a], dx2 = verts[c] - verts[a];
  const dy1 = verts[b + 1] - verts[a + 1], dy2 = verts[c + 1] - verts[a + 1];
  const span = Math.max(
    Math.abs(dy2 * du1 - dy1 * du2), Math.abs(dy2 * dv1 - dy1 * dv2),
    Math.abs(dx1 * du2 - dx2 * du1), Math.abs(dx1 * dv2 - dx2 * dv1)
  ) / Math.abs(denominator);
  const level = Math.floor(Math.log2(Math.max(1, span)));
  return image.levels[Math.min(level, image.levels.length - 1)];
}

// The same posed meshes and solver also run on browsers without a GPU context.
export function createSoftwareRenderer() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {alpha:false});
  const projection = new THREE.Matrix4(), view = new THREE.Matrix4();
  const normals = new THREE.Matrix3(), vector = new THREE.Vector3(), color = new THREE.Color();
  const projected = new WeakMap();
  let width=1, height=1, depth, pixels;
  function setSize(w,h) {
    const ratio = Math.min(1, 960 / Math.max(w,h));
    width = canvas.width = Math.max(1, Math.round(w * ratio));
    height = canvas.height = Math.max(1, Math.round(h * ratio));
    depth = new Float32Array(width * height);
  }
  function render(scene, camera) {
    scene.updateMatrixWorld(true);
    view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const ground = ctx.createLinearGradient(0,0,0,height);
    const study=Boolean(scene.userData.bodyStudy);
    ground.addColorStop(0,study?'#e5e7e4':'#ece9e4');
    ground.addColorStop(.6,study?'#d5d9d6':'#e7e3de');
    ground.addColorStop(1,study?'#c3c8c4':'#d5d0c8');
    ctx.fillStyle=ground;
    ctx.fillRect(0,0,width,height);
    const screen = (x,y,z) => {
      vector.set(x,y,z).applyMatrix4(view);
      return [(vector.x + 1) * width/2,(1-vector.y)*height/2,vector.z];
    };
    if(scene.children.some(o=>o.isLineSegments && o.visible)) {
      ctx.strokeStyle='rgba(125,117,105,.16)';
      ctx.lineWidth=.65;
      ctx.beginPath();
      for(let i=-6; i<=6; i+=.25) {
        for(let axis=0;axis<2;axis++) {
          let linked=false;
          for(let t=-6;t<=6;t+=.2) {
            const [x,y,z]=axis ? screen(t,0,i) : screen(i,0,t);
            if(z<0||z>1||x< -width||x>2*width||y>2*height) {linked=false;continue;}
            if(linked) ctx.lineTo(x,y); else ctx.moveTo(x,y);
            linked=true;
          }
        }
      }
      ctx.stroke();
    }
    const [sx,sy]=screen(0,.001,0), [edge]=screen(.4,0,0);
    const radius=Math.max(width*.045,Math.abs(sx-edge));
    ctx.save();
    ctx.translate(sx,sy);ctx.scale(1,.22);
    const shadow=ctx.createRadialGradient(0,0,0,0,0,radius);
    shadow.addColorStop(0,'rgba(72,63,52,.32)');shadow.addColorStop(1,'rgba(72,63,52,0)');
    ctx.fillStyle=shadow;ctx.fillRect(-radius,-radius,2*radius,2*radius);ctx.restore();
    const image=ctx.getImageData(0,0,width,height);
    pixels=image.data;
    depth.fill(Infinity);

    scene.traverseVisible(object=>{
      if(!object.isMesh || object.userData.floor || !camera.layers.test(object.layers)) return;
      // The gradient contact shadow above accounts for the scene's floor shadow plane.
      if (object.material.transparent && !object.material.depthWrite && object.geometry.type === 'PlaneGeometry') return;
      const geom=object.geometry, pos=geom.attributes.position, norm=geom.attributes.normal;
      const mat=Array.isArray(object.material)?object.material[0]:object.material;
      const map = mat.map;
      const uv = geom.attributes.uv;
      const diffuse = uv ? texturePixels(map) : null;
      const reference = mat.userData.referenceMap;
      const refUv = geom.attributes.referenceUv, weight = geom.attributes.referenceWeight;
      const photo = refUv && weight ? texturePixels(reference) : null;
      if (diffuse && map.matrixAutoUpdate) map.updateMatrix();
      if (photo && reference.matrixAutoUpdate) reference.updateMatrix();
      projection.multiplyMatrices(view,object.matrixWorld);
      normals.getNormalMatrix(object.matrixWorld);
      const transform=projection.elements, n=normals.elements;
      let verts=projected.get(geom);
      if(!verts||verts.length!==pos.count*stride){verts=new Float32Array(pos.count*stride);projected.set(geom,verts);}
      for(let i=0; i<pos.count;i++) {
        const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),j=stride*i;
        const iw=1/(transform[3]*x+transform[7]*y+transform[11]*z+transform[15]);
        verts[j]=((transform[0]*x+transform[4]*y+transform[8]*z+transform[12])*iw+1)*width*.5;
        verts[j+1]=(1-(transform[1]*x+transform[5]*y+transform[9]*z+transform[13])*iw)*height*.5;
        verts[j+2]=(transform[2]*x+transform[6]*y+transform[10]*z+transform[14])*iw;
        verts[j+4]=iw;
        if (diffuse) encodeUvs(verts,j+5,uv,i,map,iw);
        if (photo) {
          encodeUvs(verts,j+7,refUv,i,reference,iw);
          verts[j+9] = weight.getX(i) * iw;
        }
        const a=norm.getX(i),b=norm.getY(i),c=norm.getZ(i);
        const nx=n[0]*a+n[3]*b+n[6]*c,ny=n[1]*a+n[4]*b+n[7]*c,nz=n[2]*a+n[5]*b+n[8]*c;
        const inv=1/(Math.hypot(nx,ny,nz)||1);
        const light=Math.max(0,(-.41*nx+.68*ny+.59*nz)*inv);
        const rimLight=Math.max(0,(.6*nx+.5*ny-.62*nz)*inv);
        verts[j+3]=mat.userData.clay ? .53+.47*light+.12*rimLight+.04*ny*inv : .69+.34*light+.08*rimLight;
      }
      mat.color.getRGB(color,THREE.SRGBColorSpace);
      const rr=color.r*255,gg=color.g*255,bb=color.b*255;
      const referenceBase = mat.userData.referenceBase;
      if (referenceBase?.isColor) referenceBase.getRGB(color, THREE.SRGBColorSpace);
      else color.setRGB(1,1,1);
      const rTint = rr / Math.max(1,color.r * 255), gTint = gg / Math.max(1,color.g * 255), bTint = bb / Math.max(1,color.b * 255);
      const faces=geom.index?.array;
      for(let k=0,end=faces?.length||pos.count;k<end;k+=3) {
        const a=stride*(faces?faces[k]:k),b=stride*(faces?faces[k+1]:k+1),c=stride*(faces?faces[k+2]:k+2);
        const ax=verts[a],ay=verts[a+1], bx=verts[b],by=verts[b+1],cx=verts[c],cy=verts[c+1];
        const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
        if(Math.abs(denominator)<.005||(denominator>0 && mat.side===THREE.FrontSide)) continue;
        const minX=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),maxX=Math.min(width-1,Math.floor(Math.max(ax,bx,cx)-.5));
        const minY=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),maxY=Math.min(height-1,Math.floor(Math.max(ay,by,cy)-.5));
        if (maxX<minX || maxY<minY) continue;
        const diffuseMip = diffuse && mipForTriangle(diffuse,verts,a,b,c,5,denominator);
        const photoMip = photo && (verts[a+9] || verts[b+9] || verts[c+9]) && mipForTriangle(photo,verts,a,b,c,7,denominator);
        for(let y=minY;y<=maxY;y++) {
          const root=(cx-bx)*(y+.5-cy),tail=(ax-cx)*(y+.5-cy);
          for(let x=minX;x<=maxX;x++) {
            const w=((by-cy)*(x+.5-cx)+root)/denominator;
            const v=((cy-ay)*(x+.5-cx)+tail)/denominator;
            const u=1-w-v;
            if(w<0||v<0||u<0) continue;
            const idx=y*width+x,z=w*verts[a+2]+v*verts[b+2]+u*verts[c+2];
            if(z>=depth[idx]) continue;
            const shade = w*verts[a+3]+v*verts[b+3]+u*verts[c+3];
            let red = rr*shade, green = gg*shade, blue = bb*shade;
            let alpha = mat.opacity ?? 1;
            if (diffuseMip || photoMip) {
              const reciprocal = 1/(w*verts[a+4]+v*verts[b+4]+u*verts[c+4]);
              const pw=w*reciprocal, pv=v*reciprocal, pu=u*reciprocal;
              if (diffuseMip) {
                const rgba=texel(map,diffuseMip,pw*verts[a+5]+pv*verts[b+5]+pu*verts[c+5],pw*verts[a+6]+pv*verts[b+6]+pu*verts[c+6]);
                red *= (rgba & 255)/255;
                green *= ((rgba >>> 8) & 255)/255;
                blue *= ((rgba >>> 16) & 255)/255;
                alpha *= (rgba >>> 24)/255;
              }
              if (photoMip) {
                const mix = Math.min(1, Math.max(0,pw*verts[a+9]+pv*verts[b+9]+pu*verts[c+9]));
                if (mix > 0) {
                  const rgba=texel(reference,photoMip,pw*verts[a+7]+pv*verts[b+7]+pu*verts[c+7],pw*verts[a+8]+pv*verts[b+8]+pu*verts[c+8]);
                  const coverage = mix * (rgba >>> 24)/255;
                  red += coverage * (rTint*(rgba & 255)-red);
                  green += coverage * (gTint*((rgba >>> 8)&255)-green);
                  blue += coverage * (bTint*((rgba >>> 16)&255)-blue);
                }
              }
            }
            if (alpha <= 0 || alpha < mat.alphaTest) continue;
            const p = idx*4;
            if (mat.wireframe && Math.min(w,v,u)<.13) { red*=.54; green*=.54; blue*=.54; }
            if (mat.transparent && alpha<1) {
              red += (pixels[p]-red)*(1-alpha);
              green += (pixels[p+1]-green)*(1-alpha);
              blue += (pixels[p+2]-blue)*(1-alpha);
            }
            if (mat.depthWrite) depth[idx]=z;
            pixels[p]=red;pixels[p+1]=green;pixels[p+2]=blue;
          }
        }
      }
    });
    ctx.putImageData(image,0,0);
  }
  return {domElement:canvas,setSize,render};
}
