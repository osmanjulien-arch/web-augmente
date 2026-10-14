
// Compatible iPhone Pro Max range, generated as independent watches per model/capacity.
// Capacities not sold for a particular year will simply have no offers.
const iphoneGenerations=[16,17,18];
const capacitiesGb=[128,256,512,1024,2048];
const generatedIphones=iphoneGenerations.flatMap(g=>capacitiesGb.map(cap=>({
 id:'iphone-'+g+'-pro-max-'+cap,
 label:'iPhone '+g+' Pro Max '+(cap>=1024?cap/1024+' To':cap+' Go')+' neuf',
 family:'iphone',generation:g,model:'iphone '+g+' pro max',capacityGb:cap,
 condition:'new',maxEuro:null,currency:'EUR',enabled:true
})));
const machines=[
 {id:'mac-mini-llm',label:'Mac mini Apple Silicon ≥32 Go',family:'mac',
  model:'mac mini',minMemoryGb:32,condition:'new',maxEuro:null,currency:'EUR',enabled:true},
 {id:'mac-studio-llm',label:'Mac Studio Apple Silicon ≥32 Go',family:'mac',
  model:'mac studio',minMemoryGb:32,condition:'new',maxEuro:null,currency:'EUR',enabled:true}
];
export const watches = [
 // Preserve the existing 17/256 watch and its historical observations and limit.
 {...generatedIphones.find(w=>w.id==='iphone-17-pro-max-256'),maxEuro:1100},
 ...generatedIphones.filter(w=>w.id!=='iphone-17-pro-max-256'),
 ...machines
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
    allowedHost:'www.macway.com', enabled:false }, // Page does not attest new condition.

  // Moteur dynamique : ajoute d'autres URLs fabricants/marchands dès qu'elles sont validées.
  // 16 Pro Max : disponibilité d'un appareil neuf à confirmer (la fiche LDLC présente du reconditionné).
  {id:'iphone16-256-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00642604.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'iphone16-512-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00642606.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'iphone17-1tb-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00702838.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'iphone18-256-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00752879.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'iphone18-512-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00752867.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'iphone18-2tb-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00752878.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  // Mac mini et Studio : RAM de chaque configuration vérifiée à partir de son nom exact.
  {id:'macmini-m6-32-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00751971.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macmini-m5pro-48-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00752865.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macmini-m5pro-64-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00751974.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macstudio-m5max-36-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00751890.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macstudio-m4max-64-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00675416.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macstudio-m4max-128-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00717117.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macstudio-m3ultra-512-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00718462.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macstudio-m2ultra-128-ldlc',type:'product-ld',
    url:'https://www.ldlc.com/fiche/PB00617173.html',allowedHost:'www.ldlc.com',allowUnavailable:true,enabled:true},
  {id:'macgeneration',type:'rss',
    url:'https://cdn.mgig.fr/rss/light_rss_macg.xml',allowedHost:'cdn.mgig.fr',
    alertRecentDays:3,enabled:true},
  // { id: 'mon-comparateur', type: 'json',
  //   url: 'https://api.exemple.fr/prices.json', allowedHost:'api.exemple.fr', enabled: false }
];

export function activeWatches(env) {
  return watches.filter(w => w.enabled).map(w => ({ ...w,
    maxCents: Math.round(Number((w.id === 'iphone-17-pro-max-256' && env?.WATCH_MAX_EUR) || w.maxEuro || 0) * 100)
  }));
}
