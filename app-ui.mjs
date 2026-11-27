// Selfit 2.0 — ten-screen app shell.
// Splash · style onboarding · home · AI stylist · shop · product ·
// fit compare · 3D try-on link · closet · my page.
import {builtins,garmentTypes,measurementFields,pantsMeasurementFields} from './catalog-data.mjs?v=2026-11-27q';
import {products as sampleProducts,recommend,compareSize} from './fit-matches.mjs?v=2026-11-27s';
import {listReferences,saveReference} from './reference-store.mjs?v=2026-11-27q';
import {openRegistration} from './register-fit.mjs?v=2026-11-27q';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const won=n=>fmt.format(n)+'원';
const priceText=p=>p.price?won(p.price):'가격 미정';
const priceHtml=p=>p.price?`<p class="product-price">${won(p.price)}</p>`:`<p class="product-price alt">가격 미정</p>`;
const sourceText=p=>p?.source?String(p.source).replace(/제공하신\s*/g,'').replace(/\s*상품\s*/g,' ').trim():'';
const photoOk=src=>/^(?:catalog\/|looks\/|discovery-art\/|data:image\/(?:jpeg|png|webp);base64,|https:\/\/)/.test(src||'');
const photoOf=p=>photoOk(p?.photo)?p.photo:'';

