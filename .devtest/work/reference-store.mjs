// Both the wardrobe and the fitting room use the same locally saved garment.
let connection;
function database(){
  if(!connection)connection=new Promise((resolve,reject)=>{
    const req=indexedDB.open('selfit-baselines',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('pieces',{keyPath:'id'});
    req.onsuccess=()=>{
      const db=req.result;
      db.onversionchange=()=>{db.close();connection=null;};
      resolve(db);
    };
    req.onerror=()=>reject(req.error);
  }).catch(error=>{connection=null;throw error;});
  return connection;
}
function requestValue(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
export async function listReferences(){
  const db=await database();
  return requestValue(db.transaction('pieces').objectStore('pieces').getAll());
}
export async function getReference(id){
  const db=await database();
  return requestValue(db.transaction('pieces').objectStore('pieces').get(id));
}
export async function saveReference(piece){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('pieces','readwrite');
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
    tx.objectStore('pieces').put(piece);
  });
}
