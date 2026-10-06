# Worker hybride Web Augmenté V1

Le Worker Cloudflare `web-augmente-api` conserve l’API historique du userscript iPhone et ajoute un serveur MCP distant en lecture seule.

## Endpoints

- `GET /health` et `GET /api/wa?action=health` : santé publique ;
- `POST /api/wa` : actions `health`, `remember_page` et `get_last_page`, sans changement de contrat ;
- `POST /mcp` : transport MCP Streamable HTTP, protégé par OAuth 2.1 ;
- `/authorize`, `/oauth/token`, `/oauth/register` et `/.well-known/*` : autorisation et découverte OAuth.

Le MCP expose maintenant neuf outils en lecture seule :

- `wa_get_last_page` lit directement `meta:last_page` dans `WA_MEMORY` et signale explicitement que le texte capturé est du contenu Web non fiable ;
- `france_travail_events_status` vérifie la configuration de l’API historique **Mes Evènements Emploi** sans exposer les secrets ;
- `france_travail_events_search` interroge **Mes Evènements Emploi** ;
- `france_travail_jobs_search` normalise si nécessaire une requête libre via **ROMEO v2**, puis recherche les offres **Offres d’emploi v2** par codes ROME ou filtres ;
- `france_travail_company_prospects` recherche avec **La Bonne Boîte v2** les entreprises susceptibles de recruter dans les six prochains mois afin de couvrir le marché caché et la prospection directe ;
- `france_travail_job_analyze` récupère le détail d’une offre et l’enrichit avec sa **fiche métier ROME 4.0** lorsqu’un code ROME est disponible ;
- `france_travail_market_analysis` croise un métier ROME avec **Marché du travail** et **Accès à l’emploi**, avec difficulté de recrutement et salaires en option ;
- `france_travail_training_analysis` croise le métier avec **Sortants de formation**, **Anotéa** quand une formation est ciblée, et le marché du travail. Cet outil n’est pas un catalogue exhaustif des formations financées.

- `france_travail_stats_reference` expose les référentiels officiels des indicateurs, activités, nomenclatures, périodes et territoires des trois API statistiques.

L’intégration France Travail utilise OAuth 2.0 `client_credentials`. Les mêmes `FRANCE_TRAVAIL_CLIENT_ID` et `FRANCE_TRAVAIL_CLIENT_SECRET` servent à obtenir des jetons distincts par scope ; le cache OAuth est indexé par `(client_id, scope)`. Les identifiants, jetons et secrets ne transitent jamais vers ChatGPT.

Les nouveaux outils haut niveau utilisent des endpoints et scopes officiels vérifiés côté code. Le Worker impose HTTPS et l’hôte `api.francetravail.io`; seule La Bonne Boîte peut suivre la redirection documentée vers `labonneboite.francetravail.fr`, avec suppression du bearer avant le second appel. Il applique aussi un timeout, renouvelle une fois le jeton sur HTTP 401, et utilise un cache de réponses ainsi qu’un throttling **best effort par isolate Cloudflare**. Ce throttling réduit les appels inutiles mais ne constitue pas un limiteur global distribué.

## Stockage

Deux namespaces KV distincts sont obligatoires :

- `WA_MEMORY` conserve le namespace historique des captures ;
- `OAUTH_KV` pointe vers le namespace séparé `WA_OAUTH` pour les états temporaires, clients, grants, codes et tokens OAuth.

Les deux IDs sont inscrits explicitement dans `wrangler.jsonc`. Ne jamais supprimer, remplacer ni recréer automatiquement `WA_MEMORY`.

## Développement et validation

### Fiabilité des analyses France Travail

Les analyses marché et formation exposent `status: "ok" | "partial" | "unavailable"`.
Une analyse entièrement indisponible porte aussi `isError: true` dans sa réponse MCP.
Les données utiles restent présentes en cas d'échec partiel ; `section_errors`
conserve le code, le statut HTTP et l'endpoint sans query string pour chaque section
en échec. Les corps d'erreur HTTP amont ne sont pas réexposés.

