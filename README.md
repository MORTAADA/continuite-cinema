# Continuité Cinéma — Hair & Makeup

Application locale/PWA de continuité pour le cinéma.

## Fonctions
- Accueil / tableau de bord
- Films, personnages, séquences
- Références photo coiffure / maquillage / accessoires
- Caméra et import galerie
- Modification, téléchargement et suppression des références
- Recherche globale
- Sauvegarde et restauration complète avec photos
- Gestion du stockage local
- Fonctionnement hors ligne via IndexedDB + Service Worker
- Interface responsive mobile / tablette / desktop

## Développement
```bash
npm install
npm run dev
```

## Production
```bash
npm run build
npm run preview
```

Les données sont stockées localement dans IndexedDB. Effectuez régulièrement une sauvegarde depuis **Sauvegarde**.
