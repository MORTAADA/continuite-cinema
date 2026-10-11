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
- Caméra accessible depuis la page d’une séquence existante. L’utilisateur peut vérifier la capture, la reprendre, l’annuler ou enregistrer immédiatement l’image. La capture vidéo est exportée en PNG sans compression JPEG supplémentaire; la qualité/résolution dépend toutefois du flux caméra fourni par le navigateur.
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
