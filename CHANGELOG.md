# Changelog

All notable changes to BTP App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning Rules

- **v1.0.x** → Bug fixes only (patch)
- **v1.x.0** → New features (minor)  
- **vX.0.0** → Breaking changes (major)

---

## [Unreleased]

### Added
- Development workflow documentation (CONTRIBUTING.md)
- Staging environment configuration
- Docker Compose for staging

### Fixed
<!-- Add bug fixes here as you work -->

### Changed
<!-- Add changes here -->

---

## [1.0.0] - 2025-12-24

### 🎉 Initial Production Release

First stable production release of BTP App - Application de gestion de projets BTP.

### Features
- **Project Management**: Create, edit, and manage construction projects
- **Bordereau Module**: Price lists with automatic calculations
- **Metre System**: Detailed measurements with sections and sub-sections
- **Décompte Module**: Payment certificate generation
- **Period Management**: Track project periods
- **Photo Management**: Upload and organize project photos
- **PV Management**: Meeting minutes and documents
- **Attachment System**: File uploads and organization

### Technical
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **Storage**: MinIO for file storage
- **Realtime**: Socket.IO for live updates
- **Offline**: IndexedDB + Service Worker (PWA)
- **Auth**: JWT with auto-refresh

### Infrastructure
- **Domain**: marocinfra.com (HTTPS with Let's Encrypt)
- **Server**: Hetzner VPS
- **Containers**: Docker
- **Backup**: Daily PostgreSQL backups with 7-day retention
- **Monitoring**: Health check endpoints + automated monitoring

### Security
- HTTPS enforced (301 redirect)
- JWT authentication
- CORS configured
- Helmet security headers

---

## [Unreleased]

### Planned
- Staging environment full setup
- Email notifications
- Export to PDF improvements
- Multi-language support improvements

---

## Version History

| Version | Date | Type | Notes |
|---------|------|------|-------|
| 1.0.0 | 2025-12-24 | Release | Initial production release |

