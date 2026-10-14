// Read product prices from public merchant Product JSON-LD. No shipping assumptions.
export function parseProductLd(html, source) {
  if (typeof html !== 'string' || html.length > 800000) throw new Error('invalid product HTML');
  const out=[];
  // Conditional fallback for Boulanger only; never infer a seller from
  // a product title or from a retailer's domain alone.
  const merchantProof = source.requireSellerProof === true &&
    source.allowedHost === 'www.boulanger.com' &&
    source.sellerFallback === 'Boulanger' &&
    /produit\s+neuf<\/span>\s*vendu\s+&amp;\s*expédié\s+par[\s\S]{0,180}title=["']boulanger["']/i.test(html);
  const scripts=html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    let root;
    try {root=JSON.parse(m[1].trim());} catch {continue;}
    const queue=Array.isArray(root)?root:[root];
    for (const obj of queue) {
      const candidates=[obj,...(Array.isArray(obj?.['@graph'])?obj['@graph']:[])];
      for (const product of candidates) {
        const kinds=Array.isArray(product?.['@type'])?product['@type']:[product?.['@type']];
        if (!kinds.some(t=>String(t).toLowerCase().split('/').pop()==='product')) continue;
        const offers=Array.isArray(product.offers)?product.offers:[product.offers];
        for (const offer of offers) {
          if (!offer || String(offer.itemCondition||'').split('/').pop()!=='NewCondition') continue;
          if (String(offer.availability||'').split('/').pop()!=='InStock') continue;
          if (offer.priceCurrency!=='EUR') continue;
          const price=Number(offer.price);
          if (!Number.isFinite(price)||price<1||price>100000) continue;
          const name=String(product.name||'').replace(/<[^>]*>/g,'').trim();
          const seller=String(offer.seller?.name ||
            (merchantProof ? source.sellerFallback : '')).trim();
          if (!name || !seller) continue;
          out.push({title:name,merchant:seller,condition:'new',currency:'EUR',price_eur:price,
            url:source.url,shipping_eur:null});
        }
      }
    }
  }
  if(!out.length) throw new Error('no eligible new in-stock JSON-LD offer');
  return out;
}
