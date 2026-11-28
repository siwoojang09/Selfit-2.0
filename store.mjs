import {shopProducts,byId,editorialLooks,matchesShopQuery} from './shop-data.mjs?v=2026-11-28a';
import {setSiteNav} from './site-nav.mjs?v=2026-11-28a';
import {readCart,writeCart,addCartItem} from './shop-cart.mjs?v=2026-11-28a';

const $=id=>document.getElementById(id);
const paths={
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  user:'<circle cx="12" cy="7" r="3.25"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>',
  bag:'<path d="M5 8h14l1.3 12H3.7L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  heart:'<path d="M12 20 4.8 13a4.4 4.4 0 0 1 6.2-6.2L12 8l1-1.2a4.4 4.4 0 0 1 6.2 6.2L12 20Z"/>',
  message:'<path d="M20 11.5a8 8 0 0 1-8 8H5l1.8-2.7A8 8 0 1 1 20 11.5Z"/>'
};
const icon=key=>'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[key]+'</svg>';
for(const element of document.querySelectorAll('[data-icon]'))element.insertAdjacentHTML('afterbegin',icon(element.dataset.icon));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const price=value=>new Intl.NumberFormat('ko-KR').format(value)+'원';
const categories={all:'전체',outer:'아우터',top:'상의',bottom:'하의'};
const tags=['캐주얼','미니멀','스트리트','오피스'];
const state={user:null,online:null,looks:editorialLooks,category:'all',query:'',tab:'전체',cart:readCart()};
let activeNav;
let toastTimeout, resume, orderRequest;

