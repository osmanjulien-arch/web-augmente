# WA Core iOS — boucle V1

## Décision

La première tranche valide uniquement la boucle :

`Safari → WA Core → endpoint HTTP → mémoire KV → statut Safari`.

Elle ne fusionne aucun autre userscript, ne contient ni IA, ni Google Drive, ni base vectorielle. Le Worker ajoute désormais une façade MCP OAuth strictement read-only au-dessus de la même mémoire KV, sans modifier le contrat iPhone. Le code de cette tranche est original ; aucun code tiers n'a été copié.

## Fonctions du userscript

- bouton flottant `WA` et menu mobile dans un Shadow DOM ;
- détection légère du site courant ;
- extraction du titre, de l'URL canonique et du texte principal ;
- capture de la sélection courante ;
- `Envoyer cette page` et `Envoyer la sélection` vers le statut `inbox` ;
- `Mémoriser cette page` vers le statut `remembered` ;
- test et configuration de la connexion ;
- retour visible `new`, `already_seen`, `already_analyzed` ou `changed`.

Le script n'utilise aucun timer permanent et aucun `MutationObserver`. L'extraction ne s'exécute qu'après une action de l'utilisateur.

## Données exclues avant envoi

Le clone utilisé pour l'extraction supprime :

- `input`, `textarea`, `select`, `form` et éléments éditables ;
- scripts, styles, iframes, canvas et templates ;
- éléments cachés ;
- navigation, pied de page et panneaux secondaires ;
- toute l'interface WA.

Seul du texte est transmis, limité à 40 000 caractères par page et 20 000 par sélection. Une page comportant un champ mot de passe visible est bloquée. Une confirmation supplémentaire est demandée pour les URL qui semblent sensibles.

## Stockage et authentification iOS

WA Core 0.1.1 utilise les API modernes `GM.getValue`, `GM.setValue` et
`GM.xmlHttpRequest` prises en charge par Userscripts Safari. Il accède au `GM`
injecté localement par l’extension, et non à `globalThis.GM`.

La version 0.1.0 pouvait manquer ce `GM` et basculer silencieusement vers
`localStorage` (configuration propre à chaque site, lisible par le site) et
`fetch` (soumis aux restrictions réseau de la page). Cela pouvait entraîner
des demandes répétées du token et des erreurs Safari « Load failed ».

Ces deux replis sont supprimés. Une API d’extension indisponible ou une erreur de
stockage produit une erreur explicite, avant toute demande du token. Les écritures
dans Userscripts sont relues pour vérifier leur succès. Une erreur réseau ou
HTTP ne supprime pas la configuration et ne déclenche pas de nouvelle saisie.

L’endpoint public du projet est prérempli ; aucun secret n’est codé dans le fichier.
Le token est demandé au premier envoi privé et enregistré dans l’extension pour
le même userscript sur tous les sites couverts. Les clés GM existantes sont
conservées. Les anciennes valeurs du stockage des sites ne sont pas importées :
une saisie initiale peut donc être nécessaire après la mise à jour.

Le bouton de test appelle le `health` public sans demander ni envoyer de token.
Il vérifie le transport de l’extension, pas l’authentification des captures.

Par prudence, saisir le token depuis une page de confiance, par exemple la page GitHub du projet, et non depuis un site inconnu.

