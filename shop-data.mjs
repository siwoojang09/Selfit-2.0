import {builtins} from './catalog-data.mjs?v=2026-11-27q';
import {products} from './fit-matches.mjs?v=2026-11-27q';

const storefront = {
  'KC9315': 'https://www.musinsa.com/products/5329359',
  'mood-inside-vtg-hood-jacket': 'https://www.musinsa.com/products/4399019'
};
const photos = {
  'SF-H01': 'discovery-art/ash.webp',
  'SF-H02': 'discovery-art/navy.webp',
  'SF-T01': 'catalog/tee.webp',
  'SF-S01': 'catalog/overshirt.webp'
};
const order = ['mood-inside-vtg-hood-jacket','washed-denim-medium-blue','nike-sport-tee-white','SF-H01','KC9315','signature-wide-chino','SF-S01','SF-T01','underoff-university-hoodie','trillion-striped-oxford'];
const all = [...builtins,...products];
export const shopProducts = [...order.map(id=>all.find(item=>item.id===id)),...all.filter(item=>!order.includes(item.id))]
  .map(item=>({
    id:item.id,name:item.name,brand:item.brand||'SELFIT FITTING',color:item.colourName,
    photo:photos[item.id]||item.photo,category:item.category,
    price:item.demo?item.price:null,url:storefront[item.id]||null,demo:!!item.demo,
    sizes:item.sizes.map(row=>({label:row.label,stock:row.stock!==false}))
  }));
export const byId = new Map(shopProducts.map(item=>[item.id,item]));
export const editorialLooks = [
  {id:'studio-washed',title:'워시드 아우터와 와이드 데님',body:'워시드 블랙과 미디엄 블루 조합. 이 코디에는 흰 티셔츠와 회색 티셔츠 중 어느 쪽이 어울릴까요?',author:'SELFIT 편집팀',items:['mood-inside-vtg-hood-jacket','washed-denim-medium-blue'],tag:'캐주얼',editorial:true,likes:0,liked:false,comments:[]},
  {id:'studio-stripe',title:'스트라이프 셔츠와 치노',body:'스트라이프 셔츠와 와이드 치노를 조합했어요. 셔츠를 넣어 입었을 때와 풀어 입었을 때의 인상을 비교해 보세요.',author:'SELFIT 편집팀',items:['trillion-striped-oxford','signature-wide-chino'],tag:'미니멀',editorial:true,likes:0,liked:false,comments:[]}
];
