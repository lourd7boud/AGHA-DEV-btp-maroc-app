# 📡 Documentation du Système de Synchronisation

## Vue d'ensemble

Le système de synchronisation est au cœur de l'architecture offline-first. Il garantit que les données sont toujours disponibles localement et synchronisées avec le serveur dès que possible.

## Principe Offline-First

```
┌─────────────────────────────────────┐
│  L'APPLICATION FONCTIONNE TOUJOURS  │
│         (Offline ou Online)         │
└─────────────────────────────────────┘
         │                   │
         │ OFFLINE           │ ONLINE
         ↓                   ↓
  ┌──────────────┐    ┌──────────────┐
  │ Stockage     │    │ Stockage     │
  │ Local        │    │ Local +      │
  │ uniquement   │    │ Serveur      │
  └──────────────┘    └──────────────┘
         │                   │
         └─────────┬─────────┘
                   ↓
         Expérience utilisateur
            identique
```

## Architecture de Synchronisation

### 1. File d'Opérations (Ops-Log)

Chaque modification locale est enregistrée comme une opération de synchronisation:

```typescript
interface SyncOperation {
  id: string;              // ID unique
  userId: string;          // Utilisateur
  deviceId: string;        // Appareil (évite boucles)
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'project' | 'bordereau' | 'metre' | ...;
  entityId: string;        // ID de l'entité modifiée
  data: any;               // Données complètes
  timestamp: number;       // Horodatage précis
  synced: boolean;         // État de synchronisation
  syncedAt?: number;       // Quand synchronisé
  conflicts?: ConflictData; // Conflits détectés
}
```

**Exemple de création d'opération:**

```typescript
// Utilisateur crée un projet offline
const project = {
  id: 'project:123',
  objet: 'Construction route',
  montant: 1000000,
  // ...
};

// 1. Sauvegarder localement
await db.projects.add(project);

// 2. Enregistrer l'opération de sync
await db.syncOperations.add({
  id: uuidv4(),
  userId: currentUser.id,
  deviceId: getDeviceId(),
  type: 'CREATE',
  entity: 'project',
  entityId: '123',
  data: project,
  timestamp: Date.now(),
  synced: false,
});

// 3. UI mise à jour immédiatement
// Pas d'attente de confirmation serveur!
```

### 2. Stratégies de Synchronisation

#### Push Sync (Client → Serveur)

```typescript
async function syncPush() {
  // 1. Récupérer toutes les opérations non synchronisées
  const pendingOps = await db.syncOperations
    .where({ synced: false })
    .sortBy('timestamp');

  if (pendingOps.length === 0) return;

  // 2. Grouper par lots (batch) pour performance
  const batches = chunk(pendingOps, BATCH_SIZE); // 50 ops/batch

  for (const batch of batches) {
    try {
      // 3. Envoyer au serveur
      const result = await apiService.syncPush(batch, deviceId);

      // 4. Traiter les résultats
      // Succès
      await markAsSynced(result.success);

      // Conflits
      if (result.conflicts.length > 0) {
        await handleConflicts(result.conflicts);
      }

      // Erreurs
      if (result.failed.length > 0) {
        await logSyncErrors(result.failed);
      }
    } catch (error) {
      // Réseau indisponible: réessayer plus tard
      console.error('Sync push failed:', error);
      break; // Arrêter et réessayer au prochain cycle
    }
  }
}
```

#### Pull Sync (Serveur → Client)

```typescript
async function syncPull() {
  // 1. Récupérer le timestamp du dernier sync
  const lastSync = getLastSyncTimestamp(); // Ex: 1701360000000

  try {
    // 2. Demander au serveur les changements depuis lastSync
    const result = await apiService.syncPull(lastSync, deviceId);

    // 3. Appliquer chaque opération distante localement
    for (const op of result.operations) {
      // Éviter d'appliquer nos propres ops
      if (op.deviceId === deviceId) continue;

      const table = db[`${op.entity}s`];

      switch (op.type) {
        case 'CREATE':
          await table.put(op.data);
          break;

        case 'UPDATE':
          const existing = await table.get(op.entityId);
          if (existing) {
            // Vérifier conflits potentiels
            if (existing.updatedAt > op.timestamp) {
              // Conflit: version locale plus récente!
              await detectConflict(existing, op.data);
            } else {
              // OK: appliquer mise à jour
              await table.update(op.entityId, op.data);
            }
          }
          break;

        case 'DELETE':
          await table.update(op.entityId, {
            deletedAt: new Date(op.timestamp),
          });
          break;
      }
    }

    // 4. Mettre à jour le timestamp de dernière sync
    setLastSyncTimestamp(result.serverTime);
  } catch (error) {
    console.error('Sync pull failed:', error);
    throw error;
  }
}
```