function toast(value){
  clearTimeout(toastTimeout);
  $('toast').textContent=value;$('toast').hidden=false;
  toastTimeout=setTimeout(()=>$('toast').hidden=true,2800);
}
async function api(path,payload){
  let response;
  try{
    response=await fetch('./api/selfit'+path,payload===undefined?{}:{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
  }catch{throw Error('서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.');}
  let result;
  try{result=await response.json();}catch{throw Error('서버에 연결할 수 없습니다.');}
  if(!response.ok){
    const error=Error(typeof result.detail==='string'?result.detail:'입력값을 확인해 주세요.');
    error.status=response.status;throw error;
  }
  return result;
}
function readableError(error){return error?.message||'처리하지 못했습니다. 다시 시도해 주세요.';}
function setUser(user) {
  state.user=user;
  $('account-label').textContent=user?'내 계정':'로그인';
}
function currentPage(){
  if(location.hash==='#shop')return 'shop';
  if(location.hash==='#home')return 'home';
  return 'community';
}
function saveCart(){
  writeCart(state.cart);
  paintCartBadge();
}
function paintCartBadge(){
  const count=state.cart.reduce((sum,item)=>sum+item.quantity,0);
  const badge=$('cart-count');
  if(badge){badge.hidden=!count;badge.textContent=count;}
}
function total(){return state.cart.reduce((sum,row)=>sum+row.quantity*byId.get(row.product).price,0);}
function fittingLink(id,size){return 'fitting.html?'+new URLSearchParams({item:id,size})+'#fit';}
function shopState(item){return item.demo?'테스트 · '+price(item.price):item.url?'판매처 구매':'피팅 샘플';}
function productCard(item){
  return '<article class="product-card"><button class="product-image" type="button" data-action="product" data-id="'+item.id+'" aria-label="'+esc(item.name)+' 상세 보기"><img src="'+item.photo+'" alt="" loading="lazy"></button><div class="product-text"><p class="product-brand">'+esc(item.brand)+'</p><button class="product-name" type="button" data-action="product" data-id="'+item.id+'">'+esc(item.name)+'</button><p class="product-price">'+shopState(item)+'</p></div></article>';
}
function lookCard(post){
  const items=post.items.map(id=>byId.get(id)).filter(Boolean);
  const images=items.slice(0,2).map(item=>'<img src="'+item.photo+'" alt="'+esc(item.name)+'" loading="lazy">').join('');
  return '<article class="look"><div class="look-images '+(items.length===1?'one':'')+'">'+images+'</div><div class="look-content"><span class="pill">'+esc(post.tag)+'</span><h3>'+esc(post.title)+'</h3><p class="look-body">'+esc(post.body)+'</p><p class="author">'+esc(post.author)+'</p><div class="look-actions"><button type="button" data-action="like" data-id="'+esc(post.id)+'" aria-pressed="'+!!post.liked+'" aria-label="좋아요 '+post.likes+'개">'+icon('heart')+post.likes+'</button><button type="button" data-action="comments" data-id="'+esc(post.id)+'">'+icon('message')+'댓글 '+(post.commentCount||0)+'</button></div></div></article>';
}
function home(){
  return '<section class="hero"><div class="hero-copy"><p class="eyebrow">SELFIT DRESSING ROOM</p><h1>Try it on.<br>Make it yours.</h1><p>쇼핑하기 전 3D로 입어보고, 마음에 드는 코디를 함께 나눠보세요.</p><div class="hero-actions"><a class="primary" href="#shop">쇼핑 둘러보기 '+icon('arrow')+'</a><a class="secondary" href="fitting.html">3D 피팅룸</a></div></div><div class="hero-media"><img src="discovery-art/hero.webp" alt="자연광 아래 놓인 워시드 후드 집업" fetchpriority="high"></div></section>'+
    '<section class="shortcuts" aria-label="바로가기"><a class="shortcut" href="#shop"><div><strong>상품 둘러보기</strong><small>아우터, 상의, 하의</small></div>'+icon('arrow')+'</a><a class="shortcut" href="discovery.html"><div><strong>내 옷과 핏 비교</strong><small>실측으로 찾는 비슷한 핏</small></div>'+icon('arrow')+'</a><a class="shortcut" href="#community"><div><strong>코디 커뮤니티</strong><small>코디를 공유하고 의견 나누기</small></div>'+icon('arrow')+'</a></section>'+
    '<section class="section"><div class="section-head"><div><h2>Shop the edit</h2><p>피팅룸에서 입어볼 수 있는 상품</p></div><a class="text-button" href="#shop">전체 보기 '+icon('arrow')+'</a></div><div class="product-grid">'+shopProducts.slice(0,4).map(productCard).join('')+'</div></section>'+
    '<section class="section"><div class="section-head"><div><h2>Community looks</h2><p>다른 사람의 코디에서 아이디어를 얻어보세요.</p></div><a class="text-button" href="#community">코디 보기 '+icon('arrow')+'</a></div><div class="look-grid">'+state.looks.slice(0,2).map(lookCard).join('')+'</div></section>';
}
function shop(){
  return '<div class="page-head"><div><h1>쇼핑</h1><p>상품을 살펴보고 사이즈를 골라 입어보세요.</p></div></div><div class="tools"><div class="tabs" aria-label="상품 분류">'+
    Object.entries(categories).map(([key,label])=>'<button type="button" data-action="category" data-id="'+key+'" aria-pressed="'+(state.category===key)+'">'+label+'</button>').join('')+
    '</div><input id="shop-search" type="search" aria-label="상품 검색" placeholder="상품명 또는 브랜드 검색" value="'+esc(state.query)+'"></div><div class="product-grid" id="shop-results"></div><p id="empty-shop" class="empty" hidden>해당하는 상품이 없습니다.</p>';
}
function renderProducts(){
  const list=$('shop-results');
  if(!list)return;
  const query=state.query.toLowerCase().trim();
  const results=shopProducts.filter(item=>(state.category==='all'||item.category===state.category)&&matchesShopQuery(item,query));
  list.innerHTML=results.map(productCard).join('');
  $('empty-shop').hidden=!!results.length;
}
function community(){
  const list=state.looks.filter(post=>state.tab==='전체'||post.tag===state.tab);
  return '<div class="page-head"><div><h1>코디 커뮤니티</h1><p>입고 싶은 조합을 올리고 의견을 나눠보세요.</p></div><button class="primary" type="button" data-action="compose">코디 올리기</button></div>'+
    (!state.online?'<p class="offline">현재 예시 코디를 볼 수 있습니다. 글쓰기와 댓글은 Selfit 서버에서 이용할 수 있습니다.</p>':'')+
    '<div class="tools"><div class="tabs" aria-label="코디 스타일">'+['전체',...tags].map(tag=>'<button type="button" data-action="tag" data-id="'+tag+'" aria-pressed="'+(state.tab===tag)+'">'+tag+'</button>').join('')+
    '</div></div>'+(list.length?'<div class="look-grid">'+list.map(lookCard).join('')+'</div>':'<p class="empty">이 스타일에 올라온 코디가 없습니다.</p>');
}
function render(){
  const page=currentPage();
  $('content').innerHTML=page==='shop'?shop():page==='community'?community():home();
  const nav=location.hash==='#login'||location.hash==='#cart'?'mypage':page;
  if(activeNav!==nav){
    setSiteNav(nav,{page:'store',account:true});
    activeNav=nav;
    setUser(state.user);
    paintCartBadge();
  }
  if(page==='shop')renderProducts();
}
async function refreshLooks(){
  if(state.online)state.looks=(await api('/looks')).looks;
  if(currentPage()!=='shop')render();
}
function modal(title,html){
  $('sheet-title').textContent=title;
  $('sheet-content').innerHTML=html;
  if(!$('sheet').open)$('sheet').showModal();
  $('sheet').scrollTop=0;
}
function offlineInfo(title){
  modal(title,'<p class="note">로그인, 코디 등록과 테스트 주문은 Selfit 서버 주소에서 이용할 수 있습니다.</p><button class="secondary" type="button" data-action="close">닫기</button>');
}
function guard(action){
  if(!state.online){offlineInfo('Selfit 서버 연결');return;}
  if(state.user)return action();
  resume=action;accountForm();
}
function accountForm(signup=false){
  const title=signup?'회원가입':'로그인';
  const disabled=state.online?'':' disabled';
  const description=state.online===null?'로그인 서버를 확인하고 있습니다.':
    !state.online?'로그인 화면 미리보기입니다. 계정 서버가 연결되면 가입과 로그인이 활성화됩니다.':
    signup?'닉네임은 코디와 댓글에 공개됩니다.':'계정으로 로그인해 코디와 주문 내역을 관리하세요.';
  modal(title,'<form class="form" id="auth-form" data-mode="'+(signup?'signup':'login')+'"><p class="note" role="status">'+description+'</p>'+
    (signup?'<label>닉네임<input name="name" autocomplete="nickname" required minlength="2" maxlength="24"'+disabled+'></label>':'')+
    '<label>이메일<input name="email" type="email" autocomplete="username" required maxlength="254"'+disabled+'></label>'+
    '<label>비밀번호<input name="password" type="password" autocomplete="'+(signup?'new-password':'current-password')+'" required minlength="'+(signup?8:1)+'" maxlength="128"'+disabled+'></label>'+
    '<p class="error" role="alert"></p><div class="action-set"><button class="primary" type="submit"'+disabled+'>'+title.replace('회원가입','가입하기')+
    '</button><button class="secondary" type="button" data-action="'+(signup?'login':'signup')+'">'+(signup?'로그인으로':'회원가입')+'</button></div></form>');
  if(!state.online)return;
  bindForm('auth-form',async data=>{
    const result=await api(signup?'/signup':'/login',data);
    setUser(result.user);
    const callback=resume;resume=null;
    $('sheet').close();toast(signup?'가입되었습니다.':'로그인했습니다.');
    refreshLooks().catch(error=>toast(readableError(error)));
    if(callback)await callback();
  });
}
async function account(){
  if(!state.user){resume=null;accountForm();return;}
  const user=state.user;
  modal('내 계정','<p><strong>'+esc(user.name)+'</strong></p><p class="note">주문 내역을 불러오는 중입니다.</p>');
  const data=await api('/orders');
  if(!$('sheet').open||$('sheet-title').textContent!=='내 계정')return;
  modal('내 계정','<p><strong>'+esc(user.name)+'</strong></p><h3 style="margin-top:14px">테스트 주문 내역</h3>'+
    (data.orders.length?'<div class="list">'+data.orders.map(order=>'<article><strong>테스트 주문 '+esc(order.id)+'</strong><p>'+order.items.map(item=>esc(item.name)+' · '+esc(item.size)+' × '+item.quantity).join('<br>')+'</p><small>'+price(order.total)+'</small></article>').join('')+'</div>':'<p class="empty">등록된 주문이 없습니다.</p>')+
    '<button class="secondary" type="button" data-action="logout">로그아웃</button>');
}
function bindForm(id,handler){
  const form=$(id);
  form.onsubmit=async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type=submit]');
    if(submit.disabled)return;
    const error=form.querySelector('.error');
    error.textContent='';submit.disabled=true;
    try{await handler(Object.fromEntries(new FormData(form)),form);}
    catch(problem){error.textContent=readableError(problem);}
    finally{submit.disabled=false;}
  };
}
function product(id){
  const item=byId.get(id);
  if(!item)return;
  const first=item.sizes.find(row=>row.label==='M'&&row.stock)||item.sizes.find(row=>row.stock);
  modal('상품 상세','<div class="detail"><img src="'+item.photo+'" alt="'+esc(item.name)+'"><div><p class="product-brand">'+esc(item.brand)+'</p><h3>'+esc(item.name)+'</h3><p class="note">'+esc(item.color)+' · '+shopState(item)+'</p>'+
    '<label class="size-field">피팅 사이즈<select id="detail-size">'+item.sizes.map(row=>'<option '+(row.label===first?.label?'selected ':'')+(!row.stock?'disabled ':'')+'value="'+esc(row.label)+'">'+esc(row.label)+(row.stock?'':' · 테스트 품절')+'</option>').join('')+'</select></label>'+
    '<div class="action-set"><a class="secondary" id="detail-fit" href="'+fittingLink(id,first?.label||'')+'">3D로 입어보기</a>'+
    (item.demo?'<button class="primary" type="button" data-action="add-cart" data-id="'+id+'">장바구니 담기</button>':
      item.url?'<a class="primary" href="'+item.url+'" target="_blank" rel="noopener noreferrer">무신사에서 구매 '+icon('arrow')+'</a>':'')+'</div></div></div>'+
    '<p class="note">'+(item.demo?'테스트 상품의 가격과 재고입니다. 실제 결제나 배송은 진행되지 않습니다.':item.url?'판매가와 구매 가능한 사이즈는 판매처에서 확인할 수 있습니다.':'이 상품은 피팅용으로 등록되어 있습니다.')+'</p>');
  $('detail-size').onchange=()=>{$('detail-fit').href=fittingLink(id,$('detail-size').value);};
}
function addCart(id){
  const item=byId.get(id), size=$('detail-size')?.value;
  if(!item?.demo||!item.sizes.some(option=>option.label===size&&option.stock))return;
  const error=addCartItem(state.cart,id,size);
  if(error){toast(error);return;}
  orderRequest=null;saveCart();cart();
}
function cart(){
  modal('장바구니',state.cart.length?'<p class="note">테스트 상품 장바구니입니다. 카드 정보와 배송지를 입력하지 않습니다.</p>'+
    state.cart.map((item,i)=>{
      const good=byId.get(item.product);
      return '<div class="cart-row"><img src="'+good.photo+'" alt=""><div><strong>'+esc(good.name)+'</strong><p class="note">'+esc(item.size)+' · '+price(good.price)+'</p></div><div><select data-quantity="'+i+'" aria-label="'+esc(good.name)+' 수량">'+[1,2,3,4,5].map(n=>'<option '+(n===item.quantity?'selected':'')+'>'+n+'</option>').join('')+'</select> <button class="text-button" type="button" data-action="remove-cart" data-id="'+i+'">삭제</button></div></div>';
    }).join('')+'<p class="cart-total">합계 '+price(total())+'</p><button class="primary" type="button" data-action="checkout">테스트 주문</button>':
    '<p class="empty">장바구니가 비어 있습니다.</p><a class="secondary" href="index.html#shop">상품 둘러보기</a>');
  for(const quantity of $('sheet-content').querySelectorAll('[data-quantity]')){
    quantity.onchange=()=>{state.cart[Number(quantity.dataset.quantity)].quantity=Number(quantity.value);orderRequest=null;saveCart();cart();};
  }
}
function checkout(){
  if(!state.cart.length){cart();return;}
  modal('테스트 주문 확인','<form id="order-form" class="form"><p class="note">합계 '+price(total())+' · 실제 청구 금액 0원</p><p class="error" role="alert"></p><button class="primary" type="submit">테스트 주문 확정</button></form>');
  bindForm('order-form',async()=>{
    orderRequest ||= crypto.randomUUID();
    const receipt=await api('/orders',{requestId:orderRequest,items:state.cart});
    state.cart=[];orderRequest=null;saveCart();
    modal('테스트 주문 완료','<p>주문번호 <strong>'+esc(receipt.id)+'</strong></p><p class="note">테스트 주문이 기록되었습니다. 결제와 배송은 진행되지 않습니다.</p><button class="secondary" type="button" data-action="account">주문 내역 보기</button>');
  });
}
function compose(){
  modal('코디 올리기','<form id="look-form" class="form"><p class="note">카탈로그에서 옷을 골라 코디를 만드세요. 게시글과 댓글은 다른 사용자에게 공개됩니다.</p>'+
    '<label>제목<input name="title" required maxlength="80" minlength="2"></label><label>스타일<select name="tag">'+tags.map(tag=>'<option>'+tag+'</option>').join('')+'</select></label>'+
    '<fieldset><legend>옷 고르기 (1–4개)</legend><div class="checkbox-grid">'+shopProducts.map(item=>'<label><input type="checkbox" name="items" value="'+item.id+'">'+esc(item.name)+'</label>').join('')+'</div></fieldset>'+
    '<label>코디 소개<textarea name="body" required maxlength="800" minlength="2" placeholder="옷을 고른 이유나 궁금한 점을 적어보세요."></textarea></label><p class="error" role="alert"></p><button type="submit" class="primary">코디 게시</button></form>');
  bindForm('look-form',async(data,form)=>{
    await api('/looks',{...data,items:new FormData(form).getAll('items')});
    $('sheet').close();state.tab='전체';location.hash='community';
    await refreshLooks();toast('코디를 게시했습니다.');
  });
}
async function comments(id){
  const post=state.looks.find(look=>look.id===id);
  if(!post)return;
  modal('코디와 댓글','<p class="note">댓글을 불러오는 중입니다.</p>');
  const content=$('sheet-content').firstElementChild;
  const result=state.online?await api('/looks/'+id+'/comments'):{comments:[]};
  if(!$('sheet').open||$('sheet-content').firstElementChild!==content)return;
  modal('코디와 댓글','<h3>'+esc(post.title)+'</h3><p class="look-body">'+esc(post.body)+'</p><div class="look-items">'+
    post.items.map(item=>'<button type="button" class="secondary" data-action="product" data-id="'+item+'">'+esc(byId.get(item)?.name)+'</button>').join('')+
    '</div><div class="list">'+(result.comments.length?result.comments.map(entry=>'<article><strong>'+esc(entry.author)+'</strong><p>'+esc(entry.body)+'</p>'+
      (entry.owned?'<button class="text-button" type="button" data-action="delete-comment" data-id="'+id+'" data-entry="'+entry.id+'">댓글 삭제</button>':'')+'</article>').join(''):'<p class="note">아직 댓글이 없습니다.</p>')+'</div>'+
    (state.user?'<form class="form" id="comment-form"><label>댓글<textarea name="body" maxlength="400" required></textarea></label><p class="error" role="alert"></p><button class="primary" type="submit">댓글 등록</button></form>':
      '<button class="secondary" type="button" data-action="comment-login" data-id="'+id+'">로그인하고 의견 남기기</button>')+
    '<div class="action-set">'+(post.owned?'<button class="text-button" type="button" data-action="delete-look" data-id="'+id+'">코디 삭제</button>':
      state.online?'<button class="text-button" type="button" data-action="report" data-id="'+id+'">신고하기</button>':'')+'</div>');
  if(state.user)bindForm('comment-form',async data=>{
    await api('/looks/'+id+'/comments',data);await refreshLooks();await comments(id);
  });
}
function report(id){
  modal('코디 신고','<form class="form" id="report-form"><label>신고 사유<select name="reason"><option>개인정보 노출</option><option>부적절한 내용</option><option>스팸</option></select></label><p class="error" role="alert"></p><button class="primary" type="submit">신고 접수</button></form>');
  bindForm('report-form',async data=>{
    await api('/looks/'+id+'/report',data);$('sheet').close();toast('신고가 접수되었습니다.');
  });
}

