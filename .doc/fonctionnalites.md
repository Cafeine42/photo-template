# Fonctionnalités

L'application permet de créer des **templates photo** (une image de fond avec deux
zones de recadrage définies à la souris) puis de **générer en masse** des images
composées à partir d'un dossier de photos source, en incrustant chaque photo et un
numéro dans le template.

## 1. Liste des templates (`TemplateListView`)

Écran d'accueil. Affiche tous les `PhotoTemplate` enregistrés en base (nom, zone
numéro, chemin de l'image template) avec, pour chacun :
- **Modifier** → bascule vers le formulaire d'édition.
- **Supprimer** → demande confirmation (`confirm()`), puis suppression en base.

Deux actions globales : **Créer un nouveau Photo Template** et **Générer des images**.

## 2. Création / édition d'un template (formulaire dans `App.tsx`)

1. L'utilisateur donne un **nom**.
2. Il **téléverse une image** de template (upload de fichier) :
   - le fichier est envoyé en octets à la commande Rust `save_template_image`,
   - qui l'écrit sur disque dans `<app_data_dir>/template_images/<timestamp>_<nom>.<ext>`
     et renvoie le chemin absolu, stocké dans `formData.template_img`.
3. L'image s'affiche dans un `<canvas>` superposé, sur lequel l'utilisateur **dessine
   deux rectangles** au clic-glisser :
   - **Zone Photo (rouge)** — zone où sera incrustée la photo source (`crop_photo`).
   - **Zone Numéro (bleu)** — zone où sera écrit le numéro extrait du nom de fichier
     (`crop_number`).
   - Un bouton bascule le mode de dessin courant (`currentCropMode`).
4. À la soumission, les deux zones (sous forme `{x, y, width, height}`) sont
   sérialisées en JSON et envoyées à :
   - `add_photo_template` (création) ou
   - `update_photo_template` (édition, avec l'`id` existant).
5. Validation côté frontend : nom + image obligatoires, les deux zones doivent avoir
   une largeur/hauteur non nulle avant de pouvoir soumettre.

En édition, l'image existante est ré-affichée via le protocole `asset://localhost/...`
et les coordonnées JSON existantes sont re-parsées pour ré-afficher les rectangles.

## 3. Génération d'images (`TemplateGenerationView`)

1. L'utilisateur choisit un **template** dans une liste déroulante.
2. Il choisit un **dossier source** via un sélecteur de dossier natif
   (commande `select_image_folder`, basée sur `tauri-plugin-dialog`), et optionnellement
   un **dossier de sortie** personnalisé (`select_output_folder`) — sinon les résultats
   vont dans `<app_data_dir>/generated_images/`.
3. Dès qu'un dossier source est choisi, l'application l'analyse (`prepare_generation`) et
   affiche :
   - un **avertissement** si des images ont été trouvées dans des sous-dossiers (elles
     sont ignorées — seul le premier niveau du dossier est traité),
   - un **tableau fichier → numéro détecté**, modifiable : l'utilisateur peut corriger le
     numéro extrait automatiquement (première séquence de chiffres du nom de fichier)
     avant de lancer quoi que ce soit.
4. Un bouton **Aperçu avant génération** (`preview_generation_image`) compose le rendu de
   la première image du dossier avec le template et les numéros (corrigés ou non), et
   l'affiche directement dans l'interface — sans traiter tout le lot.
5. Il lance la génération complète (`generate_images_with_template`), qui pour **chaque
   image** du dossier (extensions `jpg, jpeg, png, bmp, gif, tiff`, non récursif) :
   - redimensionne l'image source pour tenir dans la zone "Photo" du template
     (ratio conservé, filtre Lanczos3),
   - utilise le numéro corrigé par l'utilisateur s'il y en a un, sinon l'extrait
     automatiquement du nom de fichier (repli sur l'index de traitement + 1 si aucun
     chiffre trouvé),
   - **compose** l'image : incruste la photo (centrée dans la zone rouge) sur le
     template, puis dessine le numéro en texte réel dans la zone "Numéro" (bleue),
   - sauvegarde le résultat en JPEG dans le dossier de sortie choisi (ou celui par défaut),
   - émet un évènement Tauri `generation-progress` (pourcentage) écouté par le
     frontend pour animer une barre de progression.
   Un bouton **Annuler** (`cancel_generation`) permet d'interrompre le traitement en
   cours ; les images déjà traitées restent sur le disque.
6. Une fois toutes les images traitées, elles sont regroupées dans une **archive ZIP**
   (`generated_images.zip`, dans le dossier de sortie), et l'exécution est enregistrée
   dans l'**historique des générations** (nom du template, nombre d'images, date, chemin
   de l'archive).
7. Un bouton **Télécharger l'archive** appelle `download_archive`, qui ouvre le
   dossier contenant le ZIP dans l'explorateur de fichiers du système
   (`tauri-plugin-opener`) — il ne télécharge pas au sens web, il révèle le fichier.

## 4. Historique des générations (`HistoryView`)

Accessible depuis la liste des templates via le bouton **Historique**. Liste toutes les
générations passées (nom du template, nombre d'images, date, chemin de l'archive) avec
un bouton pour rouvrir le dossier de résultat correspondant.

## Modèle de données

`PhotoTemplate` (table SQLite `photo_templates`) :

| Champ           | Type   | Description                                              |
|-----------------|--------|------------------------------------------------------------|
| `id`            | int    | clé primaire auto-incrémentée                              |
| `name`          | text   | nom du template                                            |
| `crop_photo`    | text   | JSON `{x,y,width,height}` — zone d'incrustation de la photo |
| `crop_number`   | text   | JSON `{x,y,width,height}` — zone d'affichage du numéro      |
| `template_img`  | text   | chemin absolu du fichier image du template sur le disque    |

`GenerationHistoryEntry` (table SQLite `generation_history`) :

| Champ           | Type   | Description                                              |
|-----------------|--------|------------------------------------------------------------|
| `id`            | int    | clé primaire auto-incrémentée                              |
| `template_name` | text   | nom du template utilisé (copié au moment de la génération)  |
| `archive_path`  | text   | chemin absolu de l'archive ZIP générée                      |
| `image_count`   | int    | nombre d'images traitées                                    |
| `created_at`    | text   | date/heure de la génération (ISO 8601, RFC 3339)             |