#### Full Sync (Complet)

```typescript
async function sync() {
  // Synchronisation complète: Push puis Pull
  await syncPush();  // Envoyer nos changements
  await syncPull();  // Récupérer changements distants
  await cleanOldOps(); // Nettoyer anciennes ops (30 jours)
}
```

### 3. Gestion des Conflits

Un conflit survient quand:
- Le même objet est modifié simultanément sur plusieurs appareils
- Les timestamps locaux et distants diffèrent

#### Types de Conflits

**1. Conflit Simple (Champs non-critiques)**
```typescript
// Stratégie: Last Write Wins (LWW)
if (remoteTimestamp > localTimestamp) {
  // La version distante gagne
  applyRemoteData(remoteData);
} else {
  // La version locale gagne
  keepLocalData();
}
```

**2. Conflit Critique (Champs importants)**
```typescript
// Stratégie: Résolution manuelle par l'utilisateur
const criticalFields = ['montant', 'status', 'quantite'];

if (hasCriticalConflict(localData, remoteData, criticalFields)) {
  // Afficher UI de résolution
  showConflictDialog({
    local: localData,
    remote: remoteData,
    onResolve: (resolution, mergedData) => {
      resolveConflict(conflictId, resolution, mergedData);
    },
  });
}
```

#### Interface de Résolution

```tsx
<ConflictDialog>
  <h3>Conflit détecté sur le projet "{project.objet}"</h3>
  
  <CompareView>
    <LocalVersion data={conflict.localData} />
    <RemoteVersion data={conflict.remoteData} />
  </CompareView>

  <Actions>
    <Button onClick={() => resolve('local')}>
      Garder ma version
    </Button>
    <Button onClick={() => resolve('remote')}>
      Garder la version distante
    </Button>
    <Button onClick={() => resolve('merge')}>
      Fusionner manuellement
    </Button>
  </Actions>
</ConflictDialog>
```

### 4. Déclencheurs de Synchronisation

#### Auto-Sync (Automatique)

```typescript
// 1. Détection de connexion
window.addEventListener('online', () => {
  setTimeout(() => sync(), 1000); // Délai de 1s
});

// 2. Sync périodique (5 minutes)
setInterval(() => {
  if (isOnline() && hasAuth()) {
    sync();
  }
}, 5 * 60 * 1000);

// 3. Sync au focus de l'app
window.addEventListener('focus', () => {
  if (isOnline()) {
    sync();
  }
});
```

#### Manual Sync (Utilisateur)

```tsx
<SyncButton onClick={() => sync()}>
  <RefreshIcon spinning={isSyncing} />
  Synchroniser maintenant
</SyncButton>
```

### 5. Indicateurs de Synchronisation

```tsx
<SyncIndicator>
  {/* Offline */}
  <Badge color="red">
    <WifiOffIcon /> Hors ligne
  </Badge>

  {/* Syncing */}
  <Badge color="blue">
    <LoaderIcon spinning /> Synchronisation...
  </Badge>

  {/* Synced */}
  <Badge color="green">
    <CheckIcon /> À jour
  </Badge>

  {/* Error */}
  <Badge color="red">
    <AlertIcon /> Erreur de sync
  </Badge>

  {/* Pending operations */}
  {pendingOps > 0 && (
    <Badge>
      {pendingOps} opérations en attente
    </Badge>
  )}
</SyncIndicator>
```

### 6. Optimisations

#### Delta Sync
Ne synchroniser que les champs modifiés:

```typescript
interface UpdateOperation {
  type: 'UPDATE';
  entityId: string;
  changes: {
    montant: { old: 100000, new: 150000 },
    status: { old: 'draft', new: 'active' },
  };
  timestamp: number;
}
```

#### Compression
Compresser les gros payloads:

```typescript
import { compress, decompress } from 'lz-string';

const compressed = compress(JSON.stringify(largeData));
await apiService.syncPush(compressed);
```

#### Retry avec Backoff Exponentiel

