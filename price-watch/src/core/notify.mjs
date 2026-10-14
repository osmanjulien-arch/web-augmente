export async function telegramNotify(env, offer, watch, fetchImpl=fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return ntfyNotify(env,'Alerte prix '+watch.label,
      `${(offer.totalCents/100).toFixed(2)} € livraison incluse, prix déclaré.\n`+
      offer.merchant+' - '+offer.title+'\n'+offer.url,offer.url,fetchImpl);
  }
  const text = [
    `Prix sous ton seuil : ${watch.label}`,
    `${(offer.totalCents/100).toFixed(2)} € livré (seuil ${(watch.maxCents/100).toFixed(2)} €)`,
    `Article : ${offer.title}`,
    `Vendeur : ${offer.merchant}`,
    `Source : ${offer.sourceId} — prix déclaré, à confirmer avant achat`,
    offer.url
  ].join('\n').slice(0,3900);
  const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID, text, disable_web_page_preview:true}),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  return {sent:true};
}


export async function telegramLeadNotify(env, lead, watch, fetchImpl=fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return ntfyNotify(env,'Piste RSS '+watch.label,
      'Annonce non vérifiée : '+lead.title+'\n'+lead.url,lead.url,fetchImpl);
  }
  const text = [
    `Piste RSS à vérifier : ${watch.label}`,
    `Annonce : ${lead.title}`,
    `Aucun prix livré confirmé : vérifier la variante, le vendeur et les conditions`,
    lead.url
  ].join('\n').slice(0,3900);
  const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID, text, disable_web_page_preview:true}),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  return {sent:true};
}


export const DASHBOARD_URL='https://wa-price-watch.osmanjulien-arch.workers.dev/dashboard';

// Public ntfy topics: the random topic acts as a bearer capability. Never include personal data.
export async function ntfyNotify(env,title,message,link,fetchImpl=fetch){
  if(!env.NTFY_TOPIC || !/^[a-zA-Z0-9_-]{20,64}$/.test(env.NTFY_TOPIC))return {sent:false,reason:'ntfy_not_configured'};
  let safeOfferUrl;
  try{const u=new URL(link);safeOfferUrl=u.protocol==='https:'&&!u.username&&!u.password?u.toString():null;}catch{}
  const actions='view, Voir le tableau, '+DASHBOARD_URL+
     (safeOfferUrl?'; view, Voir l offre, '+safeOfferUrl:'');
  const res=await fetchImpl('https://ntfy.sh/'+env.NTFY_TOPIC,{
    method:'POST', headers:{
      'Content-Type':'text/plain; charset=utf-8','X-Title':title.slice(0,150),
      'X-Click':DASHBOARD_URL,'X-Actions':actions,'X-Priority':'default'
    },body:message.slice(0,3500),signal:AbortSignal.timeout(10000)
  });
  if(!res.ok) throw new Error('ntfy HTTP '+res.status);
  return {sent:true};
}
export async function indicationNotify(env,item,watch,fetchImpl=fetch){
  const price=Number(item.price_eur).toFixed(2);
  const message='Prix marchand affiché : '+price+' € (livraison NON vérifiée)\n'+
    'Vendeur : '+item.merchant+'\n'+item.title+'\nConfirmer le prix livré et les caractéristiques (RAM/SSD pour Mac) avant achat.\n'+item.url;
  return ntfyNotify(env,'Baisse de prix : '+watch.label,message,item.url,fetchImpl);
}
