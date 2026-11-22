// Product feeds use centimetres, KRW prices, one stock flag per size and
// per-field measurement methods. A partner's live product can supply its URL.
const sizes = [
  ['XS', -2], ['S', -1], ['M', 0], ['L', 1], ['XL', 2], ['2XL', 3], ['3XL', 4]
];

function sampleProduct({id,brand,name,type,photo,color,colourName,price,base,unavailable=[]}) {
  const [length, shoulder, chest, sleeve] = base;
  return {
    id,code:id,brand,name,type,photo,color,colourName,price,demo:true,url:null,
    category:type==='ziphoodie'?'outer':'top',material:'cotton',source:'예시 상품 실측',
    sizes:sizes.map(([label,grade])=>({
      label,length:length+2*grade,shoulder:shoulder+1.5*grade,
      chest:chest+2.5*grade,sleeve:sleeve+grade,stock:!unavailable.includes(label)
    }))
  };
}

export const products = [
  {id:'SF-H01',brand:'FIELD NOTES',name:'루프백 후드 집업',type:'ziphoodie',photo:'discovery-art/ash.webp',color:'#b5b5b4',colourName:'애시 그레이',price:79000,base:[60,60.5,58,57]},
  {id:'SF-H02',brand:'COMMON HOUR',name:'크롭 후드 집업',type:'ziphoodie',photo:'discovery-art/navy.webp',color:'#263244',colourName:'네이비',price:85000,base:[61,62,60.5,56],unavailable:['XL']},
  {id:'SF-H03',brand:'SUNDAY FORM',name:'워시드 릴랙스 후드 집업',type:'ziphoodie',photo:'discovery-art/olive.webp',color:'#73775b',colourName:'올리브',price:89000,base:[65,63.5,62,58]},
  {id:'SF-T01',brand:'SUNDAY FORM',name:'소프트 크루 티셔츠',type:'tee',photo:'catalog/tee.webp',color:'#ede9d9',colourName:'아이보리',price:32000,base:[68,49,54.5,21.5]},
  {id:'SF-T02',brand:'COMMON HOUR',name:'마린 스트라이프 티셔츠',type:'tee',photo:'catalog/stripe.webp',color:'#243143',colourName:'네이비',price:41000,base:[67,48,55,20.5]},
  {id:'SF-S01',brand:'FIELD NOTES',name:'옥스퍼드 데일리 셔츠',type:'shirt',photo:'catalog/overshirt.webp',color:'#abc0d0',colourName:'파우더 블루',price:69000,base:[72,47,55.5,61]},
  {id:'SF-P01',brand:'SUNDAY FORM',name:'코튼 피케 폴로',type:'polo',photo:'catalog/polo.webp',color:'#8a987b',colourName:'세이지',price:59000,base:[68,47,54,22]},
  {id:'SF-C01',brand:'COMMON HOUR',name:'클래식 크루 스웨트셔츠',type:'sweatshirt',photo:'catalog/sweatshirt.webp',color:'#a6a5a2',colourName:'헤더 그레이',price:65000,base:[66,53,58.5,58]}
].map(sampleProduct);
products.find(p=>p.id==='SF-T02').pattern='stripes';

// Example partners, kept separate from the supplied reference garment.
function samplePants(id,brand,name,price,base) {
  return {
    id,code:id,brand,name,price,category:'bottom',type:'pants',material:'denim',
    colourName:'미디엄 블루',color:'#56686c',photo:'catalog/washed-denim.webp',
    demo:true,url:null,source:'예시 상품 실측',
    sizes:sizes.slice(0,5).map(([label,grade])=>({
      label,length:base.length+grade*1.5,waist:base.waist+grade*2.5,
      hip:base.hip+grade*2,thigh:base.thigh+grade,rise:base.rise+grade,
      hem:base.hem+grade,stock:true
    }))
  };
}
products.push(
  samplePants('SF-D01','FIELD NOTES','와이드 워시 데님',74000,
    {length:105,waist:39.5,hip:57,thigh:40,rise:37.5,hem:28}),
  samplePants('SF-D02','SUNDAY FORM','크롭 와이드 데님',69000,
    {length:103,waist:39.5,hip:57,thigh:40,rise:37.5,hem:28})
);

