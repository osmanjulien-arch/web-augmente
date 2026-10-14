import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parseRss} from '../src/sources/rss.mjs';
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
  const getFeed=async()=>new Response(rss,{status:200,headers:{'content-type':'text/xml'}});
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
