# Continuité — Coiffure & Maquillage Cinéma

Prototype web local en français, construit avec React, TypeScript et Vite. Interface sombre conçue pour le travail de continuité sur les tournages.

## Prérequis
- Node.js 20 ou plus récent
- npm

## Installation et lancement
Depuis le dossier du projet :

```bash
npm install
npm run build
npm run dev
```

Vite affiche ensuite une adresse locale, généralement `http://localhost:5173`.

## Fonctionnalités implémentées dans cette version
- Création d’un profil local avec adresse e-mail comme identifiant et code PIN local à 6 chiffres.
- Stockage IndexedDB local pour les films, personnages, séquences, photos et réglages.
- Création, modification, recherche et suppression des films.
- Création, modification, recherche et suppression des personnages liés à un film.
- Création, modification, recherche et suppression des séquences liées à un personnage.
- Suppression en cascade des éléments dépendants pour éviter de laisser des références orphelines.
- Interface responsive, pensée pour ordinateur et petits écrans.
- Manifeste PWA et service worker de base pour préparer le mode hors ligne.

## Limites connues — à traiter dans les prochaines étapes
- La compilation de production doit encore être vérifiée sur un ordinateur où les dépendances npm peuvent être installées.
- L’adresse e-mail sert d’identifiant local : il n’y a pas encore de vérification réelle par e-mail.
- La capture/importation de photos et les champs détaillés de coiffure, maquillage, accessoires et notes sont implémentés.
- L’export et la restauration d’une sauvegarde complète ne sont pas encore implémentés.
- Le service worker doit être validé sur une version de production servie via HTTPS ou localhost.
- Les données sont locales au navigateur et ne sont pas synchronisées entre appareils. Le code PIN verrouille l’interface, mais ne chiffre pas les données stockées.

## Données et prudence
Les données de ce prototype sont conservées dans le navigateur utilisé. Ne l’utilisez pas encore comme unique archive d’un tournage : la sauvegarde complète n’est pas disponible.

## Prise de vue intégrée

Dans l’espace « Continuité », ouvrez « Ajouter des photos », puis « Prendre une photo ». Le navigateur demande l’autorisation d’accéder à la caméra et affiche un aperçu en direct. « Capturer » ajoute une image à la liste temporaire ; il est possible d’en capturer plusieurs, puis de les enregistrer avec la séquence et les informations de coiffure, maquillage, accessoires et notes. L’import depuis la galerie reste disponible.

**Conditions de caméra :** `getUserMedia` fonctionne normalement dans un contexte sécurisé (HTTPS) ou sur `localhost`. Sur un ordinateur, autorisez la caméra dans le navigateur et vérifiez qu’aucune autre application ne la monopolise. La prise de vue intégrée doit encore être testée sur les navigateurs et appareils ciblés. Les photos restent stockées dans IndexedDB sur cet appareil ; cette version ne synchronise pas les photos entre appareils.


## Stockage des photos (mise à jour)

- Les photos prises avec la caméra intégrée sont enregistrées immédiatement dans IndexedDB, sans association obligatoire à un film, personnage ou séquence.
- La capture caméra utilise PNG pour éviter la compression JPEG supplémentaire. La résolution reste limitée par la résolution fournie par la caméra du navigateur.
- Le navigateur est invité à accorder le stockage persistant quand il le permet.
- La recherche de photos prend aussi en compte la date de prise de vue.
- Chaque photo dispose d'une action pour télécharger l'original. Sur téléphone, selon le navigateur, le fichier peut être enregistré dans Téléchargements puis déplacé vers Galerie.

**Limitation importante :** une application publiée uniquement sur GitHub Pages ne peut pas garantir l'ajout automatique et silencieux à la Galerie système sur tous les téléphones. Cela exige une intégration native Android/iOS. Le stockage IndexedDB du navigateur n'est pas une sauvegarde; exportez les photos régulièrement.
