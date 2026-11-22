import {pantsMeasurementFields} from './catalog-data.mjs?v=2026-11-23n';
const upperFields=[['chest','가슴단면'],['shoulder','어깨너비'],['sleeve','소매길이'],['length','총장']];
const labels={long:'소매가 길었어요',good:'잘 맞았어요',short:'소매가 짧았어요'};
const fmt=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const svgNS='http://www.w3.org/2000/svg';
function element(tag,text,cls){
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  if(cls)node.className=cls;
  return node;
}
function vector(tag,attrs){
  const node=document.createElementNS(svgNS,tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  return node;
}
function measurement(value){return Number.isFinite(value)&&value>0;}
function cm(value){return measurement(value)?fmt.format(value):'—';}
// Fold at the centre front so the measured one-leg span is visible. On
// this half-body view the waist and seat are half their flat-lay widths.
function pantsOutline({length,waist,hip,thigh,rise,hem}){
  const waistEdge=waist/2,seatEdge=hip/2;
  const hipY=rise*.55,thighY=rise+Math.min(2,(length-rise)*.1);
  const d='M0 0H'+waistEdge+
    'Q'+seatEdge+' '+hipY*.5+' '+seatEdge+' '+hipY+
    'Q'+seatEdge+' '+rise+' '+thigh+' '+rise+
    'V'+thighY+'L'+hem+' '+length+'H0Z';
  return {d,width:Math.max(waistEdge,seatEdge,thigh,hem),height:length};
}
function outline(size,type){
  if(type==='pants')return pantsOutline(size);
  const halfShoulder=size.shoulder/2,halfChest=size.chest/2,length=size.length;
  const short=type==='tee'||type==='polo',angle=(short?34:57)*Math.PI/180;
  const dx=Math.cos(angle),dy=Math.sin(angle);
  const shoulderY=4,underarmY=Math.min(.39*length,23),cuff=short?6.5:4.5;
  // Sleeve length runs from the shoulder seam to the centre of the cuff.
  const x=halfShoulder+size.sleeve*dx,y=shoulderY+size.sleeve*dy;
  const neck=Math.min(9,halfShoulder*.37),hem=measurement(size.hem)?size.hem/2:halfChest;
  const side=[[neck,0],[halfShoulder,shoulderY],[x+cuff*dy,y-cuff*dx],
    [x-cuff*dy,y+cuff*dx],[halfChest,underarmY],[halfChest,length*.64],[hem,length]];
  const mirror=side.slice().reverse().map(([px,py])=>[-px,py]);
  const edge=[...side,...mirror];
  return {d:'M'+edge.map(p=>p.join(' ')).join('L')+'Q0 7 '+neck+' 0Z',
    width:Math.max(...edge.map(([px])=>Math.abs(px))),height:Math.max(...edge.map(([,py])=>py))};
}
function chart(base,other,type,deltas,fields){
  const box=element('section',null,'fc-map');
  box.append(element('h3','실측 윤곽 비교'));
  const legend=element('div',null,'fc-legend');
  for(const [title,style] of [['내 옷','base'],['추천 옷','item']])legend.append(element('span',title,style));
  box.append(legend);
  if(!fields.every(([k])=>measurement(base[k])&&measurement(other[k])&&Number.isFinite(deltas?.[k]))){
    box.append(element('p',type==='pants'?'총장·허리·엉덩이·허벅지·밑위·밑단을 같은 기준으로 비교할 수 있을 때 윤곽을 표시해요.':'두 옷의 가슴·어깨·소매·총장을 같은 기준으로 비교할 수 있을 때 윤곽을 표시해요.','fc-unavailable'));
    return box;
  }
  const a=outline(base,type),b=outline(other,type),width=Math.max(a.width,b.width);
  const offset=type==='pants'?-width/2:0;
  const ex=width+offset+8,depth=Math.max(a.height,b.height)+17;
  const alignment=type==='pants'?'옆선을 맞대고 한쪽 다리를 펼친':'목 중심을 맞춘';
  const svg=vector('svg',{viewBox:[-ex,-6,ex*2,depth+6].join(' '),role:'img','aria-label':alignment+' 두 옷의 윤곽. 내 옷은 회색 점선, 추천 옷은 파란 실선.'});
  for(let x=0;x<ex;x+=10){
    for(const px of x?[x,-x]:[0])svg.append(vector('line',{x1:px,x2:px,y1:-6,y2:depth,class:'fc-grid'}));
  }
  for(let y=0;y<depth;y+=10)svg.append(vector('line',{x1:-ex,x2:ex,y1:y,y2:y,class:'fc-grid'}));
  const profiles=vector('g',{transform:'translate('+offset+' 0)'});
  profiles.append(vector('path',{d:b.d,class:'fc-product-path'}),vector('path',{d:a.d,class:'fc-base-path'}));
  svg.append(profiles);
  const scaleY=depth-5,scaleX=-ex+5;
  svg.append(vector('path',{d:'M'+scaleX+' '+(scaleY-1)+'v2m0 -1h10m0 -1v2',class:'fc-ruler'}));
  const text=vector('text',{x:scaleX+12,y:scaleY+1,class:'fc-unit'});text.textContent='10 cm';svg.append(text);
  box.append(svg,element('p',alignment+' 평면 예상 윤곽이에요. 격자 한 칸은 10cm입니다.','fc-caption'));
  return box;
}
function table(base,size,deltas,fields){
  const block=element('section',null,'fc-measures'),headline=element('div',null,'fc-heading');
  headline.append(element('h3','부위별 실측'),element('span','단위 cm'));block.append(headline);
  const t=element('table'),head=t.createTHead().insertRow(),body=t.createTBody();
  for(const s of ['부위','내 옷','추천 옷','차이']){const th=element('th',s);th.scope='col';head.append(th);}
  for(const [k,name] of fields){
    const tr=body.insertRow(),label=element('th',name);label.scope='row';tr.append(label);
    tr.insertCell().textContent=cm(base[k]);tr.insertCell().textContent=cm(size[k]);
    const diff=tr.insertCell(),d=deltas?.[k];
    diff.textContent=Number.isFinite(d)?(d>0?'+':'')+fmt.format(d):'직접 비교 어려움';
    if(!Number.isFinite(d))diff.className='fc-missing';
  }
  block.append(t);return block;
}
let current;
export function openComparison({reference,match,onTry,onFeedback,feedback}){
  if(current?.open)current.close();
  const {product,size,deltas}=match,base=reference.size;
  const dialog=element('dialog',null,'fit-comparison');
  current=dialog;
  const head=element('header',null,'fc-head'),title=element('h2','두 옷 비교');
  title.id='fc-title';dialog.setAttribute('aria-labelledby',title.id);
  const close=element('button','×','fc-close');close.type='button';close.setAttribute('aria-label','비교 닫기');close.onclick=()=>dialog.close();
  head.append(title,close);dialog.append(head);
  const content=element('div',null,'fc-body');
  const intro=element('div',null,'fc-pair');
  for(const [label,item,row] of [['내 기준 옷',reference,base],['추천 옷',product,size]]){
    const card=element('div');
    card.append(element('small',label),element('strong',item.name),element('span',[item.brand,row.label].filter(Boolean).join(' · ')));intro.append(card);
  }
  const pants=product.type==='pants',fields=pants?pantsMeasurementFields:upperFields;
  content.append(intro,chart(base,size,product.type,deltas,fields),table(base,size,deltas,fields));
  const feedbackBlock=element('section',null,'fc-feedback');
  feedbackBlock.append(element('h3','직접 입어보셨나요?'),element('p','입어본 느낌을 남기면 다음 핏 추천에 반영해요.'));
  const choices=element('div',null,'fc-options');
  const feedbackLabels=pants?{long:'기장이 길었어요',good:'잘 맞았어요',short:'기장이 짧았어요'}:labels;
  for(const [key,label] of Object.entries(feedbackLabels)){
    const btn=element('button',label);btn.type='button';btn.dataset.feedback=key;
    btn.setAttribute('aria-pressed',String(key===feedback));
    btn.onclick=()=>{onFeedback(key);for(const el of choices.children)el.setAttribute('aria-pressed',String(el===btn));};
    choices.append(btn);
  }
  feedbackBlock.append(choices);content.append(feedbackBlock);dialog.append(content);
  const foot=element('footer',null,'fc-foot'),fit=element('button','3D로 입어보기','fc-primary');fit.type='button';
  fit.onclick=()=>{dialog.close();onTry();};
  if(product.url && !product.demo){
    try{
      const url=new URL(product.url);
      if(url.protocol==='https:'){
        const link=element('a','브랜드몰에서 보기','fc-link');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';foot.append(link);
      }
    }catch{/* A feed may omit the shopping destination. */}
  }
  if(product.demo)foot.append(element('small','제휴 전 예시 상품'));
  foot.append(fit);dialog.append(foot);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{dialog.remove();if(current===dialog)current=null;},{once:true});
  document.body.append(dialog);dialog.showModal();
}
