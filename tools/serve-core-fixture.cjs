// Local-only test harness: fake GM, no real credentials, no Cloudflare requests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page de test WA — froid et régulation</title>
<link rel="canonical" href="https://example.test/cours">
<link rel="alternate" type="application/rss+xml" title="Cours RSS" href="/feed.xml">
<link rel="alternate" type="application/rss+xml" title="Doublon" href="/feed.xml">
<link rel="alternate" type="application/atom+xml" title="Actualités Atom" href="/atom.xml">
<link rel="alternate" type="application/rss+xml" title="Dangereux" href="javascript:alert(1)">
<style>body{font:18px system-ui;padding:24px;max-width:700px;margin:auto;background:#f1f5f9;color:#172033}p{line-height:1.8}#blocked{user-select:none;-webkit-user-select:none}section{margin:80px 0}</style>
</head><body><h1>Fixture locale — WA Core</h1>
<p>Aucun compte ni token réel. Le stockage GM est simulé uniquement pour ce test.</p>
<p id="fixture-network">Requêtes simulées : 0</p><p id="fixture-fallback">Accès localStorage par WA : 0</p>
<main><h2>Cycle frigorifique</h2><p id="blocked" oncopy="event.preventDefault()" onselectstart="event.preventDefault()">Ce paragraphe bloque volontairement sélection et copie. Le module WA doit pouvoir le débloquer puis revenir au comportement initial.</p>
<section><h2>Régulation</h2><p>Texte public pédagogique de test. Une note personnelle saisie dans WA ne doit jamais apparaître dans une capture de cette page.</p><h3>Pressostats et thermostats</h3><p>Un paragraphe de test pour vérifier le plan de page.</p></section>
<section><h2>Entretien</h2><p>Fin du contenu de test.</p></section></main>
<a href="/second">Deuxième page de test</a><br><a href="/?utm_source=fixture&q=froid#regulation">Page avec suivi et ancre</a>
<script src="/fixture.js"></script></body></html>`;
http.createServer((req, res) => {
  if (req.url === '/fixture.js') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    const source = fs.readFileSync(path.join(root, 'scripts/core/wa-core-ios.user.js'), 'utf8');
    res.end(`(function () {
      const store = window.sessionStorage;
      let requests = 0, fallbacks = 0;
      Object.defineProperty(window, 'localStorage', {get(){
        document.querySelector('#fixture-fallback').textContent = 'Accès localStorage par WA : ' + (++fallbacks);
        throw Error('page-storage-forbidden');
      }});
      const GM = {
        async getValue(key, fallback) {const v = store.getItem('wa-test:' + key); return v === null ? fallback : v;},
        async setValue(key, value) {store.setItem('wa-test:' + key, value);},
        async xmlHttpRequest(options) {
          document.querySelector('#fixture-network').textContent = 'Requêtes simulées : ' + (++requests);
          const body = JSON.parse(options.data);
          return {status:200,responseText:JSON.stringify({ok:true,action:body.action,status:'new',version:'fixture'})};
        }
      };
      ${source}
    })();`);
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
  }
}).listen(8789, '127.0.0.1', () => console.log('Fixture WA locale : http://localhost:8789 (GM simulé ; aucune API externe)'));