/* icons */
const ICONS={
  home:'<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.6v-6H9.6v6H5a1 1 0 0 1-1-1Z"/>',
  looks:'<path d="M10 6.5a2 2 0 1 1 3.1 1.7c-.8.6-1.1 1-1.1 2.3l8.4 5.3a1 1 0 0 1-.5 1.9H4.1a1 1 0 0 1-.5-1.9L12 11.5"/>',
  bag:'<path d="M5 8h14l1.2 12H3.8L5 8Z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9"/>',
  closet:'<rect x="4" y="3" width="16" height="18" rx="1.6"/><path d="M12 3v18M8 10v2m8-2v2"/>',
  user:'<circle cx="12" cy="8" r="3.4"/><path d="M5.6 20.5v-.7a6.4 6.4 0 0 1 12.8 0v.7"/>',
  search:'<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4.2 4.2"/>',
  bell:'<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.6 2.1h-14Z"/><path d="M10 20.4a2 2 0 0 0 4 0"/>',
  left:'<path d="m14.5 5-7 7 7 7"/>',
  right:'<path d="m9.5 5 7 7-7 7"/>',
  heart:'<path d="M12 20.1S4.6 15.5 4.6 10.3A4.1 4.1 0 0 1 12 7.5a4.1 4.1 0 0 1 7.4 2.8c0 5.2-7.4 9.8-7.4 9.8Z"/>',
  share:'<path d="M12 15.2V4m0 0L8.5 7.5M12 4l3.5 3.5"/><path d="M5 12.5v7h14v-7"/>',
  plus:'<path d="M12 5.5v13M5.5 12h13"/>',
  sparkle:'<path d="m12 4 1.8 5.4L19.2 11l-5.4 1.6L12 18l-1.8-5.4L4.8 11l5.4-1.6Z"/><path d="M18.6 3.4v2.3M17.5 4.55h2.2"/>',
  arrow:'<path d="M4.5 12h14m-5.4-5.4L18.5 12l-5.4 5.4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  check:'<path d="m5 12.6 4.5 4.4L19 7"/>',
  ruler:'<path d="m3.6 15.5 11.9-11.9 4.9 4.9-11.9 11.9z"/><path d="m7.6 11.5 2 2m1-5 2 2m1-5 2 2"/>',
  camera:'<path d="M3.5 7.5h3.9l1.8-2.5h5.6l1.8 2.5h3.9v12.5h-17z"/><circle cx="12" cy="13.4" r="3.2"/>',
  cube:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.4M12 7.9v.2"/>',
  settings:'<path d="M4 7h6m4 0h6M4 12h10m4 0h2M4 17h3m4 0h9"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="17" r="2"/>',
  hanger:'<path d="M10 5.6a2.1 2.1 0 1 1 3.3 1.8c-.9.6-1.3 1-1.3 2.2l8.6 5.5a1.3 1.3 0 0 1-.6 2.4H4a1.3 1.3 0 0 1-.6-2.4L12 9.6"/>',
  send:'<path d="m4 12 16-7-6 16-2.6-6.4z"/>',
  trash:'<path d="M5 7h14M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  star:'<path d="m12 4 2.3 4.8 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 9.6l5.2-.8z"/>'
};
const icon=(n,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||ICONS.info}</svg>`;

/* data */
const STATE_KEY='selfit-app-v1';
const defaults=()=>({onboarded:false,styles:[],saved:[],cart:[],chat:[],sizes:{},compareRef:{},compareField:{},
  shopCat:'all',shopQuery:'',profile:{name:'시우',height:174.5,gender:'male'}});
let state=defaults();
try{
  const stored=JSON.parse(localStorage.getItem(STATE_KEY)||'null');
  if(stored&&typeof stored==='object')state={...state,...stored,profile:{...state.profile,...(stored.profile||{})}};
}catch{}
function save(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state));}catch{}}
let references=[];
async function refreshReferences(){try{references=await listReferences();}catch{references=[];}return references;}

const STYLES=[
  {id:'minimal',name:'미니멀',image:'looks/female-tailored.webp'},
  {id:'casual',name:'캐주얼',image:'looks/female-casual.webp'},
  {id:'street',name:'스트릿',image:'catalog/mood-inside-vtg-hood-jacket.webp'},
  {id:'romantic',name:'로맨틱',image:'catalog/polo-cable-halfzip.webp'},
  {id:'formal',name:'포멀',image:'looks/male-tailored.webp'},
  {id:'sporty',name:'스포티',image:'catalog/nike-sport-tee-white.webp'},
  {id:'amekaji',name:'아메카지',image:'catalog/underoff-university-hoodie.webp'},
  {id:'vintage',name:'빈티지',image:'looks/male-classic.webp'},
  {id:'feminine',name:'페미닌',image:'catalog/trillion-striped-oxford.webp'}
];

const LOOKS=[
  {id:'office',tag:'출근룩',title:'미니멀 오피스',image:'looks/female-tailored.webp',
   items:['trillion-striped-oxford','signature-wide-chino'],
   note:'셔츠는 단정하게 넣어 입고, 팬츠는 와이드 실루엣으로 여유를 준 조합이에요.'},
  {id:'date',tag:'데이트룩',title:'소프트 니트 데이트',image:'looks/female-casual.webp',
   items:['polo-cable-halfzip','washed-denim-medium-blue'],
   note:'케이블 니트의 질감과 데님의 색 대비를 살린 부드러운 데일리 코디예요.'},
  {id:'weekend',tag:'주말 나들이',title:'캐주얼 위크엔드',image:'looks/male-casual.webp',
   items:['nike-sport-tee-white','washed-denim-medium-blue','mood-inside-vtg-hood-jacket'],
   note:'가벼운 티셔츠 위에 워크 자켓을 걸쳐 입어 아침저녁 기온 차에도 편해요.'},
  {id:'travel',tag:'여행룩',title:'레이어드 트래블',image:'looks/male-classic.webp',
   items:['underoff-university-hoodie','signature-wide-chino'],
   note:'오래 걸어도 편한 후드티와 치노 조합이에요. 가방과 신발은 밝은 톤을 매치해 보세요.'},
  {id:'special',tag:'특별한 날',title:'포멀 클래식',image:'looks/male-tailored.webp',
   items:['trillion-striped-oxford','signature-wide-chino','polo-cable-halfzip'],
   note:'셔츠와 팬츠를 단정하게 맞추고 어깨에 니트를 걸쳐 격식을 조금 풀었어요.'},
  {id:'other',tag:'다른 스타일',title:'빈티지 워크',image:'catalog/mood-inside-vtg-hood-jacket.webp',
   items:['mood-inside-vtg-hood-jacket','washed-denim-medium-blue','nike-sport-tee-white'],
   note:'워시드 데님과 빈티지한 워크 자켓을 겹쳐 입은 스트릿 무드예요.'}
];

const CATEGORY={top:'상의',bottom:'하의',outer:'아우터',shoes:'신발'};
const ORDER=['mood-inside-vtg-hood-jacket','washed-denim-medium-blue','nike-sport-tee-white','trillion-striped-oxford','signature-wide-chino','KC9315','polo-cable-halfzip','underoff-university-hoodie','glossy-hooded-puffer'];
const allProducts=[...builtins.map(g=>({...g,owned:true})),...sampleProducts].sort((a,b)=>{
  const ia=ORDER.indexOf(a.id),ib=ORDER.indexOf(b.id);
  return (ia<0?99:ia)-(ib<0?99:ib);
});
const byId=new Map(allProducts.map(p=>[p.id,p]));
const catalogFeed=allProducts.map(p=>({...p,sizes:(p.sizes||[]).map(s=>({...s,stock:s.stock!==false}))}));

const categoryOf=p=>p.category||(p.type==='pants'?'bottom':'top');
const fieldsFor=type=>type==='pants'?pantsMeasurementFields:measurementFields;
const displayFields=type=>type==='pants'
  ?[['waist','허리단면'],['hip','엉덩이단면'],['thigh','허벅지단면'],['rise','밑위'],['length','총장'],['hem','밑단단면']]
  :[['chest','가슴단면'],['shoulder','어깨너비'],['sleeve','소매길이'],['length','총장'],['hem','밑단단면']];
const upperFields=[['chest','가슴단면'],['shoulder','어깨너비'],['sleeve','소매길이'],['length','총장'],['hem','밑단단면']];
const measureNames={chest:'가슴단면',shoulder:'어깨너비',sleeve:'소매길이',length:'총장',waist:'허리단면',hip:'엉덩이단면',thigh:'허벅지단면',rise:'밑위',hem:'밑단단면'};
const wideFields=['chest','shoulder','waist','hip','thigh','hem'];
const centimeters=v=>Number.isFinite(v)&&v>0?fmt.format(v):'—';
const availSizes=p=>(p.sizes||[]).filter(s=>s.stock!==false);
function defaultSize(p){
  const sizes=availSizes(p);
  const kept=state.sizes[p.id];
  if(kept&&sizes.some(s=>s.label===kept))return kept;
  return sizes.find(s=>s.label==='M')?.label??sizes[0]?.label??'M';
}
const sizeRange=p=>{const s=p.sizes||[];return s.length?`${s[0].label}–${s[s.length-1].label}`:'—';};
const tryonHref=(p,size)=>'fitting.html?'+new URLSearchParams({item:p.id,size:size||defaultSize(p)}).toString()+'#fit';

function refCandidates(type){
  const pants=type==='pants';
  const fits=t=>pants?t==='pants':t!=='pants';
  const registered=(references||[]).filter(r=>r.size&&fits(r.type)).map(r=>({
    id:r.id,name:r.name,brand:r.brand||'내 옷장',photo:r.photo,type:r.type,size:r.size,registered:true
  }));
  const owned=builtins.filter(g=>fits(g.type)).map(g=>({
    id:g.id,name:g.name,brand:g.brand||'SELFIT',photo:g.photo,type:g.type,
    size:g.sizes.find(s=>s.label==='M')||g.sizes[0],owned:true
  }));
  return [...registered,...owned].sort((a,b)=>(a.type===type?0:1)-(b.type===type?0:1));
}
const typeName=type=>garmentTypes[type]||CATEGORY[type]||'옷';

/* toast · sheet */
let toastTimer;
function toast(message){
  const el=$('#toast');if(!el)return;
  el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}
function closeSheets(){for(const d of $$('dialog.sheet')){if(d.open)d.close();}}
function sheet(title,html){
  closeSheets();
  const d=document.createElement('dialog');
  d.className='sheet';d.setAttribute('aria-label',title);
  d.innerHTML=`<div class="sheet-inner"><div class="sheet-grip"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('close')}</button></div><div class="sheet-body">${html}</div></div>`;
  document.body.append(d);
  d.addEventListener('click',e=>{if(e.target===d)closeSheets();});
  d.addEventListener('close',()=>d.remove(),{once:true});
  d.showModal();
  return d;
}

/* routing */
const TITLES={splash:'Selfit 2.0',onboarding:'스타일 선택 · Selfit 2.0',home:'Selfit 2.0 · AI 퍼스널 스타일리스트',stylist:'AI 스타일리스트 · Selfit 2.0',shop:'추천 상품 · Selfit 2.0',product:'상품 상세 · Selfit 2.0',compare:'핏 비교하기 · Selfit 2.0',closet:'내 옷장 · Selfit 2.0',mypage:'마이페이지 · Selfit 2.0'};
const TABS=[['home','홈','home'],['stylist','코디','looks'],['shop','쇼핑','bag'],['closet','옷장','closet'],['mypage','마이','user']];
function parseRoute(){
  const raw=location.hash.replace(/^#/,'');
  const [path,qs]=raw.split('?');
  const seg=path.split('/').filter(Boolean).map(s=>{try{return decodeURIComponent(s);}catch{return s;}});
  return {name:seg[0]||'home',param:seg.slice(1).join('/')||null,query:new URLSearchParams(qs||'')};
}
function go(hash){
  closeSheets();
  const next=hash.startsWith('#')?hash:'#'+hash;
  if(location.hash===next)render();else location.hash=next;
}

/* screens */
function viewSplash(){
  return `<div class="splash">
    <div class="splash-text">
      <div class="brand-xl">Selfit <span class="ver">2.0</span></div>
      <p class="kicker">AI Personal Stylist</p>
      <p class="splash-copy">당신의 스타일을 더 특별하게,<br>이제는 AI와 함께.</p>
    </div>
    <div class="splash-art"><img src="looks/female-tailored.webp" alt="미니멀 오피스 룩을 입은 모델" fetchpriority="high"></div>
    <div class="splash-actions">
      <button class="btn primary block" data-action="start">시작하기</button>
      <button class="login" data-action="guest">로그인</button>
    </div>
  </div>`;
}

function viewOnboarding(){
  return `<header class="screen-head"><button class="icon-btn" data-action="back-splash" aria-label="이전 화면">${icon('left')}</button></header>
  <section class="onboard">
    <p class="kicker">Style preference</p>
    <h1>어떤 스타일을<br>좋아하시나요?</h1>
    <p class="sub">선호하는 스타일을 선택하면 더 정확한 추천을 받을 수 있어요.<br>여러 개를 골라도 괜찮아요.</p>
    <div class="style-grid">
      ${STYLES.map(s=>`<button class="style-card" data-action="toggle-style" data-id="${s.id}" aria-pressed="${state.styles.includes(s.id)}">
        <img src="${s.image}" alt="" loading="lazy"><span class="label">${esc(s.name)}</span><span class="tick">${icon('check')}</span>
      </button>`).join('')}
    </div>
    <div class="onboard-foot">
      <button class="btn primary block" data-action="finish-onboarding">다음</button>
      <button class="skip" data-action="skip-onboarding">건너뛰기 ›</button>
    </div>
  </section>`;
}

function viewHome(){
  const look=LOOKS[0];
  return `<header class="screen-head home-head">
    <a class="wordmark" href="#home">Selfit<span class="ver">2.0</span></a>
    <nav class="desk-nav" aria-label="주 메뉴"><a href="#stylist">코디</a><a href="#shop">쇼핑</a><a href="#closet">옷장</a><a href="#mypage">마이</a><a href="fitting.html">3D 피팅룸</a></nav>
    <button class="icon-btn" data-action="sheet" data-kind="notifications" aria-label="알림">${icon('bell')}</button>
  </header>
  <form class="search-row" id="homeSearch" role="search">
    <div class="search-field">${icon('search')}<input type="search" name="q" placeholder="지금, 어떤 스타일을 찾고 있나요?" aria-label="상품 검색" value="${esc(state.shopQuery||'')}"></div>
  </form>
  <section class="hero-card" aria-label="오늘의 추천 코디">
    <img src="${look.image}" alt="${esc(look.title)}" fetchpriority="high">
    <div class="hero-copy"><span class="eyebrow">TODAY'S PICK</span><h2>오늘의 추천 코디</h2><p>당신의 스타일에 맞춘<br>코디를 확인해보세요.</p></div>
    <button class="hero-arrow" data-action="open-look" data-id="${look.id}" aria-label="오늘의 추천 코디 보기">${icon('arrow')}</button>
  </section>
  <section class="quick-row" aria-label="바로가기">
    <button class="quick" data-action="open-look" data-id="${look.id}"><span class="bubble">${icon('looks')}</span>코디</button>
    <a class="quick" href="#shop"><span class="bubble">${icon('bag')}</span>쇼핑</a>
    <a class="quick" href="#closet"><span class="bubble">${icon('closet')}</span>옷장</a>
    <a class="quick" href="#stylist"><span class="bubble">${icon('sparkle')}</span>AI 스타일리스트</a>
  </section>
  <section class="block">
    <div class="block-head"><h2>지금 인기 있는 스타일</h2><a class="text-link" href="#stylist">더 보기</a></div>
    <div class="hscroll">
      ${LOOKS.slice(0,5).map(l=>`<button class="style-card" data-action="open-look" data-id="${l.id}" aria-label="${esc(l.tag)} ${esc(l.title)}"><img src="${l.image}" alt="" loading="lazy"><span class="label">${esc(l.tag)}</span></button>`).join('')}
    </div>
  </section>`;
}

function viewShop(route){
  const query=route.query.has('q')?route.query.get('q'):state.shopQuery;
  state.shopQuery=query||'';
  const cats=[['all','전체'],['top','상의'],['bottom','하의'],['outer','아우터'],['shoes','신발']];
  return `<header class="screen-head">
    <button class="icon-btn" data-nav="home" aria-label="홈으로">${icon('left')}</button>
    <h1 class="head-title">추천 상품</h1>
    <div class="head-action"><button class="icon-btn" data-action="sheet" data-kind="cart" aria-label="장바구니">${icon('bag')}<span class="badge" id="cartBadge" ${cartCount()?'':'hidden'}>${cartCount()}</span></button></div>
  </header>
  <div class="filter-row" id="shopCats" aria-label="카테고리">
    ${cats.map(([k,l])=>`<button class="chip" data-action="shop-cat" data-cat="${k}" aria-pressed="${(state.shopCat||'all')===k}">${l}</button>`).join('')}
  </div>
  <div class="shop-tools">
    <div class="search-field">${icon('search')}<input id="shopSearch" type="search" placeholder="상품명, 브랜드로 검색" aria-label="상품 검색" value="${esc(state.shopQuery)}"></div>
    <span class="result-count" id="shopCount"></span>
  </div>
  <div class="product-grid" id="shopGrid"></div>`;
}

function productCard(p){
  const saved=state.saved.includes(p.id);
  const flag=p.owned?'3D 착용':p.demo?'예시 상품':'';
  return `<article class="product-card">
    <div class="product-art">
      <a href="#product/${encodeURIComponent(p.id)}" aria-label="${esc(p.name)} 상세 보기">${photoOf(p)?`<img src="${photoOf(p)}" alt="${esc(p.name)}" loading="lazy">`:`<span class="ph">${icon('hanger')}</span>`}</a>
      ${flag?`<span class="badge-flag">${flag}</span>`:''}
      <button class="heart" data-action="heart" data-id="${p.id}" aria-pressed="${saved}" aria-label="${esc(p.name)} 찜">${icon('heart')}</button>
    </div>
    <p class="product-brand">${esc(p.brand||'SELFIT')}</p>
    <a class="product-name" href="#product/${encodeURIComponent(p.id)}">${esc(p.name)}</a>
    ${priceHtml(p)}
    <p class="product-spec">${esc(sizeRange(p))} · ${esc(typeName(p.type))}</p>
  </article>`;
}

function shopList(){
  const q=(state.shopQuery||'').trim().toLowerCase();
  const cat=state.shopCat||'all';
  return allProducts.filter(p=>(cat==='all'||categoryOf(p)===cat)&&
    (!q||[p.name,p.brand,p.colourName,typeName(p.type)].join(' ').toLowerCase().includes(q)));
}
function paintShop(){
  const list=shopList(),grid=$('#shopGrid');if(!grid)return;
  grid.innerHTML=list.length?list.map(productCard).join(''):`<div class="empty-state" style="grid-column:1/-1">${icon('search')}<h2>조건에 맞는 상품이 없어요</h2>다른 검색어나 카테고리로 찾아보세요.</div>`;
  const count=$('#shopCount');if(count)count.textContent=`${list.length}개 상품`;
}

function measureRows(p,row){
  const fields=p.type==='pants'?pantsMeasurementFields:upperFields;
  return fields.map(([k,label])=>`<tr><th>${label}</th><td>${centimeters(row?.[k])}</td></tr>`).join('');
}

function viewProduct(route){
  const p=byId.get(route.param);
  if(!p)return `${head('상품을 찾을 수 없어요','shop')}<div class="empty-state">${icon('info')}<h2>상품 정보가 없어요</h2><button class="btn secondary small" data-nav="shop">상품 목록으로</button></div>`;
  const size=defaultSize(p),row=p.sizes.find(s=>s.label===size)||p.sizes[0];
  const saved=state.saved.includes(p.id);
  return `<header class="screen-head">
    <button class="icon-btn" data-nav="shop" aria-label="상품 목록">${icon('left')}</button>
    <h1 class="head-title">상품 상세</h1>
    <div class="head-action">
      <button class="icon-btn" data-action="heart" data-id="${p.id}" aria-pressed="${saved}" aria-label="찜">${icon('heart')}</button>
      <button class="icon-btn" data-action="share" data-id="${p.id}" aria-label="공유">${icon('share')}</button>
    </div>
  </header>
  <div class="product-layout">
    <div class="product-hero">${photoOf(p)?`<img src="${photoOf(p)}" alt="${esc(p.name)}">`:`<span class="ph">${icon('hanger')}</span>`}</div>
    <div class="product-info">
      <p class="p-brand">${esc(p.brand||'SELFIT')}</p>
      <h2 class="p-name">${esc(p.name)}</h2>
      <p class="p-price${p.price?'':' alt'}">${priceText(p)} ${p.demo?'<small style="font-size:11px;color:#8a857c">예시 상품</small>':''}</p>
      <p class="p-meta">${esc(typeName(p.type))} · ${esc(sizeRange(p))}</p>
      <div class="p-section"><span class="label">컬러</span><small>${esc(p.colourName||'기본')}</small></div>
      <div class="colour-row"><span class="swatch" style="background:${esc(p.color||'#d8d2c6')}"></span>${esc(p.colourName||'기본')}</div>
      <div class="p-section"><span class="label">사이즈</span><small>${p.type==='pants'?'허리단면 기준':'실측 단면 기준'}</small></div>
      <div class="size-grid" id="sizeGrid">
        ${p.sizes.map(s=>`<button class="size-btn" data-action="size" data-id="${p.id}" data-size="${esc(s.label)}" aria-pressed="${s.label===size}" ${s.stock===false?'disabled':''}>${esc(s.label)}</button>`).join('')}
      </div>
      <div class="p-section" style="margin-top:18px"><span class="label">선택 사이즈 실측</span><small>cm</small></div>
      <table class="measure-table"><thead><tr><th>부위</th><th id="sizeHead">${esc(size)}</th></tr></thead><tbody id="sizeMeasures">${measureRows(p,row)}</tbody></table>
      ${sourceText(p)?`<p class="section-note">실측 출처 · ${esc(sourceText(p))}</p>`:''}
      <div class="buy-bar">
        <button class="btn primary block" data-action="tryon" data-id="${p.id}">${icon('cube','sm')} 가상 착용</button>
        <div class="btn-row">
          <button class="btn secondary" data-action="add-cart" data-id="${p.id}">장바구니</button>
          <button class="btn primary" data-action="buy" data-id="${p.id}">구매하기</button>
        </div>
        <p class="buy-note">${p.price?'결제 연동 전 데모 상품이에요.':'브랜드 실측으로 등록된 상품이에요.'}</p>
      </div>
      <button class="compare-banner" data-nav="compare/${encodeURIComponent(p.id)}">
        ${icon('ruler')}
        <span><strong>내 옷과 비교하기</strong><span>실측으로 핏과 사이즈를 비교해요</span></span>
        ${icon('right','sm')}
      </button>
    </div>
  </div>`;
}

function head(title,back='home'){
  return `<header class="screen-head"><button class="icon-btn" data-nav="${back}" aria-label="뒤로 가기">${icon('left')}</button><h1 class="head-title">${esc(title)}</h1></header>`;
}

function pickReference(p,candidates){
  const chosen=state.compareRef[p.id];
  const kept=candidates.find(r=>r.id===chosen);
  if(kept)return kept;
  let best=null;
  for(const c of candidates){
    let avg=null;
    for(const s of availSizes(p)){
      const cmp=compareSize(c,p,s,0);
      if(!cmp)continue;
      const vals=Object.values(cmp.deltas).filter(v=>Number.isFinite(v));
      if(!vals.length)continue;
      const a=vals.reduce((n,v)=>n+Math.abs(v),0)/vals.length;
      if(avg===null||a<avg)avg=a;
    }
    if(avg!==null&&(!best||avg<best.avg))best={ref:c,avg};
  }
  return best?best.ref:candidates[0];
}
function viewCompare(route){
  const p=byId.get(route.param);
  if(!p)return `${head('핏 비교하기','shop')}<div class="empty-state">${icon('info')}<h2>비교할 상품이 없어요</h2></div>`;
  const candidates=refCandidates(p.type).filter(r=>r.id!==p.id);
  if(!candidates.length){
    return `${head('핏 비교하기','shop')}
      <div class="empty-state">${icon('ruler')}<h2>같은 종류의 기준 옷이 없어요</h2>
      <p>내 옷장에 비교할 옷을 먼저 등록하면<br>실측 차이를 계산해 드려요.</p>
      <div class="btn-row" style="max-width:320px;margin:18px auto 0">
        <button class="btn secondary small" data-nav="shop">상품 보기</button>
        <button class="btn primary small" data-action="add-item">옷 등록</button>
      </div></div>`;
  }
  const ref=pickReference(p,candidates);
  const sizes=availSizes(p);
  let best=null;
  for(const s of sizes){
    const c=compareSize(ref,p,s,0);
    if(c&&(!best||c.score<best.score))best={...c,label:s.label};
  }
  const kept=state.sizes[p.id];
  const sizeLabel=sizes.some(s=>s.label===kept)?kept:(best?.label||sizes[0]?.label);
  const sizeRow=p.sizes.find(s=>s.label===sizeLabel);
  const cmp=compareSize(ref,p,sizeRow,0);
  const deltas=cmp?.deltas||{};
  const field=state.compareField[p.id]||'all';
  const analysis=fitAnalysis(deltas);
  return `${head('핏 비교하기','product/'+encodeURIComponent(p.id))}
  <div class="compare-layout">
    <div class="compare-main">
      <div class="pair">
        <button class="pair-card" data-action="ref-sheet" data-id="${p.id}" aria-label="기존 옷 변경">
          <span class="tag">기존 옷<b>변경</b></span>
          ${photoOf(ref)?`<img src="${photoOf(ref)}" alt="${esc(ref.name)}">`:`<span class="noimg">${icon('hanger')}</span>`}
          <p class="name">${esc(ref.name)}</p>
          <p class="meta">${esc(ref.brand||'내 옷장')} · ${esc(ref.size?.label||'')}</p>
        </button>
        <div class="pair-card">
          <span class="tag">비교할 옷</span>
          ${photoOf(p)?`<img src="${photoOf(p)}" alt="${esc(p.name)}">`:`<span class="noimg">${icon('hanger')}</span>`}
          <p class="name">${esc(p.name)}</p>
          <p class="meta">${esc(p.brand||'SELFIT')} · ${esc(sizeLabel)}</p>
        </div>
      </div>
      <div class="compare-block">
        <h2>측정 부위</h2>
        <p class="sub">같은 측정 기준의 단면 실측만 비교해요. 단위 cm.</p>
        <div class="filter-row" id="compareTabs" aria-label="측정 부위">
          <button class="chip" data-action="compare-tab" data-id="${p.id}" data-field="all" aria-pressed="${field==='all'}">전체</button>
          ${displayFields(p.type).filter(([k])=>Number.isFinite(sizeRow?.[k])||Number.isFinite(ref.size?.[k])).map(([k,label])=>`<button class="chip" data-action="compare-tab" data-id="${p.id}" data-field="${k}" aria-pressed="${field===k}">${label.replace('단면','').replace('너비','')}</button>`).join('')}
        </div>
        <table class="compare-table">
          <thead><tr><th>부위</th><th>기존 옷</th><th>비교할 옷</th><th>차이</th></tr></thead>
          <tbody id="compareRows">${compareRows(p,ref,sizeRow,deltas,field)}</tbody>
        </table>
      </div>
    </div>
    <div class="compare-side">
      <div class="ai-box">
        <div class="ai-head">${icon('sparkle')}<h2>AI 핏 분석 결과</h2></div>
        <p class="verdict">${esc(analysis.verdict)}</p>
        ${analysis.points.length?`<ul>${analysis.points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
        <p class="tip">${esc(analysis.tip)}</p>
        ${best?`<span class="recommend-pill">${icon('check','xs')} AI 추천 사이즈 ${esc(best.label)}</span>`:''}
      </div>
      <div class="compare-actions">
        <button class="btn primary block" data-action="tryon" data-id="${p.id}" data-size="${esc(sizeLabel)}">${icon('cube','sm')} 3D로 입어보기</button>
        <button class="btn secondary block" data-nav="shop">다른 상품도 비교하기</button>
      </div>
    </div>
  </div>`;
}

