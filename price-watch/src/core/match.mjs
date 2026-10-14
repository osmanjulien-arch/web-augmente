const normalize = value => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const accessory = /\b(coque|etui|housse|vitre|verre trempe|film|chargeur|cable|support|accessoire|protege|protection|case|screen protector|charger|mockup|dummy)\b/i;
const unwanted = /\b(reconditionne|occasion|refurbished|used|seconde main|grade [abc]|avec forfait|abonnement|location|leasing)\b/i;
export function matchesModel(title, model = 'iphone 17 pro max') {
  const t=normalize(title);
  return t.includes(normalize(model)) && !accessory.test(t) && !unwanted.test(t);
}
export function capacityOf(offer) {
  if(offer.capacity_gb !== undefined && offer.capacity_gb !== null) {
    const n=Number(offer.capacity_gb);
    return Number.isInteger(n)&&n>0?n:null;
  }
  const t=normalize(offer.title);
  // Find iPhone SSD capacity, not the amount of RAM in a Mac.
  const matches=[...t.matchAll(/\b(\d{1,4})\s*(go|gb|to|tb)\b/gi)];
  const part=matches.find(m=>Number(m[1])>=128 || /^(to|tb)$/i.test(m[2]));
  if(!part) return null;
  return /^(to|tb)$/i.test(part[2])?Number(part[1])*1024:Number(part[1]);
}
export function macMemoryGb(offer) {
  if(offer.memory_gb!==undefined && offer.memory_gb!==null) {
    const value=Number(offer.memory_gb);
    return Number.isInteger(value)&&value>0&&value<=1024?value:null;
  }
  const title=normalize(offer.title);
  // Mac sellers write RAM before SSD: "M5 Max 36 Go/512 Go" or "M4 Pro 64GB/1TB".
  const m=title.match(/\b(16|18|24|32|36|48|64|96|128|192|256|384|512|768)\s*(go|gb)(?:\b|\/)/i);
  return m?Number(m[1]):null;
}
export function macChip(offer) {
  const title=normalize(offer.title);
  const m=title.match(/\bm([1-9]\d?)\s*(ultra|max|pro)?\b/i);
  return m?'M'+m[1]+(m[2]?' '+m[2][0].toUpperCase()+m[2].slice(1).toLowerCase():''):null;
}
// Q4 approximate headroom includes OS & typical context but not full performance guarantees.
export function macLlmTier(ramGb) {
  if(!Number.isFinite(ramGb))return null;
  if(ramGb>=256)return 200;
  if(ramGb>=128)return 120;
  if(ramGb>=64)return 70;
  if(ramGb>=32)return 30;
  return null;
}
export function matchMac(offer,watch,discovery=false) {
  if(!matchesModel(offer.title,watch.model))return false;
  const ram=macMemoryGb(offer),chip=macChip(offer);
  if(discovery)return true;
  if(!chip||!ram || ram < watch.minMemoryGb)return false;
  return offer.condition===watch.condition;
}
export function watchFor(offer,watches,discovery=false) {
  for(const watch of watches) {
    if(watch.family==='mac') {
      if(matchMac(offer,watch,discovery))return watch;
      continue;
    }
    if(!matchesModel(offer.title,watch.model))continue;
    const capacity=capacityOf(offer);
    if(capacity!==null && capacity!==watch.capacityGb)continue;
    if(!discovery && capacity!==watch.capacityGb)continue;
    if(!discovery && offer.condition!==watch.condition)continue;
    return watch;
  }
  return null;
}
export function euroCents(raw) {
  if(typeof raw!=='string' && typeof raw!=='number')throw new Error('price missing');
  const n=Number(raw);
  if(!Number.isFinite(n)||n<0||n>100000)throw new Error('invalid EUR amount');
  return Math.round(n*100);
}
export function normalizeOffer(raw,watch,sourceId) {
  if(!raw||typeof raw!=='object')throw new Error('offer object required');
  if(raw.currency!=='EUR')throw new Error('EUR required');
  if(raw.condition!=='new')throw new Error('new condition required');
  const url=new URL(String(raw.url));
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw new Error('https offer URL required');
  if(raw.shipping_eur===null||raw.shipping_eur===undefined)throw new Error('shipping required (including free=0)');
  const title=String(raw.title||'').trim().slice(0,350),merchant=String(raw.merchant||'').trim().slice(0,120);
  if(!title||!merchant)throw new Error('title and merchant required');
  const priceCents=euroCents(raw.price_eur),shippingCents=euroCents(raw.shipping_eur);
  if(priceCents<=0)throw new Error('price must be positive');
  if(watch.family==='mac') {
    if(!matchMac(raw,watch))throw new Error('Mac family/chip/memory mismatch');
  }else {
    if(!matchesModel(title,watch.model)||capacityOf(raw)!==watch.capacityGb)
      throw new Error('watch model/capacity mismatch');
  }
  url.hash='';
  for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|mc_)/i.test(key))url.searchParams.delete(key);
  return {watchId:watch.id,sourceId,title,merchant,url:url.toString(),
    priceCents,shippingCents,totalCents:priceCents+shippingCents,
    capacityGb:watch.family==='iphone'?capacityOf(raw):null,condition:'new'};
}
export function qualifies(offer,watch,previousAlertCents=null) {
  if(!watch.maxCents || offer.totalCents>watch.maxCents)return false;
  return previousAlertCents===null||offer.totalCents<=previousAlertCents-100;
}
export function meaningfulDrop(oldCents,newCents) {
  if(oldCents===null||oldCents===undefined)return false;
  return newCents<=oldCents-Math.max(10000,Math.round(oldCents*0.05));
}
