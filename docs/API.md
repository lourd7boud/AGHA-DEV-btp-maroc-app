# 📚 Documentation API REST

## URL de Base

- **Développement**: `http://localhost:5000/api`
- **Production**: `https://votre-domaine.com/api`

## Authentification

Toutes les requêtes (sauf `/auth/register` et `/auth/login`) nécessitent un token JWT dans le header:

```http
Authorization: Bearer <votre_token_jwt>
```

## Endpoints

### 🔐 Authentification

#### Inscription

```http
POST /auth/register
Content-Type: application/json

{
  "nom": "Doe",
  "prenom": "John",
  "email": "john.doe@example.com",
  "password": "MotDePasse123!",
  "role": "user"
}
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user:123",
      "nom": "Doe",
      "prenom": "John",
      "email": "john.doe@example.com",
      "role": "user",
      "createdAt": "2025-11-29T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "User registered successfully"
}
```

#### Connexion

```http
POST /auth/login
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "MotDePasse123!"
}
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user:123",
      "nom": "Doe",
      "prenom": "John",
      "email": "john.doe@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Profil Utilisateur

```http
GET /auth/me
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "id": "user:123",
    "nom": "Doe",
    "prenom": "John",
    "email": "john.doe@example.com",
    "role": "user",
    "createdAt": "2025-11-29T10:00:00.000Z"
  }
}
```

#### Rafraîchir le Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 📁 Projets

#### Lister les Projets

```http
GET /projects
Authorization: Bearer <token>
Query Parameters:
  - page=1 (défaut: 1)
  - limit=20 (défaut: 20)
  - search=<terme> (optionnel)
  - status=<active|completed|archived> (optionnel)
  - year=<2025> (optionnel)
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "project:456",
      "objet": "Construction de route nationale",
      "marche": "MRC-2025-001",
      "affaire": "AFF-2025-001",
      "moa": "Ministère de l'Équipement",
      "maitre": "SOGETRAM",
      "lieu": "Rabat-Salé-Kénitra",
      "montant": 15000000.50,
      "delaiMois": 24,
      "dateDebut": "2025-01-15",
      "dateFin": "2027-01-15",
      "status": "active",
      "folderPath": "/2025/MRC-2025-001-AFF-2025-001/",
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z",
      "updatedAt": "2025-11-29T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "totalItems": 52
  }
}
```

#### Créer un Projet

```http
POST /projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "objet": "Construction de route nationale",
  "marche": "MRC-2025-001",
  "affaire": "AFF-2025-001",
  "moa": "Ministère de l'Équipement",
  "maitre": "SOGETRAM",
  "lieu": "Rabat-Salé-Kénitra",
  "montant": 15000000.50,
  "delaiMois": 24,
  "dateDebut": "2025-01-15",
  "dateFin": "2027-01-15",
  "status": "active"
}
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "project:456",
    "objet": "Construction de route nationale",
    "marche": "MRC-2025-001",
    "affaire": "AFF-2025-001",
    "moa": "Ministère de l'Équipement",
    "maitre": "SOGETRAM",
    "lieu": "Rabat-Salé-Kénitra",
    "montant": 15000000.50,
    "delaiMois": 24,
    "dateDebut": "2025-01-15",
    "dateFin": "2027-01-15",
    "status": "active",
    "folderPath": "/2025/MRC-2025-001-AFF-2025-001/",
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z",
    "updatedAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "Project created successfully"
}
```

#### Obtenir un Projet

```http
GET /projects/:id
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "id": "project:456",
    "objet": "Construction de route nationale",
    "marche": "MRC-2025-001",
    "affaire": "AFF-2025-001",
    "moa": "Ministère de l'Équipement",
    "maitre": "SOGETRAM",
    "lieu": "Rabat-Salé-Kénitra",
    "montant": 15000000.50,
    "delaiMois": 24,
    "dateDebut": "2025-01-15",
    "dateFin": "2027-01-15",
    "status": "active",
    "folderPath": "/2025/MRC-2025-001-AFF-2025-001/",
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z",
    "updatedAt": "2025-11-29T10:00:00.000Z"
  }
}
```

#### Mettre à jour un Projet

```http
PUT /projects/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed",
  "montant": 16000000.00
}
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "id": "project:456",
    "status": "completed",
    "montant": 16000000.00,
    "updatedAt": "2025-11-29T11:00:00.000Z"
  },
  "message": "Project updated successfully"
}
```

#### Supprimer un Projet (Soft Delete)

```http
DELETE /projects/:id
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