function compareRows(p,ref,sizeRow,deltas,field){
  const fields=displayFields(p.type).filter(([k])=>field==='all'||k===field);
  return fields.map(([k,label])=>{
    const d=deltas?.[k];
    return `<tr><th>${label}</th><td class="cm">${centimeters(ref.size?.[k])}</td><td class="cm">${centimeters(sizeRow?.[k])}</td><td>${deltaChip(d)}</td></tr>`;
  }).join('');
}
function deltaChip(d){
  if(!Number.isFinite(d))return '<span class="delta na">—</span>';
  if(Math.abs(d)<0.05)return '<span class="delta zero">0</span>';
  return `<span class="delta ${d>0?'up':'down'}">${d>0?'+':''}${fmt.format(d)}</span>`;
}

function fitAnalysis(deltas={}){
  const entries=Object.entries(deltas).filter(([,v])=>Number.isFinite(v));
  if(entries.length<2)return {verdict:'같은 기준으로 비교할 수 있는 실측이 부족해요.',points:[],tip:'옷장에서 실측이 채워진 옷을 기준으로 선택해 주세요.'};
  const points=entries.filter(([,v])=>Math.abs(v)>=0.5).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,3)
    .map(([k,v])=>{
      const wide=wideFields.includes(k);
      const word=wide?(v>0?'넓어요':'좁아요'):(v>0?'길어요':'짧아요');
      return `${measureNames[k]} ${v>0?'+':''}${fmt.format(v)}cm ${word}`;
    });
  const avg=entries.reduce((n,[,v])=>n+Math.abs(v),0)/entries.length;
  const verdict=avg<1.1?'기존 옷과 거의 같은 실루엣이에요.':avg<2.4?'전체적으로 비슷하지만 몇 군데 차이가 있어요.':'기존 옷과 실루엣 차이가 큰 편이에요.';
  const width=deltas.chest??deltas.waist??0;
  const tip=width>2.5?'한 사이즈 아래도 함께 비교해 보세요.':width<-1?'안에 레이어드를 입기에는 여유가 적어요.':'지금 사이즈가 기존 옷과 가장 비슷해요.';
  return {verdict,points,tip};
}

