// Read product prices from public merchant Product JSON-LD. No shipping assumptions.
export function parseProductLd(html, source) {
  if (typeof html !== 'string' || html.length > 800000) throw new Error('invalid product HTML');
  const out=[];
  let productCount=0, newCount=0, stockCount=0;
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
        productCount++;
        const topOffers=Array.isArray(product.offers)?product.offers:[product.offers];
        // A Product may advertise a price only via an AggregateOffer with
        // individual child Offer objects. Never treat lowPrice alone as a purchase offer.
        const offers=topOffers.flatMap(o=>
          String(o?.['@type']||'').split('/').pop()==='AggregateOffer'
            ? (Array.isArray(o.offers)?o.offers:[o.offers]).filter(Boolean).slice(0,30)
            : [o]);
        for (const offer of offers) {
          if (!offer || String(offer.itemCondition||'').split('/').pop()!=='NewCondition') continue;
          newCount++;
          if (String(offer.availability||'').split('/').pop()!=='InStock') continue;
          stockCount++;
          if (offer.priceCurrency!=='EUR') continue;
          const price=Number(offer.price);
          if (!Number.isFinite(price)||price<1||price>100000) continue;
          const name=String(product.name||'').replace(/<[^>]*>/g,'').trim();
          const seller=String(offer.seller?.name ||
            (merchantProof ? source.sellerFallback : '')).trim();
          if (!name || !seller) continue;
          const rawImage=(Array.isArray(product.image)?product.image[0]:product.image);
          let imageUrl=null;
          try{
            const imageRef=typeof rawImage==='string'?rawImage:rawImage?.url;
            const u=new URL(imageRef);
            if(u.protocol==='https:' && !u.username && !u.password &&
              /(^|\.)(materiel\.net|rueducommerce\.fr|ldlc\.com|macway\.com|boulanger\.com)$/.test(u.hostname))
              imageUrl=u.toString();
          }catch{}
          out.push({title:name,merchant:seller,condition:'new',currency:'EUR',price_eur:price,
            url:source.url,shipping_eur:null,image_url:imageUrl});
        }
      }
    }
  }
  if(!out.length) throw new Error(`no eligible new in-stock JSON-LD offer (product=${productCount},new=${newCount},stock=${stockCount},seller_proof=${merchantProof})`);
  return out;
}
