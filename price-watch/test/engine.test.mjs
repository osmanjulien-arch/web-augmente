import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parseRss} from '../src/sources/rss.mjs';
import {parseProductLd} from '../src/sources/product-ld.mjs';
import {collect} from '../src/sources/registry.mjs';
import {matchesModel,capacityOf,watchFor,normalizeOffer,qualifies} from '../src/core/match.mjs';
import {activeWatches} from '../src/config.mjs';
import {ingestManual,runScheduled} from '../src/core/engine.mjs';
import worker from '../src/worker.mjs';

const validOffer = {
  title:'Apple iPhone 17 Pro Max 256 Go bleu',
  merchant:'Exemple Marchand',url:'https://shop.example.test/iphone17?utm_source=demo',
  condition:'new',currency:'EUR',capacity_gb:256,price_eur:1050,shipping_eur:0
};

function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0002_indications.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0003_source_health.sql',import.meta.url),'utf8'));
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return { bind(...args) {
        return {
          async first(){return stmt.get(...args)??null;},
          async all(){return {results:stmt.all(...args)};},
          async run(){const meta=stmt.run(...args);return {meta:{changes:Number(meta.changes)}};}
        };
      }};
    }
  };
}

test('RSS and Atom parsing, CDATA, UTF-8 and links', () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><guid>A-1</guid><title><![CDATA[Apple iPhone 17 Pro Max 256 Go]]></title><link>https://dealabs.com/deals/one</link><pubDate>Wed, 14 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  assert.equal(parseRss(rss)[0].title,'Apple iPhone 17 Pro Max 256 Go');
  assert.equal(parseRss(rss)[0].id,'A-1');
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>iPhone 17 Pro Max</title><link rel="alternate" href="https://example.org/deal"/><id>A-2</id></entry></feed>`;
  assert.equal(parseRss(atom)[0].url,'https://example.org/deal');
  assert.throws(()=>parseRss('not xml'),/not RSS/);
});

test('precise product/condition/capacity matching', () => {
  const watch=activeWatches({})[0];
  assert.equal(watchFor(validOffer,[watch]).id,watch.id);
  assert.equal(watchFor({...validOffer,capacity_gb:512},[watch]),null);
  assert.equal(watchFor({...validOffer,condition:'refurbished'},[watch]),null);
  assert.equal(watchFor({...validOffer,title:'Coque iPhone 17 Pro Max 256 Go'},[watch]),null);
  assert.equal(watchFor({...validOffer,title:'iPhone 17 Pro 256 Go'},[watch]),null);
  assert.equal(watchFor({...validOffer,title:'iPhone 16 Pro Max 256 Go'},[watch]),null);
  assert.equal(capacityOf({title:'iPhone 17 Pro Max 1 To'}),1024);
  assert.equal(matchesModel('Coque silicone iPhone 17 Pro Max 256Go'),false);
  assert.equal(watchFor({title:'iPhone 17 Pro Max'},[watch],true)?.id,watch.id);
  assert.equal(watchFor({title:'iPhone 17 Pro Max'},[watch]),null);
});

test('validates all-in pricing, dedup and amount threshold',()=>{
  const watch=activeWatches({})[0];
  const offer=normalizeOffer({...validOffer,price_eur:'1098.50',shipping_eur:'1.50'},watch,'manual');
  assert.equal(offer.totalCents,110000);
  assert.ok(offer.url.indexOf('utm_source')===-1);
  assert.equal(qualifies(offer,watch,null),true);
  assert.equal(qualifies(offer,watch,110000),false);
  assert.equal(qualifies({...offer,totalCents:109950},watch,110000),false);
  assert.equal(qualifies({...offer,totalCents:109900},watch,110000),true);
  assert.throws(()=>normalizeOffer({...validOffer,shipping_eur:undefined},watch,'manual'),/shipping required/);
  assert.throws(()=>normalizeOffer({...validOffer,url:'http://shop.example.test'},watch,'manual'),/https/);
  assert.throws(()=>normalizeOffer({...validOffer,currency:'CHF'},watch,'manual'),/EUR/);
});

test('end-to-end manual ingest persists prices and sends alerts once per lower price',async()=>{
  const env={DB:fakeD1(),API_TOKEN:'test-token',TELEGRAM_BOT_TOKEN:'TEST',TELEGRAM_CHAT_ID:'123'};
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async(url)=>{
    assert.match(url,/api\.telegram\.org/);
    calls++;
    return new Response(JSON.stringify({ok:true}),{status:200});
  };
  try {
    const payload={source:'web-augmente',offers:[validOffer]};
    let r=await ingestManual(payload,env);
    assert.equal(r.offersSeen,1);
    assert.equal(r.alertsSent,1);
    r=await ingestManual(payload,env);
    assert.equal(r.alertsSent,0);
    r=await ingestManual({source:'web-augmente',offers:[{...validOffer,price_eur:1049.5}]},env);
    assert.equal(r.alertsSent,0);
    r=await ingestManual({source:'web-augmente',offers:[{...validOffer,price_eur:1048}]},env);
    assert.equal(r.alertsSent,1);
    assert.equal(calls,2);
    const records=await env.DB.prepare('SELECT * FROM observations').bind().all();
    assert.equal(records.results.length,3);
    const history=await worker.fetch(new Request('https://worker.example/api/v1/history',{headers:{authorization:'Bearer test-token'}}),env);
    assert.equal(history.status,200);
    assert.equal((await history.json()).observations.length,3);
  } finally {globalThis.fetch=original;}
});

test('RSS collector stores leads but cannot trigger purchase alert, including on repeat', async()=>{
  const env={DB:fakeD1()};
  const rss=`<rss><channel><item><guid>offer1</guid><title>iPhone 17 Pro Max promotion</title><link>https://www.dealabs.com/bons-plans/offer1</link></item></channel></rss>`;
  const getFeed=async(url)=>{
    if(String(url).includes('dealabs.com'))return new Response(rss,{status:200,headers:{'content-type':'text/xml'}});
    const product=JSON.stringify({'@type':'Product',name:'Apple iPhone 17 Pro Max 256 Go',offers:{'@type':'Offer',priceCurrency:'EUR',price:1250,itemCondition:'https://schema.org/NewCondition',availability:'https://schema.org/InStock',seller:{name:'Test marchand'}}});
    return new Response('<script type="application/ld+json">'+product+'</script>',{status:200,headers:{'content-type':'text/html'}});
  };
  let r=await runScheduled(env,getFeed);
  assert.equal(r.leadsAdded,1);
  assert.equal(r.offersSeen,0);
  assert.equal(r.alertsSent,0);
  r=await runScheduled(env,getFeed);
  assert.equal(r.leadsAdded,0);
  assert.equal((await env.DB.prepare('SELECT * FROM leads').bind().all()).results.length,1);
});