function closetItems(){
  const own=references.map(r=>({id:r.id,name:r.name,brand:r.brand||'내 옷장',photo:r.photo,type:r.type,category:categoryOf(r.type),size:r.size,registered:true}));
  const base=builtins.map(g=>({...g,size:g.sizes.find(s=>s.label==='M')||g.sizes[0],owned:true}));
  return [...own,...base];
}

function viewCloset(){
  return `${head('내 옷장','home')}
  <p class="section-note" id="closetCount">옷장을 불러오는 중…</p>
  <div class="filter-row" id="closetCats" aria-label="카테고리">
    ${[['all','전체'],['top','상의'],['bottom','하의'],['outer','아우터']].map(([k,l])=>`<button class="chip" data-action="closet-cat" data-cat="${k}" aria-pressed="${(state.closetCat||'all')===k}">${l}</button>`).join('')}
  </div>
  <div class="closet-grid" id="closetGrid"></div>
  <p class="section-note closet-note">${icon('info','xs')} 옷장에 등록한 실측은 핏 비교와 사이즈 추천의 기준이 돼요. 3D 피팅룸에서도 같은 옷을 입어볼 수 있어요.</p>`;
}
function paintCloset(){
  const grid=$('#closetGrid');if(!grid)return;
  const cat=state.closetCat||'all';
  const items=closetItems().filter(it=>cat==='all'||it.category===cat);
  const count=$('#closetCount');
  if(count)count.textContent=`보유 ${closetItems().length}벌 · 실측이 등록된 옷만 3D로 입어볼 수 있어요.`;
  grid.innerHTML=items.map(it=>{
    const meta=it.registered?(it.size?.label||''):(it.brand||'');
    const inner=`<span class="art">${photoOf(it)?`<img src="${photoOf(it)}" alt="${esc(it.name)}" loading="lazy">`:`<span class="ph">${icon('hanger')}</span>`}</span><span class="cap"><b>${esc(it.name)}</b>${meta?`<small>${esc(meta)}</small>`:''}</span>`;
    return it.registered
      ?`<button class="closet-item" data-action="owned-item" data-id="${esc(it.id)}" aria-label="${esc(it.name)} 실측 보기">${inner}</button>`
      :`<a class="closet-item" href="#product/${encodeURIComponent(it.id)}" aria-label="${esc(it.name)} 상세 보기">${inner}</a>`;
  }).join('')+`<button class="add-card" data-action="add-item">${icon('plus')}<span>옷 추가하기</span></button>`;
}

