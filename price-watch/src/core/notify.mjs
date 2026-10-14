export async function telegramNotify(env, offer, watch, fetchImpl=fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return {sent:false, reason:'telegram_not_configured'};
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
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return {sent:false, reason:'telegram_not_configured'};
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
