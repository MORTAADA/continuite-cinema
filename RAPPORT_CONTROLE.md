# Rapport de contrôle — Continuité Cinéma

## Version finale

Cette version rétablit une architecture cohérente entre React et CSS et ajoute les fonctions manquantes essentielles pour un usage de plateau.

### Navigation et interface
- Page **Accueil** avec tableau de bord.
- Sidebar complète : Accueil, Films, Personnages, Séquences, Continuité, Sauvegarde, Paramètres.
- Header avec recherche globale, Images et Caméra.
- Responsive desktop / tablette / mobile.
- Le logo revient toujours à Accueil.

### Gestion des projets
- Création / modification / suppression des films.
- Création / modification / suppression des personnages.
- Création / modification / suppression des séquences.
- Relations Film → Personnage → Séquence.
- Suppression en cascade des éléments et photos dépendants.

### Continuité
- Import de plusieurs images.
- Capture caméra.
- Changement caméra avant / arrière.
- Association à une séquence.
- Champs coiffure, maquillage, accessoires et notes.
- Modification d'une référence existante.
- Téléchargement de l'original.
- Suppression.
- Miniatures locales pour réduire la charge d'affichage.
- Recherche dans les références.

### Sauvegarde
- Export JSON autonome contenant les données et les photos originales.
- Restauration avec confirmation.
- Comptage du contenu restauré.

### Paramètres
- Estimation du stockage utilisé / quota.
- Demande de stockage persistant.
- Réinitialisation complète des données locales avec confirmation.

### PWA / hors ligne
- Service Worker conservé.
- Manifest conservé.
- IndexedDB pour les données locales.

## Validation
- Transpilation TypeScript/TSX de tous les fichiers source : OK.
- Contrôle des classes CSS utilisées par l'interface : OK (une classe décorative `continuity-form-card` reste sans règle spécifique).
- Le build Vite n'a pas pu être exécuté dans l'environnement de travail car `node_modules` était incomplet et les téléchargements npm ont expiré. Le projet doit être vérifié avec `npm install && npm run build` sur la machine de développement avant publication.
