# Endpoint Web Augmenté V1

Worker Cloudflare sans dépendance d'exécution. Il expose :

- `health` ;
- `remember_page` ;
- `get_last_page`.

La mémoire utilise un binding KV `WA_MEMORY`. Wrangler peut créer automatiquement le namespace au premier déploiement.

## Développement local

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars
npm test
npm run dev
```

Remplacer la valeur de `.dev.vars` par un token aléatoire d'au moins 20 caractères. Ce fichier est ignoré par Git.

## Déploiement Cloudflare

Prérequis : Wrangler connecté au compte Cloudflare.

```bash
cd worker
npm install
npx wrangler deploy
npx wrangler secret put WA_API_TOKEN
```

Pour générer un token personnel robuste :

```bash
openssl rand -hex 32
```

Conserver ce token dans un gestionnaire de mots de passe. Il ne doit jamais être ajouté au dépôt ni au userscript public.

Après `wrangler deploy`, noter l'URL `https://<worker>.<sous-domaine>.workers.dev` et configurer WA Core avec :

`https://<worker>.<sous-domaine>.workers.dev/api/wa`

## Vérifications HTTP

```bash
curl https://<worker>.<sous-domaine>.workers.dev/health
```

Puis définir temporairement le token dans le terminal et tester la mémoire :

```bash
read -s WA_TEST_TOKEN
curl -X POST https://<worker>.<sous-domaine>.workers.dev/api/wa \
  -H "Authorization: Bearer $WA_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"action":"remember_page","page":{"url":"https://example.com/test","title":"Test","capture_type":"page","content":"Première capture de test.","status":"inbox"}}'
```

```bash
curl -X POST https://<worker>.<sous-domaine>.workers.dev/api/wa \
  -H "Authorization: Bearer $WA_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"action":"get_last_page"}'
```

## Sécurité

- `health` est public ; les actions mémoire exigent le token.
- CORS accepte toutes les origines parce que le userscript s'exécute sur de nombreux sites, mais aucun cookie ni credential navigateur n'est accepté.
- Le corps JSON est lu comme un flux borné à 256 Kio.
- Le serveur ne conserve que les champs explicitement autorisés.
- Les comparaisons de token utilisent des empreintes SHA-256 et une comparaison en temps constant.
