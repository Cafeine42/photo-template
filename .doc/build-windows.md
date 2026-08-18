# Build Windows (distribution client)

Ce document explique comment produire un installeur Windows (`.msi` et/ou `.exe`
NSIS) de l'application, pour la distribuer à des clients.

## Pourquoi builder sur Windows (et pas en cross-compilation)

L'application embarque des dépendances natives (Diesel/SQLite, `image`, WebView2)
compilées pour la cible. Tauri **recommande officiellement** de builder sur le système
d'exploitation cible plutôt que de cross-compiler depuis Linux/macOS : la
cross-compilation vers `x86_64-pc-windows-msvc` ou `-gnu` est fragile pour ce genre de
dépendances et n'est pas un chemin de distribution fiable. Deux options viables :

1. **Builder directement sur une machine Windows** (ce document).
2. **CI GitHub Actions avec un runner `windows-latest`** (via `tauri-action`) — plus
   pratique pour des builds répétés à chaque nouvelle version, non couvert ici mais
   recommandable si les builds deviennent fréquents.

## Prérequis (une seule fois par machine Windows)

| Outil | Pourquoi | Où l'obtenir |
|---|---|---|
| **Rust** (toolchain MSVC) | Compile le backend (`src-tauri`) | [rustup.rs](https://rustup.rs) → `rustup-init.exe`, garder la toolchain par défaut proposée (`stable-x86_64-pc-windows-msvc`) |
| **Microsoft C++ Build Tools** | Requis par la toolchain MSVC pour compiler les dépendances natives (Diesel/SQLite, `image`) | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) → cocher le workload **"Desktop development with C++"** |
| **WebView2 Runtime** | Moteur de rendu de la fenêtre Tauri | Généralement déjà installé sur Windows 10/11 à jour (Evergreen) ; sinon [le télécharger ici](https://developer.microsoft.com/microsoft-edge/webview2/) |
| **Node.js** (LTS) + **Yarn** | Build du frontend Vite/React | [nodejs.org](https://nodejs.org), puis `npm install -g yarn` |
| **Git** | Récupérer le code | [git-scm.com](https://git-scm.com) |

Vérifier l'installation :
```powershell
rustc --version
cargo --version
node --version
yarn --version
```

## Étapes de build

```powershell
git clone git@github.com:Cafeine42/photo-template.git
cd photo-template
yarn install
yarn tauri build
```

- `yarn install` récupère les dépendances frontend (React/Vite).
- `yarn tauri build` :
  1. build le frontend (`tsc && vite build`) dans `dist/`,
  2. compile le backend Rust en profil `release` (optimisé — plus long que le mode dev,
     plusieurs minutes la première fois le temps de compiler toutes les dépendances),
  3. package le tout dans un ou plusieurs installeurs Windows.

## Résultat

D'après `tauri.conf.json` (`bundle.targets: "all"`), les installeurs générés sont dans :

```
src-tauri\target\release\bundle\msi\photo-template_<version>_x64_en-US.msi   (WiX)
src-tauri\target\release\bundle\nsis\photo-template_<version>_x64-setup.exe  (NSIS)
```

L'un ou l'autre suffit à distribuer l'application — le `.msi` est généralement préféré
en environnement professionnel/entreprise, le `.exe` NSIS est plus simple pour une
installation grand public.

## Points d'attention spécifiques à Windows

- **Emplacement de la base de données** : `establish_connection()` (`src-tauri/src/lib.rs`)
  utilise `app_handle.path().app_data_dir()`, qui correspond sur Windows à
  `%APPDATA%\com.photo-template.app\` (dossier utilisateur, toujours accessible en
  écriture). Ce point a été corrigé spécifiquement parce qu'un chemin relatif aurait
  pointé vers le dossier d'installation (`C:\Program Files\...` en install per-machine),
  non accessible en écriture pour un utilisateur standard — voir
  [known-issues.md](./known-issues.md).
- **Signature de code** : par défaut, l'installeur n'est **pas signé**. Windows
  SmartScreen affichera un avertissement ("Éditeur inconnu") à l'installation. Pour
  l'éviter, il faut un certificat de signature de code (payant, via une autorité comme
  DigiCert/Sectigo) et configurer `bundle.windows.certificateThumbprint` (ou signer après
  coup avec `signtool`). Non requis pour tester, recommandé avant une diffusion large.
- **Antivirus / SmartScreen** : un exécutable non signé et peu téléchargé peut être
  temporairement bloqué ou marqué comme suspect par Windows Defender à la première
  diffusion. C'est normal pour une petite app non signée ; ça s'atténue avec la
  réputation (téléchargements) ou disparaît avec une signature de code.
- **Mise à jour d'une version installée** : relancer `yarn tauri build` avec un numéro
  de version incrémenté dans `src-tauri/tauri.conf.json` (`version`) et
  `src-tauri/Cargo.toml` avant de générer un nouvel installeur, sinon l'installeur
  Windows peut ne pas proposer de mise à jour propre par-dessus une version existante.

## Build et test en local sans distribuer (rappel)

Pour tester rapidement pendant le développement, sans passer par un installeur :
```powershell
yarn tauri dev
```
Lance l'app avec rechargement à chaud du frontend — pas besoin de rebuild complet à
chaque changement de code React/TS.
