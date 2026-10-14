import {activeWatches,sources} from './config.mjs';
import {runScheduled,ingestManual} from './core/engine.mjs';
import {html as dashboardHtml,css as dashboardCss,js as dashboardJs} from './dashboard.mjs';

function json(value,status=200) {
  return new Response(JSON.stringify(value),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer'
  }});
}
function authorized(request, env) {
  return !!env.API_TOKEN && request.headers.get('authorization') === `Bearer ${env.API_TOKEN}`;
}
async function getRows(db,sql,args=[]) {
  const value = await db.prepare(sql).bind(...args).all();
  return value.results || [];
}
function idParam(url) {
  const id = url.searchParams.get('watch') || 'iphone-17-pro-max-256';
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('invalid watch');
  return id;
}

export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if ((url.pathname === '/' || url.pathname === '/dashboard') && request.method==='GET')
      return new Response(dashboardHtml,{headers:{
        'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'public, max-age=300',
        'X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'no-referrer',
        'X-Frame-Options':'DENY',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      }});
    if(url.pathname==='/dashboard.css' && request.method==='GET')
      return new Response(dashboardCss,{headers:{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
    if(url.pathname==='/dashboard.js' && request.method==='GET')
      return new Response(dashboardJs,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
    if (url.pathname === '/health' && request.method === 'GET') return json({ok:true,service:'wa-price-watch',version:'0.2.0'});
    if(url.pathname==='/api/v1/public' && request.method==='GET'){
      if(!env.DB) return json({error:'database_not_bound'},503);
      const indications=await getRows(env.DB,
        'SELECT watch_id,source_id,merchant,title,url,image_url,price_cents,shipping_status,last_seen,family,generation,capacity_gb,memory_gb,chip,llm_tier FROM indications ORDER BY price_cents ASC LIMIT 300');
      // Disable stale / out-of-stock offers: the last source scan must contain an eligible offer.
      const activeIndications=indications.filter(s=>sources.some(c=>c.enabled && c.id===s.source_id));
      const source_health=await getRows(env.DB,
        'SELECT source_id,last_checked,last_ok,state,last_items FROM source_health ORDER BY source_id ASC LIMIT 30');
      const active_source_health=source_health.filter(s=>sources.some(c=>c.enabled && c.id===s.source_id));
      const freshIndications=activeIndications.filter(s=>{
        const health=active_source_health.find(h=>h.source_id===s.source_id);
        return health?.state==='ok'&&health.last_items>0 &&
          Date.parse(s.last_seen)>=Date.parse(health.last_checked)-60000;
      });
      const history=await getRows(env.DB,
        'SELECT i.source_id,obs.price_cents,obs.observed_at FROM indication_observations obs JOIN indications i ON obs.indication_key=i.key ORDER BY obs.observed_at DESC LIMIT 180');
      const leads=await getRows(env.DB,
        'SELECT source_id,title,url,first_seen FROM leads ORDER BY first_seen DESC LIMIT 30');
      const confirmed=await getRows(env.DB,
        'SELECT merchant,title,url,total_cents,last_seen FROM offers ORDER BY total_cents ASC LIMIT 12');
      const runs=await getRows(env.DB,
        'SELECT completed_at,source_ok,source_failed FROM runs ORDER BY id DESC LIMIT 1');
      return json({product:'iPhone 16–18 Pro Max et Mac mini / Studio',threshold_eur:Number(env.WATCH_MAX_EUR||1100),
        currency:'EUR',shipping_notice:'Prix affichés hors livraison, panier à vérifier',
        indications:freshIndications,watches:activeWatches(env).map(w=>({id:w.id,label:w.label,family:w.family,generation:w.generation||null,capacity_gb:w.capacityGb||null,min_memory_gb:w.minMemoryGb||null,threshold_eur:w.maxCents>0?w.maxCents/100:null})),
        source_health:active_source_health,
        history:history.filter(s=>sources.some(c=>c.enabled && c.id===s.source_id)),
        leads,confirmed,latest_run:runs[0]||null});
    }
    if (!authorized(request,env)) return json({error:'unauthorized'},401);
    if (!env.DB) return json({error:'database_not_bound'},503);
    try {
      if (url.pathname === '/api/v1/watches' && request.method === 'GET')
        return json({watches:activeWatches(env)});
      if (url.pathname === '/api/v1/offers' && request.method === 'GET')
        return json({offers:await getRows(env.DB,`SELECT watch_id,title,merchant,url,
          price_cents,shipping_cents,total_cents,source_id,last_seen FROM offers
          WHERE watch_id=? ORDER BY total_cents ASC,last_seen DESC LIMIT 50`,[idParam(url)])});
      if (url.pathname === '/api/v1/leads' && request.method === 'GET')
        return json({leads:await getRows(env.DB,`SELECT watch_id,source_id,title,url,first_seen FROM leads
          WHERE watch_id=? ORDER BY first_seen DESC LIMIT 50`,[idParam(url)])});
      if (url.pathname === '/api/v1/history' && request.method === 'GET')
        return json({observations:await getRows(env.DB,`SELECT o.watch_id,o.offer_key,
          f.merchant,o.total_cents,o.observed_at FROM observations o
          JOIN offers f ON f.key=o.offer_key WHERE o.watch_id=?
          ORDER BY o.observed_at DESC LIMIT 200`,[idParam(url)])});
      if (url.pathname === '/api/v1/runs' && request.method === 'GET')
        return json({runs:await getRows(env.DB,`SELECT started_at,completed_at,source_ok,source_failed,
          leads_added,offers_seen,alerts_sent,errors_json FROM runs ORDER BY id DESC LIMIT 20`)});
      if (url.pathname === '/api/v1/ingest' && request.method === 'POST') {
        if ((Number(request.headers.get('content-length')) || 0) > 65536) return json({error:'payload_too_large'},413);
        const body = await request.text();
        if (body.length > 65536) return json({error:'payload_too_large'},413);
        const result = await ingestManual(JSON.parse(body),env);
        return json(result,202);
      }
      if (url.pathname === '/api/v1/run' && request.method === 'POST')
        return json(await runScheduled(env));
      return json({error:'not_found'},404);
    } catch (e) {
      if (e instanceof SyntaxError) return json({error:'invalid_json'},400);
      if (/^(offers\[\]|unsupported manual source|invalid watch)/.test(e.message)) return json({error:e.message},400);
      console.error('Price Watch request failed', e?.message);
      return json({error:'internal_error'},500);
    }
  },
  async scheduled(_event,env,ctx) {
    ctx.waitUntil(runScheduled(env).catch(e=>console.error('Price Watch scheduled failed',e.message)));
  }
};
