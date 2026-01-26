# Contributing to BTP Desktop

Merci de votre intérêt pour contribuer à BTP Desktop! 🎉

## 📋 Règles de développement

### Architecture stricte

```
⚠️ IMPORTANT: Electron = Wrapper UNIQUEMENT
```

- ❌ **NE PAS** ajouter de logique métier dans Electron
- ❌ **NE PAS** dupliquer du code depuis frontend-web
- ✅ Utiliser `frontend-web` comme Single Source of Truth
- ✅ Electron ne fait que: fenêtres, fichiers locaux, tray, updates

### Code Style

- TypeScript strict
- ESLint pour le linting
- Prettier pour le formatage

## 🚀 Processus de contribution

### 1. Fork et clone

```bash
git clone https://github.com/marocinfra/btp-app-desktop.git
cd btp-app-desktop
npm install
```

### 2. Créer une branche

```bash
git checkout -b feature/ma-fonctionnalite
```

### 3. Développer

```bash
# Builder frontend-web d'abord
cd ../frontend-web && npm run build && cd ../btp-app-desktop

# Lancer en dev
npm run dev
```

### 4. Commiter

Utiliser [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: ajouter support Touch Screen
fix: corriger crash au démarrage
docs: mettre à jour README
```

### 5. Pull Request

- Créer une PR vers `develop`
- Décrire les changements
- Attendre la review

## 📦 Releases

Les releases sont gérées par les mainteneurs:

1. Merge `develop` → `main`
2. Bump version dans `package.json`
3. Créer tag `vX.Y.Z`
4. GitHub Actions build automatiquement

## 🐛 Signaler un bug

Ouvrir une issue avec:
- Version de l'app
- OS et version
- Étapes pour reproduire
- Comportement attendu vs actuel

## 💡 Proposer une fonctionnalité

Ouvrir une issue avec le label `enhancement`:
- Description claire du besoin
- Cas d'utilisation
- Proposition de solution (optionnel)

---

© MarocInfra - MIT License
