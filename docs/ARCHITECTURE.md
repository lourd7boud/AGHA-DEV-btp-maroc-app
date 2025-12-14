# 📖 Documentation de l'Architecture

## Vue d'ensemble

L'application de gestion de projets est construite selon une architecture **offline-first** moderne, garantissant un fonctionnement optimal même sans connexion Internet.

## Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTS MULTIPLATEFORME                  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   Web PWA    │   Electron   │   Android    │      iOS       │
│  (React +    │  (Windows    │ (React       │  (React        │
│   Vite)      │   Desktop)   │  Native)     │   Native)      │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬─────────┘
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                      │
         ┌────────────▼────────────┐
         │   COUCHE DE SERVICES    │
         ├─────────────────────────┤
         │  • API Service          │
         │  • Sync Manager         │
         │  • Auth Service         │
         └────────────┬────────────┘
                      │
       ┌──────────────┴──────────────┐
       │                             │
┌──────▼─────────┐          ┌────────▼────────┐
│  STOCKAGE      │          │   BACKEND API   │
│   LOCAL        │◄────────►│                 │
├────────────────┤          ├─────────────────┤
│ • IndexedDB    │          │ • Node.js       │
│   (Web)        │          │ • Express       │
│ • SQLite       │          │ • CouchDB       │
│   (Mobile/     │          │ • PostgreSQL    │
│   Desktop)     │          │   (alternative) │
│ • PouchDB      │          │                 │
│   (Sync)       │          │ • JWT Auth      │
└────────────────┘          └─────────────────┘
```

## Composants Principaux

### 1. Frontend Clients

#### Web (PWA)
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **State Management**: Zustand + React Query
- **Offline**: Service Worker + IndexedDB + Dexie
- **i18n**: i18next (FR, AR, EN)

#### Desktop (Electron)
- **Base**: Application Web embarquée
- **Platform**: Windows (extensible macOS/Linux)
- **Features**: Auto-update, notifications natives
- **Storage**: SQLite local

#### Mobile (React Native)
- **Platforms**: Android + iOS
- **Navigation**: React Navigation
- **Storage**: SQLite + AsyncStorage
- **Offline**: Sync automatique

### 2. Couche de Services

#### API Service
```typescript
// Gestion centralisée des appels API
class ApiService {
  - Intercepteurs pour authentification
  - Gestion automatique des erreurs
  - Retry logic
  - Cache des réponses
}
```

#### Sync Manager
```typescript
// Moteur de synchronisation offline-first
class SyncManager {
  - File d'opérations locale (ops-log)
  - Push: Envoi batch vers serveur
  - Pull: Récupération deltas distants
  - Conflict Resolution (LWW + UI)
  - Auto-sync sur reconnexion
}
```

#### Auth Service
```typescript
// Authentification et autorisation
class AuthService {
  - Login/Register online & offline
  - JWT token management
  - Refresh token automatique
  - Session persistence
}
```

### 3. Stockage Local

#### Web: IndexedDB + Dexie
```typescript
class ProjetDatabase extends Dexie {
  users: Table<User>
  projects: Table<Project>
  bordereaux: Table<Bordereau>
  metres: Table<Metre>
  decompts: Table<Decompt>
  photos: Table<Photo>
  pvs: Table<PV>
  attachments: Table<Attachment>
  syncOperations: Table<SyncOperation>
}
```

#### Mobile/Desktop: SQLite
- Même schéma que IndexedDB
- Performance optimale
- Support transactions

### 4. Backend API

#### Architecture
```
backend/
├── src/
│   ├── controllers/     # Logique métier
│   ├── routes/          # Endpoints API
│   ├── models/          # Types et schémas
│   ├── middleware/      # Auth, validation, erreurs
│   ├── services/        # Services métier
│   ├── sync/            # Moteur de sync serveur
│   ├── config/          # Configuration DB
│   └── utils/           # Utilitaires
```

#### Base de Données: CouchDB
**Pourquoi CouchDB?**
- Réplication bidirectionnelle native
- Gestion des conflits intégrée
- API REST simple
- Scalabilité horizontale
- Synchronisation avec PouchDB (client)

**Alternative: PostgreSQL**
- Performance pour requêtes complexes
- Transactions ACID
- Nécessite moteur de sync custom

## Flux de Données

### 1. Création d'une Entité (Offline)

```
User Action
    ↓
[Frontend] Création locale
    ↓
IndexedDB.add(entity)
    ↓
SyncOperations.add({
  type: 'CREATE',
  entity: 'project',
  data: {...},
  synced: false
})
    ↓
[UI Update] Immédiat
```

### 2. Synchronisation (Online)

```
[Connexion détectée]
    ↓
SyncManager.sync()
    ↓
┌─────────────────────────┐
│  PUSH (Client → Server) │
└─────────────────────────┘
    ↓
