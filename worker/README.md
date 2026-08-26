# Worker hybride Web Augmenté V1

Le Worker Cloudflare `web-augmente-api` conserve l’API historique du userscript iPhone et ajoute un serveur MCP distant en lecture seule.

## Endpoints

- `GET /health` et `GET /api/wa?action=health` : santé publique ;
- `POST /api/wa` : actions `health`, `remember_page` et `get_last_page`, sans changement de contrat ;
- `POST /mcp` : transport MCP Streamable HTTP, protégé par OAuth 2.1 ;
- `/authorize`, `/oauth/token`, `/oauth/register` et `/.well-known/*` : autorisation et découverte OAuth.

Le MCP expose un seul outil, `wa_get_last_page`. Il lit directement `meta:last_page` dans `WA_MEMORY`, ne possède aucun chemin d’écriture et signale explicitement que le texte capturé est du contenu Web non fiable.

## Stockage

Deux namespaces KV distincts sont obligatoires :

- `WA_MEMORY` conserve le namespace historique des captures ;
- `OAUTH_KV` pointe vers le namespace séparé `WA_OAUTH` pour les états temporaires, clients, grants, codes et tokens OAuth.

Les deux IDs sont inscrits explicitement dans `wrangler.jsonc`. Ne jamais supprimer, remplacer ni recréer automatiquement `WA_MEMORY`.

## Développement et validation

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
4. Créer la connexion, terminer l’écran OAuth avec le secret personnel, puis vérifier que seul `wa_get_last_page` est découvert.
5. Dans une nouvelle conversation, ajouter cette connexion depuis le menu des outils.

La disponibilité du mode développeur peut dépendre du compte et de la politique du workspace.

## Sécurité de l’API historique

- `health` reste public ; les actions mémoire privées exigent le bearer historique.
- CORS accepte toutes les origines pour le userscript multi-sites, sans cookies ni credentials navigateur.
- Le JSON est lu comme un flux borné à 256 Kio.
- Seuls les champs de page explicitement autorisés sont conservés.
- Les bearer et secrets sont comparés par empreintes SHA-256 en temps constant.
