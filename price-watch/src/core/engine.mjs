import {activeWatches,sources} from '../config.mjs';
import {watchFor,normalizeOffer,qualifies} from './match.mjs';
import {saveLead,saveOffer,lastAlertPrice,markAlert,saveRun,saveIndication,previousIndicationAlert,markIndicationAlert,saveSourceHealth} from './storage.mjs';
import {telegramNotify,telegramLeadNotify,indicationNotify} from './notify.mjs';
import {collect} from '../sources/registry.mjs';

async function storePrices(items, sourceId, env, result, now) {
  const watches = activeWatches(env);
  for (const raw of items.slice(0,200)) {
    const watch = watchFor(raw, watches);
    if (!watch) continue;
    try {
      const offer = normalizeOffer(raw,watch,sourceId);
      const key = await saveOffer(env.DB,offer,now);
      result.offersSeen++;
      const last = await lastAlertPrice(env.DB,key);
      if (!qualifies(offer,watch,last)) continue;
      // 5 alertes max par exécution, évite la rafale lors d'un import massif.
      if (result.alertsSent >= 5) continue;
      const notification = await telegramNotify(env,offer,watch);
      if (notification.sent) {
        await markAlert(env.DB,key,offer.totalCents,now);
        result.alertsSent++;
      } else result.notificationsPending++;
    } catch (e) {result.errors.push(`${sourceId}: ${String(e.message).slice(0,160)}`);}
  }
}

export function eligibleRecentLead(item,source,now) {
  if (!source.alertRecentDays) return true;
  const published=Date.parse(item.publishedAt||'');
  const checked=Date.parse(now);
  if (!Number.isFinite(published)||!Number.isFinite(checked)) return false;
  if(published>checked+60*60*1000)return false;
  if(checked-published>source.alertRecentDays*24*60*60*1000)return false;
  // News indexes need deal language; the RSS title remains only an unverified lead.
  if(source.id==='google-news-iphone' && !/promo|promotion|r[ée]duction|offre|bon plan|prix|baisse|soldes|€|brad[eé]|remise|code promo|discount/i.test(item.title))return false;
  return true;
}
function newResult() {
  return {sourceOk:0,sourceFailed:0,leadsAdded:0,offersSeen:0,alertsSent:0,
    notificationsPending:0,leadsNotified:0,indicationsSeen:0,errors:[]};
}

export async function ingestManual(payload,env) {
  if (!payload || !Array.isArray(payload.offers) || !payload.offers.length || payload.offers.length > 50)
    throw new Error('offers[] must contain 1–50 items');
  if (payload.source !== 'web-augmente') throw new Error('unsupported manual source');
  const result = newResult();
  const now = new Date().toISOString();
  await storePrices(payload.offers,'web-augmente',env,result,now);
  return result;
}

export async function runScheduled(env, fetchImpl=fetch) {
  const now = new Date().toISOString();
  const result = newResult();
  const watches = activeWatches(env);
  for (const source of sources.filter(s=>s.enabled)) {
    try {
      const data = await collect(source,fetchImpl);
      if (data.kind === 'lead') {
        for (const item of data.items) {
          const watch = watchFor(item,watches,true);
          if (watch && await saveLead(env.DB,item,watch,source.id,now)) {
            result.leadsAdded++;
            if (env.ALERT_RSS_LEADS === 'true' && result.leadsNotified < 5 && eligibleRecentLead(item,source,now)) {
              try {
                const out = await telegramLeadNotify(env,item,watch);
                if (out.sent) result.leadsNotified++;
                else result.notificationsPending++;
              } catch(e) {result.errors.push(`RSS alert: ${String(e.message).slice(0,100)}`);}
            }
          }
        }
      } else if (data.kind === 'indication') {
        for (const item of data.items) {
          const watch=watchFor(item,watches);
          if(!watch) continue;
          const stored=await saveIndication(env.DB,item,watch,source.id,now);
          result.indicationsSeen++;
          const prev=await previousIndicationAlert(env.DB,stored.key);
          if(stored.priceCents <= watch.maxCents &&
             (prev===null || stored.priceCents <= prev-100) && result.alertsSent<5) {
            const sent=await indicationNotify(env,item,watch);
            if(sent.sent) {await markIndicationAlert(env.DB,stored.key,stored.priceCents,now);result.alertsSent++;}
            else result.notificationsPending++;
          }
        }
      } else await storePrices(data.items,source.id,env,result,now);
      result.sourceOk++;
      await saveSourceHealth(env.DB,source.id,now,true,data.items.length);
    } catch (e) {
      result.sourceFailed++;
      await saveSourceHealth(env.DB,source.id,now,false,0).catch(()=>{});
      result.errors.push(`${source.id}: ${String(e.message).slice(0,160)}`);
    }
  }
  await saveRun(env.DB,result,now,new Date().toISOString());
  return result;
}