---

### 📊 Bordereau

#### Lister les Bordereaux d'un Projet

```http
GET /bordereau?projectId=project:456
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "bordereau:789",
      "projectId": "project:456",
      "numero": "BP-001",
      "designation": "Terrassement général",
      "unite": "m3",
      "prixUnitaire": 250.00,
      "quantitePrevue": 1000,
      "montantTotal": 250000.00,
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z",
      "updatedAt": "2025-11-29T10:00:00.000Z"
    }
  ]
}
```

#### Créer un Bordereau

```http
POST /bordereau
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project:456",
  "numero": "BP-001",
  "designation": "Terrassement général",
  "unite": "m3",
  "prixUnitaire": 250.00,
  "quantitePrevue": 1000
}
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "bordereau:789",
    "projectId": "project:456",
    "numero": "BP-001",
    "designation": "Terrassement général",
    "unite": "m3",
    "prixUnitaire": 250.00,
    "quantitePrevue": 1000,
    "montantTotal": 250000.00,
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z",
    "updatedAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "Bordereau created successfully"
}
```

---

### 📏 Métré

#### Lister les Métrés

```http
GET /metre?bordereauId=bordereau:789
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "metre:101",
      "projectId": "project:456",
      "bordereauId": "bordereau:789",
      "numero": "M-001",
      "description": "Terrassement zone A",
      "longueur": 50.5,
      "largeur": 20.0,
      "hauteur": 2.5,
      "quantite": 2525.0,
      "unite": "m3",
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z",
      "updatedAt": "2025-11-29T10:00:00.000Z"
    }
  ]
}
```

#### Créer un Métré

```http
POST /metre
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project:456",
  "bordereauId": "bordereau:789",
  "numero": "M-001",
  "description": "Terrassement zone A",
  "longueur": 50.5,
  "largeur": 20.0,
  "hauteur": 2.5,
  "unite": "m3"
}
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "metre:101",
    "projectId": "project:456",
    "bordereauId": "bordereau:789",
    "numero": "M-001",
    "description": "Terrassement zone A",
    "longueur": 50.5,
    "largeur": 20.0,
    "hauteur": 2.5,
    "quantite": 2525.0,
    "unite": "m3",
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z",
    "updatedAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "Metre created successfully"
}
```

---

### 💰 Décompte

#### Lister les Décomptes

```http
GET /decompt?projectId=project:456
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "decompt:202",
      "projectId": "project:456",
      "numero": "DC-001",
      "periode": "2025-11",
      "dateDebut": "2025-11-01",
      "dateFin": "2025-11-30",
      "montantTotal": 125000.00,
      "status": "draft",
      "items": [
        {
          "bordereauId": "bordereau:789",
          "quantiteRealisee": 500,
          "montant": 125000.00
        }
      ],
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z",
      "updatedAt": "2025-11-29T10:00:00.000Z"
    }
  ]
}
```

#### Créer un Décompte

```http
POST /decompt
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project:456",
  "numero": "DC-001",
  "periode": "2025-11",
  "dateDebut": "2025-11-01",
  "dateFin": "2025-11-30",
  "items": [
    {
      "bordereauId": "bordereau:789",
      "quantiteRealisee": 500
    }
  ]
}
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "decompt:202",
    "projectId": "project:456",
    "numero": "DC-001",
    "periode": "2025-11",
    "dateDebut": "2025-11-01",
    "dateFin": "2025-11-30",
    "montantTotal": 125000.00,
    "status": "draft",
    "items": [
      {
        "bordereauId": "bordereau:789",
        "quantiteRealisee": 500,
        "montant": 125000.00
      }
    ],
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z",
    "updatedAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "Decompt created successfully"
}
```

