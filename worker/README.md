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