Anotéa ne propose pas de filtre ROME. `anotea_context` donne les filtres envoyés,
`rome_filter_applied: false` et le périmètre (`formation`, `organisme`,
`geographique`, ou `null` si aucun filtre). Même avec un filtre de formation,
le lien au métier ROME n'est pas établi par cet outil. Un code postal seul renvoie
des avis de tous les domaines locaux. Les filtres vides après suppression des
espaces ne déclenchent jamais une interrogation globale d'Anotéa.

Un HTTP 403 utilise `france_travail_forbidden` et invite à vérifier souscription,
scopes et droits. Cette classification ne rétablit pas à elle seule l'accès.
Chaque indicateur utilise ses propres critères : offres `ORIGINEOFF`, accès à
l’emploi `DUREEEMP`, difficultés `TYPE_TENSION` avec période annuelle. Sans
territoire, le périmètre est national (`NAT` / `FR`). Les périodes explicites
sont des tableaux et désactivent la sélection automatique de la dernière période.
Les salaires utilisent GET `indicateur/salaire-rome-fap/{type}/{territoire}`.
`section_criteria` permet de contrôler ces périmètres.

Les sorties de formation conservent le ROME demandé. Le taux d’accès à l’emploi
après formation nécessite un domaine de formation explicite :
`training_activity: { "type": "FORM14", "code": "<code du référentiel>" }`.
Consulter d’abord `france_travail_stats_reference` avec `api: "training"`,
`resource: "activities"`, `type_code: "FORM14"`. Aucun domaine n’est déduit du
ROME ou du formacode Anotéa. Sans ce paramètre, la section est signalée dans
`not_requested` et une requête incompatible n’est pas envoyée. Les nomenclatures
formation ne sont pas propagées au marché imbriqué.

La Bonne Boîte utilise `/partenaire/labonneboite/v2/recherche` et demande les
scopes `api_labonneboitev2 search office`. Une souscription effective reste
nécessaire : un refus d’habilitation ne peut pas être corrigé côté Worker.

Contrats de référence : OpenAPI France Travail `https://francetravail.io/api-peio/v2/api/233/openapi`
(marché), `234/openapi` (accès), `231/openapi` (formation) et `360/openapi`
(La Bonne Boîte), sous le même préfixe. Les tests de contrat simulent ces API ;
la disponibilité réelle de toutes les sections doit être vérifiée après déploiement.

`npm test` exécute les régressions du client puis les tests MCP/OAuth dans Workers.

```bash
cd worker
npm ci
npm test
npx wrangler types
npx wrangler deploy --dry-run
```

Les tests utilisent le plugin Vitest officiel Cloudflare et s’exécutent dans le runtime Workers local. Une valeur de test factice est injectée par les tests ; le secret Cloudflare réel n’est jamais nécessaire localement.

## Déploiement

Prérequis : Wrangler doit être authentifié, les deux bindings KV doivent déjà exister et le secret Cloudflare `WA_API_TOKEN` doit déjà être attaché au Worker.

```bash
cd worker
npm ci
npx wrangler deploy --keep-vars
```

Ne pas recréer, remplacer ou supprimer `WA_API_TOKEN` pendant ce déploiement.

### Configuration France Travail

Associer l’API **Mes Evènements Emploi** à une application sur `francetravail.io`, puis configurer côté Cloudflare :

```bash
cd worker

# Secrets : ne jamais les committer.
npx wrangler secret put FRANCE_TRAVAIL_CLIENT_ID
npx wrangler secret put FRANCE_TRAVAIL_CLIENT_SECRET
```

Ajouter ensuite comme variables Cloudflare les deux valeurs fournies par la documentation technique de l’API souscrite :

```text
FRANCE_TRAVAIL_EVENTS_SCOPE=<scope de Mes Evènements Emploi>
FRANCE_TRAVAIL_EVENTS_URL=https://api.francetravail.io/<chemin de l'API Mes Evènements Emploi>
```

Le Worker verrouille `FRANCE_TRAVAIL_EVENTS_URL` sur HTTPS et le domaine exact `api.francetravail.io`. Si une variable manque, `france_travail_events_status` l’indique et les fonctions Web Augmenté existantes continuent de fonctionner normalement.

### APIs France Travail utilisées par les outils haut niveau

