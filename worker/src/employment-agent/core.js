const truncate = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const descriptionExcerpt = (value) => truncate(String(value ?? '')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email masqué]')
  .replace(/(?:https?:\/\/|www\.)\S+/gi, '[lien masqué]'), 2400);

export function rankOffer(offer) {
  const title = String(offer.intitule ?? '').toLocaleLowerCase('fr');
  const description = String(offer.description ?? '').toLocaleLowerCase('fr');
  let score = 0;
  const reasons = [];
  for (const [pattern, points, label] of [
    [/pompe.s? à chaleur|\bpac\b/i, 40, 'PAC'],
    [/\bcvc\b|climatisation|génie climatique/i, 25, 'CVC'],
    [/chauffagiste|chauffage/i, 20, 'Chauffage'],
    [/maintenance|dépannage|mise en service/i, 20, 'Maintenance/MES']
  ]) {
    if (pattern.test(title) || pattern.test(description)) {
      score += points;
      reasons.push(label);
    }
  }
  return { score: Math.min(score, 100), reasons };
}

export function normalizeOffer(offer) {
  if (!offer || typeof offer !== 'object') return null;
  const id = truncate(offer.id, 64);
  if (!/^[A-Za-z0-9]{5,32}$/.test(id)) return null;
  const title = truncate(offer.intitule, 240);
  if (!title) return null;
  const { score, reasons } = rankOffer(offer);
  const company = truncate(offer.entreprise?.nom, 160);
  const location = truncate(offer.lieuTravail?.libelle, 160);
  const salary = truncate(offer.salaire?.libelle, 180);
  const contract = truncate(offer.typeContratLibelle || offer.typeContrat, 120);
  const updated = truncate(offer.dateActualisation || offer.dateCreation, 40);
  const description = String(offer.description ?? '');
  return {
    offer_key: 'francetravail:' + id,
    external_id: id,
    title, company, location, salary, contract,
    source_url: 'https://candidat.francetravail.fr/offres/recherche/detail/' + encodeURIComponent(id),
    source_updated_at: updated || null,
    description_excerpt: descriptionExcerpt(description),
    content_to_hash: JSON.stringify([title, company, location, salary, contract, updated, description]),
    relevance_score: score,
    reasons,
    evidence_status: 'source_observed'
  };
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function processOffers(offers, storage, options = {}) {
  if (!Array.isArray(offers)) throw new TypeError('Offers must be an array');
  const now = options.now || new Date().toISOString();
  const minimumScore = options.minimumScore ?? 55;
  const metrics = { received: offers.length, valid: 0, new: 0, changed: 0, unchanged: 0, rejected: 0, candidates: 0 };
  const encountered = new Set();
  for (const offer of offers.slice(0, 150)) {
    const normalized = normalizeOffer(offer);
    if (!normalized || encountered.has(normalized.offer_key)) {
      metrics.rejected++;
      continue;
    }
    encountered.add(normalized.offer_key);
    metrics.valid++;
    const { content_to_hash, ...safe } = normalized;
    const record = { ...safe, content_hash: await sha256Hex(content_to_hash), last_seen_at: now };
    const previous = await storage.get(record.offer_key);
    record.first_seen_at = previous?.first_seen_at || now;
    if (!previous) metrics.new++;
    else if (previous.content_hash !== record.content_hash) metrics.changed++;
    else metrics.unchanged++;
    await storage.upsert(record);
    if ((!previous || previous.content_hash !== record.content_hash) && record.relevance_score >= minimumScore) {
      await storage.enqueueCandidate({
        candidate_key: record.offer_key + ':' + record.content_hash,
        offer_key: record.offer_key,
        content_hash: record.content_hash,
        summary: [record.title, record.company, record.location].filter(Boolean).join(' — '),
        source_url: record.source_url,
        evidence_status: record.evidence_status,
        created_at: now
      });
      metrics.candidates++;
    }
  }
  return metrics;
}
