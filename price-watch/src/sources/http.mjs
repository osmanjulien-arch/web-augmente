export async function fetchText(source, fetchImpl=fetch) {
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || url.hostname !== source.allowedHost || url.port || url.username || url.password) {
    throw new Error(`source ${source.id}: HTTPS host not allowed`);
  }
  const result = await fetchImpl(url, {
    method:'GET', redirect:'error', signal:AbortSignal.timeout(10000),
    headers:{'Accept':'application/xml, application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9',
      'User-Agent':'WA-Price-Watch/0.1 (+private product monitoring)'}
  });
  if (!result.ok) throw new Error(`source ${source.id}: HTTP ${result.status}`);
  const limit = 600_000;
  const length = Number(result.headers.get('content-length') || 0);
  if (length > limit) throw new Error(`source ${source.id}: oversized response`);
  const reader = result.body?.getReader();
  if (!reader) throw new Error(`source ${source.id}: empty stream`);
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error(`source ${source.id}: oversized response`);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {data.set(c,offset); offset += c.byteLength;}
  return new TextDecoder().decode(data);
}