// Known aliases, including alternative measuring protocols. Never compare an
// unrecognised or explicitly unknown method even when both values are present.
const upperMeasures = {
  chest:{weight:2,default:'flat',aliases:{flat:'flat','pit-to-pit':'flat',가슴단면:'flat',circumference:'circumference',가슴둘레:'circumference'}},
  length:{weight:1,default:'high-shoulder',aliases:{'high-shoulder':'high-shoulder',hps:'high-shoulder','back-neck':'back-neck'}},
  shoulder:{weight:0.7,default:'seam-to-seam',aliases:{'seam-to-seam':'seam-to-seam',직선:'seam-to-seam','along-curve':'along-curve'}},
  sleeve:{weight:1.4,default:'shoulder-seam',aliases:{'shoulder-seam':'shoulder-seam','seam-to-cuff':'shoulder-seam','center-back':'center-back',raglan:'center-back'}}
};
const flatWidth=weight=>({weight,default:'flat',aliases:{flat:'flat','flat-width':'flat'}});
const pantsMeasures={
  waist:flatWidth(2.5),hip:flatWidth(2),thigh:flatWidth(1.5),hem:flatWidth(1),
  rise:{weight:1.4,default:'front-rise',aliases:{'front-rise':'front-rise',앞밑위:'front-rise'}},
  length:{weight:1.8,default:'outseam',aliases:{outseam:'outseam','side-seam':'outseam',총장:'outseam'}}
};

function method(item,row,key) {
  const spec=(item.type==='pants'?pantsMeasures:upperMeasures)[key];
  const raw=row.methods?.[key]??item.methods?.[key]??spec.default;
  return spec.aliases[String(raw).trim().toLowerCase()];
}

function measurement(v) {
  if(typeof v!=='number' && typeof v!=='string')return null;
  const n=Number(v);
  return Number.isFinite(n)&&n>0?n:null;
}

function compareSize(reference,product,size,lengthTarget) {
  const pants=product.type==='pants',definitions=pants?pantsMeasures:upperMeasures;
  const deltas={},issues={};
  let matched=0,error=0,weight=0;
  for(const key of Object.keys(definitions)){
    const baseline=measurement(reference.size[key]),candidate=measurement(size[key]);
    const baseMethod=method(reference,reference.size,key),candidateMethod=method(product,size,key);
    if(baseline===null||candidate===null)issues[key]='missing';
    else if(!baseMethod || baseMethod!==candidateMethod)issues[key]='method';
    const toFlat=key==='chest' && baseMethod==='circumference'?0.5:1;
    deltas[key]=issues[key]?null:Math.round((candidate-baseline)*toFlat*10)/10;
    if(!issues[key])matched++;
  }
  // At least two comparable measurements are needed to rank a garment.
  if(matched<2)return null;
  let reachDelta=pants?null:deltas.sleeve;
  if(reachDelta!==null && deltas.shoulder!==null && method(product,size,'sleeve')==='shoulder-seam'){
    reachDelta+=deltas.shoulder/2;
  }
  for(const [key,spec] of Object.entries(definitions)){
    if(deltas[key]===null)continue;
    let delta=deltas[key];
    if(key==='sleeve')delta=reachDelta-lengthTarget;
    if(pants && key==='length')delta-=lengthTarget;
    error+=spec.weight*Math.abs(delta);
    weight+=spec.weight;
  }
  const score=error/weight+Object.keys(issues).length*1.5;
  return {product,size,deltas,issues,reachDelta,score};
}
const normalized=value=>String(value??'').trim().toUpperCase();

export function recommend(reference,preference='similar',feedback={},feed=products) {
  if(!reference?.type || !reference.size)return [];
  const lengthTarget=preference==='shorter'?-2:({long:-1.5,short:1.5,good:0}[feedback?.[reference.type]]??0);
  const results=[];
  for(const product of feed){
    if(product.type!==reference.type || product.id===reference.id)continue;
    const sameCode=product.code && normalized(product.code)===normalized(reference.code);
    if(sameCode && (!reference.brand||normalized(product.brand)===normalized(reference.brand)))continue;
    let best=null;
    for(const size of product.sizes){
      if(size.stock!==true)continue;
      const candidate=compareSize(reference,product,size,lengthTarget);
      if(candidate && (!best||candidate.score<best.score))best=candidate;
    }
    if(best)results.push(best);
  }
  return results.sort((a,b)=>a.score-b.score||a.product.id.localeCompare(b.product.id));
}
