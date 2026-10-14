# Price Watch — moteur autonome et modulaire

Moteur de veille de prix pour **Cloudflare Workers + D1**, sans ChatGPT Tasks, fonctionnant en Cron **une fois par heure (UTC)**. Sources RSS (découverte), JSON (prix structurés), API Web Augmenté (push). Notifications Telegram : piste RSS clairement signalée comme non vérifiée, ou prix déclaré inférieur au seuil avec dédoublonnage et nouvelle baisse d'au moins 1 €.

**Status: Cloudflare Worker and D1 deployed; API and Telegram setup pending.**

## Modules

- `src/config.mjs` : catalogue des produits suivis, seuils et sources.
- `src/sources/rss.mjs` : lecture RSS/Atom en mode annonces/pistes. Parseur volontairement minimal (pas un parseur XML généraliste).
- `src/sources/registry.mjs` : registre des adaptateurs `rss` et `json`.
- `src/sources/http.mjs` : collecte HTTPS avec hôte autorisé, limite de taille et délai.
- `src/core/match.mjs` : identification des variantes et calcul du prix livré.
- `src/core/storage.mjs` : offres, historique, pistes RSS, alertes, journaux.
- `src/core/notify.mjs` : canal Telegram (extensible).
- `src/core/engine.mjs` : orchestration et filtrage.
- `src/worker.mjs` : Cron et API HTTP authentifiée.

## Mise en route

Pré-requis : Node 20+, accès Cloudflare avec Workers et D1, `npm install`.

1. `npm install && npm test`
2. `npx wrangler login` (sur ton ordinateur, jamais dans le chat).
3. `npx wrangler d1 create price-watch-db` puis remplacer `REPLACE_WITH_D1_DATABASE_ID` dans `wrangler.jsonc` par l'ID affiché.
4. `npm run db:remote` pour créer les tables dans D1.
5. Créer un secret long et aléatoire : `npx wrangler secret put API_TOKEN`.
6. Pour Telegram : créer un bot via BotFather, obtenir son `chat_id`, puis `npx wrangler secret put TELEGRAM_BOT_TOKEN` et `npx wrangler secret put TELEGRAM_CHAT_ID`.
7. `npm run deploy`.
8. Vérifier `https://<ton-worker>.workers.dev/health`, puis exécuter un premier `POST /api/v1/run` authentifié.

Le cron `0 * * * *` fonctionne **à l'heure UTC**, pas à l'heure de Paris. Pour un autre intervalle, modifier `wrangler.jsonc`.

## API (toutes les routes `/api` demandent `Authorization: Bearer <API_TOKEN>`)

| Route | Fonction |
|---|---|
| `GET /health` | Statut sans secrets |
| `GET /api/v1/watches` | Produits et seuils configurés |
| `GET /api/v1/offers?watch=iphone-17-pro-max-256` | Offres de prix observées, triées par prix livré |
| `GET /api/v1/leads?watch=...` | Annonces RSS (non vérifiées) |
| `GET /api/v1/history?watch=...` | Historique des variations de prix |
| `GET /api/v1/runs` | Exécutions et erreurs récentes |
| `POST /api/v1/run` | Déclenchement immédiat de la collecte |
| `POST /api/v1/ingest` | Ajout authentifié de prix par Web Augmenté |

Exemple d'ingestion **de test**, avec marchand et adresse fictifs :

```bash
curl -X POST "https://<ton-worker>.workers.dev/api/v1/ingest" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"web-augmente","offers":[{"title":"Apple iPhone 17 Pro Max 256 Go","capacity_gb":256,"condition":"new","currency":"EUR","merchant":"Magasin de démonstration","url":"https://example.org/iphone","price_eur":1090.0,"shipping_eur":0}]}'
```

**Attention : l'exemple pourrait envoyer une vraie alerte de test si Telegram est configuré.** Ne pas le confondre avec un prix réel.

## Brancher des données réellement utilisables

- **RSS** : découverte de nouveaux bons plans ; ajouter une source `rss` HTTPS dans `src/config.mjs`. Chaque offre reste une *piste*, même si le titre contient un prix.
- **Flux JSON autorisé** : ajouter une source `json` avec HTTPS et `allowedHost`, endpoint renvoyant `{ "offers": [ ... ] }`, avec les mêmes champs que l'API d'ingestion.
- **Safari Web Augmenté** : un script utilisateur optionnel pourra transmettre une offre structurée par `POST /api/v1/ingest`, après autorisation explicite de partage. **Ce script n'est pas inclus dans cette version** ; aucun accès automatique au navigateur n'est présumé.
- **Alertes idealo** : fonction native à garder comme filet de sécurité ; ce prototype n'interroge pas automatiquement idealo et n'utilise aucune API privée.

## Garanties et limites

