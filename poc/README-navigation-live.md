# Web Augmenté — Navigation Live (preuve de concept)

## État au 14 octobre 2026

Prototype expérimental dans `poc/web-augmente-navigation-live.user.js`.
Le script n'est **ni intégré aux scripts stables iOS, ni déployé automatiquement**.

### Fonctionnalités présentes

- Bouton **WA Live ON/OFF** : déclenche le partage de texte de la page active vers `/api/wa` en utilisant `remember_page` et le jeton fourni localement dans Userscripts.
- Détection des changements visibles par interrogation périodique (2 secondes) ; un onglet iOS inactif peut suspendre le script.
- URL nettoyée des paramètres et fragments.
- Bouton **WA Champs ON/OFF** : sur demande et pour le document courant, partage uniquement la valeur de champs textuels identifiés comme pseudonyme ou nom d'utilisateur, et masque les autres valeurs. Désactivé au chargement.

### Non implémenté

**Aucun Computer Use ni contrôle bidirectionnel de Safari.** Il n'existe pas d'API dans ce prototype permettant à l'assistant de cliquer, saisir, exécuter du JavaScript distant, ou approuver une action.

### Risques et conditions avant production

- L'extraction `document.body.innerText` peut inclure des informations personnelles affichées sur une page. Ne pas activer sur des pages sensibles.
- Le partage WA Live est enregistré à l'échelle du script, pas limité à un domaine donné : réévaluer cette politique avant installation.
- La reconnaissance des pseudonymes repose sur des heuristiques de libellés. Elle peut produire des faux positifs ; ne pas considérer le filtrage actuel comme une garantie de confidentialité.
- Le mode « Champs » reste actif dans le document si une navigation SPA modifie son contenu sans rechargement : prévoir une désactivation à chaque changement d'URL.
- Réviser l'extension Userscripts iOS, la récupération du jeton, l'authentification côté Worker et les droits d'origine `@match`.
- Ajouter tests unitaires et manuels avec pages de test sans secrets ; auditer les requêtes envoyées et les cas de champs masqués avant fusion.

### Étapes suivantes (proposition technique, séparées)

1. Durcir l'inspection locale et tester la confidentialité.
2. Ajouter au Worker MCP une file d'actions **en attente** liée à une session/onglet, avec identifiants courts, expiration et contrôle d'accès.
3. Faire afficher sur l'iPhone une demande d'autorisation explicite pour chaque action autorisée (clic ciblé ou saisie dans un champ non sensible), bouton d'arrêt et journal local.
4. Tester la fonctionnalité sur une page de démonstration ; ne jamais autoriser l'envoi automatique de formulaire, les mots de passe ou les opérations sensibles.

La pull request doit rester **brouillon** et **non fusionnée** avant cette vérification.