import {listReferences,saveReference} from './reference-store.mjs?v=2026-11-22m6';
import {adidas,denim,pantsMeasurementFields,garmentTypes,listSamples} from './catalog-data.mjs?v=2026-11-22m6';
import {products,recommend} from './fit-matches.mjs?v=2026-11-22m6';
import {openRegistration} from './register-fit.mjs?v=2026-11-22m6';
import {openComparison} from './compare-fit.mjs?v=2026-11-22m6';

const paths={
  home:'<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>',wardrobe:'<path d="M10 6a2 2 0 1 1 3 2c-1 .7-1 1-1 3l9 6v2H3v-2l9-6"/>',
  saved:'<path d="M20.5 5.5a5 5 0 0 0-8.5 3 5 5 0 0 0-8.5-3C.3 9.6 5.5 15.3 12 20c6.5-4.7 11.7-10.4 8.5-14.5z"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>',
  edit:'<path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4"/>',
  ruler:'<path d="m3 16 13-13 5 5L8 21zM7 12l2 2m1-5 2 2m1-5 2 2"/>',
  box:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5m-9 5v10"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5zM3 13l9 5 9-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',check:'<path d="m4 12 5 5L20 6"/>'
};
const icon=(k)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+paths[k]+'</svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageSrc=s=>/^(?:catalog\/|discovery-art\/|data:image\/(?:jpeg|webp|png);base64,|https:\/\/)/.test(s||'')?esc(s):'';
const nav=[['home','추천'],['wardrobe','내 옷장'],['saved','찜']];
const demo={...adidas,id:'preview-KC9315',size:adidas.sizes.find(s=>s.label==='M')};
const main=document.getElementById('content');
let references=[],legacy=[],matches=[],baseline,screen,timer;
let state={active:null,saved:[],pref:{},wear:{}};
try{Object.assign(state,JSON.parse(localStorage.getItem('selfit-discovery-v1')||'{}'));}catch{}
function tell(message){const el=document.getElementById('feedbackNotice');el.textContent=message;el.classList.add('shown');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('shown'),3000);}
function persist(){try{localStorage.setItem('selfit-discovery-v1',JSON.stringify(state));}catch{tell('이 브라우저에서는 선택을 임시로 보관합니다.');}}
async function load(){
  try{references=await listReferences();}
  catch{tell('브라우저에서 옷장 저장소를 열 수 없습니다.');}
  try{legacy=await listSamples();}catch{}
  render();
}
async function addPiece(piece){
  await saveReference(piece);
  references=[piece,...references.filter(r=>r.id!==piece.id)];
  state.active=piece.id;persist();go('home');tell('기준 옷을 등록했습니다.');

}
function go(next){if(location.hash==='#'+next){render();}else location.hash=next;window.scrollTo(0,0);}
function register(mode){openRegistration({mode,legacy,initialItem:mode==='denim'?denim:null,onSave:addPiece});}
const dimensions={chest:'가슴단면',length:'총장',sleeve:'소매',shoulder:'어깨'};
function difference(m){
  const labels=m.product.type==='pants'?Object.fromEntries(pantsMeasurementFields):dimensions;
  const fields=Object.keys(labels).filter(k=>Number.isFinite(m.deltas[k]));
  const largest=fields.sort((a,b)=>Math.abs(m.deltas[b])-Math.abs(m.deltas[a]))[0];
  if(!largest)return '비교할 실측을 확인해 주세요.';
  const diff=m.deltas[largest];
  if(Math.abs(diff)<.5)return '주요 실측이 기준 옷과 거의 같아요.';
  const wide=['chest','shoulder','waist','hip','thigh','hem'].includes(largest);
  return labels[largest]+' '+Number(Math.abs(diff).toFixed(1))+'cm '+(wide?(diff>0?'넓어요':'좁아요'):(diff>0?'길어요':'짧아요'));
}
function card(m){
  const p=m.product, saved=state.saved.includes(p.id);
  return '<article class="piece"><div class="piecepic"><button class="imagebtn" data-compare="'+esc(p.id)+'" aria-label="'+esc(p.name)+' 실측 비교"><img src="'+imageSrc(p.photo)+'" alt="'+esc(p.name)+'"></button><button class="heart" data-save="'+esc(p.id)+'" aria-label="'+esc(p.name)+' 찜" aria-pressed="'+saved+'">'+icon('saved')+'</button></div><div class="cardcopy"><div class="maker">'+esc(p.brand)+(p.demo?' <span>예시 상품</span>':'')+'</div><button class="piece-name" data-compare="'+esc(p.id)+'">'+esc(p.name)+'</button><div class="price">'+Number(p.price).toLocaleString('ko-KR')+'원</div><div class="verdict"><b>추천 '+esc(m.size.label)+'</b><span>'+esc(difference(m))+'</span></div><button class="detail" data-compare="'+esc(p.id)+'">'+icon('layers')+' 실측 비교</button></div></article>';
}
function referencePhoto(r){const src=imageSrc(r.photo);return src?'<img src="'+src+'" alt="">':icon('wardrobe');}
function fitReferenceLink(piece){
  if(piece.type!=='pants')return '';
  const query=new URLSearchParams({reference:piece.id});
  return '<a class="secondary" href="fitting.html?'+query+'#fit">'+icon('box')+' 내 바지 입어보기</a>';
}
function denimFeature(){
  const query=new URLSearchParams({item:denim.id,size:'M'});
  return '<section class="denim-feature" aria-labelledby="denimTitle"><img src="'+imageSrc(denim.photo)+'" alt="미디엄 블루 워시드 와이드 데님 팬츠"><div><h2 id="denimTitle">'+esc(denim.name)+'</h2><p>미디엄 블루 · XS–XL</p></div><div class="denim-actions"><a class="primary" href="fitting.html?'+query+'#fit">'+icon('box')+' 3D 피팅</a><button class="secondary" data-register="denim">'+icon('plus')+' 기준 옷 등록</button></div></section>';
}
function referenceStrip(){
  return '<section class="refstrip"><div class="tinyphoto">'+referencePhoto(baseline)+'</div><div class="referencecopy"><small>내 기준 옷</small><strong>'+esc(baseline.brand)+' '+esc(baseline.name)+' · '+esc(baseline.size.label)+'</strong></div>'+fitReferenceLink(baseline)+'<button class="secondary" data-go="wardrobe">기준 옷 변경</button></section>';
}
function hero(){return '<section class="hero"><div class="herocopy"><h1>가장 잘 맞는 옷<br>한 벌을 골라주세요<span>.</span></h1><p>내 옷의 실측으로 다른 브랜드에서<br class="mobilebreak"> 비슷한 핏과 사이즈를 찾아보세요.</p><div class="actions"><button class="primary" data-register="tag">'+icon('camera')+' 옷 택 촬영</button><button class="secondary" data-register="manual">'+icon('edit')+' 직접 등록</button></div></div><div class="heroart"><img src="discovery-art/hero.webp" alt="옷의 실측을 비교하기 위한 상의와 줄자"></div></section>';}
function preference(){const pref=state.pref[baseline.id]||'similar';return '<div class="preferences" aria-label="원하는 핏">'+[['similar','가장 비슷한 핏'],['shorter',baseline.type==='pants'?'기장은 조금 짧게':'소매는 조금 짧게']].map(([k,label])=>'<button data-pref="'+k+'" aria-pressed="'+(k===pref)+'">'+label+'</button>').join('')+'</div>';}
function home(hasRef){
  return (hasRef?referenceStrip():hero())+(!hasRef?denimFeature():'')+'<section class="results"><div class="sectiontitle"><div><h2>'+(hasRef?'내 옷과 비슷한 핏':'핏 추천 미리보기')+'</h2><p>'+(hasRef?'기준 옷과 같은 종류에서 실측이 가까운 순서예요.':'아디다스 KC9315 · M을 기준으로 비교한 예시예요.')+'</p></div>'+preference()+'</div><div class="cards">'+matches.map(card).join('')+'</div>'+(!matches.length?'<p class="empty">비교할 수 있는 같은 종류의 상품이 아직 없습니다.</p>':'')+'</section>';
}
function wardrobe(){
  return '<div class="sectiontitle pagehead"><div><h1>내 옷장</h1><p>비슷한 핏을 찾고 싶은 기준 옷을 선택하세요.</p></div><button class="primary" data-register="manual">'+icon('plus')+' 기준 옷 등록</button></div>'+
    (references.length?'<div class="wardgrid">'+references.map(r=>'<article class="owned"><div class="tinyphoto">'+referencePhoto(r)+'</div><div><small>'+esc(r.brand)+'</small><h3>'+esc(r.name)+' · '+esc(r.size.label)+'</h3><button class="detail" data-pick="'+esc(r.id)+'">'+(r.id===state.active?'선택한 옷으로 추천 보기':'이 옷과 비슷한 핏 찾기')+'</button>'+fitReferenceLink(r)+'</div></article>').join('')+'</div>':'<div class="empty">'+icon('wardrobe')+'<h2>첫 기준 옷을 등록해 보세요</h2><p>즐겨 입는 옷 한 벌의 브랜드와 사이즈로 시작할 수 있어요.</p><button class="secondary" data-register="tag">'+icon('camera')+' 옷 택 촬영</button></div>')+
    denimFeature()+(legacy.length?'<button class="secondary legacy" data-register="manual">기존 피팅룸 샘플에서 가져오기</button>':'');
}
function allSaved(){
  const all=state.saved.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  return '<div class="pagehead"><h1>찜한 옷</h1><p>관심 있는 상품을 모아두고 기준 옷과 다시 비교하세요.</p></div><div class="cards">'+all.map(p=>{
    const match=matches.find(m=>m.product.id===p.id);
    if(match)return card(match);
    return '<article class="piece"><div class="piecepic"><img src="'+imageSrc(p.photo)+'" alt="'+esc(p.name)+'"><button class="heart" data-save="'+esc(p.id)+'" aria-label="찜 해제" aria-pressed="true">'+icon('saved')+'</button></div><div class="cardcopy"><small>'+esc(p.brand)+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(garmentTypes[p.type])+' 기준 옷으로 비교해 보세요.</p><button class="detail" data-go="wardrobe">기준 옷 선택</button></div></article>';
  }).join('')+'</div>'+(!all.length?'<div class="empty">'+icon('saved')+'<h2>찜한 옷이 아직 없어요</h2><p>상품 사진의 하트를 눌러 저장하세요.</p><button class="secondary" data-go="home">추천 보기</button></div>':'');
}
function render(){
  screen=nav.some(([k])=>location.hash==='#'+k)?location.hash.slice(1):'home';
  const current=references.find(r=>r.id===state.active)||references[0];
  baseline=current||demo;
  const recent=Object.values(state.wear).filter(w=>w.reference===baseline.id).sort((a,b)=>b.time-a.time)[0];
  matches=recommend(baseline,state.pref[baseline.id]||'similar',recent?{[baseline.type]:recent.value}:{});
  for(const bar of document.querySelectorAll('.topnav,.bottomnav'))bar.innerHTML=nav.map(([k,n])=>'<a href="#'+k+'" '+(screen===k?'aria-current="page"':'')+'>'+icon(k)+n+'</a>').join('');
  main.innerHTML=screen==='home'?home(!!current):screen==='wardrobe'?wardrobe():allSaved();
}
main.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.register){register(d.register);return;}
  if(d.go){go(d.go);return;}
  if(d.pick){state.active=d.pick;persist();go('home');return;}
  if(d.pref){state.pref[baseline.id]=d.pref;persist();render();return;}
  if(d.save){const has=state.saved.includes(d.save);state.saved=has?state.saved.filter(x=>x!==d.save):[...state.saved,d.save];persist();render();tell(has?'찜에서 삭제했습니다.':'찜에 저장했습니다.');return;}
  if(d.compare){
    const m=matches.find(x=>x.product.id===d.compare);if(!m)return;
    const ref=baseline,key=JSON.stringify([ref.id,m.product.id,m.size.label]);
    openComparison({reference:ref,match:m,feedback:state.wear[key]?.value,onFeedback:value=>{
      state.wear[key]={value,reference:ref.id,time:Date.now()};persist();render();tell('착용 후기를 다음 추천에 반영했습니다.');
    },onTry:()=>{const q=new URLSearchParams({item:m.product.id,size:m.size.label});location.href='fitting.html?'+q+'#fit';}});
  }
});
document.querySelector('[data-icon="box"]').innerHTML=icon('box');
window.addEventListener('hashchange',render);
main.innerHTML='<p class="loading">옷장을 불러오는 중…</p>';load();