function viewMypage(){
  const styles=state.styles.map(id=>STYLES.find(s=>s.id===id)?.name).filter(Boolean);
  const items=closetItems();
  const initial=(state.profile.name||'S').slice(0,1);
  const menu=[
    ['style-analysis','내 스타일 분석','sparkle'],
    ['closet','내 옷장','closet'],
    ['orders','주문 내역','bag'],
    ['saved','관심 상품','heart'],
    ['settings','설정','settings'],
    ['support','고객센터','info']
  ];
  return `${head('마이페이지','home')}
  <div class="mypage-grid">
    <section>
      <div class="profile">
        <div class="avatar" aria-hidden="true">${esc(initial)}</div>
        <div><h1>${esc(state.profile.name)}님</h1><p class="member">Selfit 멤버 · AI 퍼스널 스타일리스트</p></div>
        <button class="edit" data-action="sheet" data-kind="profile">편집</button>
      </div>
      <dl class="stats">
        <div><dt>선호 스타일</dt><dd>${styles.length?esc(styles[0])+(styles.length>1?` 외 ${styles.length-1}`:''):'미설정'}</dd></div>
        <div><dt>체형</dt><dd>${fmt.format(state.profile.height)}cm</dd></div>
        <div><dt>보유</dt><dd>${items.length}벌</dd></div>
      </dl>
    </section>
    <nav class="menu" aria-label="마이페이지 메뉴">
      ${menu.map(([key,label,ic])=>key==='closet'
        ?`<a class="menu-row" href="#closet">${icon(ic)}<span>${label}</span>${icon('right','sm chev')}</a>`
        :`<button class="menu-row" data-action="sheet" data-kind="${key}">${icon(ic)}<span>${label}</span>${icon('right','sm chev')}</button>`).join('')}
      <p class="mypage-foot">Selfit 2.0 · 실측 기반 AI 핏 추천<br>옷장 데이터는 이 브라우저에만 저장됩니다.</p>
    </nav>
  </div>`;
}

function viewStylist(){
  const greeting='안녕하세요!\n오늘은 어떤 스타일을 찾으시나요?\n상황을 선택하거나, 자유롭게 말해 주세요.';
  const chips=['출근룩','데이트룩','주말 나들이','여행룩','특별한 날','다른 스타일'];
  const chat=state.chat.length?state.chat:[{role:'ai',text:greeting,greeting:true}];
  return `<header class="screen-head">
    <button class="icon-btn" data-nav="home" aria-label="홈으로">${icon('left')}</button>
    <h1 class="head-title">AI 스타일리스트</h1>
    <div class="head-action"><button class="icon-btn" data-action="clear-chat" aria-label="대화 지우기">${icon('trash')}</button></div>
  </header>
  <div class="stylist">
    <div class="chat" id="chat">
      ${chat.map(m=>m.role==='me'
        ?`<div class="msg me">${esc(m.text)}</div>`
        :`<div class="msg-wrap"><div class="msg ai">${esc(m.text)}</div>
           ${m.greeting?`<div class="chips">${chips.map(c=>`<button class="chip-btn" data-action="chat-chip" data-text="${esc(c)}">${esc(c)}</button>`).join('')}</div>`:''}
           ${m.items?.length?`<div class="rec-list">${m.items.map(it=>recCard(it)).join('')}</div>`:''}
         </div>`).join('')}
    </div>
    <form class="composer" id="chatForm">
      <input id="chatInput" type="text" placeholder="메시지를 입력하세요…" aria-label="메시지 입력" autocomplete="off">
      <button class="send" type="submit" aria-label="보내기">${icon('send')}</button>
    </form>
    <p class="chat-hint">실측 데이터로 사이즈를 함께 알려드려요.</p>
  </div>`;
}
function recCard(it){
  const p=byId.get(it.id);if(!p)return '';
  const size=it.size||defaultSize(p);
  return `<div class="rec-card">
    ${photoOf(p)?`<img src="${photoOf(p)}" alt="" loading="lazy">`:`<span class="ph">${icon('hanger')}</span>`}
    <div class="rec-body"><a class="rec-name" href="#product/${encodeURIComponent(p.id)}">${esc(p.name)}</a><p class="rec-meta">${esc(p.brand||'SELFIT')} · ${esc(size)} 추천 · ${priceText(p)}</p></div>
    <a class="rec-try" href="${tryonHref(p,size)}">3D 착용</a>
  </div>`;
}

const VIEWS={splash:viewSplash,onboarding:viewOnboarding,home:viewHome,shop:viewShop,product:viewProduct,compare:viewCompare,closet:viewCloset,mypage:viewMypage,stylist:viewStylist};

