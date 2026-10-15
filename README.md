# Continuité — Coiffure & Maquillage Cinéma

Application web locale en français, construite avec React, TypeScript et Vite. L’interface responsive est conçue pour organiser les références de continuité pendant un tournage.

## Prérequis et lancement
- Node.js 20 ou plus récent
- npm

```bash
npm install
npm run build
npm run dev
```

Vite affiche une adresse locale, généralement `http://localhost:5173`.

## Fonctionnalités présentes dans cette version
- Profil local avec identifiant e-mail et code PIN à 6 chiffres. L’e-mail n’est pas vérifié par un service externe et le PIN ne chiffre pas les données.
- Films, personnages, séquences et photos stockés dans IndexedDB sur l’appareil.
- Navigation hiérarchique : film → personnage → séquence → photos et caméra.
- Une séquence peut être liée à plusieurs personnages du même film. Les photos sont attachées à la séquence et ne sont pas dupliquées pour chaque personnage.
- Caméra continue depuis la page d’une séquence : aperçu en direct, grand bouton de prise de vue, miniature de la dernière photo avec compteur. Chaque photo est enregistrée immédiatement dans IndexedDB (JPEG qualité 0,98 à la résolution du flux fourni par le navigateur) et la caméra reste ouverte pour enchaîner les prises.
- Aperçu plein écran (touche sur la miniature ou sur une photo) : boutons Retour (vers la caméra ou la liste), Supprimer et Détails. Le panneau Détails permet de lier la photo à un autre film, personnage ou séquence, et de modifier date, coiffure, maquillage, accessoires et notes. Ordre d’enregistrement : l’image d’abord, puis les modifications, enregistrées automatiquement (≈ 0,7 s après la dernière frappe, et à la fermeture). Navigation entre photos par flèches, glissement ou clavier (← → Échap).
- Accueil simplifié : bouton « Photographier » (reprend la dernière séquence), boutons Projets / Mes photos / Sauvegarde (alerte si aucune copie depuis 7 jours), 6 dernières photos. Premier lancement : un seul formulaire (film, personnage, séquence) puis caméra. Navigation : barre basse sur téléphone (Accueil, Projets, caméra, Mes photos, Plus), menu latéral sur ordinateur.
- Sauvegarde : état de la dernière sauvegarde avec alerte après 7 jours, bouton « Sauvegarder et partager » (Drive, WhatsApp, e-mail… quand le navigateur accepte le partage de fichiers) ou téléchargement du fichier `.ccbackup`. Stockage persistant demandé automatiquement au lancement.
- Miniatures : une miniature JPEG (≤ 480 px) est créée à chaque photo ; les photos plus anciennes en reçoivent une automatiquement en arrière-plan. Les listes utilisent les miniatures, le plein écran l’original (jamais modifié).
- Tests sur téléphone : voir `TESTS_TELEPHONE.md`.
- Page « Mes photos » : toutes les photos, filtres film / personnage / séquence, recherche, archivage/restauration et ouverture en plein écran.
- Import de photos depuis la galerie, en conservant le Blob fourni par le navigateur.
- Notes, date de référence, coiffure, maquillage et accessoires modifiables après l’enregistrement de la photo.
- Archivage et restauration des films, personnages, séquences et photos; suppression définitive séparée et confirmée.
- Export d’un fichier de sauvegarde binaire unique `.ccbackup`, contenant les métadonnées et les Blobs d’images sans conversion base64 ni recompression. La restauration valide le format et les relations avant de remplacer les données locales.
- Affichage de l’estimation de stockage disponible lorsque le navigateur l’expose, demande optionnelle de stockage persistant et avertissement en cas d’utilisation estimée élevée.
- Manifeste PWA et service worker de base.

## Stockage et sauvegarde — limites importantes
- Les données restent locales au navigateur/appareil. La capacité disponible dépend du navigateur, du système, de l’espace libre et des politiques de quota; aucune capacité fixe de 15 Go ne peut être garantie.
- Le stockage persistant peut être refusé. Il ne protège pas contre la suppression manuelle des données, la désinstallation ou la perte du téléphone. Exportez régulièrement une sauvegarde et gardez-la séparément.
- Le fichier `.ccbackup` conserve les images originales sans recompression, mais les opérations d’export/restauration doivent encore être testées sur des projets de grande taille et sur les téléphones ciblés. Le navigateur peut nécessiter de l’espace temporaire.
- Les sauvegardes exportées sont indépendantes des données de l’application. Supprimer un film localement ne supprime pas les anciennes sauvegardes copiées ailleurs.
- Google Drive n’est pas encore connecté. Aucun transfert cloud automatique n’est implémenté.
- Le service worker/PWA, le build de production, les migrations de base de données sur un navigateur réel et la caméra physique doivent être validés avant une mise en production client.

## Sécurité et données
Le code PIN verrouille l’interface, mais ne chiffre pas les données IndexedDB. N’utilisez pas cette version comme unique archive d’un tournage tant que les essais de sauvegarde/restauration et la validation sur les appareils de production ne sont pas terminés.

### Séquences partagées sur téléphone
Lors de la création ou de la modification d’une séquence, sélectionnez les personnages associés en touchant leurs cases à cocher. Les photos appartiennent à la séquence et restent identiques lorsqu’on ouvre cette séquence depuis l’un ou l’autre personnage.

## Installer sur le téléphone (application PWA)
L’application est une PWA : une fois publiée en **HTTPS**, elle s’installe comme une vraie application (icône, plein écran, hors ligne, caméra).
1. Publiez : poussez le dépôt sur GitHub (branche `main`), puis *Settings → Pages → Source : GitHub Actions*. Le workflow `.github/workflows/deploy.yml` construit et publie sur `https://<utilisateur>.github.io/continuite-cinema/` (le nom du dépôt doit être `continuite-cinema`, sinon changez `base` dans `vite.config.ts`).
2. Android (Chrome) : ouvrez l’adresse → menu ⋮ → **Installer l’application** / **Ajouter à l’écran d’accueil**.
3. iPhone (Safari) : ouvrez l’adresse → bouton Partager → **Sur l’écran d’accueil**.
4. Ouvrez l’application une fois avec Internet, puis elle fonctionne hors ligne. Autorisez la caméra à la première prise de vue.
Les données restent dans le téléphone : exportez régulièrement une sauvegarde `.ccbackup`.


## Version 0.7.0 — livraison
Voir `GUIDE_CLIENT.md` (utilisation, installation Android/iPhone, sauvegarde) et la section « Révision 0.7.0 » de `RAPPORT_CONTROLE.md`. Le déploiement GitHub Pages utilise `base: /continuite-cinema/` ; si le dépôt est renommé, modifiez `vite.config.ts` **et** `public/manifest.webmanifest` ainsi que le lien du manifest dans `index.html`.
