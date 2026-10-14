const normalize = value => String(value || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const accessory = /\b(coque|etui|housse|vitre|verre trempe|film|chargeur|cable|support|accessoire|protege|protection|case|screen protector|charger|mockup|dummy)\b/i;
const unwanted = /\b(reconditionne|occasion|refurbished|used|seconde main|grade [abc]|avec forfait|abonnement|location|leasing)\b/i;

export function matchesModel(title, model = 'iphone 17 pro max') {
  const t = normalize(title);
  return t.includes(normalize(model)) && !accessory.test(t) && !unwanted.test(t);
}

export function capacityOf(offer) {
  if (offer.capacity_gb !== undefined && offer.capacity_gb !== null) {
    const n = Number(offer.capacity_gb);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const match = normalize(offer.title).match(/\b(1|2|128|256|512|1024|2048)\s*(go|gb|to|tb)\b/i);
  if (!match) return null;
  return /^(to|tb)$/i.test(match[2]) ? Number(match[1]) * 1024 : Number(match[1]);
}

export function watchFor(offer, watches, discovery = false) {
  for (const watch of watches) {
    if (!matchesModel(offer.title, watch.model)) continue;
    const capacity = capacityOf(offer);
    if (capacity !== null && capacity !== watch.capacityGb) continue;
    if (!discovery && capacity !== watch.capacityGb) continue;
    if (!discovery && offer.condition !== watch.condition) continue;
    return watch;
  }
  return null;
}

export function euroCents(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error('price missing');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error('invalid EUR amount');
  return Math.round(n * 100);
}

export function normalizeOffer(raw, watch, sourceId) {
  if (!raw || typeof raw !== 'object') throw new Error('offer object required');
  if (raw.currency !== 'EUR') throw new Error('EUR required');
  if (raw.condition !== 'new') throw new Error('new condition required');
  const url = new URL(String(raw.url));
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error('https offer URL required');
  if (!raw.shipping_eur && raw.shipping_eur !== 0) throw new Error('shipping required (including free=0)');
  const title = String(raw.title || '').trim().slice(0, 350);
  const merchant = String(raw.merchant || '').trim().slice(0, 120);
  if (!title || !merchant) throw new Error('title and merchant required');
  const priceCents = euroCents(raw.price_eur);
  if (priceCents === 0) throw new Error('price must be positive');
  const shippingCents = euroCents(raw.shipping_eur);
  const capacityGb = capacityOf(raw);
  if (!matchesModel(title, watch.model) || capacityGb !== watch.capacityGb) throw new Error('watch model/capacity mismatch');
  url.hash = '';
  // Pas de fragment ni de paramètres marketing dans l'identité de l'offre.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  return {watchId:watch.id, sourceId, title, merchant,
    url:url.toString(), priceCents, shippingCents, totalCents:priceCents+shippingCents,
    capacityGb, condition:'new'};
}

export function qualifies(offer, watch, previousAlertCents = null) {
  if (offer.totalCents > watch.maxCents) return false;
  // Une nouvelle baisse d'au moins 1 € peut alerter, sans répétition horaire.
  return previousAlertCents === null || offer.totalCents <= previousAlertCents - 100;
}