const actions={
  search(){if(currentPage()!=='shop')location.hash='shop';requestAnimationFrame(()=>$('shop-search')?.focus());},
  account,close:()=>$('sheet').close(), login:()=>accountForm(), signup:()=>accountForm(true),
  logout:async()=>{await api('/logout',{});setUser(null);$('sheet').close();await refreshLooks();toast('로그아웃했습니다.');},
  category(id){state.category=id;render();},tag(id){state.tab=id;render();},
  product,cart,'add-cart':addCart,
  'remove-cart'(index){state.cart.splice(Number(index),1);orderRequest=null;saveCart();cart();},
  checkout:()=>guard(checkout),
  compose:()=>guard(compose), comments:id=>comments(id),
  'comment-login':id=>guard(()=>comments(id)),
  like:id=>guard(async()=>{await api('/looks/'+id+'/like',{});await refreshLooks();}),
  'delete-comment':async(id,button)=>{await api('/looks/'+id+'/comments/'+button.dataset.entry+'/delete',{});await refreshLooks();await comments(id);},
  'delete-look'(id){
    modal('코디 삭제','<p class="note">게시글과 댓글을 삭제할까요?</p><div class="action-set"><button class="secondary" type="button" data-action="comments" data-id="'+id+'">취소</button><button class="primary" type="button" data-action="confirm-delete" data-id="'+id+'">삭제</button></div>');
  },
  'confirm-delete':async id=>{await api('/looks/'+id+'/delete',{});$('sheet').close();await refreshLooks();},
  report:id=>guard(()=>report(id))
};

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');
  if(!button)return;
  if(button.tagName==='BUTTON')button.disabled=true;
  try{await actions[button.dataset.action]?.(button.dataset.id,button);}
  catch(error){if(error.status===401){setUser(null);accountForm();}else toast(readableError(error));}
  finally{if(button.tagName==='BUTTON')button.disabled=false;}
});
document.addEventListener('input',event=>{
  if(event.target.id==='shop-search'){state.query=event.target.value;renderProducts();}
});
window.addEventListener('hashchange',()=>{
  if(['#login','#cart'].includes(location.hash)){
    render();
    if(location.hash==='#cart')cart();
    else account().catch(error=>toast(readableError(error)));
    return;
  }
  if(!['#home','#shop','#community',''].includes(location.hash))return;
  if($('sheet').open)$('sheet').close();
  render();window.scrollTo(0,0);
  if(currentPage()==='community')refreshLooks().catch(error=>toast(readableError(error)));
});
$('sheet').addEventListener('close',()=>{
  if(['#login','#cart'].includes(location.hash)&&!$('sheet').open){history.replaceState(null,'','#community');render();}
});
window.addEventListener('storage',()=>{
  state.cart=readCart();orderRequest=null;paintCartBadge();
  if($('sheet').open&&$('sheet-title').textContent==='장바구니')cart();
});
saveCart();render();
if(location.hash==='#login')account().catch(error=>toast(readableError(error)));
if(location.hash==='#cart')cart();
api('/session').then(data=>{
  state.online=true;setUser(data.user);
}).catch(()=>{state.online=false;}).finally(()=>{
  const form=$('auth-form');
  if($('sheet').open&&form){
    if(state.user)account().catch(error=>toast(readableError(error)));
    else accountForm(form.dataset.mode==='signup');
  }
  if(state.online)refreshLooks().catch(error=>toast(readableError(error)));
  else if(currentPage()==='community')render();
});
