export const measurementFields=[['length','총장'],['shoulder','어깨너비'],['chest','가슴단면'],['sleeve','소매길이'],['hem','밑단단면']];
export const pantsMeasurementFields=[['length','총장'],['waist','허리단면'],['hip','엉덩이단면'],['thigh','허벅지단면'],['rise','밑위'],['hem','밑단단면']];
export const garmentTypes={ziphoodie:'후드 집업',tee:'반소매 티셔츠',shirt:'긴소매 셔츠',polo:'폴로셔츠',sweatshirt:'스웨트셔츠',pants:'바지'};
const sizeRow=([label,length,shoulder,chest,sleeve,hem=null])=>({label,length,shoulder,chest,sleeve,hem});
export const adidas={id:'KC9315',code:'KC9315',brand:'adidas',name:'후드 집업',colourName:'블랙 / 크림화이트',color:'#1d1c20',type:'ziphoodie',category:'outer',photo:'catalog/hoodie.webp',material:'cotton',source:'무신사 상품 실측표',sizes:[
  ['2XS',58,58,54,56],['XS',60,60,56,57],['S',61.5,60.5,58.5,57.5],['M',62,62,60.5,58],['L',64,64,62.5,58.5],['XL',66,65,68,59],['2XL',68,65.5,69,59.5],['3XL',69,66,69.5,59.5],['4XL',70,66.5,70,60]
].map(sizeRow)};
export const denim={
  id:'washed-denim-medium-blue',code:'',brand:'',name:'데미지 워시드 데님 팬츠',colourName:'미디엄 블루',
  type:'pants',category:'bottom',color:'#596e74',photo:'catalog/washed-denim.webp',material:'denim',source:'제공하신 상품 실측표',
  sizes:[
    ['XS',102,34.5,53,38,35.5,26],['S',103.5,37,55,39,36.5,27],['M',105,39.5,57,40,37.5,28],
    ['L',106.5,42,59,41,38.5,29],['XL',108,44.5,61,42,39.5,30]
  ].map(([label,length,waist,hip,thigh,rise,hem])=>({label,length,waist,hip,thigh,rise,hem}))
};
const basics=[
 ['T01','코튼 크루넥 티셔츠','tee','tee','아이보리','#ede9d9',68,48,54,22],
 ['S02','옥스퍼드 셔츠','shirt','overshirt','파우더 블루','#abc0d0',73,48,56,61],
 ['P03','피케 폴로셔츠','polo','polo','세이지 그린','#8a987b',68,47,53,23],
 ['S04','크루넥 스웨트셔츠','sweatshirt','sweatshirt','헤더 그레이','#a6a5a2',67,54,59,59],
 ['T05','스트라이프 티셔츠','tee','stripe','네이비 / 아이보리','#243143',68,48,54,22]
];
export const builtins=[adidas,...basics.map(([code,name,type,file,colourName,color,length,shoulder,chest,sleeve])=>({
  id:code,code,brand:'Drape Studio',name,type,category:'top',photo:'catalog/'+file+'.webp',colourName,color,pattern:file==='stripe'?'stripes':'',material:'cotton',source:'스튜디오 샘플 예시 치수',
  sizes:[['S',-2],['M',0],['L',2]].map(([label,d])=>sizeRow([label,length+d,shoulder+d,chest+d,sleeve+d/2]))
})),denim];
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
