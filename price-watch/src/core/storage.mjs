export async function fingerprint(...parts) {
  const data = new TextEncoder().encode(parts.join('\u001f'));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export async function saveLead(db, lead, watch, sourceId, now) {
  const url = new URL(lead.url);
  if (url.protocol !== 'https:') return false;
  const key = await fingerprint('lead',sourceId,lead.id || url.toString());
  const result = await db.prepare(`INSERT OR IGNORE INTO leads
    (key,watch_id,source_id,title,url,published_at,first_seen)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(key, watch.id, sourceId, lead.title.slice(0,350), url.toString(),lead.publishedAt,now).run();
  return Boolean(result.meta?.changes);
}

export async function saveOffer(db, offer, now) {
  const key = await fingerprint('offer',offer.sourceId,offer.merchant.toLowerCase(),offer.url);
  const prev = await db.prepare('SELECT total_cents FROM offers WHERE key=?').bind(key).first();
  await db.prepare(`INSERT INTO offers
    (key,watch_id,source_id,merchant,title,url,price_cents,shipping_cents,total_cents,condition,capacity_gb,first_seen,last_seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET
      title=excluded.title, url=excluded.url, price_cents=excluded.price_cents,
      shipping_cents=excluded.shipping_cents, total_cents=excluded.total_cents,
      last_seen=excluded.last_seen`)
    .bind(key,offer.watchId,offer.sourceId,offer.merchant,offer.title,offer.url,
      offer.priceCents,offer.shippingCents,offer.totalCents,offer.condition,
      offer.capacityGb,now,now).run();
  if (!prev || prev.total_cents !== offer.totalCents) {
    await db.prepare('INSERT INTO observations (offer_key,watch_id,total_cents,observed_at) VALUES (?,?,?,?)')
      .bind(key,offer.watchId,offer.totalCents,now).run();
  }
  return key;
}

export async function lastAlertPrice(db, offerKey) {
  const row = await db.prepare('SELECT last_total_cents FROM alerts WHERE offer_key=?').bind(offerKey).first();
  return row ? row.last_total_cents : null;
}

export async function markAlert(db, offerKey, cents, now) {
  await db.prepare(`INSERT INTO alerts (offer_key,last_total_cents,last_sent_at) VALUES (?,?,?)
    ON CONFLICT(offer_key) DO UPDATE SET last_total_cents=excluded.last_total_cents,
      last_sent_at=excluded.last_sent_at`).bind(offerKey,cents,now).run();
}

export async function saveRun(db, result, started, ended) {
  await db.prepare(`INSERT INTO runs
    (started_at,completed_at,source_ok,source_failed,leads_added,offers_seen,alerts_sent,errors_json)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(started,ended,result.sourceOk,result.sourceFailed,result.leadsAdded,
      result.offersSeen,result.alertsSent,JSON.stringify(result.errors.slice(0,10))).run();
}


export async function saveIndication(db, offer, watch, sourceId, now) {
  const key=await fingerprint('indication',sourceId,offer.merchant.toLowerCase(),offer.url);
  const cents=Math.round(offer.price_eur*100);
  const prev=await db.prepare('SELECT price_cents FROM indications WHERE key=?').bind(key).first();
  await db.prepare(`INSERT INTO indications
    (key,watch_id,source_id,merchant,title,url,price_cents,shipping_status,first_seen,last_seen)
    VALUES (?,?,?,?,?,?,?,'unknown',?,?)
    ON CONFLICT(key) DO UPDATE SET title=excluded.title,price_cents=excluded.price_cents,last_seen=excluded.last_seen`)
    .bind(key,watch.id,sourceId,offer.merchant,offer.title,offer.url,cents,now,now).run();
  if(!prev || prev.price_cents!==cents) await db.prepare(
    'INSERT INTO indication_observations (indication_key,watch_id,price_cents,observed_at) VALUES (?,?,?,?)'
  ).bind(key,watch.id,cents,now).run();
  return {key,priceCents:cents,changed:!prev || prev.price_cents!==cents};
}
export async function previousIndicationAlert(db,key){
  const row=await db.prepare('SELECT last_price_cents FROM indication_alerts WHERE indication_key=?').bind(key).first();
  return row ? row.last_price_cents : null;
}
export async function markIndicationAlert(db,key,cents,now){
  await db.prepare(`INSERT INTO indication_alerts(indication_key,last_price_cents,last_sent_at) VALUES (?,?,?)
  ON CONFLICT(indication_key) DO UPDATE SET last_price_cents=excluded.last_price_cents,last_sent_at=excluded.last_sent_at`)
    .bind(key,cents,now).run();
}