test('JSON source parser accepts structured feeds only; redirects are rejected',async()=>{
  const source={id:'custom',type:'json',url:'https://api.example.org/v1/prices',allowedHost:'api.example.org'};
  const r=await collect(source,async()=>new Response(JSON.stringify({offers:[validOffer]})));
  assert.equal(r.kind,'price');
  assert.equal(r.items.length,1);
  await assert.rejects(()=>collect({...source,allowedHost:'malicious.site'},async()=>new Response('{}')),/not allowed/);
  await assert.rejects(()=>collect(source,async()=>new Response('{}')),/offers/);
});

test('unauthorized requests and public health checks',async()=>{
  const env={DB:fakeD1(),API_TOKEN:'top-secret'};
  assert.equal((await worker.fetch(new Request('https://worker.example/api/v1/offers'),env)).status,401);
  assert.equal((await worker.fetch(new Request('https://worker.example/health'),env)).status,200);
  const req=new Request('https://worker.example/api/v1/ingest',{method:'POST',headers:{authorization:'Bearer top-secret'},body:JSON.stringify({source:'foo',offers:[validOffer]})});
  assert.equal((await worker.fetch(req,env)).status,400);
});


test('real retailer Product JSON-LD is identified, other models and refurbished rejected',()=>{
  const source={url:'https://www.materiel.net/produit/202509100081.html'};
  const p=(condition='NewCondition',price=1379)=>'<script type="application/ld+json">'+JSON.stringify({
    '@type':'Product',name:'Apple iPhone 17 Pro Max Orange Cosmique - 256 Go',
    offers:{price,priceCurrency:'EUR',availability:'https://schema.org/InStock',
      itemCondition:'https://schema.org/'+condition,seller:{name:'Materiel.net'}}
  })+'</script>';
  assert.equal(parseProductLd(p(),source)[0].price_eur,1379);
  assert.equal(parseProductLd(p(),source)[0].shipping_eur,null);
  assert.throws(()=>parseProductLd(p('UsedCondition'),source),/no eligible/);
  assert.throws(()=>parseProductLd(p('NewCondition',-1),source),/no eligible/);
});

test('merchant indicative prices persist without fabricating delivered price',async()=>{
  const env={DB:fakeD1(),WATCH_MAX_EUR:'1100'};
  const product=JSON.stringify({'@type':'Product',name:'Apple iPhone 17 Pro Max 256 Go',offers:{
    price:'1255.55',priceCurrency:'EUR',availability:'https://schema.org/InStock',
    itemCondition:'https://schema.org/NewCondition',seller:{name:'RDC marchand'}}});
  const feed=async(url)=>new Response(String(url).includes('dealabs.com')?'<rss><channel></channel></rss>':
    '<script type="application/ld+json">'+product+'</script>',{status:200});
  await runScheduled(env,feed);
  const indications=(await env.DB.prepare('SELECT * FROM indications').bind().all()).results;
  assert.equal(indications.length,5);
  assert.equal(indications[0].shipping_status,'unknown');
  const confirmed=(await env.DB.prepare('SELECT * FROM offers').bind().all()).results;
  assert.equal(confirmed.length,0);
  const view=await worker.fetch(new Request('https://example.org/api/v1/public'),env);
  assert.equal(view.status,200);
  assert.equal((await view.json()).indications.length,5);
});

