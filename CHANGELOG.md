# Changelog

All notable changes to BTP App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning Rules

- **v1.0.x** → Bug fixes only (patch)
- **v1.x.0** → New features (minor)  
- **vX.0.0** → Breaking changes (major)

---

## [1.4.0] - 2026-02-13

### ✨ New Features & UI Enhancements

Major feature release with new capabilities for project management and improved user experience.

### Added

#### 🖼️ Photo Albums System
- New album management for organizing project photos
- Create, rename, and delete albums
- Assign photos to albums during upload
- **New Files:**
  - `backend/src/controllers/album.controller.ts`
  - `backend/src/routes/album.routes.ts`
  - `frontend-web/src/services/albumService.ts`

#### 📋 Enhanced PV System (V2)
- 8 specialized PV templates:
  - Installation Chantier
  - Réunion de Chantier
  - Constat
  - Réception Provisoire
  - Réception Définitive
  - Arrêt de Travaux
  - Reprise de Travaux
  - Autre
- Dynamic fields per PV type
- Improved PDF generation (`generatePVPdfV2`)
- Direct PDF/image upload support
- **New Files:**
  - `frontend-web/src/components/project/PVTabV2.tsx`

#### 🖱️ Drag & Drop Upload System
- Universal drag-and-drop for all file uploads
- Visual feedback during drag operations
- Support for Photos, Documents, and PVs
- **New Files:**
  - `frontend-web/src/components/common/DropZone.tsx`

#### 🗑️ Delete Métré Feature
- Ability to delete métré entries with confirmation modal
- Cascading delete: Période → Décompte → Metres
- **Safety Check**: Prevents deletion of métrés with validated décomptes
- Works in both Web (API) and Electron (soft delete) modes

#### 🎨 Login Page Redesign
- Professional new design with SVG logo
- Background image from Unsplash
- Animated banner with business illustrations
- Responsive design for all screen sizes
- **New Files:**
  - `frontend-web/src/styles/login.css`

### Changed
- `PhotosTab` now uses `PhotosTabV2` component
- `PVTab` now uses `PVTabV2` component
- `DocumentsTab` updated to use DropZone component
- Asset controller enhanced with album support and PV V2

### 🔒 Security
- Delete Métré checks if décompte is validated before allowing deletion
- Validated/Paid décomptes cannot be deleted through métré deletion

### 🔒 No Impact On
- Financial calculations (DecomptCalculator unchanged)
- Existing décompte/récapitulation data
- Auto-save behavior for validated décomptes
- Production database (changes only in dev)

---

## [1.3.2] - 2026-02-02

### 🔧 Database Schema Fix - Décompte Creation

This patch fixes a critical database schema issue causing décompte creation to fail with 500 error.

### Fixed
- **Missing Database Column**: Added `total_general_ttc` column to `decompts` table
  - Production database was missing this column while development had it
  - Backend INSERT query failed with "column does not exist" error
  - Added migration script: `010_add_total_general_ttc_to_decompts.sql`

### Root Cause
- Development database was updated manually with new column
- Production database migration was not applied
- This caused schema mismatch between environments

### 🔒 No Impact On
- Existing décompte data
- Financial calculations
- Other features

---

## [1.3.1] - 2026-02-02

### 🔧 Production Bug Fixes - Métré & Décompte Creation

This patch release fixes critical issues with métré/décompte creation in Web production.

### Fixed
- **Sequential Métré Numbering**: Fixed incorrect métré numbering (was using array length instead of max numero + 1)
  - Now correctly calculates next number as `Math.max(...existingNumeros) + 1`
  - Prevents duplicate números like "Métré N° 2" appearing twice
  
- **Décompte Creation**: Fixed décompte not being created when creating new métré
  - Added proper `projectId` validation (was passing undefined in some cases)
  - Added comprehensive logging for debugging

- **Nginx Port Configuration**: Fixed API proxy pointing to wrong port
  - Changed upstream from `127.0.0.1:3000` to `127.0.0.1:5000`
  - Backend Docker container now accessible from nginx

- **Backend Environment Variables**: Fixed PostgreSQL connection
  - Backend was looking for `POSTGRES_HOST` but container had `PGHOST`
  - Container now starts with correct environment variables

### Data Cleanup
- Removed test data (Métré N° 99)
- Fixed duplicate périodes numbering in affected projects

### 🔒 No Impact On
- Existing métré/décompte data (read-only fixes)
- Financial calculations
- Electron app functionality

---

## [1.1.1] - 2025-12-30

### 🔧 Infrastructure & Bug Fixes

This patch release fixes file upload limits and PDF generation issues.

### Fixed
- **PDF Previous Décomptes Display**: Fixed issue where previous décomptes were not showing in PDF export
  - Web mode now correctly uses `serverDecompts` instead of empty IndexedDB
  - Previous décomptes now appear with correct dates and amounts in PDF header
  
### Changed
- **File Upload Limits**: Increased limits for bulk photo uploads
  - Nginx: 50MB → 500MB
  - Express body-parser: 10mb → 500mb
  - Multer: 50MB → 100MB per file, max 50 files at once
  - Added `proxy_request_buffering off` for large uploads

### Infrastructure
- Fixed Docker backend database connections
  - Production (`btp-backend`) → `btpdb`
  - Development (`btp-backend-staging`) → `btpdb_staging`

### 🔒 No Impact On
- Financial calculations (financeEngine untouched)
- Stored data (read-only changes)
- Previous projects or approved décomptes

---

## [1.1.0] - 2025-12-27

### 🎯 Excel Compliance & Auto-Save Décompte

This release establishes complete Excel-compatible financial calculations and adds automatic Décompte saving.

### Added
- **Auto-Save Décompte**: Décompte is now automatically calculated and saved when saving Métré
  - No need to visit Décompte page separately
  - All financial calculations happen in one save action
  - Message changed to "Métrés et Décompte enregistrés avec succès !"

### Fixed
- **Récapitulation Display**: Now shows TTC display value (same as Total Général T.T.C) instead of internal value
  - Display only change, no calculation impact
  - Matches Excel visual behavior exactly

### Changed
- **financeEngine v2**: Complete separation of internal vs display values
  - `internal` → Full precision for calculations
  - `display` → Rounded values for UI
  - TVA uses TRUNC (not ROUND)
  - TTC uses ROUND
  - Montant Acompte uses floating-point conversion (Excel compatibility)

### Technical
- Added `useDecompts` hook to MetrePage
- Added `saveDecompteAfterMetre()` function with full financial calculation
- All calculations go through `financeEngine.ts` exclusively

### 🔒 Excel Compliance Rules (Locked)
```
TVA = TRUNC(HT × taux%, 2)
TTC_Internal = HT_Internal + TVA_Display
TTC_Display = ROUND(TTC_Internal, 2)
Montant_Acompte = toNumber().toFixed(2) // Float conversion
```

---

## [Unreleased]

### Added
- Development workflow documentation (CONTRIBUTING.md)
- Staging environment configuration
- Docker Compose for staging

### Fixed
- TVA (20%) rounding issue in Décompte page - changed from Math.ceil (majoration) to Math.round (standard accounting rounding)
- All monetary values now display with exactly 2 decimals in Décompte page and PDF export
- Consistent formatting across web interface and PDF output

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