/* state helpers */
function cartCount(){return state.cart.reduce((n,c)=>n+(c.qty||1),0);}
function saveCart(){save();const badge=$('#cartBadge');if(badge){badge.textContent=cartCount();badge.hidden=!cartCount();}}
function addToCart(p,size){
  const key=c=>c.id===p.id&&c.size===size;
  state.cart=state.cart.some(key)?state.cart.map(c=>key(c)?{...c,qty:(c.qty||1)+1}:c):[...state.cart,{id:p.id,size,qty:1}];
  saveCart();toast('장바구니에 담았어요.');
}
function toggleSaved(id){
  const has=state.saved.includes(id);
  state.saved=has?state.saved.filter(x=>x!==id):[...state.saved,id];
  save();
  for(const b of $$('[data-action="heart"][data-id="'+CSS.escape(id)+'"]'))b.setAttribute('aria-pressed',String(!has));
  toast(has?'관심 상품에서 뺐어요.':'관심 상품에 담았어요.');
}

/* stylist answers */
function findLook(text){
  const t=text.toLowerCase();
  if(/출근|오피스|회사|비즈니스|면접|미팅|출장/.test(t))return LOOKS[0];
  if(/데이트|소개팅|만남|약속/.test(t))return LOOKS[1];
  if(/주말|나들이|산책|휴일|주말룩/.test(t))return LOOKS[2];
  if(/여행|휴가|공항|트립|여행룩/.test(t))return LOOKS[3];
  if(/특별|파티|결혼|모임|저녁|행사|하객/.test(t))return LOOKS[4];
  if(/다른|새로운|색다른|빈티지|스트릿|스트리트|힙/.test(t))return LOOKS[5];
  const pref=state.styles.map(id=>STYLES.find(s=>s.id===id)?.name).filter(Boolean).find(n=>t.includes(n));
  if(pref){const found=LOOKS.find(l=>l.tag.includes(pref)||l.title.includes(pref));if(found)return found;}
  return LOOKS[1];
}
function fitLineFor(items){
  for(const item of items){
    const ref=refCandidates(item.type).find(r=>r.id!==item.id);
    if(!ref)continue;
    const match=recommend(ref,'similar',{},catalogFeed).find(m=>m.product.id===item.id);
    if(match)return `내 옷장의 ${ref.name}(${ref.size.label}) 기준으로 보면 ${item.name}은 ${match.size.label} 사이즈가 가장 비슷해요.`;
  }
  return '';
}
function replyFor(text){
  const look=findLook(text);
  const items=look.items.map(id=>byId.get(id)).filter(Boolean);
  const lines=[`${look.tag}에는 ${items.map(i=>i.name).join(' + ')} 조합을 추천해요.`,look.note];
  if(state.styles.length){
    const names=state.styles.map(id=>STYLES.find(s=>s.id===id)?.name).filter(Boolean).slice(0,2);
    if(names.length)lines.push('',`선호하시는 ${names.join('·')} 무드에 맞춰 골랐어요.`);
  }
  const fit=fitLineFor(items);
  if(fit)lines.push('',fit);
  return {text:lines.join('\n'),items:items.map(i=>({id:i.id,size:defaultSize(i)}))};
}
function sendChat(text){
  state.chat.push({role:'me',text});
  const reply=replyFor(text);
  state.chat.push({role:'ai',text:reply.text,items:reply.items});
  if(state.chat.length>40)state.chat=state.chat.slice(-40);
  save();render();scrollChat();
  const input=$('#chatInput');if(input)input.focus({preventScroll:true});
}
function scrollChat(){
  requestAnimationFrame(()=>{const chat=$('#chat');if(chat)chat.scrollTop=chat.scrollHeight;});
}

