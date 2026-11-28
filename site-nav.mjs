const entries=[
  ['home','홈','index.html#home','<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>'],
  ['shop','쇼핑','index.html#shop','<path d="M5 8h14l1 12H4zM9 9V6a3 3 0 0 1 6 0v3"/>'],
  ['fitting','3D 피팅','fitting.html','<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>'],
  ['community','커뮤니티','store.html#community','<path d="M20 11a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 14-5Z"/>'],
  ['mypage','마이','index.html#mypage','<circle cx="12" cy="7.5" r="3.2"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>']
];
const svg=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';

export function setSiteNav(active,{page,hidden=false,account=false}={}){
  const header=document.querySelector('#site-header'), mobile=document.querySelector('#site-mobile');
  if(!header||!mobile)return;
  header.hidden=mobile.hidden=hidden;
  if(hidden)return;
  const links=withIcons=>entries.map(([key,label,url,path])=>{
    const local=(page==='app'&&url.startsWith('index.html#'))||(page==='store'&&key==='community');
    const href=local?url.slice(url.indexOf('#')):url;
    return '<a href="'+href+'"'+(key===active?' aria-current="page"':'')+'>'+
      (withIcons?svg(path):'')+'<span>'+label+'</span></a>';
  }).join('');
  const bag=(attributes,badge)=>'<button type="button" class="site-bag" '+attributes+' aria-label="장바구니">'+svg(entries[1][3])+'<span id="'+badge+'" hidden></span></button>';
  header.innerHTML='<div class="site-frame"><a class="site-brand" href="'+(page==='app'?'#home':'index.html#home')+
    '" aria-label="Selfit 2.0 홈">selfit<span>2.0</span></a><nav aria-label="주 메뉴" class="site-links">'+links(false)+'</nav>'+
    '<div class="site-actions">'+(account
      ?'<button type="button" class="site-access" data-action="account"><span id="account-label">로그인</span></button>'+bag('data-action="cart"','cart-count')
      :'<a class="site-access" href="store.html#login">로그인</a>'+(page==='app'?bag('data-action="sheet" data-kind="cart"','cartBadge'):''))+'</div></div>';
  mobile.innerHTML=links(true);
}
