import {fetchText} from './http.mjs';
import {parseRss} from './rss.mjs';

export async function collect(source, fetchImpl=fetch) {
  const body = await fetchText(source, fetchImpl);
  if (source.type === 'rss') return {kind:'lead', items:parseRss(body)};
  if (source.type === 'json') {
    const raw = JSON.parse(body);
    if (!Array.isArray(raw.offers) || raw.offers.length > 200) throw new Error('json feed requires offers[] (<=200)');
    return {kind:'price',items:raw.offers};
  }
  throw new Error(`unsupported source type: ${source.type}`);
}