#### Générer PDF d'un Décompte

```http
GET /decompt/:id/pdf
Authorization: Bearer <token>
```

**Réponse 200:**
```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="decompt-DC-001.pdf"

[Binary PDF data]
```

---

### 📷 Photos

#### Lister les Photos

```http
GET /photos?projectId=project:456
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "photo:303",
      "projectId": "project:456",
      "fileName": "chantier-zone-a.jpg",
      "filePath": "/uploads/2025/MRC-2025-001-AFF-2025-001/photos/chantier-zone-a.jpg",
      "description": "État des lieux zone A",
      "tags": ["terrassement", "zone-a"],
      "latitude": 33.9716,
      "longitude": -6.8498,
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z"
    }
  ]
}
```

#### Uploader une Photo

```http
POST /photos
Authorization: Bearer <token>
Content-Type: multipart/form-data

projectId: project:456
description: État des lieux zone A
tags: terrassement,zone-a
latitude: 33.9716
longitude: -6.8498
photo: [binary file]
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "photo:303",
    "projectId": "project:456",
    "fileName": "chantier-zone-a.jpg",
    "filePath": "/uploads/2025/MRC-2025-001-AFF-2025-001/photos/chantier-zone-a.jpg",
    "description": "État des lieux zone A",
    "tags": ["terrassement", "zone-a"],
    "latitude": 33.9716,
    "longitude": -6.8498,
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "Photo uploaded successfully"
}
```

---

### 📝 PV (Procès-Verbaux)

#### Lister les PV

```http
GET /pv?projectId=project:456
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pv:404",
      "projectId": "project:456",
      "numero": "PV-001",
      "type": "installation",
      "objet": "Installation de chantier",
      "date": "2025-01-15",
      "participants": [
        {
          "nom": "Dupont",
          "prenom": "Pierre",
          "fonction": "Ingénieur chef",
          "organisme": "MOA"
        }
      ],
      "contenu": "Constat de l'installation du chantier...",
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z"
    }
  ]
}
```

#### Créer un PV

```http
POST /pv
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "project:456",
  "numero": "PV-001",
  "type": "installation",
  "objet": "Installation de chantier",
  "date": "2025-01-15",
  "participants": [
    {
      "nom": "Dupont",
      "prenom": "Pierre",
      "fonction": "Ingénieur chef",
      "organisme": "MOA"
    }
  ],
  "contenu": "Constat de l'installation du chantier..."
}
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "pv:404",
    "projectId": "project:456",
    "numero": "PV-001",
    "type": "installation",
    "objet": "Installation de chantier",
    "date": "2025-01-15",
    "participants": [
      {
        "nom": "Dupont",
        "prenom": "Pierre",
        "fonction": "Ingénieur chef",
        "organisme": "MOA"
      }
    ],
    "contenu": "Constat de l'installation du chantier...",
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "PV created successfully"
}
```

---

### 📎 Attachments

#### Lister les Pièces Jointes

```http
GET /attachments?projectId=project:456
Authorization: Bearer <token>
```

**Réponse 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "attachment:505",
      "projectId": "project:456",
      "fileName": "facture-001.pdf",
      "filePath": "/uploads/2025/MRC-2025-001-AFF-2025-001/attachments/facture-001.pdf",
      "category": "facture",
      "description": "Facture matériaux mois novembre",
      "relatedEntity": "decompt:202",
      "createdBy": "user:123",
      "createdAt": "2025-11-29T10:00:00.000Z"
    }
  ]
}
```

#### Uploader une Pièce Jointe

```http
POST /attachments
Authorization: Bearer <token>
Content-Type: multipart/form-data

