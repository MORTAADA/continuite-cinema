# Continuité Cinéma — rapport de contrôle de cette révision

## Changements implémentés
- Passage de la base IndexedDB à la version 2 avec migration des séquences existantes vers un tableau `characterIds` et un index multi-entrée. La relation historique `characterId` est conservée pour compatibilité.
- Ajout des relations partagées entre une séquence et plusieurs personnages du même film. Les photos restent liées à un seul `sequenceId`.
- Ajout de l’archivage/restauration des films, personnages, séquences et photos. Le chemin de suppression définitive est séparé et avertit que les sauvegardes externes ne sont pas supprimées.
- Ajustement des suppressions de personnages : les séquences partagées et leurs photos sont conservées lorsqu’un autre personnage y est encore lié.
- Modification du flux caméra : caméra disponible depuis la page d’une séquence ouverte via Films → Personnage → Séquence; capture en PNG, aperçu de vérification, reprise/annulation et sauvegarde immédiate sans formulaire obligatoire de notes.
- Retrait de la compression JPEG supplémentaire sur le flux de capture. Les photos importées depuis la galerie restent stockées sous forme de Blob. La résolution de la capture caméra reste celle du flux fourni par le navigateur.
- Ajout de l’édition des notes, de la date de référence, des détails de coiffure, de maquillage et des accessoires après l’enregistrement d’une photo.
- Ajout d’un format binaire `.ccbackup` à fichier unique, qui stocke les métadonnées dans un manifeste et les Blobs originaux en séquence, sans conversion base64. La restauration valide le format et les relations avant d’ouvrir la transaction de remplacement.
- Ajout de l’estimation du stockage, de la demande optionnelle de stockage persistant et d’un avertissement de seuil élevé, sans suppression automatique.
- Mise à jour du README pour refléter les fonctionnalités et limites actuelles.

## Contrôles effectués dans cet environnement
- ZIP source extrait sans erreur.
- Analyse syntaxique de 10 fichiers TypeScript/TSX avec le compilateur TypeScript global : aucune erreur de syntaxe détectée.
- Audit AST des boutons JSX : 68 boutons recensés, 0 bouton sans attribut `type`.
- Contrôle TypeScript de cohérence avec déclarations temporaires minimales : aucune erreur de cohérence supplémentaire détectée; ce contrôle ne remplace pas les types réels des dépendances.
- Revue statique des principaux chemins de sauvegarde, d’archivage, de suppression et de navigation.

## Contrôles non réalisés — ne pas considérer comme validés
- `npm ci` n’a pas pu terminer dans cet environnement; l’installation a échoué pendant la récupération des dépendances. Par conséquent, `npm run build` et le contrôle TypeScript sémantique complet n’ont pas pu être exécutés.
- Pas de test automatisé IndexedDB sur un vrai navigateur, ni de simulation complète de migration version 1 → 2.
- Pas de test physique de la caméra sur Android/iOS, ni d’essai PWA hors ligne.
- Pas de test d’export/restauration avec une grande photothèque. Bien que le format évite l’expansion base64, le navigateur peut nécessiter de l’espace temporaire.
- Pas de test multi-appareils ni d’intégration Google Drive; ces fonctionnalités ne sont pas annoncées comme disponibles.

## Recommandation avant livraison client
Installer les dépendances sur une machine avec accès au registre npm, exécuter `npm ci` puis `npm run build`, tester la migration sur une copie de la base version 1, et réaliser les tests d’acceptation sur les téléphones réellement utilisés au tournage. Conserver une copie de sauvegarde avant toute mise à jour de l’application.

## Étape suivante — amélioration mobile
- Remplacement du contrôle HTML `select multiple` des personnages par une liste de cases à cocher tactiles. L’ancien contrôle nécessitait Ctrl/Cmd sur ordinateur, ce qui rendait la sélection de personnages partagés peu évidente sur téléphone.
- Le formulaire continue d’envoyer les identifiants cochés sous le champ `characterIds`; aucune modification du schéma IndexedDB n’est requise pour cette amélioration.
- Nouvelle vérification syntaxique après ce changement : 10 fichiers TypeScript/TSX analysés, aucune erreur de syntaxe; 68 boutons JSX vérifiés, aucun sans `type` explicite.
- Renforcement de la validation de restauration : vérification que les identifiants de personnages d’une séquence sont uniques et cohérents avec son personnage principal, et que chaque photo référence un personnage réellement lié à sa séquence. Les incohérences sont rejetées avant le remplacement de la base locale.


