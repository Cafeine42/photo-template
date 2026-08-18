# Roadmap — améliorations orientées utilisateur

Ce document liste les points d'amélioration identifiés du point de vue de
l'utilisateur final (pas de la dette technique interne, voir
[known-issues.md](./known-issues.md) pour ça), organisés en phases par valeur/effort.
Une phase n'a pas de date — c'est un ordre de priorité proposé.

---

## Phase 1 — Fiabiliser ce qui existe (quick wins) ✅ fait

Ce sont des irritants qui touchent l'usage quotidien, corrigeables sans refonte.

1. ✅ **Aperçu visuel des templates dans la liste** — vignette (`asset://`) affichée dans `TemplateListView`.
2. ✅ **Confirmation de suppression plus claire** — `ConfirmDialog` nommé ("Supprimer le template *X* ?").
3. ✅ **Mémoriser le dernier dossier source utilisé** — persisté en `localStorage`.
4. ✅ **Rendu du numéro en texte réel** — police DejaVu Sans embarquée, rendu via `imageproc`/`rusttype`.
5. ✅ **Messages d'erreur/succès plus visibles et non ambigus** — composant `Toast` global, icône + auto-disparition.

## Phase 2 — Donner confiance dans la génération en masse ✅ fait

Le risque principal : lancer un traitement sur tout un dossier sans pouvoir vérifier le
résultat avant, ni revenir en arrière si le rendu est mauvais.

6. ✅ **Aperçu avant génération** — bouton "Aperçu avant génération" (`preview_generation_image`) sur la première image du dossier.
7. ✅ **Vérification/correction manuelle du numéro extrait** — tableau fichier → numéro modifiable (`prepare_generation` + overrides envoyés à la génération).
8. ✅ **Support des sous-dossiers (avertissement)** — message d'avertissement si des images sont ignorées en sous-dossier (`skipped_subfolder_image_count`). L'inclusion effective des sous-dossiers reste à faire si le besoin se confirme.
9. ✅ **Bouton Annuler pendant la génération** — `cancel_generation` + `GenerationCancelFlag` côté Rust.
10. ✅ **Choix du dossier de sortie** — sélecteur de dossier de sortie optionnel (`select_output_folder`).
11. ✅ **Historique des générations** — table `generation_history` + vue `HistoryView`.

## Phase 3 — Édition de template plus précise et plus riche ✅ fait

Concerne l'écran de création/modification, initialement limité au dessin approximatif
à la souris.

12. ✅ **Ajustement fin des zones après tracé** — poignées de redimensionnement (8 points) et déplacement par glisser-déposer (`getHandleAt`, `resizeRect`), avec retour visuel du curseur.
13. ✅ **Saisie manuelle des coordonnées** — champs numériques x/y/largeur/hauteur pour la zone active.
14. ✅ **Zoom sur l'image de template** — contrôle 100–300% (`zoomLevel`), mapping souris→canvas corrigé pour rester précis à tout niveau de zoom.
15. ✅ **Personnalisation du texte du numéro** — couleur (sélecteur hexadécimal) et taille (slider, multiplicateur `fontScale`), rendues côté Rust.
16. ✅ **Remplacement d'image sans perdre les zones** — les zones ne sont plus réinitialisées à l'upload d'une nouvelle image.
17. ✅ **Duplication d'un template existant** — bouton "Dupliquer" dans la liste, pré-remplit le formulaire de création à partir d'un template existant.

## Phase 4 — Confort, organisation, montée en charge

Utile si le nombre de templates/générations grandit ou si plusieurs utilisateurs
partagent l'outil.

18. **Recherche / tri / catégories dans la liste des templates**
    Pas de souci à petite échelle, mais devient nécessaire dès qu'il y a plus
    qu'une poignée de templates.
19. **Choix du format et de la qualité de sortie**
    La sortie est toujours en JPEG, qualité par défaut. Permettre PNG (transparence)
    ou un curseur de qualité/compression selon l'usage (impression vs partage web).
20. **Onboarding / aide contextuelle**
    Rien n'explique à un nouvel utilisateur qu'il doit dessiner deux rectangles à la
    souris et dans quel ordre. Un court guide ou des info-bulles réduirait la courbe
    d'apprentissage.
21. **Redimensionnement de la fenêtre / mise en page adaptative**
    La fenêtre est fixée à 800×600. Sur un grand écran ou pour un gros template,
    l'espace de travail est à l'étroit ; rendre l'UI responsive améliorerait le
    confort d'édition.

---

## Comment prioriser

- **Phase 1** répond à des irritants visibles immédiatement par tout utilisateur,
  effort limité — bon point de départ.
- **Phase 2** réduit le risque d'un mauvais traitement en masse (le cœur de la
  proposition de valeur de l'app) — à traiter avant d'élargir les fonctionnalités
  d'édition.
- **Phase 3** transforme l'éditeur de zones en un vrai outil précis — investissement
  plus lourd (interactions canvas plus riches).
- **Phase 4** a du sens une fois l'usage confirmé et le volume de templates/données
  augmente.
