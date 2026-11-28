import {byId} from './shop-data.mjs?v=2026-11-28a';

const key='selfit.shop.cart';
const available=(id,size)=>byId.get(id)?.demo&&byId.get(id).sizes.some(row=>row.label===size&&row.stock);
export function readCart(){
  const cart=[];
  try{
    const saved=JSON.parse(localStorage.getItem(key)||'null');
    const previous=saved===null?JSON.parse(localStorage.getItem('selfit-app-v1')||'{}').cart:undefined;
    const rows=Array.isArray(saved)?saved:Array.isArray(previous)?previous.map(row=>({
      product:row?.id,size:row?.size,quantity:row?.qty
    })):[];
    for(const row of rows){
      if(!row||!available(row.product,row.size)||!Number.isInteger(row.quantity)||row.quantity<=0)continue;
      const existing=cart.find(entry=>entry.product===row.product&&entry.size===row.size);
      if(existing)existing.quantity=Math.min(5,existing.quantity+row.quantity);
      else if(cart.length<30)cart.push({product:row.product,size:row.size,quantity:Math.min(5,row.quantity)});
    }
  }catch{}
  return cart;
}
export function writeCart(cart){
  try{localStorage.setItem(key,JSON.stringify(cart));}catch{}
}
export function addCartItem(cart,product,size){
  if(!available(product,size))return '선택한 사이즈를 다시 확인해 주세요.';
  const existing=cart.find(row=>row.product===product&&row.size===size);
  if(existing){
    if(existing.quantity>=5)return '같은 상품은 5개까지 담을 수 있어요.';
    existing.quantity++;
  }else{
    if(cart.length>=30)return '장바구니에는 30종까지 담을 수 있어요.';
    cart.push({product,size,quantity:1});
  }
  writeCart(cart);
  return '';
}