/* sheets */
function notificationsHtml(){
  const rows=[
    ['오늘의 추천 코디가 도착했어요','미니멀 오피스 룩을 실측 데이터로 준비했어요.'],
    ['AI 스타일리스트가 주말 코디를 준비했어요','주말 나들이에 어울리는 레이어드 조합을 확인해 보세요.'],
    ['새 옷이 옷장에 등록됐어요','등록한 실측은 핏 비교와 사이즈 추천에 바로 반영돼요.']
  ];
  return rows.map(([title,body])=>`<div class="notice"><span class="dot"></span><div><strong>${esc(title)}</strong><p>${esc(body)}</p><time>오늘</time></div></div>`).join('')+
    `<div class="sheet-actions"><button class="btn primary block" data-action="open-look" data-id="office">오늘의 코디 보기</button></div>`;
}
function cartHtml(){
  if(!state.cart.length)return `<div class="empty-state">${icon('bag')}<h2>장바구니가 비어 있어요</h2><p>마음에 드는 상품을 담아두고<br>3D로 입어본 뒤 결정해 보세요.</p><div class="sheet-actions"><button class="btn primary small" data-nav="shop">상품 둘러보기</button></div></div>`;
  const rows=state.cart.map(c=>{
    const p=byId.get(c.id);if(!p)return '';
    return `<div class="sheet-row">
      ${photoOf(p)?`<img src="${photoOf(p)}" alt="">`:''}
      <div class="grow"><strong>${esc(p.name)}</strong><small>${esc(p.brand||'SELFIT')} · ${esc(c.size)} · ${c.qty}개</small><small>${priceText(p)}</small></div>
      <button class="icon-btn" data-action="cart-remove" data-id="${p.id}" data-size="${esc(c.size)}" aria-label="${esc(p.name)} 삭제">${icon('trash','sm')}</button>
    </div>`;
  }).join('');
  const total=state.cart.reduce((n,c)=>n+(byId.get(c.id)?.price||0)*(c.qty||1),0);
  return `<h3>장바구니 ${cartCount()}개</h3><div class="sheet-list">${rows}</div>
    <div class="total-row"><span>합계</span><span>${total?won(total):'가격 미정'}</span></div>
    <p class="section-note">데모 스토어라 실제 결제는 이루어지지 않아요.</p>
    <h3>주문 내역</h3><p>아직 주문한 내역이 없어요. 장바구니에 담아둔 상품부터 3D로 확인해 보세요.</p>
    <div class="sheet-actions"><button class="btn primary block" data-nav="shop">쇼핑 계속하기</button></div>`;
}
function savedHtml(){
  const items=state.saved.map(id=>byId.get(id)).filter(Boolean);
  if(!items.length)return `<div class="empty-state">${icon('heart')}<h2>관심 상품이 없어요</h2><p>상품 사진의 하트를 눌러<br>나중에 다시 볼 옷을 모아두세요.</p><div class="sheet-actions"><button class="btn primary small" data-nav="shop">상품 둘러보기</button></div></div>`;
  return `<div class="sheet-list">${items.map(p=>`<div class="sheet-row">
      ${photoOf(p)?`<img src="${photoOf(p)}" alt="">`:''}
      <div class="grow"><strong>${esc(p.name)}</strong><small>${esc(p.brand||'SELFIT')} · ${priceText(p)}</small></div>
      <a class="action" href="#product/${encodeURIComponent(p.id)}">보기</a>
      <button class="icon-btn" data-action="heart" data-id="${p.id}" aria-label="관심 상품에서 빼기" aria-pressed="true">${icon('heart','sm')}</button>
    </div>`).join('')}</div>`;
}
function settingsHtml(){
  return `<h3>화면</h3>
    <div class="sheet-list">
      <button class="sheet-row" data-action="replay-splash"><span class="grow"><strong>시작 화면 다시 보기</strong><small>스플래시부터 다시 시작해요</small></span>${icon('right','sm')}</button>
      <button class="sheet-row" data-action="redo-onboarding"><span class="grow"><strong>스타일 다시 고르기</strong><small>선호 스타일을 새로 선택해요</small></span>${icon('right','sm')}</button>
      <a class="sheet-row" href="fitting.html"><span class="grow"><strong>3D 피팅룸</strong><small>실측 샘플을 3D로 입어봐요</small></span>${icon('right','sm')}</a>
    </div>
    <h3>데이터</h3>
    <p>옷장 등록과 관심 상품은 이 브라우저에만 저장돼요. 다른 기기와는 동기화되지 않아요.</p>`;
}
function profileHtml(){
  const presets=[[163.5,'female','여성 163.5cm'],[174.5,'male','남성 174.5cm']];
  return `<div class="field"><label for="profileName">이름</label><input id="profileName" type="text" maxlength="20" value="${esc(state.profile.name)}" autocomplete="off"></div>
  <div class="field"><label for="profileHeight">체형 (키)</label>
    <div class="row"><input id="profileHeight" type="number" inputmode="decimal" step="0.1" min="120" max="220" value="${state.profile.height}">
      ${presets.map(([h,g,l])=>`<button class="chip" data-action="set-height" data-height="${h}" data-gender="${g}" aria-pressed="${state.profile.height===h&&state.profile.gender===g}">${l}</button>`).join('')}
    </div>
  </div>
  <div class="field"><label>선호 스타일</label><div class="colour-row" style="flex-wrap:wrap;gap:6px">${state.styles.length?state.styles.map(id=>`<span class="chip on" style="display:inline-grid;place-items:center">${esc(STYLES.find(s=>s.id===id)?.name||'')}</span>`).join(''):'<span style="font-size:12px;color:#8a857c">아직 선택하지 않았어요</span>'}</div></div>
  <div class="sheet-actions"><button class="btn primary block" data-action="save-profile">저장하기</button></div>`;
}
function analysisHtml(styles){
  const items=closetItems();
  const count=cat=>items.filter(it=>it.category===cat).length;
  const picks=styles.map(id=>STYLES.find(s=>s.id===id)).filter(Boolean);
  return `<h3>선호 스타일</h3>
    ${picks.length?`<div class="colour-row" style="flex-wrap:wrap;gap:6px">${picks.map(s=>`<span class="chip on" style="display:inline-grid;place-items:center">${esc(s.name)}</span>`).join('')}</div>`:'<p>아직 선호 스타일을 고르지 않았어요.</p>'}
    <h3>옷장 구성</h3>
    <p>상의 ${count('top')}벌 · 하의 ${count('bottom')}벌 · 아우터 ${count('outer')}벌</p>
    <p>실측이 등록된 옷 ${items.filter(it=>it.owned||it.registered).length}벌로 핏을 비교하고 사이즈를 추천해요.</p>
    <h3>다음 추천</h3>
    <p>${picks.length?esc(picks[0].name):'선호 스타일'} 무드를 기준으로 코디를 골라 드릴게요. AI 스타일리스트에게 상황을 말해 보세요.</p>
    <div class="sheet-actions"><button class="btn primary block" data-nav="stylist">AI 스타일리스트 열기</button></div>`;
}
function supportHtml(){
  const qa=[
    ['사이즈 추천은 어떻게 계산되나요?','옷의 단면 실측(cm)을 같은 측정 기준으로 비교해요. 가슴·어깨·소매·총장 차이를 가중치로 계산해 가장 비슷한 사이즈를 골라 드려요. 측정 기준이 다르면 비교에서 제외해요.'],
    ['3D 가상 착용은 어떤 옷까지 되나요?','실측과 3D 샘플이 등록된 옷은 바로 입어볼 수 있어요. 상품 상세의 [가상 착용]을 누르면 피팅룸에서 사이즈와 실루엣을 확인할 수 있어요.'],
    ['내 옷은 어떻게 등록하나요?','내 옷장의 [옷 추가하기]에서 직접 입력하거나 옷 택·사이즈표 사진을 읽어 등록할 수 있어요. 등록한 실측은 핏 비교의 기준 옷이 돼요.'],
    ['데이터는 어디에 저장되나요?','옷장과 관심 상품은 이 브라우저(IndexedDB·localStorage)에만 저장돼요. 서버로 보내지 않아요.']
  ];
  return qa.map(([q,a])=>`<details class="faq"><summary>${esc(q)}${icon('right')}</summary><p>${esc(a)}</p></details>`).join('')+
    `<div class="sheet-actions"><button class="btn secondary block" data-nav="stylist">AI 스타일리스트에게 묻기</button></div>`;
}
function openLookSheet(id){
  const look=LOOKS.find(l=>l.id===id)||LOOKS[0];
  const items=look.items.map(x=>byId.get(x)).filter(Boolean);
  sheet(look.title,`<div class="look-art"><img src="${look.image}" alt="${esc(look.title)}"></div>
    <p class="look-note">${esc(look.note)}</p>
    <div class="rec-list">${items.map(p=>recCard({id:p.id,size:defaultSize(p)})).join('')}</div>
    <div class="sheet-actions"><button class="btn primary block" data-action="tryon" data-id="${items[0].id}">${icon('cube','sm')} 이 코디 3D로 입어보기</button></div>`);
}
function openRefSheet(productId){
  const p=byId.get(productId);
  if(!p)return;
  const candidates=refCandidates(p.type).filter(r=>r.id!==p.id);
  sheet('기존 옷 선택',candidates.length?`<p>비교 기준으로 쓸 내 옷을 골라 주세요. 실측이 있는 옷만 비교할 수 있어요.</p>
    <div class="sheet-list">${candidates.map(r=>`<button class="sheet-row" data-action="pick-ref" data-id="${p.id}" data-ref="${esc(r.id)}" aria-pressed="${(state.compareRef[p.id]||candidates[0].id)===r.id}">
      ${photoOf(r)?`<img src="${photoOf(r)}" alt="">`:''}
      <div class="grow"><strong>${esc(r.name)}</strong><small>${esc(r.brand||'내 옷장')} · ${esc(typeName(r.type))} · ${esc(r.size?.label||'')}</small></div>
      ${icon('right','sm')}</button>`).join('')}</div>
    <div class="sheet-actions"><button class="btn secondary block" data-action="add-item">새 옷 등록</button></div>`
    :`<div class="empty-state">${icon('hanger')}<h2>기준 옷이 없어요</h2><div class="sheet-actions"><button class="btn primary small" data-action="add-item">옷 등록하기</button></div></div>`);
}
function openBuySheet(productId){
  const p=byId.get(productId);if(!p)return;
  const size=defaultSize(p);
  sheet('구매 준비',`<div class="sheet-row">
    ${photoOf(p)?`<img src="${photoOf(p)}" alt="">`:''}
    <div class="grow"><strong>${esc(p.name)}</strong><small>${esc(p.brand||'SELFIT')} · ${esc(size)} · ${priceText(p)}</small></div>
  </div>
  <p class="section-note">${p.price?'데모 스토어라 실제 결제는 진행되지 않아요. 장바구니에 담아두고 3D로 확인해 보세요.':'이 상품은 실측으로 등록된 옷이라 판매 정보가 아직 없어요. 3D로 입어보고 내 옷장에 담아둘 수 있어요.'}</p>
  <div class="sheet-actions">
    <button class="btn primary block" data-action="add-cart" data-id="${p.id}">장바구니 담기</button>
    <button class="btn secondary block" style="margin-top:8px" data-action="tryon" data-id="${p.id}">${icon('cube','sm')} 가상 착용</button>
  </div>`);
}
function openOwnedSheet(id){
  const r=references.find(x=>x.id===id);
  if(!r)return;
  const fields=fieldsFor(r.type).filter(([k])=>Number.isFinite(r.size?.[k]));
  sheet(r.name,`<div class="sheet-row">${photoOf(r)?`<img src="${photoOf(r)}" alt="">`:''}<div class="grow"><strong>${esc(r.name)}</strong><small>${esc(r.brand||'내 옷장')} · ${esc(typeName(r.type))} · ${esc(r.size?.label||'')}</small></div></div>
  <h3>내 실측</h3>
  <table class="measure-table"><thead><tr><th>부위</th><th>cm</th></tr></thead><tbody>${fields.map(([k,label])=>`<tr><th>${label}</th><td>${centimeters(r.size[k])}</td></tr>`).join('')}</tbody></table>
  ${r.type==='pants'?`<div class="sheet-actions"><a class="btn primary block" href="fitting.html?reference=${encodeURIComponent(r.id)}#fit">${icon('cube','sm')} 이 바지 3D로 입어보기</a></div>`:''}
  <p class="section-note">이 옷은 핏 비교의 기준 옷으로 선택할 수 있어요.</p>`);
}
function openSheet(kind,data={}){
  if(kind==='notifications')return sheet('알림',notificationsHtml());
  if(kind==='cart'||kind==='orders')return sheet('주문 내역',cartHtml());
  if(kind==='saved')return sheet('관심 상품',savedHtml());
  if(kind==='settings')return sheet('설정',settingsHtml());
  if(kind==='profile')return sheet('프로필 편집',profileHtml());
  if(kind==='support')return sheet('고객센터',supportHtml());
  if(kind==='style-analysis')return sheet('내 스타일 분석',analysisHtml(state.styles));
  if(kind==='reference')return openRefSheet(data.id);
  if(kind==='buy')return openBuySheet(data.id);
  if(kind==='owned')return openOwnedSheet(data.id);
  if(kind==='look')return openLookSheet(data.id);
}

