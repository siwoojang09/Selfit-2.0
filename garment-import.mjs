import {adidas,measurementFields} from './catalog-data.mjs?v=2026-11-27p';

const local=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const configured=document.querySelector('meta[name="selfit-garment-api"]')?.content.trim();
const backend=configured?.startsWith('https://')?configured.replace(/\/+$/,''):
  local&&location.protocol==='http:'?'http://'+location.hostname+':8787':'';
const benchmark='https://www.musinsa.com/products/5329359';
const benchmarkJob={id:'fixture',status:'review',product:{...adidas,url:benchmark},sizes:adidas.sizes,
  source:'Selfit KC9315 샘플',photos:['front'],notice:'저장된 상품 사진과 실측표로 피팅을 체험할 수 있습니다.'};
const realPhoto='assets/adidas-kc9315.glb';
const storageKey='selfit-garment-job';
function pendingJob(){
  try{return sessionStorage.getItem(storageKey);}catch{return null;}
}
function rememberJob(id){
  try{
    if(id)sessionStorage.setItem(storageKey,id);
    else sessionStorage.removeItem(storageKey);
  }catch{}
}
const maxBytes=12*1024*1024;
const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const limits={length:[33,99],shoulder:[28,96],chest:[32,94],sleeve:[7,85],hem:[30,95]};

