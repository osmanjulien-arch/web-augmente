// Ajouter un produit = ajouter une entrée ; aucun changement au moteur nécessaire.
export const watches = [
  { id: 'iphone-17-pro-max-256', label: 'iPhone 17 Pro Max 256 Go neuf',
    model: 'iphone 17 pro max', capacityGb: 256, condition: 'new', maxEuro: 1100,
    currency: 'EUR', enabled: true }
];

// RSS = découverte d'annonces (sans garantie du prix affiché).
// json = prix structurés provenant d'un endpoint que TU contrôles / autorises.
export const sources = [
  { id: 'dealabs-telephonie', type: 'rss',
    url: 'https://www.dealabs.com/rss/groupe/telephonie',
    allowedHost: 'www.dealabs.com', alertRecentDays:3, enabled: true },
  { id: 'dealabs-apple', type:'rss',
    url:'https://www.dealabs.com/rss/groupe/apple',
    allowedHost:'www.dealabs.com', alertRecentDays:3, enabled:true },
  { id:'frandroid-bons-plans', type:'rss',
    url:'https://www.frandroid.com/bons-plans/feed',
    allowedHost:'www.frandroid.com', alertRecentDays:3, enabled:true },
  { id:'igeneration-apple', type:'rss',
    url:'https://cdn.mgig.fr/rss/light_rss_igen.xml',
    allowedHost:'cdn.mgig.fr', alertRecentDays:3, enabled:true },
  // Google News is optional and inactive: the Cloudflare worker received HTTP 503.
  { id:'google-news-iphone', type:'rss',
    url:'https://news.google.com/rss/search?q=%22iPhone%2017%20Pro%20Max%22%20%28Amazon%20OR%20Cdiscount%20OR%20Fnac%20OR%20Darty%20OR%20Boulanger%29&hl=fr&gl=FR&ceid=FR:fr',
    allowedHost:'news.google.com', alertRecentDays:2, enabled:false },
  { id:'materiel-orange', type:'product-ld',
    url:'https://www.materiel.net/produit/202509100081.html',
    allowedHost:'www.materiel.net', enabled:true },
  { id:'rueducommerce-argent', type:'product-ld',
    url:'https://www.rueducommerce.fr/p/r25099019850.html',
    allowedHost:'www.rueducommerce.fr', enabled:true },
  // Boulanger: JSON-LD lacks seller. The fallback is accepted only when
  // the page explicitly states the product is new and sold by Boulanger.
  { id:'boulanger-orange', type:'product-ld',
    url:'https://www.boulanger.com/ref/1226095?offer=26284cfd-6b5a-44e8-a0d1-5bd6db904aaf',
    allowedHost:'www.boulanger.com', sellerFallback:'Boulanger',
    requireSellerProof:true, enabled:false },
  { id:'boulanger-bleu', type:'product-ld',
    url:'https://www.boulanger.com/ref/1227789',
    allowedHost:'www.boulanger.com', sellerFallback:'Boulanger',
    requireSellerProof:true, enabled:false },
  { id:'ldlc-bleu', type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00702832.html',
    allowedHost:'www.ldlc.com', enabled:true },
  { id:'ldlc-argent', type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00702830.html',
    allowedHost:'www.ldlc.com', enabled:false }, // BackOrder; re-enable when in stock.
  { id:'macway-bleu', type:'product-ld',
    url:'https://www.macway.com/apple-iphone-17-pro-max-256-go-bleu-intense/p3185211',
    allowedHost:'www.macway.com', enabled:true },
  { id:'macway-argent', type:'product-ld',
    url:'https://www.macway.com/apple-iphone-17-pro-max-256-go-argent/p3185216',
    allowedHost:'www.macway.com', enabled:false } // Page does not attest new condition.
  // { id: 'mon-comparateur', type: 'json',
  //   url: 'https://api.exemple.fr/prices.json', allowedHost:'api.exemple.fr', enabled: false }
];

export function activeWatches(env) {
  return watches.filter(w => w.enabled).map(w => ({ ...w,
    maxCents: Math.round(Number((w.id === 'iphone-17-pro-max-256' && env?.WATCH_MAX_EUR) || w.maxEuro) * 100)
  }));
}