/* registration */
function addItem(){
  openRegistration({onSave:async piece=>{
    await saveReference(piece);
    await refreshReferences();
    if(['closet','mypage','compare'].includes(currentRoute.name))render();
    toast('옷장에 옷을 추가했어요.');
  }});
}

/* render */
let currentRoute={name:'home',param:null,query:new URLSearchParams()};
function renderTabs(active){
  const bar=$('#tabbar');if(!bar)return;
  bar.innerHTML=TABS.map(([key,label,ic])=>`<a href="#${key}" ${key===active?'aria-current="page"':''}>${icon(ic)}<span>${label}</span></a>`).join('');
}
function render(){
  currentRoute=parseRoute();
  const name=VIEWS[currentRoute.name]?currentRoute.name:'home';
  document.body.dataset.screen=name;
  document.body.classList.toggle('has-tabs',['home','shop','closet','mypage'].includes(name));
  renderTabs(name);
  const view=$('#view');
  view.innerHTML=VIEWS[name](currentRoute);
  document.title=TITLES[name]||'Selfit 2.0';
  if(name==='shop'){
    paintShop();
    const input=$('#shopSearch');
    input?.addEventListener('input',()=>{state.shopQuery=input.value;save();paintShop();});
  }
  if(name==='closet')paintCloset();
  window.scrollTo(0,0);
}

/* interactions */
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');
  if(nav&&!nav.dataset.action){e.preventDefault();go('#'+nav.dataset.nav);return;}
  const el=e.target.closest('[data-action]');
  if(!el)return;
  const a=el.dataset.action,d=el.dataset;
  const product=d.id?byId.get(d.id):null;
  switch(a){
    case 'start':go('#onboarding');break;
    case 'guest':state.onboarded=true;save();go('#home');break;
    case 'back-splash':go('#splash');break;
    case 'toggle-style':{
      const on=!state.styles.includes(d.id);
      state.styles=on?[...state.styles,d.id]:state.styles.filter(x=>x!==d.id);
      el.setAttribute('aria-pressed',String(on));save();break;
    }
    case 'finish-onboarding':case 'skip-onboarding':
      state.onboarded=true;save();go('#home');break;
    case 'open-look':openLookSheet(d.id);break;
    case 'sheet':openSheet(d.kind,d);break;
    case 'close-sheet':closeSheets();break;
    case 'chat-chip':closeSheets();sendChat(d.text);break;
    case 'clear-chat':state.chat=[];save();render();toast('대화를 새로 시작했어요.');break;
    case 'heart':toggleSaved(d.id);break;
    case 'size':{
      if(!product)break;
      state.sizes[product.id]=d.size;save();
      for(const b of $$('[data-action="size"][data-id="'+CSS.escape(product.id)+'"]'))b.setAttribute('aria-pressed',String(b.dataset.size===d.size));
      const row=product.sizes.find(s=>s.label===d.size);
      const body=$('#sizeMeasures');if(body)body.innerHTML=measureRows(product,row);
      const head=$('#sizeHead');if(head)head.textContent=d.size;
      break;
    }
    case 'tryon':{
      if(!product)break;
      const target=tryonHref(product,d.size||state.sizes[product.id]);
      closeSheets();location.href=target;break;
    }
    case 'add-cart':
      if(!product)break;
      addToCart(product,d.size||defaultSize(product));
      if(currentRoute.name==='product'){/* badge is on shop header only */}
      break;
    case 'buy':openBuySheet(d.id);break;
    case 'cart-remove':{
      state.cart=state.cart.filter(c=>!(c.id===d.id&&c.size===d.size));saveCart();
      openSheet('cart');break;
    }
    case 'shop-cat':{
      state.shopCat=d.cat;save();
      for(const b of $$('[data-action="shop-cat"]'))b.setAttribute('aria-pressed',String(b.dataset.cat===d.cat));
      paintShop();break;
    }
    case 'closet-cat':{
      state.closetCat=d.cat;save();
      for(const b of $$('[data-action="closet-cat"]'))b.setAttribute('aria-pressed',String(b.dataset.cat===d.cat));
      paintCloset();break;
    }
    case 'compare-tab':{
      const id=d.id;state.compareField[id]=d.field;save();
      for(const b of $$('[data-action="compare-tab"]'))b.setAttribute('aria-pressed',String(b.dataset.field===d.field));
      const p=byId.get(id);if(!p)break;
      const candidates=refCandidates(p.type).filter(r=>r.id!==p.id);
      const ref=pickReference(p,candidates);
      const sizeLabel=state.sizes[id]||defaultSize(p);
      const row=p.sizes.find(s=>s.label===sizeLabel);
      const cmp=ref?compareSize(ref,p,row,0):null;
      const tbody=$('#compareRows');if(tbody)tbody.innerHTML=compareRows(p,ref,row,cmp?.deltas||{},d.field);
      break;
    }
    case 'ref-sheet':openRefSheet(d.id);break;
    case 'pick-ref':{
      state.compareRef[d.id]=d.ref;save();closeSheets();render();break;
    }
    case 'add-item':addItem();break;
    case 'owned-item':openOwnedSheet(d.id);break;
    case 'share':{
      if(!product)break;
      shareProduct(product);break;
    }
    case 'set-height':{
      state.profile.height=Number(d.height);state.profile.gender=d.gender;save();
      const input=$('#profileHeight');if(input)input.value=d.height;
      for(const b of $$('[data-action="set-height"]'))b.setAttribute('aria-pressed',String(b.dataset.height===d.height&&b.dataset.gender===d.gender));
      break;
    }
    case 'save-profile':{
      const name=$('#profileName')?.value.trim();
      const height=Number($('#profileHeight')?.value);
      if(name)state.profile.name=name.slice(0,20);
      if(Number.isFinite(height)&&height>=120&&height<=220)state.profile.height=Math.round(height*10)/10;
      save();closeSheets();render();toast('프로필을 저장했어요.');break;
    }
    case 'replay-splash':closeSheets();go('#splash');break;
    case 'redo-onboarding':closeSheets();go('#onboarding');break;
  }
});

document.addEventListener('submit',e=>{
  const form=e.target;
  if(form.id==='homeSearch'){
    e.preventDefault();
    const q=new FormData(form).get('q')?.toString().trim()||'';
    state.shopQuery=q;save();
    go('#shop'+(q?'?q='+encodeURIComponent(q):''));
  }
  if(form.id==='chatForm'){
    e.preventDefault();
    const input=$('#chatInput');
    const text=input?.value.trim();
    if(!text)return;
    input.value='';
    sendChat(text);
  }
});

/* boot */
if(!location.hash||location.hash==='#')history.replaceState(null,'','#'+(state.onboarded?'home':'splash'));
window.addEventListener('hashchange',()=>render());
render();
refreshReferences().then(()=>{
  if(['closet','mypage','compare'].includes(currentRoute.name))render();
});
window.addEventListener('pageshow',e=>{if(e.persisted)render();});