```typescript
async function syncWithRetry(maxRetries = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await sync();
      return; // Succès
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;

      // Backoff: 1s, 2s, 4s, 8s...
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
    }
  }
}
```

### 7. Upload de Fichiers

Les fichiers (photos, attachments) suivent un flux spécial:

```typescript
async function uploadPhoto(file: File, projectId: string) {
  // 1. Sauvegarder localement en blob/base64
  const localBlob = await fileToBlob(file);
  const photoId = uuidv4();

  const photo = {
    id: `photo:${photoId}`,
    projectId,
    fileName: file.name,
    localPath: localBlob, // Blob URI ou base64
    syncStatus: 'pending',
    createdAt: new Date(),
  };

  await db.photos.add(photo);

  // 2. Enregistrer opération de sync
  await logSyncOperation('CREATE', 'photo', photoId, photo, userId);

  // 3. Si online, upload immédiatement
  if (isOnline()) {
    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('projectId', projectId);

      const result = await apiService.uploadPhoto(formData);

      // Mettre à jour avec le chemin distant
      await db.photos.update(photo.id, {
        filePath: result.data.filePath,
        syncStatus: 'synced',
        localPath: undefined, // Libérer espace
      });
    } catch (error) {
      // Échec: garder en pending
      console.error('Upload failed, will retry:', error);
    }
  }

  // Sinon, sera uploadé au prochain sync
}
```

### 8. Gestion d'Erreurs

```typescript
enum SyncErrorType {
  NETWORK = 'NETWORK',           // Pas de connexion
  AUTH = 'AUTH',                 // Token invalide
  CONFLICT = 'CONFLICT',         // Conflit de données
  SERVER = 'SERVER',             // Erreur serveur (500)
  VALIDATION = 'VALIDATION',     // Données invalides
}

async function handleSyncError(error: SyncError) {
  switch (error.type) {
    case SyncErrorType.NETWORK:
      // Réessayer au prochain cycle
      scheduleRetry();
      break;

    case SyncErrorType.AUTH:
      // Token expiré: relogin
      await refreshToken();
      break;

    case SyncErrorType.CONFLICT:
      // Afficher UI de résolution
      showConflictDialog(error.data);
      break;

    case SyncErrorType.SERVER:
      // Logger et notifier admin
      logError(error);
      break;

    case SyncErrorType.VALIDATION:
      // Données corrompues: ne pas synchroniser
      markOperationAsFailed(error.operationId);
      break;
  }
}
```

## Flux Complet d'une Opération

```
USER ACTION (Créer un projet)
    ↓
┌──────────────────────────────┐
│  1. ENREGISTREMENT LOCAL     │
│  db.projects.add(project)    │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  2. OPS-LOG                  │
│  db.syncOperations.add({     │
│    type: 'CREATE',           │
│    entity: 'project',        │
│    data: project,            │
│    synced: false             │
│  })                          │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  3. UI UPDATE                │
│  Projet visible immédiatement│
└──────────────┬───────────────┘
               ↓
         [CONNEXION?]
               │
     Offline   │   Online
        ↓      │      ↓
    [FIN]      │   ┌─────────────────┐
               │   │  4. SYNC PUSH   │
               │   │  Envoyer au     │
               │   │  serveur        │
               │   └────────┬────────┘
               │            ↓
               │   ┌─────────────────┐
               │   │  5. SERVEUR     │
               │   │  Valide & stocke│
               │   └────────┬────────┘
               │            ↓
               │   ┌─────────────────┐
               │   │  6. CONFIRMATION│
               │   │  Mark as synced │
               │   └────────┬────────┘
               │            ↓
               └───────►[FIN]
```

## Meilleures Pratiques

### ✅ À FAIRE

1. **Toujours enregistrer localement d'abord**
2. **Ne jamais bloquer l'UI** en attendant la sync
3. **Utiliser des timestamps précis** (milliseconde)
4. **Détecter et gérer les conflits** de manière appropriée
5. **Nettoyer régulièrement** les anciennes opérations
6. **Tester en mode offline** fréquemment

### ❌ À ÉVITER

1. **Ne pas attendre le serveur** pour afficher les changements
2. **Ne pas ignorer les conflits** critiques
3. **Ne pas synchroniser** trop fréquemment (battery drain)
4. **Ne pas stocker** indéfiniment les ops synchronisées
5. **Ne pas uploader** de gros fichiers sans compression

---

**Version**: 1.0.0  
**Dernière mise à jour**: 29 Novembre 2025