## Révision 0.3.0 — Option A : aperçu plein écran, enregistrement automatique, « Mes photos »
### Changements
- Nouveau composant `src/PhotoViewer.tsx` : aperçu plein écran (retour, suppression, détails, rattachement film → personnage → séquence), enregistrement automatique avec écritures sérialisées et dernier enregistrement à la fermeture/changement de photo.
- Caméra : disposition miniature de la dernière photo | grand déclencheur | changer de caméra / flash / fermer. Le flux vidéo reste actif pendant l’aperçu : retour à la caméra sans la rouvrir. Ancien aperçu « incrusté » et ancienne bande de miniatures supprimés.
- Correction : l’ancien bouton « Détails » ouvert depuis la caméra affichait une fenêtre derrière la caméra (z-index inférieur) ; remplacé par le panneau intégré à l’aperçu.
- `savePhoto` retourne la photo créée ; `updatePhoto` accepte `sequenceId`/`characterId` (validation : séquence active, personnage lié, `filmId` recalculé) et retourne la photo mise à jour. L’image n’est jamais modifiée. Le format de sauvegarde `.ccbackup` et le schéma IndexedDB sont inchangés.
- Section « Continuité » renommée « Mes photos », avec filtres film / personnage / séquence ; cartes cliquables.
- Capture : mise à jour de l’état en place (plus de rechargement complet de toutes les images à chaque photo).

### Tests réalisés (navigateur Chromium réel, caméra simulée, viewports 390×800 et 1280×800)
Création film/personnages/séquences ; 3 prises de vue ; compteur ; aperçu plein écran (390×740) ; notes et coiffure enregistrées en IndexedDB ; blobs JPEG conservés ; reclassement vers une autre séquence ; cohérence des listes ; retour à la caméra avec flux toujours « live » ; nouvelle prise ; suppression depuis l’aperçu ; touche Échap ; page Mes photos et filtre par séquence : tous réussis, aucune erreur JS.

### Limites — à refaire sur votre machine
- `npm ci` était bloqué dans cet environnement (registre npm refusé par la politique réseau). Les tests ont utilisé esbuild + React 19 avec de petites doublures pour `idb` et `lucide-react`. Le projet cible React 18.3 : exécutez `npm ci && npm run build` pour la validation TypeScript complète (une vérification approchée a confirmé l’absence de variables inutilisées/indéfinies).
- Caméra physique Android/iOS, flash, PWA hors ligne et grandes photothèques non testés.


## Révision 0.4.0 — accueil simplifié et navigation
- Accueil : carte « Reprendre » + grand bouton Photographier, 3 boutons (Projets, Mes photos, Sauvegarde avec alerte ≥ 7 jours ou aucune copie), 6 dernières photos (touche → aperçu plein écran). Premier lancement : formulaire unique film/personnage/séquence puis caméra.
- Navigation : Accueil · Projets · Mes photos (+ Plus : Sauvegarde, Paramètres, listes complètes Personnages/Séquences, Aide, Verrouiller). Barre basse avec bouton caméra sur téléphone ; menu latéral avec bouton Photographier sur ordinateur.
- Des fichiers de l’accueil existaient déjà dans le dossier dans deux versions incompatibles (props et classes CSS différentes) ; ils ont été unifiés (`Home.tsx`, `lib/home.ts`, `lib/resume.ts`).
- Tests Chromium (390×800 et 1280×800, caméra simulée) : formulaire de premier lancement → caméra, Reprendre, Photographier direct, miniature → plein écran, boutons Projets/Mes photos/Sauvegarde, feuille Plus, sidebar/barre basse selon l’écran : tous réussis, aucune erreur JS.
- Non fait : bouton « + Nouvelle séquence » depuis la caméra. Même limite qu’avant : `npm run build` complet et tests sur vrais téléphones à faire chez vous.