1. Récupérer ops non synchronisées
2. Batch upload vers API
3. Serveur applique & enregistre
4. Marquer ops comme synced
5. Gérer conflits éventuels
    ↓
┌─────────────────────────┐
│  PULL (Server → Client) │
└─────────────────────────┘
    ↓
1. Récupérer timestamp last sync
2. Fetch deltas depuis serveur
3. Appliquer ops localement
4. Update last sync timestamp
```

### 3. Gestion des Conflits

#### Stratégie: Last Write Wins (LWW)
```typescript
if (remoteTimestamp > localTimestamp) {
  // Conflit: remote plus récent
  if (fieldIsCritical) {
    // Afficher UI de résolution
    showConflictDialog(localData, remoteData);
  } else {
    // LWW: conserver remote
    applyRemoteData(remoteData);
  }
}
```

#### Résolution Manuelle
```typescript
enum ConflictResolution {
  LOCAL = 'local',    // Garder version locale
  REMOTE = 'remote',  // Garder version distante
  MERGE = 'merge'     // Fusionner (UI)
}
```

## Modules Métier

### 1. Projets
- **CRUD complet**
- **Génération automatique** de structure de dossiers
- **Timeline** et suivi des délais
- **Système d'alertes** (dépassements, échéances)

### 2. Bordereau
- Tableaux de prix
- Liaison dynamique avec Métré
- Calculs automatiques (quantité × prix)

### 3. Métré
- Saisie de mesures (L × l × h)
- Calculs automatiques
- Synchronisation avec Bordereau et Décompte

### 4. Décompte
- Génération basée sur Bordereau + Métré
- États: draft, submitted, validated, paid
- Export PDF

### 5. Photos
- Upload offline
- Géolocalisation
- Tags et description
- Sync différée

### 6. PV (Procès-Verbaux)
- Types: installation, réception, constat
- Participants et signatures
- Génération automatique

### 7. Attachments
- Catégories: facture, BP, plan, autre
- Association à d'autres entités
- Upload et sync automatique

## Sécurité

### Authentification
- **JWT** avec expiration
- **Refresh tokens** automatiques
- **Stockage sécurisé** (localStorage + encryption)

### Autorisation
- **Role-based access control** (RBAC)
- Vérification côté serveur
- Isolation des données par utilisateur

### Données
- **Validation** avec Zod (TypeScript)
- **Sanitization** des inputs
- **CORS** configuré
- **Helmet.js** pour headers de sécurité

## Performance

### Optimisations Frontend
- **Code splitting** (lazy loading)
- **Memoization** (React.memo, useMemo)
- **Virtual scrolling** pour grandes listes
- **Debouncing** des recherches

### Optimisations Backend
- **Indexation** des requêtes fréquentes
- **Pagination** des résultats
- **Cache** avec Redis (optionnel)
- **Compression** gzip

### Optimisations Réseau
- **Batch requests** pour sync
- **Delta sync** (envoyer seulement changements)
- **Retry logic** avec backoff exponentiel
- **Request queue** pour gérer offline

## Scalabilité

### Horizontal Scaling
- **CouchDB**: Réplication master-master
- **Load balancer** pour API
- **CDN** pour assets statiques

### Vertical Scaling
- **PostgreSQL** avec partitioning
- **Indexation avancée**
- **Connection pooling**

## Monitoring & Logging

### Backend
- **Winston** pour logs structurés
- Niveaux: error, warn, info, debug
- Rotation automatique des fichiers

### Frontend
- **Sentry** pour error tracking (optionnel)
- **Analytics** user behavior
- **Performance metrics**

## Déploiement

### Backend
```bash
# Docker Compose
docker-compose up -d

# Ou manuel
npm install
npm run build
npm start
```

### Frontend Web
```bash
npm run build
# Déployer dist/ sur Netlify/Vercel/serveur
```

### Desktop (Electron)
```bash
npm run build:win  # Windows .exe
npm run build:mac  # macOS .dmg
npm run build:linux # Linux AppImage
```

### Mobile
```bash
npm run build:apk     # Android APK
npm run build:bundle  # Android Bundle
npm run build:ios     # iOS (Xcode)
```

## Maintenance

### Mises à jour
- **Electron**: Auto-update avec electron-updater
- **Web**: Cache invalidation automatique
- **Mobile**: Google Play / App Store

### Backup
- **CouchDB**: Réplication continue
- **PostgreSQL**: pg_dump quotidien
- **Fichiers**: S3 ou stockage cloud

## Tests

### Backend
```bash
npm run test          # Jest
npm run test:coverage # Coverage report
```

### Frontend
```bash
npm run test          # Vitest
npm run test:e2e      # Playwright
```

---

**Version**: 1.0.0  
**Dernière mise à jour**: 29 Novembre 2025