Références : [injection officielle Userscripts](https://github.com/quoid/userscripts/blob/release/4.x.x/src/ext/content-scripts/entry-userscripts.js)
et [API Userscripts](https://github.com/quoid/userscripts/tree/release/4.x.x#api).

### Mettre à jour depuis PowerShell

Depuis la racine du dépôt sur `feature/wa-core-v1`, récupérer la version publiée
puis exécuter `node --test tests/wa-core-ios.test.cjs` (Node.js 18 ou supérieur).
Les tests reproduisent l’injection locale de `GM` et les clics du menu avec un
DOM et un stockage simulés ; ils ne remplacent pas le test sur un vrai iPhone.

Sur l’iPhone, remplacer **le fichier WA Core existant**, sans le renommer ni créer
une seconde copie. Le stockage Userscripts est associé au fichier du script.
Ouvrir ensuite le panneau de l’extension Userscripts dans Safari, attendre son
chargement, puis recharger la page Web. Le menu WA doit afficher **0.1.1**.
Un `git pull` sur le PC ne met pas à jour à lui seul le fichier installé sur iPhone.
Aucun redéploiement Cloudflare ni changement du secret serveur n’est requis.

## Contrat HTTP V1

Endpoint : `POST /api/wa` avec `Content-Type: application/json`.

Les actions privées exigent `Authorization: Bearer <WA_API_TOKEN>`.

### `health`

```json
{
  "action": "health"
}
```

`GET /health` et `GET /api/wa?action=health` sont également disponibles sans authentification.

### `remember_page`

```json
{
  "action": "remember_page",
  "page": {
    "url": "https://example.com/article?utm_source=test",
    "canonical_url": "https://example.com/article",
    "title": "Titre",
    "capture_type": "page",
    "content": "Texte utile…",
    "status": "inbox"
  }
}
```

La réponse contient un ID SHA-256 stable dérivé de l'URL canonique normalisée et l'un de ces statuts :

| Statut | Sens |
|---|---|
| `new` | première capture de cette URL canonique |
| `already_seen` | fiche déjà présente et contenu identique |
| `already_analyzed` | fiche déjà analysée et contenu identique |
| `changed` | empreinte du contenu différente |

### `get_last_page`

```json
{
  "action": "get_last_page"
}
```

Cette action renvoie la dernière capture avec son texte. La même clé alimente l’outil MCP read-only `wa_get_last_page` sans passer par l’API bearer du userscript.

## Fiche mémoire

Une clé KV `page:<id>` contient la fiche légère. Une clé `meta:last_page` contient la dernière capture pour une récupération en une lecture.

Champs préparés dès maintenant :

- `id`, `canonical_url`, `title`, `domain` ;
- `first_seen`, `last_seen`, `content_hash`, `status` ;
- `tags`, `summary`, `key_facts`, `previous_analysis` ;
- `recommendations`, `open_questions`, `next_actions`, `related_pages` ;
- `analysis_version`.

Le texte utile est conservé car il est nécessaire à l'analyse future. Le HTML brut n'est jamais stocké.

## Limite assumée de KV

KV est adapté à cette V1 personnelle et peu concurrente. Les écritures peuvent mettre jusqu'à environ une minute à se propager entre régions et deux écritures simultanées sur la même page peuvent se remplacer. Ce compromis évite D1 tant que l'usage réel ne démontre pas un besoin transactionnel.

## Protocole de test Safari iPhone

1. Installer WA Core depuis l'URL RAW de la branche `feature/wa-core-v1`.
2. Vérifier que le bouton `WA` apparaît sur une page non sensible.
3. Configurer l'URL du Worker et le token personnel.
4. Toucher `Tester la connexion` : résultat attendu `Serveur joignable via Userscripts` (test public).
5. Toucher `Envoyer cette page` : résultat attendu `Nouvelle page mémorisée`.
6. Recommencer sans modifier la page : résultat attendu `Page déjà vue`.
7. Sélectionner un passage et toucher `Envoyer la sélection`.
8. Vérifier côté API que `get_last_page` renvoie cette sélection.
9. Recharger, puis ouvrir un autre site et envoyer une nouvelle capture : aucun
   token ne doit être redemandé. Vérifier ensuite titre, URL et date via le MCP.

## Étapes volontairement différées

1. fiche Markdown dans Google Drive ;
2. `get_context` et comparaison explicite de versions ;
3. fusion progressive des modules userscripts ;
4. routeur IA gratuit.