## Révision 0.6.0 — protection des données et rapidité
- Photo fantôme (0.5.0) retirée à la demande du client : le code et le CSS associés ont été supprimés.
- Miniatures : `makeThumbnail` à chaque `savePhoto` ; `backfillThumbnails` (lecture + écriture dans une même transaction, une photo à la fois) pour les photos existantes ; listes « Mes photos », accueil et caméra utilisent la miniature.
- Sauvegarde : état + alerte ≥ 7 jours / aucune copie ; partage natif (`navigator.share` avec fichier) avec repli téléchargement ; `rememberBackup` seulement après succès (pas si l’utilisateur annule) ; `navigator.storage.persist()` demandé au lancement (silencieux).
- Tests Chromium (390×800, caméra simulée, partage simulé) : miniature JPEG créée (≈ 3 Ko pour 35 Ko), anciennes photos complétées avec notes conservées, statut de sauvegarde, partage appelé avec un fichier `.ccbackup`, téléchargement, restauration avec miniatures intactes ; régression accueil/navigation mobile et bureau : réussie, aucune erreur JS.
- Non vérifié : le partage de fichier `.ccbackup` (type `application/octet-stream`) dépend du navigateur — Chrome Android peut refuser certains types ; dans ce cas le bouton Télécharger reste disponible. À confirmer sur Android et iPhone (voir `TESTS_TELEPHONE.md`). `npm run build` complet non exécuté ici (registre npm bloqué).


## Révision 0.7.0 — version de livraison (sécurité, installation, performances)

### Changements
- **Installation (PWA)** : `id`, `start_url`, `scope`, icônes et lien du manifest en chemins absolus `/continuite-cinema/` (la mention « Impossible d'installer cette appli » venait d'un manifest en chemins relatifs). Icône `apple-touch-icon.png` 180×180 pour iPhone.
- **Verrouillage** : l'accès reste fermé si la base locale est illisible (avant : déverrouillage par défaut). Verrouillage automatique après 2 min en arrière-plan. Limitation des essais persistée (5 essais, puis pause 30 s doublant jusqu'à 15 min). Empreinte du code passée en PBKDF2-SHA-256 (150 000 itérations) avec mise à niveau automatique des anciens profils.
- **Code de récupération** : généré à la création du profil (80 bits, affiché une seule fois), utilisable via « Code oublié ? », renouvelable dans Sauvegarde → Sécurité. Changement du code local possible depuis l'application.
- **Sauvegardes** : les réglages de sécurité (empreinte du code, sel, code de récupération) ne sont plus exportés et ne sont jamais écrasés par une restauration. Les anciens fichiers `.ccbackup` restent lisibles (leurs champs de sécurité sont ignorés).
- **Texte d'inscription** : suppression de la mention d'une vérification par e-mail « avant la livraison » ; explication claire (code local, pas de compte, pas de récupération par e-mail).
- **Mes photos** : affichage par pages de 24 avec « Afficher plus » (évite de créer des centaines de miniatures d'un coup).
- **Service worker** : pré-chargement de tous les fichiers du build (usage hors ligne dès la première ouverture), nom de cache renouvelé automatiquement à chaque build (plugin dans `vite.config.ts`), réseau d'abord pour manifest/icônes.
- **iPhone** : bandeau d'aide à l'installation sur l'écran d'accueil quand l'application est ouverte dans Safari (protection contre l'effacement automatique des données).
- Ajout de `GUIDE_CLIENT.md`.

### Contrôles effectués ici
- Test automatisé (Node 22, WebCrypto réel, stockage simulé) de la logique de verrouillage : bon/mauvais code, pause après 5 échecs et doublement, refus du bon code pendant la pause, changement de code, récupération (casse/espaces tolérés), invalidation de l'ancien code de récupération, migration d'un ancien profil SHA-256 : 20 contrôles réussis.
- Test du plugin de pré-chargement sur un dossier `dist` simulé : liste correcte, `.map` et `index.html` exclus, syntaxe du service worker produit valide, échec explicite si les marqueurs manquent.
- Vérification TypeScript approchée avec déclarations simplifiées (options du projet : strict, noUnusedLocals, verbatimModuleSyntax) : aucun identifiant inutilisé, indéfini ou import de type mal formé.

### Non réalisé — à faire avant la remise au client
- `npm ci && npm run build` (registre npm inaccessible ici) : le typage réel React/idb n'a pas été vérifié ; le build GitHub Actions le fera et échouera en cas d'erreur.
- Aucun test sur navigateur ni sur appareil réel : écrans de verrouillage / récupération, bandeau iOS, installation sur Android et iPhone, caméra, hors ligne, restauration d'une ancienne sauvegarde.
- Le code est un verrou d'interface : les photos restent non chiffrées dans IndexedDB.
