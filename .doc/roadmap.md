# Roadmap — améliorations orientées utilisateur

Ce document liste les points d'amélioration identifiés du point de vue de
l'utilisateur final (pas de la dette technique interne, voir
[known-issues.md](./known-issues.md) pour ça), organisés en phases par valeur/effort.
Une phase n'a pas de date — c'est un ordre de priorité proposé.

---

## Phase 1 — Fiabiliser ce qui existe (quick wins)

Ce sont des irritants qui touchent l'usage quotidien, corrigeables sans refonte.

1. **Aperçu visuel des templates dans la liste**
   Aujourd'hui la liste affiche le chemin brut du fichier image (`template_img`) au
   lieu d'une vignette. Un utilisateur ne peut pas reconnaître un template au premier
   coup d'œil.
2. **Confirmation de suppression plus claire**
   La suppression utilise une boîte `confirm()` du navigateur (générique, pas de nom
   du template rappelé). Un vrai dialogue de confirmation ("Supprimer le template
   *Diplôme 2026* ?") réduit le risque d'erreur.
3. **Mémoriser le dernier dossier source utilisé**
   Il faut rebrowser le dossier d'images à chaque génération, même en relançant sur le
   même lot. Pré-remplir avec le dernier dossier choisi ferait gagner du temps.
4. **Rendu du numéro en texte réel**
   La zone bleue "Numéro" n'affiche actuellement qu'un rectangle noir semi-transparent
   à la place du texte (voir known-issues.md). C'est la fonctionnalité la plus visible
   qui ne fait pas ce qu'elle promet à l'écran — à traiter en priorité si le produit
   est destiné à un usage réel.
5. **Messages d'erreur/succès plus visibles et non ambigus**
   Les messages (ex. "Erreur: ...") sont de simples paragraphes de texte, sans
   auto-disparition cohérente ni distinction visuelle forte (icône, position fixe).

## Phase 2 — Donner confiance dans la génération en masse

Le risque principal aujourd'hui : lancer un traitement sur tout un dossier sans
pouvoir vérifier le résultat avant, ni revenir en arrière si le rendu est mauvais.

6. **Aperçu avant génération**
   Afficher le rendu composé d'une (ou quelques) photo(s) du dossier avant de lancer
   le traitement complet, pour valider le cadrage sans attendre la fin du batch.
7. **Vérification/correction manuelle du numéro extrait**
   Le numéro est deviné automatiquement à partir du nom de fichier (premier nombre
   trouvé). Proposer un tableau "fichier → numéro détecté" modifiable avant de lancer
   la génération éviterait les erreurs silencieuses (mauvais chiffre extrait).
8. **Support des sous-dossiers**
   Les photos rangées dans des sous-dossiers sont actuellement ignorées sans
   avertissement. Soit les inclure (option "inclure les sous-dossiers"), soit avertir
   clairement combien de fichiers ont été ignorés et pourquoi.
9. **Bouton Annuler pendant la génération**
   Pas de moyen d'interrompre un traitement en cours (seulement une barre de
   progression passive). Utile pour un gros lot où l'on se rend compte d'une erreur.
10. **Choix du dossier de sortie**
    L'archive et les images générées sont toujours écrites dans un dossier interne à
    l'application. Permettre de choisir où exporter (ou au moins l'indiquer clairement
    avant de lancer) évite d'avoir à chercher le résultat après coup.
11. **Historique des générations**
    Une fois l'app fermée, l'utilisateur perd la trace du chemin de l'archive
    générée. Un historique simple ("dernières générations", avec lien vers le
    dossier) éviterait de perdre ce résultat.

## Phase 3 — Édition de template plus précise et plus riche

Concerne l'écran de création/modification, actuellement limité au dessin approximatif
à la souris.

12. **Ajustement fin des zones après tracé**
    Une fois une zone dessinée, impossible de la redimensionner ou déplacer : il faut
    tout redessiner depuis zéro pour un ajustement d'un pixel. Ajouter des poignées de
    redimensionnement/déplacement (comme un éditeur d'image classique) change
    beaucoup l'expérience.
13. **Saisie manuelle des coordonnées**
    Compléter le dessin à la souris par des champs numériques (x, y, largeur,
    hauteur) pour un positionnement au pixel près, utile pour aligner plusieurs
    templates entre eux.
14. **Zoom sur l'image de template**
    Pour les templates en haute résolution ou les petites zones, dessiner précisément
    sur une image compressée à la taille de l'écran est difficile. Un zoom/pan
    faciliterait le travail de précision.
15. **Personnalisation du texte du numéro**
    Une fois le rendu du texte implémenté (Phase 1), permettre de choisir police,
    taille, couleur, alignement — pas juste une valeur codée en dur.
16. **Remplacement d'image sans perdre les zones**
    Changer l'image du template réinitialise actuellement les deux zones de
    recadrage. Si la nouvelle image a les mêmes dimensions/mise en page (ex. légère
    retouche), on devrait pouvoir garder les zones déjà définies.
17. **Duplication d'un template existant**
    Pour créer une variante d'un template (ex. même mise en page, texte différent),
    partir d'une copie plutôt que de recommencer le dessin des zones à zéro.

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