projectId: project:456
category: facture
description: Facture matériaux mois novembre
relatedEntity: decompt:202
file: [binary file]
```

**Réponse 201:**
```json
{
  "success": true,
  "data": {
    "id": "attachment:505",
    "projectId": "project:456",
    "fileName": "facture-001.pdf",
    "filePath": "/uploads/2025/MRC-2025-001-AFF-2025-001/attachments/facture-001.pdf",
    "category": "facture",
    "description": "Facture matériaux mois novembre",
    "relatedEntity": "decompt:202",
    "createdBy": "user:123",
    "createdAt": "2025-11-29T10:00:00.000Z"
  },
  "message": "Attachment uploaded successfully"
}
```

---

### 🔄 Synchronisation

#### Push (Client → Serveur)

```http
POST /sync/push
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "device-abc-123",
  "operations": [
    {
      "id": "op-1",
      "type": "CREATE",
      "entity": "project",
      "entityId": "project:456",
      "data": { /* données du projet */ },
      "timestamp": 1701360000000
    },
    {
      "id": "op-2",
      "type": "UPDATE",
      "entity": "bordereau",
      "entityId": "bordereau:789",
      "data": { /* données modifiées */ },
      "timestamp": 1701360001000
    }
  ]
}
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "success": ["op-1", "op-2"],
    "conflicts": [],
    "failed": []
  },
  "message": "Operations synced successfully"
}
```

**Réponse avec conflits:**
```json
{
  "success": true,
  "data": {
    "success": ["op-1"],
    "conflicts": [
      {
        "operationId": "op-2",
        "entityId": "bordereau:789",
        "localData": { /* données locales */ },
        "remoteData": { /* données serveur */ },
        "conflictFields": ["prixUnitaire", "quantitePrevue"]
      }
    ],
    "failed": []
  }
}
```

#### Pull (Serveur → Client)

```http
POST /sync/pull
Authorization: Bearer <token>
Content-Type: application/json

{
  "deviceId": "device-abc-123",
  "lastSync": 1701360000000
}
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "operations": [
      {
        "id": "remote-op-1",
        "type": "UPDATE",
        "entity": "project",
        "entityId": "project:456",
        "data": { /* données mises à jour */ },
        "timestamp": 1701360500000,
        "deviceId": "device-xyz-789"
      }
    ],
    "serverTime": 1701360600000
  }
}
```

#### Résoudre un Conflit

```http
POST /sync/conflict/resolve
Authorization: Bearer <token>
Content-Type: application/json

{
  "conflictId": "conflict-123",
  "resolution": "local",  // ou "remote" ou "merge"
  "mergedData": {
    // Si resolution === "merge"
    "prixUnitaire": 250.00,
    "quantitePrevue": 1000
  }
}
```

**Réponse 200:**
```json
{
  "success": true,
  "data": {
    "resolved": true,
    "finalData": { /* données finales après résolution */ }
  },
  "message": "Conflict resolved successfully"
}
```

---

## Codes d'Erreur

| Code | Message | Description |
|------|---------|-------------|
| 200 | OK | Requête réussie |
| 201 | Created | Ressource créée |
| 400 | Bad Request | Données invalides |
| 401 | Unauthorized | Non authentifié |
| 403 | Forbidden | Non autorisé |
| 404 | Not Found | Ressource introuvable |
| 409 | Conflict | Conflit de données |
| 422 | Unprocessable Entity | Validation échouée |
| 500 | Internal Server Error | Erreur serveur |

**Format d'erreur standard:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

---

## Rate Limiting

- **Authentification**: 5 requêtes/minute
- **API générale**: 100 requêtes/minute
- **Upload fichiers**: 10 requêtes/minute

**En-têtes de rate limit:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1701360000
```

---

## Pagination

Toutes les listes supportent la pagination:

```http
GET /projects?page=2&limit=50
```

**Réponse avec pagination:**
```json
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "page": 2,
    "limit": 50,
    "totalPages": 10,
    "totalItems": 487
  }
}
```

---

**Version API**: 1.0.0  
**Dernière mise à jour**: 29 Novembre 2025
