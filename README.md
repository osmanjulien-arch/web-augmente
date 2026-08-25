# Web Augmenté

Prototype personnel de couche d’amélioration du Web par userscripts.

## Phase actuelle

V1 — CLEAN + boucle Web Augmenté minimale

Premier test :
Safari iPhone + Userscripts + Amazon.fr.

La branche `feature/wa-core-v1` ajoute une boucle volontaire et légère, désormais lisible par un MCP OAuth en lecture seule :

`Safari → WA Core iOS → /api/wa → Cloudflare KV → /mcp → ChatGPT`.

## Installation Amazon iOS

1. Installer l’extension Safari Userscripts.
2. Autoriser Userscripts sur amazon.fr.
3. Ouvrir l’URL RAW de amazon-clean-ios.user.js dans Safari.
4. Installer le script via Userscripts.
5. Recharger Amazon.fr.

La branche stable `release/amazon-clean-ios-v0.2.3` reste indépendante et ne doit pas être modifiée.

## Installation WA Core iOS

1. Déployer l'endpoint décrit dans [`worker/README.md`](worker/README.md).
2. Ouvrir dans Safari l'[URL RAW de WA Core iOS](https://raw.githubusercontent.com/osmanjulien-arch/web-augmente/feature/wa-core-v1/scripts/core/wa-core-ios.user.js).
3. Installer le fichier avec Userscripts.
4. Sur une page Web, toucher le bouton `WA`.
5. Choisir `Configurer la connexion`, puis saisir l'URL `/api/wa` et le token personnel.
6. Tester `Envoyer cette page`, puis envoyer une seconde fois : le serveur doit répondre `new`, puis `already_seen`.

Le script n'envoie rien automatiquement. Il transmet uniquement du texte après une action explicite.

## Documentation V1

- [Périmètre, API et protocole de test iPhone](docs/wa-core-v1.md)
- [Déploiement du Worker Cloudflare et connexion MCP](worker/README.md)

## Principe

Aucune nouvelle fonction ne doit être ajoutée tant qu’elle ne répond pas à une friction utilisateur clairement identifiée.
