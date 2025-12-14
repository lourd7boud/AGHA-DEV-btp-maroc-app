# 📦 Guide d'Installation

Ce guide vous accompagne dans l'installation et la configuration de l'application de gestion de projets en environnement de développement et de production.

## Table des Matières

1. [Installation Développement](#installation-développement)
2. [Installation Production](#installation-production)
3. [Configuration](#configuration)
4. [Premiers Pas](#premiers-pas)
5. [Troubleshooting](#troubleshooting)

---

## Installation Développement

### Prérequis

Assurez-vous d'avoir installé:

- **Node.js** >= 18.x ([Télécharger](https://nodejs.org/))
- **npm** >= 9.x (inclus avec Node.js)
- **Git** ([Télécharger](https://git-scm.com/))
- **Docker Desktop** (optionnel, pour CouchDB) ([Télécharger](https://www.docker.com/products/docker-desktop/))

Vérifier les versions:
```bash
node --version  # v18.x ou supérieur
npm --version   # v9.x ou supérieur
git --version   # v2.x ou supérieur
```

### 1. Cloner le Projet

```bash
git clone https://github.com/votre-username/gestion-projets.git
cd gestion-projets
```

### 2. Installation Backend

#### Avec Docker (Recommandé)

```bash
cd backend

# Copier le fichier d'environnement
cp .env.example .env

# Lancer CouchDB avec Docker Compose
docker-compose up -d

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

Le serveur démarre sur **http://localhost:5000**

#### Sans Docker

Si vous préférez installer CouchDB manuellement:

1. **Installer CouchDB** ([Guide d'installation](https://docs.couchdb.org/en/stable/install/index.html))

2. **Créer la base de données:**
   ```bash
   curl -X PUT http://admin:password@localhost:5984/projet_gestion
   ```

3. **Configurer `.env`:**
   ```bash
   cd backend
   cp .env.example .env
   # Éditer .env avec vos paramètres
   ```

4. **Installer et lancer:**
   ```bash
   npm install
   npm run dev
   ```

### 3. Installation Frontend Web

```bash
cd frontend-web

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Lancer le serveur de développement
npm run dev
```

L'application Web démarre sur **http://localhost:3000**

### 4. Installation Desktop (Electron)

```bash
cd frontend-electron

# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev
```

L'application Electron se lance automatiquement.

### 5. Installation Mobile (React Native)

#### Android

**Prérequis:**
- Android Studio installé
- SDK Android configuré
- Un émulateur Android ou un appareil physique

```bash
cd frontend-mobile

# Installer les dépendances
npm install

# Installer les dépendances iOS (CocoaPods)
cd ios && pod install && cd ..

# Lancer sur Android
npm run android
```

#### iOS (macOS uniquement)

```bash
cd frontend-mobile

# Installer les dépendances
npm install

# Installer les Pods
cd ios && pod install && cd ..

# Lancer sur iOS
npm run ios
```

---

## Installation Production

### Option 1: Installation Automatisée avec Docker

**1. Cloner le projet sur le serveur:**
```bash
ssh user@votre-serveur.com
git clone https://github.com/votre-username/gestion-projets.git
cd gestion-projets
```

**2. Configurer les variables d'environnement:**
```bash
cd backend
cp .env.example .env.production
nano .env.production
```

Éditer les valeurs:
```bash
NODE_ENV=production
PORT=5000
COUCHDB_URL=http://admin:SecurePassword123@couchdb:5984
COUCHDB_DB_NAME=projet_gestion
JWT_SECRET=VotreSecretJWTTresSecurise123!@#
JWT_EXPIRE=7d
CORS_ORIGIN=https://votre-domaine.com
UPLOAD_DIR=/app/uploads
LOG_LEVEL=info
```

**3. Lancer avec Docker Compose:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

**4. Vérifier le statut:**
```bash
docker-compose ps
curl http://localhost:5000/health
```

### Option 2: Installation Manuelle

#### Backend

**1. Préparer l'environnement:**
```bash
# Se connecter au serveur
ssh user@votre-serveur.com

# Installer Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Vérifier
node --version
npm --version
```

**2. Installer l'application:**
```bash
git clone https://github.com/votre-username/gestion-projets.git
cd gestion-projets/backend

# Installer les dépendances de production
npm install --production

# Copier et configurer .env
cp .env.example .env
nano .env
```

**3. Build TypeScript:**
```bash
npm run build
```

**4. Installer PM2:**
```bash
sudo npm install -g pm2
```

**5. Lancer l'application:**
```bash
pm2 start dist/index.js --name projet-api
pm2 save
pm2 startup  # Suivre les instructions affichées
```

#### Frontend Web

**1. Build de production:**
```bash
cd frontend-web

# Configurer l'environnement
cp .env.example .env.production
nano .env.production

# Éditer:
VITE_API_URL=https://api.votre-domaine.com/api
VITE_APP_NAME=Gestion de Projets
VITE_DEFAULT_LANGUAGE=fr

# Build
npm install
npm run build
```

**2. Déployer sur un serveur web:**

**Avec Nginx:**
```bash
# Copier les fichiers build
sudo cp -r dist/* /var/www/votre-domaine.com/

# Configurer Nginx
sudo nano /etc/nginx/sites-available/votre-domaine.com
```

Ajouter la configuration (voir [DEPLOYMENT.md](./DEPLOYMENT.md#option-c-serveur-statique-nginx)).

```bash
# Activer le site
sudo ln -s /etc/nginx/sites-available/votre-domaine.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Ou avec un hébergeur (Netlify/Vercel):**
```bash
# Netlify
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist

# Vercel
npm install -g vercel
vercel login
vercel --prod
```

#### Base de Données (CouchDB)

**Installation:**
```bash
# Ajouter le repository
echo "deb https://apache.jfrog.io/artifactory/couchdb-deb/ focal main" | sudo tee /etc/apt/sources.list.d/couchdb.list

# Ajouter la clé GPG
curl -L https://couchdb.apache.org/repo/keys.asc | sudo apt-key add -

# Installer
sudo apt-get update
sudo apt-get install -y couchdb

# Configurer (standalone)
sudo systemctl enable couchdb
sudo systemctl start couchdb
```

**Configuration:**
```bash
# Créer un admin
curl -X PUT http://localhost:5984/_node/_local/_config/admins/admin -d '"SecurePassword123"'

# Créer la base de données
curl -X PUT http://admin:SecurePassword123@localhost:5984/projet_gestion

# Activer CORS
curl -X PUT http://admin:SecurePassword123@localhost:5984/_node/_local/_config/httpd/enable_cors -d '"true"'
curl -X PUT http://admin:SecurePassword123@localhost:5984/_node/_local/_config/cors/origins -d '"https://votre-domaine.com"'
```

---

## Configuration

### Backend (.env)

Fichier `.env` à créer dans `backend/`:

```bash
# Environment
NODE_ENV=development

# Server
PORT=5000

# Database (CouchDB)
COUCHDB_URL=http://admin:password@localhost:5984
COUCHDB_DB_NAME=projet_gestion

# Alternative: PostgreSQL
# DATABASE_URL=postgresql://user:password@localhost:5432/projet_gestion

# JWT
JWT_SECRET=votre_secret_jwt_minimum_32_caracteres
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=votre_secret_refresh_jwt
JWT_REFRESH_EXPIRE=30d

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10 MB

# CORS
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=debug
```

### Frontend Web (.env)

Fichier `.env` à créer dans `frontend-web/`:

```bash
# API Backend
VITE_API_URL=http://localhost:5000/api

# Application
VITE_APP_NAME=Gestion de Projets
VITE_DEFAULT_LANGUAGE=fr

# Features
VITE_ENABLE_OFFLINE=true
VITE_ENABLE_NOTIFICATIONS=true
```

### Frontend Mobile (.env)

Fichier `.env` à créer dans `frontend-mobile/`:

```bash
API_URL=http://10.0.2.2:5000/api  # Pour émulateur Android
# API_URL=http://localhost:5000/api  # Pour iOS Simulator
APP_NAME=Gestion de Projets
DEFAULT_LANGUAGE=fr
```

---

## Premiers Pas

### 1. Créer un Compte

**Via l'interface Web:**
1. Ouvrir http://localhost:3000
2. Cliquer sur "S'inscrire"
3. Remplir le formulaire:
   - Nom: Doe
   - Prénom: John
   - Email: john.doe@example.com
   - Mot de passe: MotDePasse123!
4. Cliquer sur "Créer un compte"

**Via l'API (curl):**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nom": "Doe",
    "prenom": "John",
    "email": "john.doe@example.com",
    "password": "MotDePasse123!",
    "role": "user"
  }'
```

### 2. Se Connecter

**Via l'interface Web:**
1. Cliquer sur "Se connecter"
2. Entrer l'email et le mot de passe
3. Cliquer sur "Connexion"

**Via l'API:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "MotDePasse123!"
  }'
```

Copier le `token` de la réponse pour les requêtes suivantes.

### 3. Créer un Projet

**Via l'interface Web:**
1. Aller sur "Projets"
2. Cliquer sur "+ Nouveau Projet"
3. Remplir le formulaire:
   - Objet: Construction de route
   - Marché: MRC-2025-001
   - Affaire: AFF-2025-001
   - MOA: Ministère
   - Maître d'œuvre: SOGETRAM
   - Lieu: Rabat
   - Montant: 1000000
   - Délai: 24 mois
   - Date début: 2025-01-15
   - Date fin: 2027-01-15
4. Cliquer sur "Créer"

**Via l'API:**
```bash
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -d '{
    "objet": "Construction de route",
    "marche": "MRC-2025-001",
    "affaire": "AFF-2025-001",
    "moa": "Ministère",
    "maitre": "SOGETRAM",
    "lieu": "Rabat",
    "montant": 1000000,
    "delaiMois": 24,
    "dateDebut": "2025-01-15",
    "dateFin": "2027-01-15",
    "status": "active"
  }'
```

### 4. Tester le Mode Offline

1. **Créer un projet en ligne** (voir ci-dessus)
2. **Couper la connexion réseau:**
   - Windows: Désactiver Wi-Fi/Ethernet
   - Navigateur: Outils de développement → Network → Offline
3. **Créer un nouveau projet offline:**
   - L'interface fonctionne normalement
   - Le projet apparaît immédiatement
   - Un indicateur "Hors ligne" s'affiche
4. **Reconnecter:**
   - L'indicateur passe à "Synchronisation..."
   - Les données sont envoyées au serveur
   - Confirmation "À jour"

### 5. Vérifier la Synchronisation

**Dans l'interface:**
- L'indicateur de sync en haut à droite montre:
  - 🔴 Hors ligne
  - 🔵 Synchronisation en cours...
  - 🟢 À jour
  - ⚠️ X opérations en attente

**Via l'API:**
```bash
# Vérifier les opérations en attente
curl -X POST http://localhost:5000/api/sync/pull \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_TOKEN" \
  -d '{
    "deviceId": "device-123",
    "lastSync": 0
  }'
```

---

## Troubleshooting

### Problème: Le backend ne démarre pas

**Erreur: "EADDRINUSE: address already in use ::5000"**

Solution:
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/macOS
lsof -ti:5000 | xargs kill -9
```

Ou changer le port dans `.env`:
```bash
PORT=5001
```

---

### Problème: Connexion à CouchDB échouée

**Erreur: "Failed to connect to CouchDB"**

Vérifier que CouchDB est lancé:
```bash
# Docker
docker ps | grep couchdb

# Service
sudo systemctl status couchdb
```

Vérifier l'URL dans `.env`:
```bash
COUCHDB_URL=http://admin:password@localhost:5984
```

Tester la connexion:
```bash
curl http://admin:password@localhost:5984/
```

---

### Problème: Frontend ne se connecte pas au backend

**Erreur: "Network Error" ou "CORS Error"**

1. **Vérifier que le backend est lancé:**
   ```bash
   curl http://localhost:5000/health
   ```

2. **Vérifier l'URL dans `.env` du frontend:**
   ```bash
   VITE_API_URL=http://localhost:5000/api
   ```

3. **Vérifier CORS dans backend `.env`:**
   ```bash
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Redémarrer le frontend:**
   ```bash
   cd frontend-web
   npm run dev
   ```

---

### Problème: Erreur JWT "Token expired"

**Solution:**

1. **Déconnexion et reconnexion:**
   - Cliquer sur "Se déconnecter"
   - Se reconnecter

2. **Vider le localStorage:**
   ```javascript
   // Dans la console du navigateur
   localStorage.clear();
   location.reload();
   ```

3. **Augmenter la durée du token (développement):**
   ```bash
   # Dans backend/.env
   JWT_EXPIRE=30d
   ```

---

### Problème: Build de production échoue

**Erreur TypeScript:**
```bash
npm run build
# Error: TS2304: Cannot find name 'XXX'
```

Solution:
```bash
# Supprimer node_modules et package-lock.json
rm -rf node_modules package-lock.json

# Réinstaller
npm install

# Rebuild
npm run build
```

---

### Problème: L'application mobile ne se lance pas

**Android:**

Vérifier que l'émulateur est lancé:
```bash
adb devices
```

Si vide, lancer un émulateur depuis Android Studio.

Nettoyer et rebuild:
```bash
cd android
./gradlew clean
cd ..
npm run android
```

**iOS:**

Vérifier que les Pods sont installés:
```bash
cd ios
pod install
cd ..
```

Rebuild:
```bash
npm run ios
```

---

### Problème: Synchronisation ne fonctionne pas

**Symptômes:**
- Les données ne se synchronisent pas
- L'indicateur reste sur "Synchronisation..."

**Solutions:**

1. **Vérifier la connexion réseau:**
   ```bash
   curl https://api.votre-domaine.com/health
   ```

2. **Vérifier les opérations en attente:**
   - Ouvrir les DevTools du navigateur
   - Application → IndexedDB → ProjetDatabase → syncOperations
   - Voir si des opérations ont `synced: false`

3. **Forcer une synchronisation manuelle:**
   - Cliquer sur le bouton "Synchroniser" dans l'interface
   - Ou dans la console:
     ```javascript
     // Dans la console du navigateur
     window.location.reload();
     ```

4. **Vérifier les logs backend:**
   ```bash
   # Docker
   docker-compose logs -f backend

   # PM2
   pm2 logs projet-api
   ```

---

### Problème: Fichiers ne s'uploadent pas

**Erreur: "File too large"**

Solution:
```bash
# Backend .env
MAX_FILE_SIZE=20971520  # 20 MB

# Nginx (si utilisé)
client_max_body_size 20M;
```

Redémarrer les services.

---

### Support

Pour toute question ou problème:

- **Documentation**: Lire [README.md](../README.md), [API.md](./API.md), [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues GitHub**: Ouvrir une issue sur le repository
- **Email**: support@votre-domaine.com

---

**Version**: 1.0.0  
**Dernière mise à jour**: 29 Novembre 2025