import {telegramNotify,telegramLeadNotify,indicationNotify} from '../src/core/notify.mjs';

test('ntfy fallback sends only clearly labelled price information',async()=>{
 const urls=[];
 const fakeFetch=async(url,options)=>{
   urls.push({url,body:options.body,header:options.headers['X-Title']});
   return new Response('{"id":"test"}',{status:200});
 };
 const env={NTFY_TOPIC:'pw_ip17_12345678901234567890123456789012'};
 const watch=activeWatches({})[0];
 const a=await telegramNotify(env,{...normalizeOffer(validOffer,watch,'web-augmente'),sourceId:'web-augmente'},watch,fakeFetch);
 assert.equal(a.sent,true);
 assert.match(urls[0].body,/livraison incluse/);
 const b=await telegramLeadNotify(env,{title:'iPhone 17 Pro Max 256 Go',url:'https://www.dealabs.com/a'},watch,fakeFetch);
 assert.equal(b.sent,true);
 assert.match(urls[1].body,/non vérifiée/);
 const c=await indicationNotify(env,{...validOffer,price_eur:990},watch,fakeFetch);
 assert.equal(c.sent,true);
 assert.match(urls[2].body,/livraison NON vérifiée/);
 assert.equal(urls.length,3);
});


test('Boulanger fallback seller requires explicit new product and actual seller proof',()=>{
  const source={id:'boulanger-orange',url:'https://www.boulanger.com/ref/1226095',
    allowedHost:'www.boulanger.com',sellerFallback:'Boulanger',requireSellerProof:true};
  const ld=(condition='NewCondition')=>'<script type="application/ld+json">'+JSON.stringify({
    '@type':'Product',name:'Smartphone APPLE iPhone 17 Pro Max 5G 256Go Orange cosmique',
    offers:{'@type':'Offer',price:'1379.0',priceCurrency:'EUR',
      availability:'https://schema.org/InStock',itemCondition:condition}
  })+'</script>';
  const proof='<span>produit  neuf</span> vendu &amp; expédié par <span title="boulanger">boulanger</span>';
  assert.equal(parseProductLd(proof+ld(),source)[0].merchant,'Boulanger');
  assert.throws(()=>parseProductLd(ld(),source),/no eligible/);
  assert.throws(()=>parseProductLd(proof+ld('UsedCondition'),source),/no eligible/);
  const ldlcSource={url:'https://www.ldlc.com/fiche/PB00702830.html'};
  assert.throws(()=>parseProductLd(proof+ld(),ldlcSource),/no eligible/);
});

test('out-of-stock new product is excluded rather than advertised as available',()=>{
  const src={url:'https://www.ldlc.com/fiche/PB00702830.html'};
  const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Product',
    name:'Apple iPhone 17 Pro Max 256 Go Argent',
    offers:{price:1379,priceCurrency:'EUR',itemCondition:'https://schema.org/NewCondition',
      availability:'https://schema.org/BackOrder',seller:{name:'LDLC'}}})+'</script>';
  assert.throws(()=>parseProductLd(html,src),/no eligible/);
});


test('source health preserves last success when a merchant begins refusing requests',async()=>{
  const {saveSourceHealth}=await import('../src/core/storage.mjs');
  const db=fakeD1();
  await saveSourceHealth(db,'merchant-x','2026-10-14T18:00:00Z',true,1);
  await saveSourceHealth(db,'merchant-x','2026-10-14T19:00:00Z',false,0);
  const row=await db.prepare('SELECT * FROM source_health WHERE source_id=?').bind('merchant-x').first();
  assert.equal(row.state,'error');
  assert.equal(row.last_ok,'2026-10-14T18:00:00Z');
  assert.equal(row.last_items,1);
});

test('public endpoint exposes per-source freshness and failures',async()=>{
 const env={DB:fakeD1()};
 const mock=async url=>{
  if(String(url).includes('dealabs.com'))return new Response('<rss><channel></channel></rss>',{status:200});
  return new Response(JSON.stringify({error:'blocked'}),{status:403});
 };
 const result=await runScheduled(env,mock);
 assert.equal(result.sourceFailed,5);
 const response=await worker.fetch(new Request('https://example.org/api/v1/public'),env);
 const json=await response.json();
 assert.equal(json.source_health.length,6);
 assert.equal(json.source_health.filter(x=>x.state==='error').length,5);
});
