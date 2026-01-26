# BTP Desktop

Application de bureau pour la gestion des projets BTP.

## 🎯 Architecture

Cette application est un **wrapper Electron** autour de l'application web.

```
frontend-web/src/  →  npm run build  →  dist/  →  Electron loads it
```

### Règles strictes:
- ❌ **Aucune logique métier** dans Electron
- ❌ **Aucun fork** du code web
- ✅ Electron = **Wrapper uniquement**
- ✅ **Single Source of Truth** = frontend-web

## 📁 Structure

```
btp-app-desktop/
├── src/
│   ├── main/           # Main process (window, IPC, services)
│   └── preload/        # Bridge between main and renderer
├── renderer/           # ⚠️ Auto-generated from frontend-web/dist
├── resources/          # Icons and assets
├── scripts/            # Build scripts
└── release/            # Built installers (git-ignored)
```

## 🚀 Développement

### Prérequis

1. Builder le frontend web d'abord:
```bash
cd ../frontend-web
npm run build
```

2. Installer les dépendances:
```bash
npm install
```

### Lancer en développement

```bash
npm run dev
```

### Construire les installateurs

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# Tous
npm run build:all
```

## 📦 Releases

Les releases sont automatiquement créées via GitHub Actions quand un tag `v*` est poussé.

```bash
# Créer une release
git tag v1.2.0
git push origin v1.2.0
```

## 🔄 Mise à jour

L'application vérifie automatiquement les mises à jour depuis GitHub Releases.

## 📋 Fonctionnalités Desktop-only

- 💾 Sauvegarde de fichiers locaux (PDF, Excel)
- 📂 Ouverture de fichiers dans l'application par défaut
- 🔔 Icône système (tray)
- 🔄 Mises à jour automatiques
- 🌐 Détection de connexion réseau

## 📄 License

MIT © MarocInfra
