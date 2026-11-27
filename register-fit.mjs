import {builtins, garmentTypes, pantsMeasurementFields, readProductPhoto} from './catalog-data.mjs?v=2026-11-27g';

const topDimensions = [
  ['length','총장','어깨의 가장 높은 곳에서 밑단까지'],
  ['chest','가슴단면','양쪽 겨드랑이 아래를 수평으로'],
  ['shoulder','어깨너비','뒤쪽 좌우 어깨 봉제선 사이'],
  ['sleeve','소매길이','어깨 봉제선에서 소맷단까지']
];
const pantsHints={
  length:'허리밴드 위쪽부터 바깥 솔기를 따라 밑단까지',waist:'허리밴드를 평평하게 놓고 좌우 끝 사이',
  hip:'엉덩이의 가장 넓은 부분을 가로로',thigh:'가랑이 봉제선 바로 아래에서 한쪽 다리의 가로 폭',
  rise:'앞 허리밴드 위쪽부터 가랑이 봉제선까지',hem:'밑단에서 한쪽 바짓가랑이의 가로 폭'
};
const pantsDimensions=pantsMeasurementFields.map(([key,label])=>[key,label,pantsHints[key]]);
const pantsLabels={length:/총\s*장|기장|outseam|length/i,waist:/허\s*리\s*(?:단\s*면|너비)?|waist/i,
  hip:/엉\s*덩\s*이|힙\s*단면|hip/i,thigh:/허\s*벅\s*지|thigh/i,
  rise:/밑\s*위|앞\s*밑위|rise/i,hem:/밑\s*단|hem|leg\s*opening/i};
const labels = {length:/총장|기장|(?<!sleeve )length/i,chest:/가슴\s*단면|chest\s*width/i,shoulder:/어깨(?:\s*너비|넓이)?|shoulder/i,sleeve:/소매(?:\s*길이)?|sleeve/i,hem:/밑단|hem/i};
const normal = value => String(value??'').trim().toUpperCase();
const codeKey = value => normal(value).replace(/[\s-]/g,'');
const base = new URL('./vendor/ocr/',import.meta.url);
let engine;
function loadEngine(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!engine)engine=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('tesseract.min.js',base).href;
    script.onload=()=>resolve(window.Tesseract);
    script.onerror=()=>{script.remove();engine=null;reject(Error('OCR 엔진을 불러오지 못했습니다.'));};
    document.head.append(script);
  });
  return engine;
}

