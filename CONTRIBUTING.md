# 🔧 Development Workflow Guide

## Branch Strategy

```
main (Production)     ← Protected, v1.0.0+
  │
  └── develop         ← All development happens here
        │
        └── feature/* ← Optional: for big features
        └── fix/*     ← Optional: for specific fixes
```

## 🔴 Rules (MANDATORY)

### ❌ NEVER DO:
- Push directly to `main`
- Fix bugs on production directly
- Deploy without version number
- Merge untested code

### ✅ ALWAYS DO:
- Work on `develop` branch
- Test in staging environment
- Update CHANGELOG before merge
- Create version tag for releases

---

## 📋 Daily Workflow

### 1. Start Working
```bash
# Make sure you're on develop
git checkout develop
git pull origin develop
```

### 2. Fix a Bug
```bash
# Make your changes
# Test locally
# Test in staging
```

### 3. Commit
```bash
git add .
git commit -m "Fix: description of the fix"
git push origin develop
```

### 4. Update CHANGELOG
Add under `## [Unreleased]`:
```markdown
### Fixed
- Description of fix (#issue if applicable)
```

---

## 🚀 Release Process

### When Ready to Release:

1. **Update Version**
```bash
# In package.json files
# In VERSION file
```

2. **Update CHANGELOG**
```markdown
## [1.0.1] - 2025-XX-XX
### Fixed
- Bug 1
- Bug 2
```

3. **Merge to Main**
```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

4. **Create Tag**
```bash
git tag -a v1.0.1 -m "Version 1.0.1 - Bug fixes"
git push origin v1.0.1
```

5. **Deploy**
```bash
# Deploy to production
# Verify everything works
```

---

## 🧪 Staging Environment

### Backend
- Port: 3001
- Database: btpdb_staging
- Config: `.env.staging`

### Frontend
- API URL: http://localhost:3001/api
- Config: `.env.staging`

### Start Staging
```bash
# Backend only
docker-compose -f docker-compose.staging.yml up -d

# Frontend dev
cd frontend-web
npm run dev -- --mode staging
```

---

## ✅ Pre-Merge Checklist

Before ANY merge to main:

- [ ] No console errors
- [ ] No network errors  
- [ ] All existing features work
- [ ] CHANGELOG updated
- [ ] Version number updated
- [ ] Manual testing passed
- [ ] Code reviewed

---

## 📁 Environment Files

| File | Purpose |
|------|---------|
| `.env.production` | Production settings |
| `.env.staging` | Staging/testing settings |
| `.env.example` | Template for new devs |

---

## 🔒 Protected Branches

### `main`
- Direct push: ❌ Forbidden
- Merge: ✅ From develop only
- Deploy: ✅ After merge

### `develop`  
- Direct push: ✅ Allowed
- Testing: ✅ Required
- Breaking changes: ⚠️ Be careful

