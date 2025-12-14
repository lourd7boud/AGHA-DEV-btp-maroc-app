# 🚀 Guide de Déploiement

Ce guide couvre le déploiement de l'application sur toutes les plateformes supportées.

## Table des Matières

1. [Prérequis](#prérequis)
2. [Déploiement Backend](#déploiement-backend)
3. [Déploiement Frontend Web (PWA)](#déploiement-frontend-web-pwa)
4. [Déploiement Desktop (Electron)](#déploiement-desktop-electron)
5. [Déploiement Mobile (React Native)](#déploiement-mobile-react-native)
6. [Configuration Production](#configuration-production)
7. [Maintenance](#maintenance)

---

## Prérequis

### Développement
- **Node.js**: >= 18.x
- **npm**: >= 9.x
- **Docker**: >= 24.x (optionnel)
- **Git**: >= 2.x

### Production
- **Serveur**: VPS ou Cloud (AWS, DigitalOcean, etc.)
- **Base de données**: CouchDB >= 3.x ou PostgreSQL >= 15.x
- **Domaine**: avec certificat SSL (Let's Encrypt)
- **Stockage**: pour fichiers uploadés

---

## Déploiement Backend

### Option 1: Docker (Recommandé)

#### 1. Configuration

Créer un fichier `.env` en production:

```bash
# .env.production
NODE_ENV=production
PORT=5000

# Database
COUCHDB_URL=http://admin:password@couchdb:5984
COUCHDB_DB_NAME=projet_gestion

# JWT
JWT_SECRET=votre_secret_jwt_tres_securise_ici
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=votre_secret_refresh_jwt
JWT_REFRESH_EXPIRE=30d

# Upload
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE=10485760

# CORS
CORS_ORIGIN=https://votre-domaine.com

# Logging
LOG_LEVEL=info
```

#### 2. Build et Lancement

```bash
cd backend

# Build l'image Docker
docker-compose build

# Lancer les services
docker-compose up -d

# Vérifier les logs
docker-compose logs -f backend
```

#### 3. Reverse Proxy (Nginx)

Créer `/etc/nginx/sites-available/api.votre-domaine.com`:

```nginx
server {
    listen 80;
    server_name api.votre-domaine.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.votre-domaine.com;

    ssl_certificate /etc/letsencrypt/live/api.votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.votre-domaine.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Upload de fichiers
    client_max_body_size 20M;
}
```

Activer le site:
```bash
sudo ln -s /etc/nginx/sites-available/api.votre-domaine.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. SSL avec Let's Encrypt

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.votre-domaine.com
```

### Option 2: Déploiement Manuel

#### 1. Installation

```bash
cd backend
npm install --production
npm run build
```

#### 2. Process Manager (PM2)

```bash
# Installer PM2
npm install -g pm2

# Lancer l'application
pm2 start dist/index.js --name projet-api

# Sauvegarder la configuration
pm2 save

# Démarrage automatique au boot
pm2 startup
```

#### 3. Configuration PM2

Créer `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'projet-api',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
};
```

Lancer avec:
```bash
pm2 start ecosystem.config.js
```

---

## Déploiement Frontend Web (PWA)

### 1. Build Production

```bash
cd frontend-web

# Installer les dépendances
npm install

# Build pour production
npm run build
```

Cela génère un dossier `dist/` optimisé.

### 2. Configuration Environnement

Créer `.env.production`:

```bash
VITE_API_URL=https://api.votre-domaine.com/api
VITE_APP_NAME=Gestion de Projets
VITE_DEFAULT_LANGUAGE=fr
```

### 3. Déploiement

#### Option A: Netlify

```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Déployer
netlify deploy --prod --dir=dist
```

**Configuration `netlify.toml`:**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Content-Type = "application/manifest+json"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
```

#### Option B: Vercel

```bash
# Installer Vercel CLI
npm install -g vercel

# Login
vercel login

# Déployer
vercel --prod
```

**Configuration `vercel.json`:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### Option C: Serveur Statique (Nginx)

```bash
# Copier les fichiers build
scp -r dist/* user@server:/var/www/votre-domaine.com/
```

**Configuration Nginx `/etc/nginx/sites-available/votre-domaine.com`:**

```nginx
server {
    listen 80;
    server_name votre-domaine.com www.votre-domaine.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name votre-domaine.com www.votre-domaine.com;

    ssl_certificate /etc/letsencrypt/live/votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.com/privkey.pem;

    root /var/www/votre-domaine.com;
    index index.html;

    # Service Worker
    location /sw.js {
        add_header Cache-Control "no-cache";
        proxy_cache_bypass $http_pragma;
        proxy_cache_revalidate on;
        expires off;
        access_log off;
    }

    # Assets statiques (cache long)
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Permissions-Policy "geolocation=(self)" always;

    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

---

## Déploiement Desktop (Electron)

### 1. Build Windows

```bash
cd frontend-electron

# Installer les dépendances
npm install

# Build pour Windows
npm run build:win
```

**Résultat:**
- `dist/Gestion de Projets Setup 1.0.0.exe` (Installateur NSIS)
- `dist/Gestion de Projets 1.0.0.exe` (Portable)

### 2. Build macOS

```bash
npm run build:mac
```

**Résultat:**
- `dist/Gestion de Projets-1.0.0.dmg`
- `dist/Gestion de Projets-1.0.0-arm64.dmg` (Apple Silicon)

### 3. Build Linux

```bash
npm run build:linux
```

**Résultat:**
- `dist/Gestion de Projets-1.0.0.AppImage`

### 4. Signature du Code

#### Windows
```bash
# Obtenir un certificat de signature de code
# Signer avec signtool.exe
signtool sign /f certificate.pfx /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 "dist/Gestion de Projets Setup 1.0.0.exe"
```

#### macOS
```bash
# Signer avec certificat Apple Developer
codesign --deep --force --verify --verbose --sign "Developer ID Application: Votre Nom (TEAM_ID)" "dist/Gestion de Projets.app"

# Notarisation
xcrun altool --notarize-app --primary-bundle-id "com.votreentreprise.gestion-projets" --username "votre@email.com" --password "@keychain:AC_PASSWORD" --file "dist/Gestion de Projets-1.0.0.dmg"
```

### 5. Auto-Update

**Configuration dans `package.json`:**
```json
{
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "votre-username",
        "repo": "gestion-projets"
      }
    ]
  }
}
```

**Release sur GitHub:**
```bash
# Tag de version
git tag v1.0.0
git push --tags

# Upload des releases
gh release create v1.0.0 \
  dist/*.exe \
  dist/*.dmg \
  dist/*.AppImage \
  --title "Version 1.0.0" \
  --notes "Première version stable"
```

---

## Déploiement Mobile (React Native)

### Android

#### 1. Prérequis
- **Android Studio** installé
- **JDK 17** installé
- **SDK Android** configuré

#### 2. Configuration

Éditer `android/gradle.properties`:
```properties
MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=*****
MYAPP_UPLOAD_KEY_PASSWORD=*****
```

#### 3. Générer une Clé de Signature

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore my-upload-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

#### 4. Build APK

```bash
cd android
./gradlew assembleRelease
```

**Résultat:**
- `android/app/build/outputs/apk/release/app-release.apk`

#### 5. Build AAB (Pour Google Play)

```bash
./gradlew bundleRelease
```

**Résultat:**
- `android/app/build/outputs/bundle/release/app-release.aab`

#### 6. Publication sur Google Play

1. Créer un compte **Google Play Developer** (25 USD)
2. Créer une nouvelle application
3. Uploader l'AAB
4. Remplir les informations (description, screenshots, etc.)
5. Soumettre pour review

### iOS

#### 1. Prérequis
- **macOS** avec **Xcode** >= 15
- **Compte Apple Developer** (99 USD/an)
- **CocoaPods** installé

#### 2. Installation des Pods

```bash
cd ios
pod install
```

#### 3. Configuration Xcode

1. Ouvrir `ios/GestionProjets.xcworkspace` dans Xcode
2. Sélectionner le projet → Target → Signing & Capabilities
3. Sélectionner votre Team
4. Configurer le Bundle Identifier: `com.votreentreprise.gestion-projets`

#### 4. Build

```bash
cd ios
xcodebuild -workspace GestionProjets.xcworkspace \
  -scheme GestionProjets \
  -configuration Release \
  -archivePath build/GestionProjets.xcarchive \
  archive
```

#### 5. Export IPA

```bash
xcodebuild -exportArchive \
  -archivePath build/GestionProjets.xcarchive \
  -exportPath build \
  -exportOptionsPlist ExportOptions.plist
```

#### 6. Publication sur App Store

```bash
# Installer Transporter (Mac App Store)
# Ou utiliser la ligne de commande
xcrun altool --upload-app --type ios --file build/GestionProjets.ipa \
  --username "votre@email.com" \
  --password "@keychain:AC_PASSWORD"
```

Puis:
1. Aller sur **App Store Connect**
2. Créer une nouvelle version
3. Uploader les screenshots
4. Remplir les informations
5. Soumettre pour review

---

## Configuration Production

### Variables d'Environnement

#### Backend
```bash
NODE_ENV=production
PORT=5000
COUCHDB_URL=http://user:pass@couchdb:5984
COUCHDB_DB_NAME=projet_gestion
JWT_SECRET=secret_tres_securise
JWT_EXPIRE=7d
CORS_ORIGIN=https://votre-domaine.com
UPLOAD_DIR=/app/uploads
LOG_LEVEL=info
```

#### Frontend Web
```bash
VITE_API_URL=https://api.votre-domaine.com/api
VITE_APP_NAME=Gestion de Projets
VITE_DEFAULT_LANGUAGE=fr
```

#### Mobile
```bash
API_URL=https://api.votre-domaine.com/api
APP_NAME=Gestion de Projets
```

### Base de Données

#### CouchDB (Production)

```bash
# Docker Compose
docker run -d \
  --name couchdb \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=password \
  -v /data/couchdb:/opt/couchdb/data \
  -p 5984:5984 \
  couchdb:3.3
```

**Configuration de réplication:**
```bash
curl -X POST http://admin:password@localhost:5984/_replicate \
  -H "Content-Type: application/json" \
  -d '{
    "source": "http://source:5984/projet_gestion",
    "target": "http://target:5984/projet_gestion",
    "continuous": true,
    "create_target": true
  }'
```

#### PostgreSQL (Alternative)

```bash
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=projet_gestion \
  -v /data/postgres:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:15
```

### Backup Automatique

#### Script de Backup CouchDB

Créer `/usr/local/bin/backup-couchdb.sh`:

```bash
#!/bin/bash

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/couchdb"
DB_NAME="projet_gestion"

# Créer le répertoire
mkdir -p $BACKUP_DIR

# Backup
curl -X GET "http://admin:password@localhost:5984/$DB_NAME/_all_docs?include_docs=true" \
  | gzip > "$BACKUP_DIR/${DB_NAME}_${DATE}.json.gz"

# Garder seulement les 30 derniers jours
find $BACKUP_DIR -name "*.json.gz" -mtime +30 -delete

echo "Backup completed: ${DB_NAME}_${DATE}.json.gz"
```

Rendre exécutable:
```bash
chmod +x /usr/local/bin/backup-couchdb.sh
```

**Cron quotidien (3h du matin):**
```bash
crontab -e

# Ajouter:
0 3 * * * /usr/local/bin/backup-couchdb.sh >> /var/log/couchdb-backup.log 2>&1
```

---

## Maintenance

### Monitoring

#### Backend Health Check

```bash
# Vérifier le statut
curl https://api.votre-domaine.com/health

# Réponse attendue:
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2025-11-29T10:00:00.000Z"
}
```

#### Logs

```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs projet-api

# Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Mises à jour

#### Backend

```bash
cd backend
git pull
npm install
npm run build
pm2 restart projet-api
```

#### Frontend Web

```bash
cd frontend-web
git pull
npm install
npm run build
# Redéployer sur Netlify/Vercel ou copier dist/
```

#### Desktop (Auto-update)

Les utilisateurs recevront automatiquement les mises à jour via `electron-updater`.

#### Mobile

Publier une nouvelle version sur Google Play et App Store.

### Rollback

#### Docker

```bash
# Revenir à l'image précédente
docker-compose down
docker-compose up -d --force-recreate
```

#### PM2

```bash
pm2 reload projet-api --update-env
```

---

**Version**: 1.0.0  
**Dernière mise à jour**: 29 Novembre 2025
