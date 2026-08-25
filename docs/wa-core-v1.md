# WA Core iOS — boucle V1

## Décision

La première tranche valide uniquement la boucle :

`Safari → WA Core → endpoint HTTP → mémoire KV → statut Safari`.

Elle ne fusionne aucun autre userscript, ne contient ni IA, ni MCP, ni Google Drive, ni base vectorielle. Le code de cette tranche est original ; aucun code tiers n'a été copié.

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

WA Core utilise les API modernes `GM.getValue`, `GM.setValue` et `GM.xmlHttpRequest` prises en charge par Userscripts Safari. Un repli vers `localStorage` et `fetch` existe pour faciliter le diagnostic.

L'URL de l'endpoint et le token ne sont pas codés dans le fichier public. Ils sont demandés au premier usage. Avec `GM.setValue`, la configuration appartient au userscript et reste disponible sur les sites couverts.

Par prudence, saisir le token depuis une page de confiance, par exemple la page GitHub du projet, et non depuis un site inconnu.

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

Cette action renvoie la dernière capture avec son texte. Elle constitue le futur point d'entrée de l'outil MCP `get_last_page`.

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
4. Toucher `Tester la connexion` : résultat attendu `Connexion opérationnelle`.
5. Toucher `Envoyer cette page` : résultat attendu `Nouvelle page mémorisée`.
6. Recommencer sans modifier la page : résultat attendu `Page déjà vue`.
7. Sélectionner un passage et toucher `Envoyer la sélection`.
8. Vérifier côté API que `get_last_page` renvoie cette sélection.

## Étapes volontairement différées

1. fiche Markdown dans Google Drive ;
2. façade MCP des mêmes actions ;
3. `get_context` et comparaison explicite de versions ;
4. fusion progressive des modules userscripts ;
5. routeur IA gratuit.