Aucune variable Cloudflare supplémentaire n’est nécessaire : les endpoints/scopes vérifiés sont fixés côté code et les mêmes identifiants France Travail sont utilisés pour demander le jeton correspondant à chaque scope.

- **Offres d’emploi v2** : recherche et détail des offres ;
- **ROMEO v2** : rapprochement d’un texte libre avec des métiers ROME ;
- **ROME 4.0 – Fiches métiers** : enrichissement métier ;
- **Marché du travail** + **Accès à l’emploi** : statistiques métier/territoire ;
- **Sortants de formation et accès à l’emploi** : résultats après formation ;
- **Anotéa** : avis lorsque `certif_info`, `formacode`, code postal ou organisme est fourni ;
- **La Bonne Boîte v2** : scope `api_labonneboitev2`, recherche d’entreprises par métier/ROME et territoire. Le Worker suit uniquement la redirection officielle vers `labonneboite.francetravail.fr` et retire le bearer avant le second appel.

**Synthèse Pages employeurs v1** reste volontairement hors du backend MCP : la documentation France Travail la présente comme une API à consommer uniquement sous forme de widget. Aucun endpoint Pages employeurs n’est appelé par le Worker.

Le cache de réponses est volontairement court pour les offres (45 s), plus long pour ROMEO/ROME/statistiques et La Bonne Boîte, et reste local à l’isolate. Les quotas vus dans le portail sont respectés côté orchestration : Offres 10/s, ROMEO 3/s, fiches ROME 1/s, Marché/Accès/Sortants 10/s, Anotéa 8/s et La Bonne Boîte 2/s.

Le point d’obtention du jeton est fixé côté code à :

```text
https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire
```

Après configuration, redéployer le Worker puis reconnecter/actualiser le plugin MCP pour que ChatGPT découvre les nouveaux outils.

URL API iPhone :

```text
https://web-augmente-api.osmanjulien-arch.workers.dev/api/wa
```

URL MCP :

```text
https://web-augmente-api.osmanjulien-arch.workers.dev/mcp
```

## Authentification MCP

Le provider officiel Cloudflare assure OAuth 2.1, PKCE S256, rotation des refresh tokens et découverte RFC 8414/RFC 9728. Le seul scope consenti est `memory:read`.

L’écran `/authorize` demande le secret personnel par formulaire HTTPS POST. Le secret est comparé en temps constant à `WA_API_TOKEN` puis immédiatement oublié : il n’est ni placé dans une URL, ni enregistré, ni retourné, ni journalisé. L’état OAuth est lié à des cookies `__Host-` sécurisés, protégé contre CSRF, à usage unique et limité à dix minutes.

## Ajouter le MCP dans ChatGPT

### Retour OAuth et protection du formulaire

Chrome peut appliquer `form-action` aux redirections qui suivent une soumission.
Une CSP limitée à `'self'` bloquait donc le retour vers ChatGPT après la validation
du secret (réponse 302 puis erreur CSP dans la console du navigateur).

Le formulaire autorise désormais `'self'` et l’adresse fixe
`https://chatgpt.com/connector_platform_oauth_redirect`, uniquement lorsque cette
adresse exacte est le `redirectUri` validé par le provider OAuth. Aucune URL fournie
par un client n’est interpolée dans la CSP. Les autres formulaires et les pages
d’erreur restent limités à `'self'` ; aucun joker n’est ajouté.

Le POST contenant le secret reste dirigé vers `/authorize` sur le Worker ; le
retour OAuth contient le code d’autorisation, pas le secret personnel. Les
protections CSRF, cookies, PKCE, expiration et scope ne changent pas.
Cette correction ne résout pas à elle seule un éventuel `STATE_COOKIE_MISSING`.

Les tests vérifient la CSP exacte et le parcours provider → code → token → MCP
en local. Ils ne remplacent pas une connexion réelle dans Chrome/Safari après
déploiement. Relancer une connexion depuis ChatGPT avec un formulaire neuf ; ne
pas réutiliser un formulaire déjà soumis ni partager les URL de callback complètes.

### Diagnostic d’un refus OAuth