function normalize(raw){
  let url;
  try{url=new URL(raw);}catch{throw Error('무신사 상품 링크를 입력해 주세요.');}
  const hosts=['www.musinsa.com','musinsa.com','m.musinsa.com'];
  const item=url.pathname.match(/^\/products\/([1-9][0-9]{0,11})\/?$/);
  if(url.protocol!=='https:'||!hosts.includes(url.host)||url.username||url.password||!item)
    throw Error('무신사 상품 상세 링크를 입력해 주세요.');
  return 'https://www.musinsa.com/products/'+item[1];
}
function endpoint(job,path=''){return backend+'/api/garment/jobs/'+encodeURIComponent(job.id)+path;}
async function request(url,signal,payload){
  const options=payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{};
  let response;
  try{response=await fetch(url,{...options,signal,cache:'no-store'});}
  catch(error){if(error.name==='AbortError')throw error;throw Error('3D 생성 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');}
  if(!response.ok){
    const trouble=await response.json().catch(()=>null);
    const error=Error(typeof trouble?.detail==='string'?trouble.detail:'상품을 처리하지 못했습니다. 다시 시도해 주세요.');
    error.status=response.status;
    throw error;
  }
  return response.json();
}
function pollDelay(signal){
  return new Promise(resolve=>{
    setTimeout(resolve,signal.aborted?0:800);
  });
}
async function photoContent(file){
  if(!file?.size)return '';
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>maxBytes)
    throw Error('JPG, PNG 또는 WebP 사진을 12MB 이하로 올려 주세요.');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(Error('상품 사진을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}
const photoUrl=(job,slot)=>job.id==='fixture'?adidas.photo:endpoint(job,'/photo/'+slot);
const assetUrl=job=>job.id==='fixture'?realPhoto:endpoint(job,'/asset');
const stateLabels={
  lookup_queued:'상품 정보 확인을 기다리는 중…',
  lookup_running:'상품 정보와 실측 확인 중…',
  build_queued:'3D 생성 대기 중…',
  build_running:'사진에서 원단을 분리하고 3D 패턴에 적용하는 중…'
};
const modelNote=job=>job.appearance?.view==='front_only'
  ?'정면 사진을 적용했습니다. 뒷면은 정면의 대표 색상으로 추정했습니다.'
  :job.appearance?.view==='front_back'?'정면과 뒷면 사진을 적용했습니다.':'KC9315의 기존 상품 3D 에셋을 사용했습니다.';

export function openGarmentImport({dialog,body,onManual,onSave}){
  const controller=new AbortController(),{signal}=controller;
  dialog.addEventListener('close',()=>{if(!dialog.open)controller.abort();},{once:true});
  const edit=markup=>{if(!signal.aborted)body.innerHTML=markup;};
  const error=(message)=>{body.querySelector('[data-error]').textContent=message;};
  function backToManual(){controller.abort();onManual();}
  const footerBack='<button class="secondary" type="button" data-manual>사진·실측으로 직접 등록</button>';
  const failure=err=>err.name!=='AbortError'&&!signal.aborted&&error(err.message);
  const wireManual=()=>{const button=body.querySelector('[data-manual]');if(button)button.onclick=backToManual;};

  function start(){
    edit('<form class="link-form"><p>무신사 후드 집업 링크를 입력하고 상품 사진과 실측을 확인해 주세요.</p>'+
      '<label class="field">상품 링크<input name="url" type="url" placeholder="'+benchmark+'" required></label>'+
      '<button type="button" class="textlink" data-example>adidas KC9315 샘플 링크 붙여넣기</button>'+
      (backend&&pendingJob()?'<p><button type="button" class="secondary" data-resume>지난 가져오기 이어서 확인</button></p>':'')+
      (!backend?'<p class="import-note">이 주소에서는 KC9315 샘플을 체험할 수 있습니다. 다른 링크의 자동 생성은 연결된 3D 생성 서버에서 지원합니다.</p>':'')+
      '<p class="form-error" role="alert" data-error></p><div class="form-footer">'+footerBack+
      '<button class="primary" type="submit">상품 확인</button></div></form>');
    wireManual();
    const form=body.querySelector('form');
    body.querySelector('[data-example]').onclick=()=>{form.elements.url.value=benchmark;form.elements.url.focus();};
    const resume=body.querySelector('[data-resume]');
    if(resume)resume.onclick=async()=>{
      resume.disabled=true;
      try{await wait(await request(endpoint({id:pendingJob()}),signal));}
      catch(err){
        if(err.status===404)rememberJob(null);
        if(!signal.aborted){start();failure(err);}
      }finally{resume.disabled=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('[type=submit]');
      if(button.disabled)return;
      button.disabled=true;
      error('');
      try{
        const url=normalize(form.elements.url.value);
        if(!backend){
          if(url!==benchmark)throw Error('이 주소에서 가져올 수 있는 상품은 KC9315 샘플입니다.');
          review(benchmarkJob);
        }else{
          const accepted=await request(backend+'/api/garment/jobs',signal,{url});
          rememberJob(accepted.id);
          await wait(accepted);
        }
      }catch(err){
        if(!signal.aborted){
          if(!button.isConnected)start();
          failure(err);
        }
      }finally{button.disabled=false;}
    };
  }

  async function wait(job,form){
    let attempt=0;
    if(!form)edit('<p role="status" class="import-progress"></p><p class="form-error" role="alert" data-error></p>');
    const progress=body.querySelector('.import-progress');
    while(stateLabels[job.status]&&!signal.aborted&&attempt++<450){
      progress.textContent=stateLabels[job.status];
      await pollDelay(signal);
      job=await request(endpoint(job),signal);
    }
    if(signal.aborted)return;
    if(job.status==='ready')ready(job);
    else if(form&&job.status==='needs_input'){progress.textContent='';error(job.notice||'입력한 자료를 확인해 주세요.');}
    else if(['review','needs_input'].includes(job.status))review(job);
    else{
      if(!stateLabels[job.status])rememberJob(null);
      start();
      error(job.notice||'작업을 마치지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
  }

  function review(job){
    const p=job.product;
    const assets=job.photos.map((slot,i)=>'<figure><img crossorigin="anonymous" src="'+html(photoUrl(job,slot+'.jpg'))+
      '" alt="상품 사진 '+(i+1)+'"><figcaption>사진 '+(i+1)+'</figcaption></figure>').join('');
    const options=(view)=>'<option value="">'+(view==='back'?'뒷면 없음':'사진 선택')+'</option>'+
      job.photos.map((slot,i)=>'<option value="'+html(slot)+'" '+(slot===view?'selected':'')+'>사진 '+(i+1)+'</option>').join('');
    const fixture=job.id==='fixture';
    edit('<form class="link-form"><p class="import-note">'+html(job.notice||'상품명과 실측표를 확인하고, 바닥에 펼친 정면 사진을 골라 주세요.')+'</p>'+
      (p.name?'<h3>'+html([p.brand,p.name,p.colourName].filter(Boolean).join(' · '))+'</h3>':
        '<div class="field-grid"><label class="field">상품명<input name="name" required maxlength="90"></label>'+
        '<label class="field">브랜드 (선택)<input name="brand" maxlength="45"></label>'+
        '<label class="field">품번 (선택)<input name="code" maxlength="45"></label>'+
        '<label class="field">색상 (선택)<input name="colourName" maxlength="45"></label></div>')+
      (!p.type?'<label class="import-confirm"><input type="checkbox" name="confirmZipHoodie" required> 후드 집업 상품입니다.</label>':'')+
      (assets?'<div class="import-photos">'+assets+'</div>':'')+
      (!fixture?'<div class="field-grid">'+['front','back'].map((view,i)=>{
        const label=i?'뒷면 (선택)':'정면';
        return '<label class="field">'+label+' 상품 사진<select name="'+view+'">'+options(view)+'</select></label>'+
          '<label class="field">'+label+' 직접 올리기<input type="file" name="'+view+
          'Upload" accept="image/jpeg,image/png,image/webp"></label>';
      }).join('')+'</div><p class="import-note">직접 올린 사진이 선택한 사진보다 우선합니다. 정면 한 장으로 진행하면 뒷면은 대표 색상으로 채웁니다.</p>':'')+
      '<h3 class="form-section">사이즈별 실측 (cm)</h3><div class="sample-rows"><div class="measurement-row labels">'+
      '<span>사이즈</span>'+measurementFields.map(([,name])=>'<span>'+name+'</span>').join('')+
      '<span></span></div><div data-rows></div></div>'+
      (!fixture?'<button type="button" class="secondary" data-add>＋ 사이즈 추가</button>':'')+
      '<p role="status" class="import-progress" aria-live="polite"></p><p class="form-error" role="alert" data-error></p><div class="form-footer"><button type="button" class="secondary" data-restart>다른 링크</button>'+
      '<button type="submit" class="primary">'+(fixture?'3D 샘플 확인':'3D 생성')+'</button></div></form>');
    const form=body.querySelector('form'),rows=body.querySelector('[data-rows]');
    const disabled=fixture?' disabled':'';
    function addRow(m={}){
      const row=document.createElement('div');row.className='measurement-row';
      row.innerHTML='<input aria-label="사이즈" name="label" maxlength="14" placeholder="M" value="'+html(m.label)+'" required'+disabled+'>'+
        measurementFields.map(([key,label])=>'<input type="number" aria-label="'+label+'" name="'+key+'" min="'+limits[key][0]+
        '" max="'+limits[key][1]+'" step="0.1" value="'+html(m[key])+'" placeholder="'+(key==='hem'?'선택':'cm')+'" '+
        (key==='hem'?'':'required')+disabled+'>').join('')+
        (!fixture?'<button type="button" aria-label="사이즈 삭제">×</button>':'<span></span>');
      if(!fixture)row.querySelector('button').onclick=()=>{if(rows.children.length>1)row.remove();};
      rows.append(row);
    }
    (job.sizes.length?job.sizes:[{}]).forEach(addRow);
    if(!fixture)body.querySelector('[data-add]').onclick=()=>{if(rows.children.length<20)addRow();};
    const restart=body.querySelector('[data-restart]');
    restart.onclick=()=>{rememberJob(null);start();};
    form.onsubmit=async event=>{
      event.preventDefault();
      if(fixture){ready({...job,status:'ready',thumbnail:'front.jpg',assetKind:'catalog',referenceSize:'M',
        appearance:{color:adidas.color,view:'catalog',segmentation:[]}});return;}
      const submit=form.querySelector('[type=submit]');
      if(submit.disabled)return;
      submit.disabled=restart.disabled=true;
      error('');
      try{
        const data=new FormData(form);
        const table=Array.from(rows.children,row=>Object.fromEntries(Array.from(row.querySelectorAll('input'),
          input=>[input.name,input.type==='number'?(input.value===''?null:Number(input.value)):input.value.trim()])));
        const [frontUpload,backUpload]=await Promise.all([photoContent(data.get('frontUpload')),photoContent(data.get('backUpload'))]);
        await wait(await request(endpoint(job,'/build'),signal,{
          name:data.get('name'),brand:data.get('brand'),code:data.get('code'),colourName:data.get('colourName'),
          confirmZipHoodie:data.has('confirmZipHoodie'),sizes:table,front:data.get('front'),back:data.get('back'),frontUpload,backUpload
        }),form);
      }catch(err){
        if(!signal.aborted){
          body.querySelector('.import-progress').textContent='';
          failure(err);
        }
      }finally{submit.disabled=restart.disabled=false;}
    };
  }

  function ready(job){
    edit('<div class="import-result"><img crossorigin="anonymous" src="'+html(photoUrl(job,job.thumbnail))+'" alt="등록할 후드 집업"><div><h3>'+
      html(job.product.name)+'</h3><p>'+html(job.referenceSize)+' 사이즈 기준 3D 모델 · '+html(job.source)+'</p>'+
      '<p>'+html(modelNote(job))+' 착용 위치와 주름은 실측과 체형을 바탕으로 계산한 추정치입니다.</p></div></div>'+
      '<p class="form-error" role="alert" data-error></p><div class="form-footer"><button class="secondary" type="button" data-restart>다른 링크</button>'+
      '<button class="primary" type="button" data-save>옷장에 저장하고 입혀보기</button></div>');
    body.querySelector('[data-restart]').onclick=()=>{rememberJob(null);start();};
    const button=body.querySelector('[data-save]');
    button.onclick=async()=>{
      if(button.disabled)return;
      button.disabled=true;
      error('');
      try{
        const response=await fetch(assetUrl(job),{signal});
        if(!response.ok)throw Error('3D 모델을 받지 못했습니다. 다시 시도해 주세요.');
        const asset=await response.blob();
        const header=await asset.slice(0,4).text();
        if(header!=='glTF')throw Error('3D 모델 형식을 확인할 수 없습니다.');
        const image=await fetch(photoUrl(job,job.thumbnail),{signal,cache:'no-store'});
        if(!image.ok)throw Error('상품 사진을 받지 못했습니다. 다시 시도해 주세요.');
        const thumb=await image.blob();
        const photo=await new Promise((resolve,reject)=>{
          const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(thumb);
        });
        if(signal.aborted)return;
        const p=job.product;
        await onSave({id:'import-'+crypto.randomUUID(),custom:true,created:Date.now(),name:p.name,brand:p.brand,
          code:p.code,type:'ziphoodie',category:'outer',color:job.appearance.color,colourName:p.colourName,
          material:'cotton',sizes:job.sizes,source:job.source,productUrl:p.url,photo,asset,
          assetKind:job.assetKind,appearance:job.appearance});
        rememberJob(null);
      }catch(err){failure(err);}
      finally{button.disabled=false;}
    };
  }
  start();
}