const sizePattern='(?:[2-5]X[LS]|X{1,3}[LS]|[SML]|FREE|ONE\\s*SIZE|[0-9]{2,3})';
export function readTag(text,items=builtins){
  const flat=codeKey(text), found=items.find(item=>item.code && flat.includes(codeKey(item.code)));
  const code=found?.code || text.match(/(?:품번|제품코드|style|art(?:icle)?)[\s.:#-]*([a-z0-9][a-z0-9-]{2,20})/i)?.[1]
    || text.match(/\b(?=[A-Z0-9-]*\d)[A-Z]{1,5}[-]?[0-9]{3,}[A-Z0-9-]*\b/i)?.[0];
  const brand=found?.brand||items.find(item=>item.brand && normal(text).includes(normal(item.brand)))?.brand
    ||text.match(/(?:브랜드|brand)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  const size=text.match(new RegExp('(?:SIZE|사이즈|호칭)\\s*[:：/-]?\\s*('+sizePattern+')(?=\\s|$|[/|,])','i'))?.[1]
    ||text.match(new RegExp('^\\s*('+sizePattern+')\\s*$','im'))?.[1];
  return {code:normal(code),brand:brand||'',size:normal(size)};
}

// Read only columns with identified flat-lay headings. Other numeric columns
// keep their place, preventing an unsupported measure from shifting the row.
export function readChart(text,label,type=''){
  if(!label)return null;
  const headings=type==='pants'?pantsLabels:labels;
  const lines=text.split(/\n/);
  const header=lines.find(line=>Object.values(headings).filter(re=>re.test(line)).length>=2);
  if(!header)return null;
  if(/둘레|circumference|인치|\binches?\b/i.test(header))return null;
  const ordered=Object.entries(headings).map(([key,regex])=>[key,header.search(regex)]).filter(([,i])=>i>=0).sort((a,b)=>a[1]-b[1]);
  for(const line of lines){
    const clean=line.replace(/[|│]/g,' ').trim().replace(/[–—−]/g,'-');
    const parts=clean.split(/\s+/);
    if(normal(parts.shift())!==normal(label)||parts.length!==ordered.length)continue;
    const values={};
    for(let i=0;i<parts.length;i++){
      if(parts[i]==='-')continue;
      const numeric=parts[i].replace(/(?<=\d),(?=\d)/,'.');
      // A cropped decimal at the right edge of a split chart is incomplete.
      if(i===parts.length-1 && /^\d+[.,]$/.test(numeric))continue;
      if(!/^\d+(\.\d+)?$/.test(numeric))return null;
      const n=Number(numeric);
      if(!(n>0 && n<=200))return null;
      values[ordered[i][0]]=n;
    }
    return values;
  }
  return null;
}

function drawGuide(canvas,pants){
  const c=canvas.getContext('2d');
  if(!c)return;
  c.fillStyle='#eff3eb';c.fillRect(0,0,430,215);
  c.beginPath();const outline=[[180,28],[148,37],[105,104],[131,119],[154,89],[154,184],[275,184],[275,89],[299,119],[327,104],[282,37],[250,28],[237,40],[194,40]];
  const shape=pants?[[157,26],[268,26],[279,70],[282,187],[230,187],[216,97],[199,187],[148,187],[146,70]]:outline;
  shape.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle='#fcfcf7';c.fill();c.strokeStyle='#a3aba0';c.lineWidth=2;c.stroke();
  c.font='bold 15px sans-serif';c.strokeStyle='#235d4b';c.fillStyle='#235d4b';
  const marks=pants?[[137,26,137,187,100,142,'총장'],[157,26,268,26,174,18,'허리단면'],[147,67,278,67,288,71,'엉덩이단면'],[147,101,215,101,148,122,'허벅지단면'],[216,29,216,95,220,87,'밑위'],[230,187,282,187,230,207,'밑단단면']]:
    [[168,36,168,181,120,160,'총장'],[155,100,274,100,192,123,'가슴단면'],[151,48,279,48,188,68,'어깨너비'],[282,43,321,104,326,80,'소매길이']];
  for(const [x,y,x2,y2,tx,ty,name] of marks){
    c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();for(const [cx,cy] of [[x,y],[x2,y2]]){c.beginPath();c.arc(cx,cy,3,0,Math.PI*2);c.fill();}c.fillText(name,tx,ty);
  }
}

export function openRegistration({legacy=[],onSave,mode='manual',initialItem=null}={}){
  const linkURL=new URL('./register-fit.css',import.meta.url).href;
  if(!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(el=>el.href===linkURL)){
    const link=document.createElement('link');link.rel='stylesheet';link.href=linkURL;document.head.append(link);
  }
  const catalog=[...legacy,...builtins];
  const d=document.createElement('dialog');d.className='selfit-register';d.setAttribute('aria-labelledby','register-fit-title');
  d.innerHTML=`
    <form class="rg-form">
      <header><div><h2 id="register-fit-title">잘 맞는 옷 등록</h2><p>자주 입는 상의나 바지를 추천 기준으로 저장하세요.</p></div><button type="button" class="rg-close" aria-label="닫기">×</button></header>
      <div class="rg-content">
        <section><h3>옷 정보</h3>
          <div class="rg-lookup"><label>옷장에서 불러오기<select name="existing"><option value="">내가 가진 옷 선택</option></select></label>
          <button type="button" data-action="tag" class="rg-soft">옷 택 촬영</button></div>
          <input type="file" name="tagFile" accept="image/*" capture="environment" hidden>
          <div data-photo="tag" hidden></div>
          <div class="rg-pair"><label>브랜드<input name="brand" placeholder="예: adidas" maxlength="60"></label>
          <label>품번<input name="code" placeholder="예: KC9315" maxlength="50"></label></div>
          <div class="rg-pair"><label>옷 이름<input name="name" placeholder="예: 자주 입는 후드 집업" maxlength="80" required></label>
          <label>종류<select name="type"></select></label></div>
          <div data-pants-look hidden><div class="rg-pair"><label>바지 색상<input name="pantsColor" type="color" value="#596e74"></label>
          <label>바지 소재<select name="pantsMaterial"><option value="denim">데님</option><option value="cotton">면</option><option value="linen">리넨</option></select></label></div>
          <label>옷장 사진 (선택)<input name="productFile" type="file" accept="image/jpeg,image/png,image/webp"></label><div data-photo="product" hidden></div></div>
          <div class="rg-pair"><label>내가 입는 사이즈<input name="size" list="rg-size-options" placeholder="예: M" maxlength="15" required><datalist id="rg-size-options"></datalist></label>
          <button type="button" data-action="lookup" class="rg-soft">품번으로 실측 찾기</button></div>
        </section>
        <section><div class="rg-section-head"><h3>내 사이즈 실측 <small>cm</small></h3><button type="button" data-action="chart" class="rg-text">사이즈표 사진 읽기</button></div>
          <input type="file" name="chartFile" accept="image/*" hidden>
          <div data-photo="chart" hidden></div>
          <div class="rg-measures"></div>
          <details><summary>측정 방법</summary><div class="rg-pair" data-top-methods>
            <label>총장 기준<select name="lengthMethod"><option value="high-shoulder">어깨 높은 점부터</option><option value="back-neck">뒷목 중심부터</option><option value="unknown">확인 필요</option></select></label>
            <label>소매 기준<select name="sleeveMethod"><option value="shoulder-seam">어깨 봉제선부터</option><option value="center-back">뒷목 중심부터</option><option value="unknown">확인 필요</option></select></label>
          </div><canvas width="430" height="215" aria-label="상의의 총장, 가슴단면, 어깨너비, 소매길이 측정 위치"></canvas><ul></ul></details>
        </section>
        <p class="rg-status" role="status" aria-live="polite"></p>
      </div>
      <footer><button class="rg-save" type="submit">기준 옷으로 저장</button></footer>
    </form>`;
  document.body.append(d);
  const form=d.querySelector('form'),field=key=>form.elements.namedItem(key),status=d.querySelector('.rg-status');
  const guide=d.querySelector('details ul'),measureBox=d.querySelector('.rg-measures');
  const canvas=d.querySelector('details canvas'),isPants=()=>field('type').value==='pants';
  const dimensions=()=>isPants()?pantsDimensions:topDimensions;
  function showDimensions(){
    guide.replaceChildren();measureBox.replaceChildren();
    d.querySelector('[data-top-methods]').hidden=isPants();
    d.querySelector('[data-pants-look]').hidden=!isPants();
    canvas.setAttribute('aria-label',isPants()?'바지 실측 위치':'상의 실측 위치');
    for(const [key,name,hint] of dimensions()){
      const label=document.createElement('label');label.textContent=name;
      const input=document.createElement('input');Object.assign(input,{name:key,type:'number',min:'.1',max:'200',step:'.1',placeholder:'cm'});
      input.required=isPants()||key==='length'||key==='chest';label.append(input);measureBox.append(label);
      const li=document.createElement('li');li.textContent=name+' · '+hint;guide.append(li);
    }
    if(d.querySelector('details').open)drawGuide(canvas,isPants());
  }
  for(const [type,name] of Object.entries(garmentTypes))field('type').add(new Option(name,type));
  for(const [i,item] of catalog.entries())field('existing').add(new Option([item.brand,item.name,item.code].filter(Boolean).join(' · '),String(i)));
  let match=null,photo=null,charts=[],task=0,runningWorker=null,closed=false,saving=false,photoRevision=0;
  showDimensions();
  const productPreview=d.querySelector('[data-photo="product"]');
  function showPhoto(url){
    photo=url||null;productPreview.replaceChildren();productPreview.hidden=!isPants()||!photo;
    if(!productPreview.hidden){const img=new Image();img.src=photo;img.alt='옷장에 표시할 바지 사진';productPreview.append(img);}
  }
  field('productFile').onchange=async()=>{
    const file=field('productFile').files[0],revision=++photoRevision;
    if(!file)return;
    try{const url=await readProductPhoto(file);if(revision===photoRevision&&!closed){showPhoto(url);displayInfo('옷장 사진을 추가했습니다.');}}
    catch(e){if(revision===photoRevision&&!closed)displayInfo(e.message);}
  };
  function displayInfo(s){status.textContent=s;}
  function writeRow(row){
    for(const [key] of dimensions())field(key).value=row?.[key]??'';
  }
  function setMethods(methods={}){
    field('lengthMethod').value=methods.length||'high-shoulder';
    field('sleeveMethod').value=methods.sleeve||'shoulder-seam';
  }
  function readSelectedSize(){
    if(!match)return false;
    const row=match.sizes?.find(r=>normal(r.label)===normal(field('size').value));
    writeRow(row);setMethods({...match.methods,...row?.methods});
    displayInfo(row?'선택한 사이즈의 실측을 불러왔습니다. 저장 전에 확인해 주세요.':'이 사이즈의 실측이 필요합니다. 사이즈표를 읽거나 직접 입력해 주세요.');
    return Boolean(row);
  }
  function useItem(item,label){
    match=item;photoRevision++;charts=[];
    d.querySelector('[data-photo="chart"]').hidden=true;
    for(const key of ['brand','name','type','code'])field(key).value=item[key]||'';
    showDimensions();showPhoto(item.photo);
    if(isPants()){
      field('pantsColor').value=item.color||'#596e74';
      field('pantsMaterial').value=item.material||'denim';
    }
    field('existing').value=String(catalog.indexOf(item));
    const datalist=d.querySelector('datalist');datalist.replaceChildren();
    for(const row of item.sizes||[])datalist.append(new Option(row.label,row.label));
    field('size').value=label||((item.sizes||[]).find(r=>r.label==='M')||item.sizes?.[0])?.label||'';
    readSelectedSize();
  }
  function lookup(){
    const code=codeKey(field('code').value),item=code && catalog.find(x=>x.code&&codeKey(x.code)===code);
    if(item){useItem(item,field('size').value.trim());return true;}
    displayInfo('일치하는 품번이 없습니다. 옷 정보와 실측을 입력해 주세요.');return false;
  }
  function dropMatch(){
    if(!match)return;
    match=null;photoRevision++;showPhoto(null);field('existing').value='';d.querySelector('datalist').replaceChildren();writeRow(null);
  }
  field('existing').onchange=()=>{stopTask();if(field('existing').value!=='')useItem(catalog[Number(field('existing').value)],'');else dropMatch();};
  field('code').addEventListener('input',dropMatch);
  field('type').addEventListener('change',()=>{
    // The old inputs may describe another kind of garment.
    match=null;charts=[];photoRevision++;showPhoto(null);field('existing').value='';
    d.querySelector('datalist').replaceChildren();d.querySelector('[data-photo="chart"]').hidden=true;
    stopTask();showDimensions();setMethods();
  });
  function chartRow(texts){
    let found=false;
    for(const raw of texts){
      const values=readChart(raw,field('size').value,field('type').value);
      if(!values)continue;
      for(const [key] of dimensions()){
        if(values[key]!=null){field(key).value=values[key];found=true;}
      }
    }
    if(found)displayInfo('읽은 항목을 채웠습니다. 표가 나뉘어 있으면 다음 사진도 추가해 주세요.');
    return found;
  }
  field('size').addEventListener('change',()=>{if(charts.length)writeRow(null);readSelectedSize();chartRow(charts);});
  d.querySelector('[data-action="lookup"]').onclick=lookup;
  d.querySelector('.rg-close').onclick=()=>d.close();
  function stopTask(){
    task++;
    if(runningWorker){runningWorker.terminate();runningWorker=null;}
  }
  d.addEventListener('close',()=>{closed=true;stopTask();d.remove();},{once:true});
  d.querySelector('details').addEventListener('toggle',()=>{if(d.querySelector('details').open)drawGuide(canvas,isPants());});
  for(const kind of ['tag','chart']){
    const file=field(kind+'File'),preview=d.querySelector('[data-photo="'+kind+'"]');
    d.querySelector('[data-action="'+kind+'"]').onclick=()=>file.click();
    file.onchange=async()=>{
      const source=file.files[0];if(!source)return;
      stopTask();const revision=task;file.value='';
      try{
        const data=await readProductPhoto(source);
        if(revision!==task)return;
        const img=new Image();img.src=data;img.alt=kind==='tag'?'촬영한 옷 택':'첨부한 사이즈표';preview.replaceChildren(img);preview.hidden=false;
        displayInfo('사진 속 글자를 이 기기에서 읽는 중입니다.');
        const tesseract=await loadEngine();if(revision!==task)return;
        const worker=await tesseract.createWorker('eng+kor',1,{
          workerPath:new URL('worker.min.js',base).href,workerBlobURL:false,
          corePath:new URL('tesseract-core-lstm.wasm.js',base).href,langPath:base.href,
          logger:m=>{if(m.status==='recognizing text'&&revision===task)displayInfo('사진 속 글자를 읽는 중 · '+Math.round(m.progress*100)+'%');}
        });
        if(revision!==task){await worker.terminate();return;}
        runningWorker=worker;
        const {data:result}=await worker.recognize(data);if(revision!==task)return;
        if(kind==='tag'){
          const tag=readTag(result.text,catalog);
          const item=catalog.find(x=>tag.code&&x.code&&codeKey(x.code)===codeKey(tag.code));
          if(item){
            useItem(item,tag.size);
            if(!tag.size){field('size').value='';writeRow(null);}
          }
          else {
            dropMatch();
            if(tag.brand)field('brand').value=tag.brand;
            if(tag.code)field('code').value=tag.code;
            if(tag.size)field('size').value=tag.size;
          }
          displayInfo('택 사진과 비교해 브랜드, 품번, 내 사이즈를 확인해 주세요.');
        }else{
          charts.push(result.text);
          if(!chartRow([result.text]))displayInfo('내 사이즈와 표의 측정 항목을 확인해 주세요. 사진을 보며 직접 입력할 수 있습니다.');
        }
      }catch(error){if(!closed&&revision===task)displayInfo(error.message.includes('사진')?error.message:'글자를 읽기 어렵습니다. 사진을 보며 직접 입력하거나 다시 촬영해 주세요.');}
      finally{if(revision===task && runningWorker){await runningWorker.terminate();runningWorker=null;}}
    };
  }
  form.onsubmit=async e=>{
    e.preventDefault();if(saving)return;
    const name=field('name').value.trim(),sizeLabel=field('size').value.trim();
    if(!name||!sizeLabel){displayInfo('옷 이름과 사이즈를 입력해 주세요.');return;}
    saving=true;stopTask();
    const save=d.querySelector('.rg-save');save.disabled=true;
    const size={label:normal(sizeLabel)};
    for(const [key] of dimensions())size[key]=field(key).value===''?null:Number(field(key).value);
    if(isPants() && size.rise>=size.length){displayInfo('밑위가 총장보다 짧은지 확인해 주세요.');saving=false;save.disabled=false;return;}
    const methods={...match?.methods,...match?.sizes?.find(r=>normal(r.label)===size.label)?.methods};
    if(!isPants()){methods.length=field('lengthMethod').value;methods.sleeve=field('sleeveMethod').value;}
    const item={id:crypto.randomUUID(),name,brand:field('brand').value.trim(),code:normal(field('code').value),type:field('type').value,photo,size,methods};
    if(match)item.sourceId=match.id;
    if(isPants()){item.color=field('pantsColor').value;item.material=field('pantsMaterial').value;}
    try{await onSave(item);d.close();}
    catch{displayInfo('기준 옷을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.');}
    finally{saving=false;save.disabled=false;}
  };
  if(initialItem)useItem(initialItem,'');
  d.showModal();
  if(mode==='tag')field('tagFile').click();
}