- Produit strict : iPhone **17 Pro Max** (ni 17 Pro, ni accessoires), **256 Go** uniquement, état `new`, devise EUR, frais de livraison obligatoirement précisés, seuil par défaut **1 100 € livré**.
- Un résultat JSON/manual est un *prix déclaré par la source*, pas une transaction garantie. Vérifier prix et disponibilité sur la page vendeur avant achat.
- Aucune suppression ni modification du Worker Web Augmenté existant, aucun ordre d'achat.
- API protégée par `API_TOKEN`. Pas de clé inscrite dans le dépôt ; jamais exposer le jeton API dans du code Safari public. Pour connecter Safari, prévoir un relais authentifié ou un jeton limité côté serveur.
- Les flux doivent être consultés dans le respect de leurs conditions d'utilisation. Pas de contournement de protection, pas de scraping non autorisé.
- Workers/D1 restent soumis à leurs propres quotas. HTTP limité à HTTPS, hôte autorisé, 600 Ko, timeout 10 s, redirections refusées.
- Cron et ingestion peuvent exécuter des écritures concurrentes ; pour de gros volumes ou du multiutilisateur, ajouter une file et une déduplication transactionnelle des notifications.
- Les erreurs des sources sont visibles via `GET /api/v1/runs`. La disponibilité réelle des flux et l'envoi Telegram exigent un test sur infrastructure connectée.

## Ajouter un second produit

Dupliquer une entrée de `watches` dans `src/config.mjs` en lui donnant un `id` unique, un `model` et une capacité précise. Les mêmes adaptateurs et règles s'appliquent automatiquement. Adapter si besoin la stratégie de matching pour les autres marques.

## Deployment 2026-10-14
- Health: https://wa-price-watch.osmanjulien-arch.workers.dev/health
- Isolated worker: wa-price-watch; D1: price-watch-db (WEUR); Cron: hourly UTC.
- API_TOKEN and Telegram secrets not configured; private API returns 401 and no notification delivery is active.
- Feed parsing verified locally; production cron execution not yet independently confirmed.

## Sources automatiques et alertes push — 14 octobre 2026

- Merchant JSON-LD collect: Materiel.net (iPhone 17 Pro Max 256 Go orange) and Rue du Commerce (iPhone 17 Pro Max 256 Go argent). Do not assume the advertised price includes shipping; observations go to the `indications` table, not confirmed delivered-price offers.
- New public read-only endpoint: `GET /api/v1/public` with source timestamps, stated shipping uncertainty, and last run diagnostics. No API token is exposed.
- Price signals below configured threshold may be sent via ntfy, with clear mention that shipping is not confirmed. Existing confirmed-price and RSS lead alerts use ntfy if Telegram is not configured.
- ntfy has a random topic deployed as a Cloudflare secret; subscription requires a one-time user action in the ntfy iOS app. The topic name is stored separately on the user's device at `Documents/PriceWatch-Build-20261014/ntfy-topic.txt`. Do not commit the topic to the public repository.
- Product-page polling remains limited by the merchants' website conditions and anti-bot controls. If source fetching fails, failures are recorded rather than fabricated values.

## Extension enseignes (octobre 2026)

- Sources actives validées depuis Cloudflare : Dealabs RSS ; Materiel.net (orange), Rue du Commerce (argent), LDLC (bleu), MacWay (bleu). Les fiches Boulanger (orange et bleu) sont désactivées car les requêtes Cloudflare ont échoué (réponses non exploitables puis HTTP 400). LDLC argent est désactivé car en réapprovisionnement ; MacWay argent car son JSON-LD n'atteste pas l'état neuf.
- Boulanger ne fournit pas systématiquement l'identité du vendeur dans le JSON-LD : un vendeur de repli Boulanger est accepté uniquement avec une preuve textuelle explicite « produit neuf vendu et expédié par Boulanger » et un JSON-LD NewCondition/InStock.
- Fnac, Darty : accès automatisé refusé (403) lors des essais ; pas de contournement.
- Cdiscount : l'HTML accessible par le collecteur ne contient pas de fiche Product JSON-LD exploitable ; pas de prix automatique.
- Amazon : la recherche ne fournit pas de prix structuré marchand suffisamment fiable ; une API autorisée/flux partenaire serait nécessaire.
- Auchan : pas de JSON-LD Product exploitable lors des essais ; non actif.
- Un prix affiché n'est **pas** un prix livraison comprise. Les alertes de piste signalent explicitement cette incertitude.

## Traçabilité des sources

Le point de consultation public /api/v1/public expose désormais source_health : date du dernier passage, dernière réussite et état ok/error. Une erreur de collecte ne signifie pas une hausse ou une baisse du prix. Aucune donnée de livraison ne doit être inventée.