Les erreurs de session affichent un **code diagnostic** et une **référence**
aléatoire, partageables sans transmettre le secret. Le même code est disponible
dans `X-WA-OAuth-Error` et dans le log structuré `wa_oauth_diagnostic`.
Le header `X-WA-OAuth-Diagnostics: 1` sur les réponses HTML OAuth permet de
confirmer que cette version du diagnostic est déployée.

| Code | Observation |
| --- | --- |
| `FORM_INVALID` | Formulaire illisible ou type de contenu incorrect. |
| `STATE_FIELD_MISSING` / `CSRF_FIELD_MISSING` | Champ masqué absent du formulaire reçu. |
| `STATE_COOKIE_MISSING` / `CSRF_COOKIE_MISSING` | Cookie correspondant absent de la requête reçue. |
| `STATE_COOKIE_MISMATCH` / `CSRF_COOKIE_MISMATCH` | Cookie reçu différent du champ du formulaire ; vérifier notamment les ouvertures concurrentes. |
| `STATE_UNAVAILABLE` | KV ne retourne aucun état. Ne permet pas de distinguer expiration, consommation ou délai de visibilité KV. |
| `STATE_INVALID` | État retrouvé incomplet ou invalide. |
| `STATE_EXPIRED` | État encore présent mais sa date d’expiration est dépassée. |
| `CSRF_STATE_MISMATCH` | Protection du formulaire différente de celle enregistrée. |
| `STORAGE_READ_FAILED` / `STORAGE_DELETE_FAILED` | Échec d’accès au stockage de session (HTTP 503). |

Le diagnostic ne journalise que le code, sa version et un identifiant aléatoire
indépendant. Aucune valeur de formulaire, token, cookie, empreinte, URL, donnée
de page ou erreur brute n’est ajoutée aux logs. Il ne modifie ni les critères
d’autorisation, ni les cookies, ni la durée de session, ni les bindings.
L’état reste consommé à la première soumission selon le comportement existant :
après un refus, relancer la connexion depuis ChatGPT plutôt que renvoyer le POST.

### Connexion

D’après la [documentation officielle OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt) :

1. Dans ChatGPT, ouvrir **Settings** → **Security and login**, puis activer **Developer mode**.
2. Ouvrir **ChatGPT Plugins**, sélectionner le bouton **+**, puis saisir un nom et une description.
3. Dans **Connection**, choisir l’endpoint public et saisir l’URL MCP complète terminant par `/mcp`.
4. Créer la connexion, terminer l’écran OAuth avec le secret personnel, puis vérifier que les neuf outils listés plus haut sont découverts.
5. Dans une nouvelle conversation, ajouter cette connexion depuis le menu des outils.

La disponibilité du mode développeur peut dépendre du compte et de la politique du workspace.

## Sécurité de l’API historique

- `health` reste public ; les actions mémoire privées exigent le bearer historique.
- CORS accepte toutes les origines pour le userscript multi-sites, sans cookies ni credentials navigateur.
- Le JSON est lu comme un flux borné à 256 Kio.
- Seuls les champs de page explicitement autorisés sont conservés.
- Les bearer et secrets sont comparés par empreintes SHA-256 en temps constant.

## Stabilisation 0.4.1

`commune` accepte un nom ou un code INSEE. Les noms sont résolus avec le
référentiel officiel des communes, mis en cache ; un homonyme nécessite un code
explicite (`commune_code`). Les codes passent directement sans lookup.

Les versions package, santé HTTP et serveur MCP sont alignées sur 0.4.1.
Les sources et tests sont encodés en UTF-8. Pour déployer exactement un commit
Git, partir d’un checkout propre et utiliser `npm run deploy`. Ce script conserve
les variables et KV, expose le SHA dans `/health` et lance `npm run smoke`.
Le smoke exige `MCP_ACCESS_TOKEN` (OAuth MCP) et ne journalise ni jeton ni contenu
des offres. Un refus d’accès ou une section statistique indisponible échoue au
smoke ; un déploiement réussi ne garantit donc pas un service métier opérationnel.
La souscription France Travail doit être vérifiée dans le portail développeur
si La Bonne Boîte refuse encore l’accès avec sa route et ses scopes corrigés.
