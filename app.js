import {openGarmentImport} from './garment-import.mjs?v=2026-11-27m';
import {products as feedProducts} from './fit-matches.mjs?v=2026-11-27m';
import {pantsFit} from './pants-fit.mjs?v=2026-11-27m';
import {getReference,listReferences} from './reference-store.mjs?v=2026-11-27m';
import {wearer,hoodieFit} from './hoodie-fit.mjs?v=2026-11-27m';
import {adidas,builtins,measurementFields,pantsMeasurementFields,garmentTypes,listSamples,saveSample,removeSample,readProductPhoto} from './catalog-data.mjs?v=2026-11-27m';
const $=id=>document.getElementById(id);
const garmentUrls=new WeakMap();
function garmentUrl(asset){
  if(!asset)return null;
  if(!garmentUrls.has(asset))garmentUrls.set(asset,URL.createObjectURL(asset));
  return garmentUrls.get(asset);
}
const paths={
 brand:'<path d="m3 17 8-12h9L12 17H3Zm3 3h8l8-12M4.5 15l7.8-.1"/>',
 hanger:'<path d="M10 5a2.4 2.4 0 1 1 4 1.8c-1.1.8-2 1.3-2 3v1l9.2 6.4a1.4 1.4 0 0 1-.8 2.5H3.6a1.4 1.4 0 0 1-.8-2.5L12 11"/>',
 person:'<circle cx="12" cy="5" r="2.4"/><path d="M9 9h6l2.3 5-2.3 1-.9-1.5.5 8H9.4l.5-8L9 15l-2.3-1z"/>',
 book:'<path d="M3 5c3-1 6.4-.5 9 1.4C14.8 4.5 18 4 21 5v13c-3-.8-6-.3-9 1.4-2.7-1.7-6-2.3-9-1.4zM12 7v12"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
 focus:'<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/><circle cx="12" cy="12" r="4"/>',
 play:'<path d="m8 4 12 8-12 8z" fill="currentColor" stroke="none"/>',pause:'<path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor" stroke="none"/>',
 orbit:'<ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(-28 12 12)"/><path d="M7 13C5 6 7 2 10 3s7 7 7 13"/>',
 sliders:'<path d="M3 6h6m4 0h8M3 12h11m4 0h3M3 18h4m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
 ruler:'<path d="m3 16 13-13 5 5L8 21zM7 12l2 2m1-5 2 2m1-5 2 2"/>',
 heart:'<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>',
 sparkle:'<path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.8L12 18l-1.7-5.5L5 10.7 10.3 9Z"/><path d="M18.5 3v2.4M17.3 4.2h2.4"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>'
};
const icon=name=>'<svg aria-hidden="true" class="ico" viewBox="0 0 24 24">'+paths[name]+'</svg>';
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let samples=[],selected=null,size='',scope='all',filter='all',brand='ALL',query='',avatar='female',bottom='none',lowerFabric='linen',wire=false,playing=false,ready=false,loader=null,applied={},upper=null,toastTimer,loadError='';
let pants=null,activePants=null,activeTop=null,referenceSamples=[];
const isPants=()=>selected?.type==='pants';
const fieldsFor=type=>type==='pants'?pantsMeasurementFields:measurementFields;
// The landing frame is the whole look on its plinth; the torso close-up is
// the `fit` view the guide and the view picker still reach.
const fittingView=()=>isPants()?'pants':'front';
let bodyOnly=window.location.hash==='#body',studyGrid=true;
let poseWalk=false,loop=true,tickId=0,cameraView=bodyOnly?'study':'front';
if(bodyOnly)avatar='male';
const bodyInputsByModel={female:null,male:null};
const bodyFields={height:'키',chest:'가슴둘레',waist:'허리둘레',hip:'엉덩이둘레'};
const fmt=n=>Number(n.toFixed(1)).toString();
const signed=n=>(n>0?'+':'')+fmt(n);
const currentWearer=()=>wearer(avatar,bodyInputsByModel[avatar]);
const physics={gravity:9.81,wind:2.4,direction:0,turbulence:.18,speed:1,grid:false};
const fabrics={linen:'리넨',cotton:'코튼',denim:'데님',silk:'실크'};
const bottomPresets={none:'선택 없음',trousers:'리넨 팬츠',slacks:'슬랙스',shorts:'쇼츠',skirt:'미디스커트'};
const colors={linen:'#e6ddc9',cotton:'#c4c1b8',denim:'#465569',silk:'#bc887d'};
const ownSamples=()=>[...samples,...referenceSamples.filter(ref=>!samples.some(item=>item.id===ref.id))];
const collections=()=>[...builtins,...ownSamples()];
const measures=()=>selected.sizes.find(row=>row.label===size)||selected.sizes[0];
function toast(msg){$('notice').textContent=msg;$('notice').classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('notice').classList.remove('on'),3600);}
window.addEventListener('drape:garment-error',event=>{
  const item=[activeTop,activePants].find(item=>item?.id===event.detail);
  if(item)toast(item.name+'의 3D 데이터를 불러오지 못했습니다.');
});
const wishlist=new Set(JSON.parse(localStorage.getItem('selfit.wishlist')||'[]'));
const saveWishlist=()=>{try{localStorage.setItem('selfit.wishlist',JSON.stringify([...wishlist]));}catch{}};
function brandName(item){return String(item.brand||(item.reference?'내 기준 옷':item.custom?'내 샘플':'DRAPE STUDIO')).toUpperCase();}
function renderBrandChips(items){
  const names=[...new Set(items.map(brandName))].slice(0,8);
  const chips=$('brandChips');chips.replaceChildren();
  for(const name of ['ALL',...names]){
    const button=document.createElement('button');button.type='button';
    button.textContent=name;button.setAttribute('aria-pressed',String(brand===name||(name==='ALL'&&brand==='ALL')));
    button.onclick=()=>{brand=name;renderShelf();};
    chips.append(button);
  }
}
function cardThumb(item){
  const frame=document.createElement('span');frame.className='sample-photo';
  if(item.photo){const image=document.createElement('img');image.src=item.photo;image.alt='';frame.append(image);}
  const heart=document.createElement('button');heart.type='button';heart.className='heart';
  heart.setAttribute('aria-label','위시리스트에 담기');heart.setAttribute('aria-pressed',String(wishlist.has(item.id)));
  heart.innerHTML=icon('heart');
  heart.onclick=event=>{
    event.stopPropagation();
    if(wishlist.has(item.id))wishlist.delete(item.id);else wishlist.add(item.id);
    heart.setAttribute('aria-pressed',String(wishlist.has(item.id)));saveWishlist();
  };
  frame.append(heart);
  return frame;
}
function renderShelf(){
  const items=scope==='mine'?ownSamples():collections();
  renderBrandChips(items);
  const shown=items.filter(item=>(filter==='all'||item.category===filter)&&(brand==='ALL'||brandName(item)===brand)&&[item.name,item.brand,item.code].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  $('shelfName').textContent=scope==='mine'?'내 샘플':'샘플 옷장';$('total').textContent=shown.length;
  $('allNav').classList.toggle('nav-on',scope==='all');$('ownNav').classList.toggle('nav-on',scope==='mine');
  document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.filter===filter));
  const shelf=$('samples');shelf.replaceChildren();
  for(const item of shown){
    const card=document.createElement('div');
    card.className='sample';card.dataset.item=item.id;card.tabIndex=0;card.setAttribute('role','button');
    card.setAttribute('aria-label',[item.brand,item.name,item.code].filter(Boolean).join(' '));
    card.setAttribute('aria-pressed',String(selected?.id===item.id));
    card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(item);}};
    const info=document.createElement('span');info.className='sample-info';
    const b=document.createElement('small'),n=document.createElement('strong'),c=document.createElement('span');
    b.textContent=brandName(item);n.textContent=item.name;c.textContent=item.colourName||garmentTypes[item.type];
    info.append(b,n,c);card.append(cardThumb(item),info);shelf.append(card);
  }
  if(!shown.length){
    const empty=document.createElement('div');empty.className='empty';
    const line=document.createElement('p');line.textContent=query||filter!=='all'||brand!=='ALL'?'조건에 맞는 샘플이 없습니다.':loadError||'등록한 샘플이 없습니다.';empty.append(line);
    const action=document.createElement('button');
    if(query||filter!=='all'||brand!=='ALL'){action.textContent='필터 초기화';action.onclick=()=>{query='';filter='all';brand='ALL';$('search').value='';renderShelf();};}
    else{action.textContent='샘플 등록';action.onclick=openRegister;}empty.append(action);shelf.append(empty);
  }
}
function wornRows(){
  const preset=bottom==='none'||pants?null:{name:bottomPresets[bottom],virtual:true};
  return [
    {item:activeTop,role:'상의',size:upper?.measurements.label},
    {item:activePants||preset,role:'하의',size:pants?.measurements.label}
  ];
}
function renderWorn(){
  const rows=wornRows();
  const list=$('wornList');list.replaceChildren();
  for(const {item,role,size} of rows){
    const row=document.createElement('div');row.className='worn-row'+(item?'':' empty-row');
    const thumb=document.createElement('div');thumb.className='worn-thumb-lg';
    if(item?.photo){const image=document.createElement('img');image.src=item.photo;image.alt='';thumb.append(image);}
    const meta=document.createElement('div');meta.className='worn-meta';
    const brandEl=document.createElement('small'),nameEl=document.createElement('strong'),sizeEl=document.createElement('span');
    brandEl.textContent=item?(item.virtual?'DRAPE STUDIO':brandName(item)):'—';
    nameEl.textContent=item?item.name:role+'를 골라보세요';
    sizeEl.textContent=size?role+' · '+size+' 사이즈':role;
    meta.append(brandEl,nameEl,sizeEl);
    const go=document.createElement('span');go.className='worn-go';go.innerHTML=icon('chevron');
    row.append(thumb,meta,go);
    if(item&&!item.virtual)row.onclick=()=>choose(item);
    list.append(row);
  }
  const rail=$('wornRail');rail.replaceChildren();
  for(const {item,role} of rows){
    const button=document.createElement('button');button.type='button';
    button.className='worn-thumb'+(item?'':' empty-slot');
    button.title=item?item.name+' · '+role:role+' 없음';
    button.setAttribute('aria-label',button.title);
    if(item?.photo){const image=document.createElement('img');image.src=item.photo;image.alt='';button.append(image);}
    else button.textContent=role;
    if(item&&!item.virtual)button.onclick=()=>choose(item);
    rail.append(button);
  }
}
function renderRecommended(){
  const items=collections().filter(item=>item.id!==selected?.id&&item.photo);
  const picked=[];
  for(const category of ['outer','top','bottom']){
    const hit=items.find(item=>item.category===category&&!picked.includes(item));
    if(hit)picked.push(hit);
  }
  for(const item of items){if(picked.length>=3)break;if(!picked.includes(item))picked.push(item);}
  const row=$('recommended');row.replaceChildren();
  for(const item of picked.slice(0,3)){
    const button=document.createElement('button');button.type='button';button.className='rec-item';
    button.onclick=()=>choose(item);
    const photo=document.createElement('span');photo.className='rec-photo';
    const image=document.createElement('img');image.src=item.photo;image.alt='';photo.append(image);
    const brandEl=document.createElement('small'),nameEl=document.createElement('strong');
    brandEl.textContent=brandName(item);nameEl.textContent=item.name;
    button.append(photo,brandEl,nameEl);row.append(button);
  }
}
function setWornItem(){
  if(isPants()){
    activePants=selected;
    pants={id:selected.id,type:'pants',color:selected.color,material:selected.material||'denim',measurements:measures()};
  }else{
    activeTop=selected;
    upper={id:selected.id,type:selected.type,color:selected.color,pattern:selected.pattern||'',material:selected.material||'cotton',image:selected.custom&&!selected.asset?selected.photo:null,assetUrl:garmentUrl(selected.asset),imported:Boolean(selected.asset),adidas:selected.assetKind==='catalog',measurements:measures()};
  }
}
function product(){
  const hasSelection=Boolean(selected);
  $('removeSample').hidden=!selected?.custom;
  $('measureTable').hidden=!hasSelection;
  $('downloadGlb').hidden=!selected?.asset;
  $('sizeBlock').hidden=!hasSelection;
  $('brand').textContent=selected?brandName(selected):'';
  $('sku').textContent=selected?.code||'';
  $('productName').textContent=selected?.name||'옷을 선택해 주세요';
  $('colourDot').style.background=selected?.color||'';
  $('colourName').textContent=selected?.colourName||selected?.color||'';
  $('colourName').parentElement.hidden=!hasSelection;
  if(hasSelection){
    $('sizes').innerHTML=selected.sizes.map(m=>'<button type="button" data-size="'+esc(m.label)+'" aria-pressed="'+(m.label===size)+'">'+esc(m.label)+'</button>').join('');
    const row=measures();
    $('quickMeasures').innerHTML=fieldsFor(selected.type).filter(([key])=>row[key]!=null).map(([key,label])=>'<span>'+label+' <strong>'+row[key]+' cm</strong></span>').join('');
  }else{
    $('sizes').replaceChildren();
    $('quickMeasures').replaceChildren();
  }
  renderFitReport();renderWorn();renderSizeDock();renderRecommended();
}
// The dock sits under the 3D stage so a size can be changed without scrolling
// the page: one row per worn garment, the row of the sample being edited marked.
// Both the dock and the Style & Fit card read the same `size`/measurement rows,
// so the two sets of buttons cannot drift apart.
function dockGarment(role){
  if(!selected)return null;
  const editingTop=!isPants(),isTop=role==='top';
  if(isTop?isPants()&&!upper:!isPants()&&!pants)return null;
  const item=isTop?(editingTop?selected:activeTop):(editingTop?activePants:selected);
  const row=isTop?(editingTop?measures():upper?.measurements):(editingTop?pants?.measurements:measures());
  if(!item||!row)return null;
  return {role:isTop?'상의':'하의',item,row,active:isTop===editingTop};
}
function dockEase(g){
  if(g.role==='하의'){
    const f=pantsFit(g.row,avatar,bodyInputsByModel[avatar]);
    return '허리 여유 '+signed(f.waistEase)+' cm';
  }
  const f=hoodieFit(g.row,currentWearer());
  return '가슴 여유 '+signed(f.ease)+' cm'+(g.item.id===adidas.id?' · '+f.fitLabel:'');
}
function renderSizeDock(){
  const dock=$('sizeDock');
  if(!dock)return;
  const rows=['top','bottom'].map(dockGarment).filter(Boolean);
  if(!rows.length){dock.replaceChildren();dock.hidden=true;return;}
  dock.hidden=false;dock.innerHTML=rows.map(g=>'<div class="dock-row'+(g.active?' dock-active':'')+'">'+
    '<button type="button" class="dock-who" data-dock-item="'+esc(g.item.id)+'" tabindex="'+(g.active?'-1':'0')+'">'+
      '<span class="dock-role">'+g.role+'</span><span class="dock-name">'+esc(g.item.name)+'</span></button>'+
    '<div class="dock-sizes" role="group" aria-label="'+g.role+' '+esc(g.item.name)+' 사이즈">'+g.item.sizes.map(m=>'<button type="button" data-dock-size="'+esc(m.label)+'" data-dock-role="'+(g.role==='상의'?'top':'bottom')+'" aria-pressed="'+(m.label===g.row.label)+'">'+esc(m.label)+'</button>').join('')+'</div>'+
    '<span class="dock-ease">'+esc(dockEase(g))+'</span></div>').join('');
}
function setGarmentSize(role,label){
  const isTopRow=role==='top';
  const item=isTopRow?activeTop:activePants;
  const onSelected=item&&item===selected;
  if(onSelected){
    if(size===label&&!bodyOnly)return;
    size=label;
    if(bodyOnly){bodyOnly=false;cameraView=fittingView();}
    setWornItem();product();apply();
    return;
  }
  // Sizing the other garment also brings it into Style & Fit and Your Look, so
  // the two sets of size buttons never describe different samples.
  if(!item||!item.sizes.some(m=>m.label===label))return;
  const crossedType=isPants()!==(item.type==='pants');
  const wasBody=bodyOnly;
  selected=item;size=label;
  if(crossedType||wasBody){bodyOnly=false;resetCamera(fittingView());}
  setWornItem();product();renderShelf();apply();
}
$('sizeDock').onclick=e=>{
  const sizeBtn=e.target.closest('[data-dock-size]');
  if(sizeBtn){setGarmentSize(sizeBtn.dataset.dockRole,sizeBtn.dataset.dockSize);return;}
  const who=e.target.closest('[data-dock-item]');
  if(who&&who.dataset.dockItem!==selected?.id){
    const item=collections().find(i=>i.id===who.dataset.dockItem);
    if(item)choose(item);
  }
};
function cuffPosition(fit){
  return '손목 '+(fit.cuffOffset<0?'위 ':'아래 ')+fmt(Math.abs(fit.cuffOffset)*100)+' cm';
}
function reportCells(stats){
  const clamp=v=>Math.max(4,Math.min(100,Math.round(v*100)));
  return stats.map(([label,value,hint,ratio,tone])=>{
    const level=tone||'neutral';
    return '<div class="fit-stat '+level+'"><div class="row"><span>'+label+'</span><strong>'+value+'</strong></div>'+
      '<div class="track" role="presentation"><i style="--v:'+clamp(ratio??.3)+'%"></i></div><small>'+hint+'</small></div>';
  }).join('');
}
function renderFitReport(hemLift=0){
  const show=selected?.id===adidas.id||Boolean(selected?.asset)||isPants();
  $('fitReport').hidden=!show;
  if(!show)return;
  const w=currentWearer();
  if(isPants()){
    const f=pantsFit(measures(),avatar,bodyInputsByModel[avatar]);
    $('bodySummary').textContent=(bodyInputsByModel[avatar]?'입력한 체형':'기본 '+(avatar==='male'?'남성':'여성')+' 모델')+' · 키 '+fmt(w.height)+' cm · 허리 '+fmt(w.waist)+' cm · 엉덩이 '+fmt(w.hip)+' cm';
    const stats=[['허리둘레 여유',signed(f.waistEase)+' cm',f.waistEase<0?'몸의 허리둘레보다 작음':'바지 허리둘레 − 몸 허리둘레',Math.min(1,Math.abs(f.waistEase)/16),f.waistEase<0?'tight':'good'],['엉덩이둘레 여유',signed(f.hipEase)+' cm',f.hipEase<0?'몸의 엉덩이둘레보다 작음':'바지 엉덩이둘레 − 몸 엉덩이둘레',Math.min(1,Math.abs(f.hipEase)/18),f.hipEase<0?'tight':'good'],['밑단에 모이는 길이',fmt(f.stack)+' cm','신발에 닿으며 접히는 길이 추정',Math.min(1,f.stack/12),'neutral']];
    $('fitNumbers').innerHTML=reportCells(stats);
    $('fitHem').textContent='펴진 밑단 예상 위치 · 발목 '+(f.ankleOffset<0?'위 ':'아래 ')+fmt(Math.abs(f.ankleOffset))+' cm'+(f.waistEase<0||f.hipEase<0?' · 실측상 둘레가 부족해 실제로 잠그기 어려울 수 있습니다.':'');
    return;
  }
  const f=hoodieFit(measures(),w);
  $('bodySummary').textContent=(bodyInputsByModel[avatar]?'입력한 치수':'기본 '+(avatar==='male'?'남성':'여성')+' 모델')+' · 키 '+fmt(w.height)+' cm · 가슴둘레 '+fmt(w.chest)+' cm';
  const easeTone=f.ease<0?'tight':f.ease>28?'good':'neutral';
  $('fitNumbers').innerHTML=reportCells([
    ['가슴둘레 여유',signed(f.ease)+' cm',f.fitLabel,Math.min(1,Math.abs(f.ease)/40),easeTone],
    ['한쪽 어깨 여분',signed(f.shoulderSurplus*100)+' cm','의류와 몸의 너비 차이 ÷ 2',Math.min(1,f.shoulderSurplus/.16),'neutral'],
    ['예상 소맷단 위치',cuffPosition(f),'주름에 모이는 길이 '+fmt(f.sleeveStack*100)+' cm',Math.min(1,Math.abs(f.cuffOffset)/.16),f.cuffOffset>0?'tight':'good']]);
  const fromWaist=((w.base.waistY-f.frontHemY)*w.sy-hemLift)*100;
  $('fitHem').textContent='앞 밑단 예상 위치 · 허리선 '+(fromWaist>=0?'아래 ':'위 ')+fmt(Math.abs(fromWaist))+' cm'+(f.ease<0?' · 지퍼를 잠글 수 있는지는 원단 신장률 확인이 필요합니다.':'');

}
function resetCamera(view){
  cameraView=view;
  window.DrapeEngine.set({view,zoom:1});
}
function showFit(){
  bodyOnly=false;playing=false;poseWalk=false;resetCamera(fittingView());apply();
}
$('fitPreview').onclick=showFit;
$('finishView').onclick=()=>{
  const detailView=isPants()?'pants':'finish';
  const detail=cameraView!==detailView||bodyOnly;
  bodyOnly=false;playing=false;poseWalk=false;
  resetCamera(detail?detailView:isPants()?'front':'fit');apply();
  $('stage').scrollIntoView({block:'center',behavior:'smooth'});
};
$('compareFit').onclick=()=>{
  const w=currentWearer();
  if(isPants()){
    const rows=selected.sizes.map(m=>{
      const f=pantsFit(m,avatar,bodyInputsByModel[avatar]);
      return '<tr class="'+(m.label===size?'current':'')+'"><th><button type="button" data-fit-size="'+esc(m.label)+'">'+esc(m.label)+'</button></th><td>'+signed(f.waistEase)+'</td><td>'+signed(f.hipEase)+'</td><td>'+fmt(f.stack)+'</td></tr>';
    }).join('');
    modal('바지 사이즈별 핏 비교','<p>현재 체형의 허리둘레 '+fmt(w.waist)+' cm, 엉덩이둘레 '+fmt(w.hip)+' cm 기준입니다. 사이즈를 눌러 입혀보세요.</p><div class="table-wrap"><table><thead><tr><th>사이즈</th><th>허리 여유 (cm)</th><th>엉덩이 여유 (cm)</th><th>예상 밑단 접힘 (cm)</th></tr></thead><tbody>'+rows+'</tbody></table></div>');
  }else modal('사이즈별 핏 비교','<p>현재 모델의 가슴둘레 '+fmt(w.chest)+' cm를 기준으로 계산했습니다. 단위는 cm입니다.</p><div class="table-wrap"><table><thead><tr><th>사이즈</th><th>옷 가슴둘레</th><th>가슴 여유</th><th>총장</th><th>소매길이</th><th>예상 소맷단 위치</th></tr></thead><tbody>'+selected.sizes.map(m=>{
    const f=hoodieFit(m,w);
    return '<tr class="'+(m.label===size?'current':'')+'"><th><button type="button" data-fit-size="'+esc(m.label)+'">'+esc(m.label)+'</button></th><td>'+fmt(f.chestM*100)+'</td><td>'+signed(f.ease)+'</td><td>'+m.length+'</td><td>'+m.sleeve+'</td><td>'+cuffPosition(f)+'</td></tr>';
  }).join('')+'</tbody></table></div><p>사이즈 이름을 누르면 해당 사이즈를 입혀봅니다. </p>');
  $('dialogBody').querySelectorAll('[data-fit-size]').forEach(b=>b.onclick=()=>{size=b.dataset.fitSize;setWornItem();product();$('dialog').close();showFit();});
};
$('fitMethod').onclick=()=>{
  if(isPants()){
    const m=measures();
    modal('바지 실측과 계산 근거','<dl class="help"><dt>입력한 실측 · '+esc(size)+'</dt><dd>허리단면 '+m.waist+' cm와 엉덩이단면 '+m.hip+' cm를 두 배로 환산해 현재 체형의 둘레와 비교했습니다. 허벅지단면과 밑단단면은 한쪽 바짓가랑이의 너비입니다.</dd><dt>밑위와 총장</dt><dd>밑위는 허리 앞중심에서 가랑이 봉제선까지, 총장은 허리 상단에서 바깥쪽 밑단까지 잰 길이입니다. 밑단 접힘과 주름은 착용 높이, 모델의 키와 신발 위치를 기준으로 추정합니다.</dd><dt>원단과 외형</dt><dd>3D에서는 원단 특성을 근사합니다. 실제 착용 위치와 접힘은 체형 비율, 원단의 신축성, 신발 높이에 따라 달라집니다.</dd></dl>');
    return;
  }
  const m=measures(),w=currentWearer(),f=hoodieFit(m,w);
  if(selected.asset){
    modal('가져온 후드 집업의 계산 근거','<dl class="help"><dt>실측 출처</dt><dd>'+esc(selected.source)+
      ' · '+esc(size)+' · 가슴단면 '+m.chest+' cm × 2를 모델 가슴둘레와 비교합니다.</dd>'+
      '<dt>마감과 원단</dt><dd>밑단단면 '+(m.hem==null?'미제공 · 가슴단면의 84.5%로 추정':m.hem+' cm 사용')+
      ' · 원단 굽힘과 신축성은 코튼 프리셋을 적용합니다.</dd><dt>착용 결과</dt>'+
      '<dd>소맷단과 밑단의 위치는 선택한 실측과 체형으로 계산합니다. 실제 옷의 패턴과 원단 시험값이 있으면 더 정확히 맞출 수 있습니다.</dd></dl>'+
      '<a class="textlink" href="'+esc(selected.productUrl)+'" target="_blank" rel="noopener noreferrer">무신사 상품 원본</a>');
    return;
  }
  modal('소재와 계산 근거','<dl class="help"><dt>상품 실측 · '+size+'</dt><dd>제공된 사이즈표의 가슴단면 '+m.chest+' cm × 2 = 옷 가슴둘레 '+fmt(f.chestM*100)+' cm입니다. 몸의 가슴둘레 '+fmt(w.chest)+' cm를 빼면 여유가 '+signed(f.ease)+' cm입니다. 음수는 착용에 신축이 필요하다는 뜻입니다.</dd><dt>밑단과 주름</dt><dd>'+(f.hemMeasured?'XS의 밑단단면 44 cm를 사용했습니다.':'밑단단면은 미제공입니다. XS의 밑단 대 가슴단면 비율 44/56을 적용한 '+fmt(f.hemM*50)+' cm를 사용했습니다.')+' 밑단은 하의의 바깥 표면을 따릅니다. 드롭 숄더에서 손목까지 필요한 길이를 구하고, 여분은 손등을 덮는 길이와 시보리 위에 모이는 주름으로 나눴습니다. 패턴과 원단 시험값이 없어 밑단 위치와 주름은 추정입니다.</dd><dt>원단과 마감</dt><dd>KC9315 상품 고시 기준 주소재는 면 100%, 배색 소재는 면 99%·엘라스테인 1%입니다. 사진을 기준으로 검은 몸판, 크림색 세 줄 테이프와 골지 시보리의 표면을 따로 재현했습니다. 원단 중량·두께·방향별 신장률과 굽힘 강성은 미확인입니다.</dd><dt>착용 모델</dt><dd>기본 치수는 3D 인체의 가슴·허리·엉덩이 단면에서 측정했습니다. 입력한 둘레를 적용할 때는 같은 높이의 단면을 비례 조정합니다. 어깨와 팔 길이는 선택한 모델의 비례를 따릅니다.</dd></dl><div class="fit-links"><a target="_blank" rel="noopener" href="https://www.musinsa.com/products/5329359">무신사 제품 설명</a><a target="_blank" rel="noopener" href="https://shinsegaemall.ssg.com/item/itemView.ssg?itemId=1000875360137">신세계몰 소재 고시</a></div>');
};
$('bodyInputs').onclick=()=>{
  const w=currentWearer();
  modal('피팅에 쓸 신체 치수','<p>몸에 밀착해 잰 둘레를 cm로 입력하세요. 선택한 모델의 착장에 적용되며 사이즈를 바꿔도 유지됩니다.</p><form id="wearerForm"><div class="field-grid">'+Object.entries(bodyFields).map(([k,label])=>{
    const min=k==='height'?140:Math.ceil(w.base[k]*.72),max=k==='height'?210:Math.floor(w.base[k]*1.45);
    return '<label class="field">'+label+' (cm)<input required type="number" name="'+k+'" step="0.1" min="'+min+'" max="'+max+'" value="'+fmt(w[k])+'"><small>'+min+'–'+max+' cm</small></label>';
  }).join('')+'</div><div class="form-footer"><button type="button" id="clearWearer" class="secondary">기본 모델로 복원</button><button type="submit" class="primary">핏에 적용</button></div></form>');
  function finish(values){bodyInputsByModel[avatar]=values;product();$('dialog').close();showFit();}
  $('clearWearer').onclick=()=>finish(null);
  $('wearerForm').onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget);finish(Object.fromEntries(Object.keys(bodyFields).map(k=>[k,Number(data.get(k))])));};
};
function sync(){
  const detail=!bodyOnly&&cameraView===(isPants()?'pants':'finish');
  $('finishView').hidden=!selected||bodyOnly;
  $('finishView').setAttribute('aria-pressed',String(detail));
  $('finishView').textContent=detail?'착장 전체':isPants()?'하체 핏':'소맷단·밑단';
  $('fitPreview').hidden=!selected;
  $('fitPreview').textContent=bodyOnly?'착장으로 돌아가기':'3D 착장 전체 보기';
  $('bodyView').setAttribute('aria-pressed',String(bodyOnly));
  $('dressedView').setAttribute('aria-pressed',String(!bodyOnly));
  $('stage').classList.toggle('body-study',bodyOnly);
  $('stage').classList.toggle('show3d',ready);
  $('mode').textContent=!ready?'3D 불러오는 중':playing?'3D 보행 중':
    bodyOnly?'3D 체형':!upper&&!pants&&bottom==='none'?'기본 3D 마네킹':
    selected?.id===adidas.id||Boolean(selected?.asset)||isPants()?'3D 실측 핏':'3D 피팅';
  $('play').querySelector('i').innerHTML=icon(playing?'pause':'play');
  $('play').querySelector('span').textContent=playing?'일시정지':'보행 시뮬레이션';
  $('play').setAttribute('aria-pressed',playing);
  document.querySelectorAll('[data-model]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.model===avatar));
}
function options(){
  const outfit=bottom==='shorts'?'casual':bottom==='slacks'?'tailored':'classic';
  return {...physics,grid:bodyOnly?studyGrid:physics.grid,person:bodyInputsByModel[avatar],bodyOnly,selectedOnly:true,sample:upper,pants,model:avatar,bottom:pants?'trousers':bottom,outfit:pants?'classic':outfit,fabric:pants?(pants.material||'denim'):lowerFabric,color:pants?pants.color:colors[lowerFabric],playing,walking:poseWalk,speed:physics.speed,view:cameraView,wireframe:wire};
}
async function apply(){
  sync();
  if(!loader){
    const opts=options();window.DrapeEngine.set(opts);applied=opts;
    loader=window.DrapeEngine.init($('liveScene'),$('stage'));
  }
  try{
    if(!await loader)throw Error();
    const opts=options(),changes=Object.fromEntries(Object.entries(opts).filter(([k,v])=>applied[k]!==v));
    if(Object.keys(changes).length)window.DrapeEngine.set(changes);
    applied=opts;ready=true;sync();
    renderFitReport(!bodyOnly?(window.DrapeEngine.getStats().hemLift||0):0);
  }catch{
    ready=false;loader=null;playing=false;
    sync();$('mode').textContent='3D 로드 실패';
    toast('3D 피팅을 열지 못했습니다. 보행 시뮬레이션을 눌러 다시 시도해 주세요.');
  }
}
function choose(item){
  const fromStudy=bodyOnly;
  bodyOnly=false;
  if(fromStudy)cameraView='front';
  const hadPantsSelected=isPants();
  selected=item;
  if(isPants()||hadPantsSelected)resetCamera(fittingView());
  const worn=isPants()?pants:upper;
  const previous=worn?.id===item.id?worn.measurements.label:null;
  size=item.sizes.find(s=>s.label===previous)?.label ?? item.sizes.find(s=>s.label==='M')?.label ?? item.sizes[0].label;
  setWornItem();
  product();renderShelf();apply();
}
function navigate(next){
  scope=next;query='';filter='all';brand='ALL';$('search').value='';renderShelf();
  if(matchMedia('(max-width:680px)').matches)$('closet').scrollIntoView({behavior:'smooth',block:'start'});
}
function changeBodyView(show){
  if(bodyOnly===show)return;
  bodyOnly=show;cameraView=show?'study':fittingView();
  if(!playing)poseWalk=false;
  apply();
}
window.addEventListener('hashchange',()=>{if(window.location.hash==='#fit')showFit();else changeBodyView(window.location.hash==='#body');});
$('bodyView').onclick=()=>changeBodyView(true);
$('dressedView').onclick=()=>changeBodyView(false);
$('allNav').onclick=()=>navigate('all');$('ownNav').onclick=()=>navigate('mine');$('ownNavSmall').onclick=()=>navigate(scope==='mine'?'all':'mine');
$('filters').onclick=e=>{const btn=e.target.closest('[data-filter]');if(btn){filter=btn.dataset.filter;renderShelf();}};
$('searchToggle').onclick=()=>{const open=document.activeElement!==$('search');$('search').focus();$('searchToggle').setAttribute('aria-expanded',String(open));if(!open&&!$('search').value){query='';renderShelf();}};
$('search').oninput=e=>{query=e.target.value;renderShelf();};
$('samples').onclick=e=>{const btn=e.target.closest('[data-item]');if(!btn)return;choose(collections().find(i=>i.id===btn.dataset.item));if(matchMedia('(max-width:680px)').matches)$('fitting').scrollIntoView({behavior:'smooth',block:'start'});};
$('sizes').onclick=e=>{
  const btn=e.target.closest('[data-size]');
  if(btn&&selected)setGarmentSize(isPants()?'bottom':'top',btn.dataset.size);
};
document.querySelector('.gender').onclick=e=>{
  const b=e.target.closest('[data-model]');
  if(!b||avatar===b.dataset.model)return;
  avatar=b.dataset.model;renderFitReport();renderSizeDock();apply();
};
function tick(){
  tickId=0;
  if(!playing)return;
  const current=window.DrapeEngine.getStats().time||0;
  if(current>=8){
    window.DrapeEngine.set({time:loop?current%8:8});
    if(!loop){playing=false;apply();}
  }
  if($('timeSeek')){$('timeSeek').value=Math.min(current,8);$('timeOut').textContent=Math.min(current,8).toFixed(2)+' s';}
  if(playing)tickId=requestAnimationFrame(tick);
}
$('play').onclick=()=>{
  playing=!playing;
  if(playing){
    poseWalk=true;
    if(ready && window.DrapeEngine.getStats().time>=8)window.DrapeEngine.set({time:0});
    if(!tickId)tickId=requestAnimationFrame(tick);
  }
  apply();
};
$('zoomIn').onclick=()=>window.DrapeEngine.zoomBy(1.12);
$('zoomOut').onclick=()=>window.DrapeEngine.zoomBy(1 / 1.12);
$('recenter').onclick=()=>{resetCamera(bodyOnly?'study':fittingView());apply();};
$('expand').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('fitting').requestFullscreen();}catch{toast('이 브라우저에서는 전체 화면을 사용할 수 없습니다.');}};
function modal(title,body){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=body;if(!$('dialog').open)$('dialog').showModal();}
$('close').onclick=()=>$('dialog').close();$('dialog').onclick=e=>{if(e.target===$('dialog')){const b=$('dialog').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$('dialog').close();}};
$('measureTable').onclick=()=>{
  const measureFields=fieldsFor(selected.type);
  modal(selected.name+' 실측표','<p>'+esc(selected.source)+' · 단위 cm</p><div class="table-wrap"><table><thead><tr><th>사이즈</th>'+measureFields.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+selected.sizes.map(m=>'<tr class="'+(size===m.label?'current':'')+'"><th scope="row">'+esc(m.label)+'</th>'+measureFields.map(([k])=>'<td>'+(m[k]??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p>'+(isPants()?'허리·엉덩이·허벅지·밑단은 옷을 평평하게 놓고 잰 단면 너비입니다.':'가슴과 밑단은 옷을 평평하게 놓고 잰 단면 너비입니다.')+' — 표시는 미제공 치수입니다.</p>');
};
$('guide').onclick=()=>modal('드레싱룸 이용 가이드','<dl class="help"><dt>샘플 입어보기</dt><dd>옷장에서 샘플을 고르고 사이즈를 바꿔 보세요. 신체 치수에서 키와 가슴·허리·엉덩이둘레를 적용하면 그 몸에 맞춰 다시 입습니다.</dd><dt>3D 화면 조작</dt><dd>3D 화면을 한 손가락으로 밀거나 마우스로 드래그하면 모델이 회전합니다. 두 손가락을 벌리거나 오므리면 확대·축소되고, 두 손가락을 함께 움직이면 화면 속 위치를 옮길 수 있습니다. 마우스 휠로도 확대·축소할 수 있습니다.</dd><dt>옷장 찾기</dt><dd>분류(아우터·상의·하의)와 브랜드 칩으로 좁히고, 검색창에는 상품명·브랜드·품번을 넣습니다. 카드의 하트는 이 브라우저의 위시리스트에 담깁니다.</dd><dt>3D 체형</dt><dd>3D 체형을 누르면 기본 피팅복을 입고 팔을 벌린 인체 모델을 볼 수 있습니다. 드래그해 회전하거나 보행을 재생하세요. 착장을 누르면 같은 모델에 선택한 옷을 다시 입힙니다.</dd><dt>3D 착장</dt><dd>모든 샘플은 실물 사진에서 뜬 원단과 그래픽으로 3D에 입혀집니다. 사이즈를 바꾸면 같은 사진의 결이 그 사이즈 패턴에 다시 깔리고, 보행하면 밑단과 소매가 흔들립니다.</dd><dt>실제 옷 등록</dt><dd>정면 사진과 상품명을 입력한 뒤 의류 유형을 선택하세요. 바지는 총장·허리단면·엉덩이단면·허벅지단면·밑위·밑단단면을, 상의는 총장·어깨너비·가슴단면·소매길이를 cm로 입력합니다. 사진은 단색 배경에서 바르게 펼친 모습이 좋습니다.</dd><dt>샘플 보관</dt><dd>직접 등록한 사진과 실측은 이 브라우저의 내 샘플에 저장됩니다. 정확한 핏을 검증하려면 앞·뒤 패턴, 원단의 두께·무게·신축성과 실제 피팅 모델의 신체 치수가 추가로 필요합니다.</dd></dl>');
function environment(){
  const sliders=[['gravity','중력',0,20,.01,'m/s²'],['wind','풍속',0,12,.1,'m/s'],['direction','풍향',0,360,5,'°'],['turbulence','난류',0,1,.05,''],['speed','보행 속도',.25,2,.05,'×']];
  modal('물리 환경 설정',sliders.map(([key,label,min,max,step,unit])=>'<label class="parameter">'+label+'<input data-parameter="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+physics[key]+'"><output>'+physics[key]+' '+unit+'</output></label>').join('')+
    '<label class="parameter">하의<select id="bottomPick">'+(pants?'<option selected value="measured">'+esc(activePants.name)+'</option>':'')+Object.entries(bottomPresets).map(([id,n])=>'<option value="'+id+'" '+(!pants&&id===bottom?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
    '<label class="parameter">하의 원단<select id="fabricPick" '+(pants||bottom==='none'?'disabled':'')+'>'+Object.entries(fabrics).map(([id,n])=>'<option value="'+id+'" '+(id===(pants?.material||lowerFabric)?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
    '<label class="parameter">3D 시점<select id="viewPick">'+Object.entries({pants:'하체 핏',finish:'소맷단과 밑단',fit:'상반신 핏',study:'사선',front:'정면',side:'측면',back:'후면'}).map(([value,n])=>'<option value="'+value+'" '+(cameraView===value?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
    '<label class="parameter">보행 시간<input type="range" id="timeSeek" aria-label="보행 시간" min="0" max="8" step=".01" value="'+(window.DrapeEngine.getStats().time||0)+'"><output id="timeOut">'+(window.DrapeEngine.getStats().time||0).toFixed(2)+' s</output></label>'+
    '<div class="checks"><label class="check"><input type="checkbox" id="repeatPick" '+(loop?'checked':'')+'>반복 재생</label><label class="check"><input id="gridPick" type="checkbox" '+((bodyOnly?studyGrid:physics.grid)?'checked':'')+'>바닥 그리드</label><label class="check"><input id="wirePick" type="checkbox" '+(wire?'checked':'')+'>와이어프레임</label></div>');
  document.querySelectorAll('[data-parameter]').forEach((el,i)=>el.oninput=()=>{physics[el.dataset.parameter]=+el.value;el.nextElementSibling.textContent=el.value+' '+sliders[i][5];apply();});
  $('bottomPick').onchange=e=>{
    if(e.target.value==='measured')return;
    const wasPants=isPants();
    pants=null;activePants=null;
    bottom=e.target.value;
    lowerFabric=({trousers:'linen',skirt:'linen',slacks:'cotton',shorts:'denim'})[bottom]||'linen';
    $('fabricPick').value=lowerFabric;
    $('fabricPick').disabled=bottom==='none';
    if(wasPants){selected=activeTop;size=upper?.measurements?.label||'';cameraView=fittingView();}
    e.target.querySelector('[value="measured"]')?.remove();
    product();renderShelf();apply();
  };
  $('fabricPick').onchange=e=>{lowerFabric=e.target.value;apply();};
  $('viewPick').onchange=e=>{cameraView=e.target.value;apply();};
  $('repeatPick').onchange=e=>{loop=e.target.checked;};
  $('timeSeek').oninput=async e=>{
    const t=+e.target.value;playing=false;poseWalk=true;$('timeOut').textContent=t.toFixed(2)+' s';
    await apply();if(ready)window.DrapeEngine.set({time:t});
  };
  $('gridPick').onchange=e=>{if(bodyOnly)studyGrid=e.target.checked;else physics.grid=e.target.checked;apply();};$('wirePick').onchange=e=>{wire=e.target.checked;apply();};
}
$('settings').onclick=environment;
function addSizeRow(values={}){
  const type=$('sampleForm').elements.type.value;
  const fields=fieldsFor(type);
  const row=document.createElement('div');row.className='measurement-row entry';
  row.innerHTML='<input aria-label="사이즈" name="label" maxlength="14" placeholder="M" required>'+fields.map(([key,name])=>'<input aria-label="'+name+'" name="'+key+'" type="number" min="0.1" max="250" step="0.1" placeholder="'+(key==='hem'&&type!=='pants'?'선택':'cm')+'" '+(key==='hem'&&type!=='pants'?'':'required')+'>').join('')+'<button type="button" aria-label="이 사이즈 제거">×</button>';
  for(const input of row.querySelectorAll('input'))input.value=values[input.name]??'';
  row.querySelector('button').onclick=()=>{if(document.querySelectorAll('.entry').length>1)row.remove();else toast('사이즈가 한 개 이상 필요합니다.');};
  $('rows').append(row);
}
function openRegister(){
  modal('의류 샘플 등록','<button class="primary" id="openGarmentImport" type="button">무신사 링크로 가져오기</button><p>옷의 정면 사진을 선택한 뒤 의류 유형별 실측을 입력하세요. 등록한 옷은 이 브라우저의 내 샘플에 저장됩니다.</p>'+
  '<form id="sampleForm"><div class="field-grid"><label class="field wide">상품 사진<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required><small>단색 배경의 정면 사진 · JPG, PNG, WebP · 최대 12MB</small></label>'+
  '<label class="field">상품명<input name="name" maxlength="65" required placeholder="예: 코튼 후드 집업"></label><label class="field">브랜드 (선택)<input name="brand" maxlength="45" placeholder="브랜드명"></label>'+
  '<label class="field">의류 유형<select name="type">'+Object.entries(garmentTypes).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label><label class="field">품번 (선택)<input name="code" maxlength="45" placeholder="상품 코드"></label>'+
  '<label class="field">기본 색상<input type="color" name="color" value="#363a39"></label><label class="field">원단 프리셋<select name="material"><option value="cotton">코튼</option><option value="linen">리넨</option><option value="denim">데님</option><option value="silk">실크</option></select></label></div>'+
  '<h3 class="form-section">사이즈별 실측 (cm)</h3><div class="sample-rows"><div class="measurement-row labels"><span>사이즈</span>'+measurementFields.map(([,n])=>'<span>'+n+'</span>').join('')+'<span></span></div><div id="rows"></div></div><button type="button" class="secondary" id="addSize">＋ 사이즈 추가</button>'+
  '<p id="formError" class="form-error" role="alert"></p><div class="form-footer"><button class="primary" type="submit">등록하고 입혀보기</button></div></form>');
  $('openGarmentImport').onclick=()=>{
    modal('상품 링크로 3D 피팅','');
    openGarmentImport({dialog:$('dialog'),body:$('dialogBody'),onManual:openRegister,onSave:async sample=>{
      await saveSample(sample);
      samples.unshift(sample);scope='mine';query='';filter='all';brand='ALL';$('search').value='';
      $('dialog').close();choose(sample);toast('옷장에 저장하고 피팅룸에 적용했습니다.');
    }});
  };
  const form=$('sampleForm'),drafts=new Map();
  let group='upper';
  addSizeRow();$('addSize').onclick=()=>addSizeRow();
  form.elements.type.onchange=()=>{
    const type=form.elements.type.value,next=type==='pants'?'pants':'upper';
    if(next===group)return;
    drafts.set(group,Array.from(form.querySelectorAll('.entry'),row=>Object.fromEntries(Array.from(row.querySelectorAll('input'),i=>[i.name,i.value]))));
    group=next;form.elements.material.value=type==='pants'?'denim':'cotton';
    const section=form.querySelector('.sample-rows');
    section.classList.toggle('pant-sizes',type==='pants');
    section.querySelector('.labels').innerHTML='<span>사이즈</span>'+fieldsFor(type).map(([,label])=>'<span>'+label+'</span>').join('')+'<span></span>';
    $('rows').replaceChildren();(drafts.get(group)||[{}]).forEach(addSizeRow);
  };
  form.onsubmit=async event=>{
    event.preventDefault();const submit=form.querySelector('[type=submit]');if(submit.disabled)return;
    const error=$('formError');error.textContent='';
    try{
      const data=new FormData(form);const name=data.get('name').trim();if(!name)throw Error('상품명을 입력해 주세요.');
      const labels=new Set();
      const sizes=Array.from(form.querySelectorAll('.entry'),row=>{
        const label=row.querySelector('[name=label]').value.trim();
        if(!label||labels.has(label.toUpperCase()))throw Error('각 사이즈에 서로 다른 이름을 입력해 주세요.');
        labels.add(label.toUpperCase());const m={label};
        for(const [key] of fieldsFor(data.get('type'))){const v=row.querySelector('[name='+key+']').value;m[key]=v===''?null:Number(v);}
        if(data.get('type')==='pants' && m.length<=m.rise)throw Error('바지 총장은 밑위보다 길어야 합니다.');
        return m;
      });
      submit.disabled=true;submit.textContent='등록 중…';
      const photo=await readProductPhoto(data.get('image'));
      const type=data.get('type');const sample={id:'own-'+crypto.randomUUID(),custom:true,created:Date.now(),name,brand:data.get('brand').trim(),code:data.get('code').trim(),type,category:type==='pants'?'bottom':['ziphoodie','puffer','workjacket'].includes(type)?'outer':'top',photo,color:data.get('color'),colourName:data.get('color').toUpperCase(),material:data.get('material'),source:'직접 입력한 실측',sizes};
      await saveSample(sample);samples.unshift(sample);scope='mine';query='';filter='all';$('search').value='';
      $('dialog').close();choose(sample);toast('샘플을 저장하고 3D 모델에 적용했습니다.');
    }catch(err){error.textContent=err.name==='QuotaExceededError'?'브라우저 저장 공간이 부족합니다.':err.message||'샘플을 저장하지 못했습니다. 저장 공간을 확인해 주세요.';submit.disabled=false;submit.textContent='등록하고 입혀보기';}
  };
}
$('downloadGlb').onclick=()=>{
  if(!selected?.asset)return;
  const link=document.createElement('a');
  link.href=garmentUrl(selected.asset);
  link.download=(selected.code||selected.name).replace(/[\\/:*?"<>|]/g,'-')+'.glb';
  link.click();
};
$('removeSample').onclick=()=>{
  const item=selected;
  if(!item?.custom)return;
  modal('등록한 샘플 삭제','<p>'+esc(item.name)+'의 사진과 실측을 이 브라우저의 내 샘플에서 삭제할까요?</p><div class="form-footer"><button class="secondary" id="cancelRemoval">취소</button><button class="primary" id="confirmRemoval">삭제</button></div>');
  $('cancelRemoval').onclick=()=>$('dialog').close();
  $('confirmRemoval').onclick=async e=>{
    const b=e.currentTarget;b.disabled=true;
    try{
      await removeSample(item.id);
      samples=samples.filter(s=>s.id!==item.id);
      if(activePants?.id===item.id){activePants=null;pants=null;}
      if(activeTop?.id===item.id){activeTop=null;upper=null;}
      selected=activeTop||activePants;
      size=(upper||pants)?.measurements?.label||'';
      cameraView=fittingView();
      $('dialog').close();product();renderShelf();apply();toast('샘플을 삭제했습니다.');
    }
    catch{b.disabled=false;toast('샘플을 삭제하지 못했습니다.');}
  };
};
$('register').onclick=openRegister;
const fittingQuery=new URLSearchParams(location.search);
const savedSamples=listSamples();
function pantReferenceProduct(ref){
  const original=builtins.find(i=>i.type==='pants' && (i.id===ref.sourceId || (i.code && i.code===ref.code) || i.name===ref.name));
  return {id:ref.id,reference:true,sourceId:ref.sourceId,name:ref.name,brand:ref.brand,code:ref.code,photo:ref.photo,
    type:'pants',category:'bottom',color:ref.color||original?.color||'#53676e',material:ref.material||original?.material||'denim',
    colourName:ref.colourName||original?.colourName||'',sizes:[ref.size],source:'내 옷장에 저장한 실측'};
}
async function initialiseSelection(){
  const itemId=fittingQuery.get('item');
  let requested=[...builtins,...feedProducts].find(item=>item.id===itemId);
  if(!requested && itemId?.startsWith('own-')){
    try{requested=(await savedSamples).find(item=>item.id===itemId);}catch{/* A storage error is shown in the sample shelf. */}
    if(!requested)toast('이 브라우저에서 해당 샘플을 찾지 못했습니다.');
  }
  const refId=fittingQuery.get('reference');
  if(refId){
    try{
      const ref=await getReference(refId);
      if(ref?.size && ref.type==='pants'){
        requested=pantReferenceProduct(ref);
      }else toast('이 브라우저에서 해당 기준 바지를 찾지 못했습니다.');
    }catch{toast('이 브라우저의 기준 옷을 불러오지 못했습니다.');}
  }
  if(requested){
    selected=requested;
    size=selected.sizes.find(row=>row.label===fittingQuery.get('size'))?.label || selected.sizes.find(row=>row.label==='M')?.label || selected.sizes[0].label;
    bodyOnly=false;cameraView=fittingView();
    setWornItem();
  }
  product();renderShelf();apply();
}
initialiseSelection();
savedSamples.then(records=>{samples=records;renderShelf();}).catch(()=>{loadError='이 브라우저에서는 저장된 샘플에 접근할 수 없습니다.';renderShelf();});
listReferences().then(records=>{
  referenceSamples=records.filter(r=>r.type==='pants' && r.size).map(pantReferenceProduct);
  renderShelf();
}).catch(()=>{});
