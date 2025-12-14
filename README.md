# 🏗️ Système de Gestion de Projets - Offline-First

Application complète de gestion de projets avec architecture offline-first, multiplateforme avec synchronisation intelligente.

## 📋 Table des matières

- [Caractéristiques](#caractéristiques)
- [Architecture](#architecture)
- [Technologies](#technologies)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Structure du projet](#structure-du-projet)
- [Modules](#modules)
- [Synchronisation](#synchronisation)
- [Déploiement](#déploiement)

## ✨ Caractéristiques

### Fonctionnalités Principales

- ✅ **Offline-First**: Fonctionne sans connexion Internet
- 🔄 **Synchronisation automatique**: Sync intelligente dès la reconnexion
- 🌍 **Multilingue**: Français, Arabe, Anglais
- 📱 **Multiplateforme**: Web (PWA), Windows (Electron), Android & iOS (React Native)
- 📊 **Dashboard complet**: Vue d'ensemble de tous les projets
- 🔐 **Authentification sécurisée**: Connexion online/offline
- 📁 **Gestion de fichiers**: Upload, organisation automatique, sync
- ⚡ **Performance optimale**: Architecture moderne et optimisée

### Modules Métier

- **Gestion de Projets**: CRUD complet avec validation
- **Bordereau**: Tableaux de prix, quantités, unités
- **Métré**: Saisie des mesures, calculs automatiques
- **Décompte**: Génération automatique basée sur bordereau/métré
- **Photos**: Upload offline avec sync différée
- **PV**: Génération de procès-verbaux
- **Attachements**: Gestion de documents liés

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND CLIENTS                      │
├──────────────┬──────────────┬──────────────┬────────────┤
│  React PWA   │   Electron   │ React Native │React Native│
│    (Web)     │  (Windows)   │  (Android)   │   (iOS)    │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬─────┘
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                      │
              ┌───────▼────────┐
              │  Service Layer │
              │   (Sync Core)  │
              └───────┬────────┘
                      │
       ┌──────────────┴──────────────┐
       │                             │
┌──────▼─────┐              ┌────────▼────────┐
│   Local    │              │    Backend      │
│   Store    │◄────────────►│   API Server    │
├────────────┤              ├─────────────────┤
│ IndexedDB  │              │   Node.js       │
│   SQLite   │              │   Express       │
│  PouchDB   │              │   CouchDB       │
└────────────┘              └─────────────────┘
```

### Architecture Offline-First

1. **Stockage Local**
   - Web: IndexedDB + PouchDB
   - Mobile/Desktop: SQLite
   - Service Worker pour caching

2. **File d'opérations (ops-log)**
   - Toutes les modifications locales enregistrées
   - Sync par lot (batch) lors de la reconnexion
   - Gestion des conflits automatique

3. **Synchronisation Intelligente**
   - Push: Envoi des opérations locales vers serveur
   - Pull: Récupération des deltas distants
   - Merge: Application automatique avec résolution de conflits

## 🛠️ Technologies

### Frontend
- **React 18** + TypeScript
- **React Native** (Mobile)
- **Electron** (Desktop)
- **PouchDB** / **Dexie.js** (Stockage local)
- **React Query** (État serveur)
- **Zustand** (État global)
- **i18next** (Internationalisation)
- **TailwindCSS** (Styles)
- **Vite** (Build tool)

### Backend
- **Node.js** + **Express** / **NestJS**
- **CouchDB** (Base de données avec réplication)
- **PostgreSQL** (Alternative)
- **JWT** (Authentification)
- **Multer** (Upload de fichiers)

### DevOps
- **Docker** + **Docker Compose**
- **GitHub Actions** (CI/CD)
- **ESLint** + **Prettier**
- **Jest** + **Testing Library**

## 📦 Installation

### Prérequis

- Node.js >= 18.x
- npm >= 9.x ou yarn
- Docker & Docker Compose (pour le backend)
- Android Studio (pour build Android)
- Xcode (pour build iOS, macOS uniquement)

### Installation Rapide

```bash
# Cloner le repository
git clone <repo-url>
cd projet-gestion

# Installer les dépendances
npm install

# Configuration
cp .env.example .env
# Éditer .env avec vos paramètres

# Démarrer le backend (Docker)
cd backend
docker-compose up -d

# Démarrer le frontend web
cd ../frontend-web
npm run dev

# Démarrer l'application Electron
cd ../frontend-electron
npm run dev

# Démarrer l'application mobile
cd ../frontend-mobile
npm run android
# ou
npm run ios
```

## 🚀 Utilisation

### Développement

```bash
# Web (PWA)
cd frontend-web
npm run dev          # Développement
npm run build        # Production
npm run preview      # Aperçu build

# Electron (Windows)
cd frontend-electron
npm run dev          # Développement
npm run build:win    # Build Windows

# Mobile (React Native)
cd frontend-mobile
npm run android      # Android dev
npm run ios          # iOS dev
npm run build:apk    # Build APK
```

### Tests

```bash
# Tests unitaires
npm run test

# Tests e2e
npm run test:e2e

# Coverage
npm run test:coverage
```

## 📂 Structure du projet

```
projet-gestion/
├── backend/                    # API Backend
│   ├── src/
│   │   ├── controllers/       # Contrôleurs API
│   │   ├── models/            # Modèles de données
│   │   ├── routes/            # Routes API
│   │   ├── services/          # Logique métier
│   │   ├── middleware/        # Middleware Express
│   │   ├── sync/              # Moteur de synchronisation
│   │   └── utils/             # Utilitaires
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
│
├── frontend-web/              # Application Web (PWA)
│   ├── src/
│   │   ├── components/        # Composants React
│   │   ├── pages/             # Pages/Routes
│   │   ├── hooks/             # Custom hooks
│   │   ├── services/          # Services API
│   │   ├── store/             # État global
│   │   ├── sync/              # Logique sync offline
│   │   ├── utils/             # Utilitaires
│   │   ├── i18n/              # Traductions
│   │   └── types/             # Types TypeScript
│   ├── public/
│   └── package.json
│
├── frontend-electron/         # Application Desktop
│   ├── src/
│   │   ├── main/              # Processus principal Electron
│   │   └── renderer/          # Processus de rendu (React)
│   └── package.json
│
├── frontend-mobile/           # Application Mobile
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── navigation/
│   │   └── services/
│   ├── android/
│   ├── ios/
│   └── package.json
│
├── shared/                    # Code partagé
│   ├── types/                 # Types TypeScript communs
│   ├── constants/             # Constantes
│   └── utils/                 # Utilitaires partagés
│
└── docs/                      # Documentation
    ├── API.md
    ├── ARCHITECTURE.md
    ├── SYNC.md
    └── DEPLOYMENT.md
```

## 📊 Modules

### 1. Gestion de Projets

Chaque projet contient:
- **Informations administratives**: Objet, Marché N°, Année, Dates, Montant, etc.
- **Délais & Suivi**: OSC, alertes, timeline
- **Structure de fichiers automatique**: `/Facture`, `/BP`, `/Photo`, `/Decompt`, etc.

### 2. Bordereau

- Tableaux de prix
- Quantités et unités
- Prix unitaires (MAD)
- Liens dynamiques avec Métré

### 3. Métré

- Saisie des mesures
- Calculs automatiques
- Synchronisation avec Bordereau, Décompte, Détail

### 4. Décompte

- Calculs basés sur Métré/Bordereau
- Génération PDF automatique

### 5. Photos

- Upload offline
- File locale
- Sync automatique différée

### 6. PV (Procès-Verbaux)

- Générateur automatique
- Modèles réutilisables

### 7. Attachements

- Upload de fichiers
- Association projets/tâches
- Sync automatique

## 🔄 Synchronisation

### Principe Offline-First

1. **Toutes les opérations fonctionnent offline**
2. **File d'opérations locale (ops-log)**
   ```typescript
   {
     id: "uuid",
     type: "CREATE" | "UPDATE" | "DELETE",
     entity: "project" | "bordereau" | "metre",
     data: {...},
     timestamp: number,
     synced: false
   }
   ```

3. **Stratégie de synchronisation**
   - Détection de connexion
   - Envoi par lot (batch)
   - Réception des deltas distants
   - Application locale automatique

4. **Gestion des conflits**
   - LWW (Last Write Wins) pour champs simples
   - Merge manuel (UI) pour champs critiques
   - Indicateurs UI: "Offline", "Synchronisation...", "Conflit détecté"

### Indicateurs UI

- 🔴 **Offline**: Pas de connexion
- 🟡 **Synchronisation...**: Sync en cours
- 🟢 **À jour**: Tout est synchronisé
- 🔶 **Conflits détectés**: Action requise

## 🌍 Internationalisation

Langues supportées:
- 🇫🇷 **Français** (par défaut)
- 🇸🇦 **Arabe** (avec support RTL)
- 🇬🇧 **Anglais**

Configuration: `src/i18n/`

## 💰 Monnaie

Monnaie officielle: **MAD** (Dirham Marocain)

## 🚢 Déploiement

### Web (PWA)
```bash
cd frontend-web
npm run build
# Déployer dist/ sur votre serveur
```

### Windows (Electron)
```bash
cd frontend-electron
npm run build:win
# Fichier .exe dans dist/
```

### Android
```bash
cd frontend-mobile
npm run build:apk
# APK dans android/app/build/outputs/
```

### iOS
```bash
cd frontend-mobile
npm run build:ios
# Via Xcode ou Fastlane
```

### Backend
```bash
cd backend
docker-compose up -d --build
```

## 📝 License

Propriétaire - Tous droits réservés

## 👥 Support

Pour toute question ou problème, contactez l'équipe de développement.

---

**Version**: 1.0.0  
**Dernière mise à jour**: 29 Novembre 2025
