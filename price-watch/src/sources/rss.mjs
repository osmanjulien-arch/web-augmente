// Parseur limité aux champs texte essentiels d'Atom/RSS (pas d'XML arbitraire).
// Détecter les annonces, jamais affirmer un prix à partir du seul titre RSS.
const decode = value => String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
  .replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|#\d+|#x[0-9a-f]+);/gi, x => {
    const m = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&#x27;':"'"};
    const l=x.toLowerCase();
    if (m[l]) return m[l];
    const code = l.startsWith('&#x') ? parseInt(l.slice(3,-1),16) : parseInt(l.slice(2,-1),10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : x;
  }).replace(/<[^>]+>/g,'').trim();
function tag(xml, name) {
  const escaped = name.replace(/:/g, '\\:');
  const found = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i'));
  return found ? decode(found[1]) : '';
}
function xmlUrl(item, atom) {
  if (atom) {
    const link = item.match(/<link\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"][^>]*\/?\s*>/i);
    return link ? decode(link[1]) : tag(item,'link');
  }
  return tag(item,'link');
}
export function parseRss(xml) {
  if (typeof xml !== 'string' || !/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error('not RSS/Atom XML');
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].slice(0,200);
  return blocks.map(([,kind,body])=>({
    id:tag(body,'guid') || tag(body,'id') || xmlUrl(body,kind.toLowerCase()==='entry'),
    title:tag(body,'title'), url:xmlUrl(body,kind.toLowerCase()==='entry'),
    publishedAt:tag(body,'pubDate') || tag(body,'published') || tag(body,'updated') || null
  })).filter(x=>x.title && /^https?:\/\//i.test(x.url));
}
