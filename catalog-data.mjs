export const measurementFields=[['length','총장'],['shoulder','어깨너비'],['chest','가슴단면'],['sleeve','소매길이'],['hem','밑단단면']];
export const pantsMeasurementFields=[['length','총장'],['waist','허리단면'],['hip','엉덩이단면'],['thigh','허벅지단면'],['rise','밑위'],['hem','밑단단면']];
export const garmentTypes={ziphoodie:'후드 집업',hoodie:'후드티',halfzip:'하프집업 니트',tee:'반소매 티셔츠',shirt:'긴소매 셔츠',polo:'폴로셔츠',sweatshirt:'스웨트셔츠',puffer:'다운 패딩',workjacket:'후드 워크 자켓',pants:'바지'};
const sizeRow=([label,length,shoulder,chest,sleeve,hem=null])=>({label,length,shoulder,chest,sleeve,hem});
export const adidas={id:'KC9315',code:'KC9315',brand:'adidas',name:'후드 집업',colourName:'블랙 / 크림화이트',color:'#1d1c20',type:'ziphoodie',category:'outer',photo:'catalog/hoodie.webp',material:'cotton',source:'무신사 상품 실측표',sizes:[
  ['2XS',58,58,54,56],['XS',60,60,56,57],['S',61.5,60.5,58.5,57.5],['M',62,62,60.5,58],['L',64,64,62.5,58.5],['XL',66,65,68,59],['2XL',68,65.5,69,59.5],['3XL',69,66,69.5,59.5],['4XL',70,66.5,70,60]
].map(sizeRow)};
// A black glossy short puffer. Brand and size chart are placeholders until the
// owner sends the label's own numbers: it is cut on a standard Korean short
// puffer's run (M-L-XL).
export const glossyPuffer={
  id:'glossy-hooded-puffer',code:'',brand:'DRAPE STUDIO',name:'글로시 후드 다운 패딩',colourName:'블랙',
  type:'puffer',category:'outer',color:'#0b0b0d',photo:'catalog/glossy-hooded-puffer.webp',material:'cotton',
  source:'표준 숏패딩 실측표(임시)',
  sizes:[
    ['M',67,52,63,61,58],['L',69,53,66,62,60],['XL',71,54,69,63,62]
  ].map(sizeRow)
};
// MOOD INSIDE's VTG washed hood jacket: heavy duck canvas, pigment washed black,
// cropped and boxy over a dropped shoulder, one pouch pocket with a square label
// patch, a two-way zip and black ribbed cuffs and hem. The shop lists M only
// (L and XL are sold out), so L/XL follow M's run proportionally and the hem is
// taken at 0.85 of the chest, the ratio the flat lay shows.
export const moodJacket={
  id:'mood-inside-vtg-hood-jacket',code:'4399019',brand:'MOOD INSIDE',name:'VTG 워시드 후드 자켓',colourName:'워시드 블랙',
  type:'workjacket',category:'outer',color:'#2b2c30',photo:'catalog/mood-inside-vtg-hood-jacket.webp',material:'cotton',
  source:'무신사 실측표(M) · L/XL 비례 산출 · 밑단 추정',
  sizes:[
    ['M',65,59.5,74,63,62.9],['L',67,61.5,76.5,64.5,65.0],['XL',69,63.5,79,66,67.2]
  ].map(sizeRow)
};
export const denim={
  id:'washed-denim-medium-blue',code:'',brand:'',name:'데미지 워시드 데님 팬츠',colourName:'미디엄 블루',
  type:'pants',category:'bottom',color:'#596e74',photo:'catalog/washed-denim.webp',material:'denim',source:'제공하신 상품 실측표',
  sizes:[
    ['XS',102,34.5,53,38,35.5,26],['S',103.5,37,55,39,36.5,27],['M',105,39.5,57,40,37.5,28],
    ['L',106.5,42,59,41,38.5,29],['XL',108,44.5,61,42,39.5,30]
  ].map(([label,length,waist,hip,thigh,rise,hem])=>({label,length,waist,hip,thigh,rise,hem}))
};
export const chino={
  id:'signature-wide-chino',code:'',brand:'SIGNATURE',name:'와이드 치노 팬츠',colourName:'베이지 / 카키',
  type:'pants',category:'bottom',color:'#c3b696',photo:'catalog/signature-wide-chino.webp',material:'cotton',source:'제공하신 상품 실측표',
  sizes:[
    ['S',106,36.5,53,37,35,25],['M',107,39,55,39.5,36,26],
    ['L',108,41.5,57,41,37,27],['XL',109,44,59,42.5,38,28]
  ].map(([label,length,waist,hip,thigh,rise,hem])=>({label,length,waist,hip,thigh,rise,hem}))
};
export const nikeTee={
  id:'nike-sport-tee-white',code:'',brand:'NIKE',name:'스포츠 반소매 티셔츠',colourName:'화이트',
  type:'tee',category:'top',color:'#f4f4f2',photo:'catalog/nike-sport-tee-white.webp',material:'cotton',source:'제공하신 상품 실측표',
  sizes:[
    ['S',71,43,48,22.5,null],['M',71.5,43.5,50,22.5,48],['L',72,44,52,23,51],
    ['XL',72.5,45,55,23.5,54],['2XL',73,46,58,23.5,57]
  ].map(sizeRow)
};
export const underoffHoodie={
  id:'underoff-university-hoodie',code:'',brand:'UNDEROFF',name:'유니버시티 1992 후드티',colourName:'버건디',
  type:'hoodie',category:'top',color:'#5b2029',photo:'catalog/underoff-university-hoodie.webp',material:'cotton',source:'제공하신 상품 실측표',
  sizes:[
    ['S',62,61,61,48,null],['M',65,64,63,50,null],['L',69,66,65,53,null],['XL',73,68,68,54,null]
  ].map(sizeRow)
};
export const poloCable={
  id:'polo-cable-halfzip',code:'',brand:'POLO RALPH LAUREN',name:'케이블 하프집업 니트',colourName:'블랙',
  type:'halfzip',category:'top',color:'#141416',photo:'catalog/polo-cable-halfzip.webp',material:'cotton',source:'제공하신 상품 실측표',
  sizes:[
    ['XS',65,40,47,61.5,null],['S',66,41.5,49.5,63,null],['M',67.5,42.5,52,64,null],
    ['L',69,44.5,56,65.5,null],['XL',71,46.5,59.75,66.5,null],['XXL',73,48.5,63.5,68,null]
  ].map(sizeRow)
};
export const trillionOxford={
  id:'trillion-striped-oxford',code:'',brand:'TRILLION',name:'스트라이프 옥스포드 셔츠',colourName:'블랙 / 화이트',
  type:'shirt',category:'top',color:'#b9bab4',photo:'catalog/trillion-striped-oxford.webp',material:'cotton',source:'제공하신 상품 실측표',
  sizes:[
    ['M',67,53,62,60,null],['L',69,55,64,61,null],['XL',71,57,66,62,null]
  ].map(sizeRow)
};
// Only the garments the owner actually has: the studio's drawn samples are not
// products, and a wardrobe of stand-ins makes the fitting room look emptier than
// it is. The mannequin and the studio crew remain as the body it is fitted on.
export const builtins=[adidas,glossyPuffer,moodJacket,nikeTee,underoffHoodie,poloCable,trillionOxford,chino,denim];
let connection;
function openStore(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
    const req=indexedDB.open('drape-sample-wardrobe',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('samples',{keyPath:'id'});};
    req.onerror=()=>{connection=null;reject(req.error);};
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
  });
  return connection;
}
export async function listSamples(){
  const db=await openStore();
  return new Promise((resolve,reject)=>{
    const req=db.transaction('samples').objectStore('samples').getAll();
    req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.created-a.created));
    req.onerror=()=>reject(req.error);
  });
}
export async function saveSample(sample){
  const db=await openStore();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('samples','readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
    tx.objectStore('samples').add(sample);
  });
}
export async function removeSample(id){
  const db=await openStore();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('samples','readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
    tx.objectStore('samples').delete(id);
  });
}
export async function readProductPhoto(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPG, PNG 또는 WebP 상품 사진을 선택해 주세요.');
  if(file.size>12*1024*1024)throw Error('12MB 이하의 상품 사진을 선택해 주세요.');
  const url=URL.createObjectURL(file);
  try{
    const photo=new Image();photo.src=url;await photo.decode();
    const ratio=Math.min(1,1200/Math.max(photo.naturalWidth,photo.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(photo.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(photo.naturalHeight*ratio));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f1f0eb';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(photo,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/webp',.91);
  }catch{throw Error('사진을 읽지 못했습니다. 다른 이미지 파일을 선택해 주세요.');}
  finally{URL.revokeObjectURL(url);}
}
