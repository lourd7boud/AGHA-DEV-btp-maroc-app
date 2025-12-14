# Module Métré - Documentation

## Vue d'ensemble

Le module **Métré** permet de suivre et calculer les quantités réalisées pour chaque ligne du bordereau. Il s'adapte intelligemment au type d'unité (M³, M², ML, KG, T, U, ENS, M) et affiche les champs de saisie appropriés.

## Architecture

### 1. Structure des données

#### Interface `MetreLigne`
```typescript
interface MetreLigne {
  id: string;
  numero: number;
  designation: string;
  longueur?: number;
  largeur?: number;
  profondeur?: number;
  nombre?: number;
  diametre?: number;
  partiel: number;
  observations?: string;
}
```

#### Interface `Metre`
```typescript
interface Metre {
  id: string;
  projectId: string;
  bordereauLigneId: string;
  userId: string;
  reference: string;
  designationBordereau: string;
  unite: string;
  lignes: MetreLigne[];
  totalPartiel: number;
  totalCumule: number;
  quantiteBordereau: number;
  pourcentageRealisation: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

### 2. Types de calculs supportés

Le système supporte 5 types de calculs différents :

#### Volume (M³)
- **Formule**: `Longueur × Largeur × Profondeur`
- **Champs**: longueur, largeur, profondeur
- **Usage**: Terrassement, béton, déblais, etc.

#### Surface (M²)
- **Formule**: `Longueur × Largeur`
- **Champs**: longueur, largeur
- **Usage**: Carrelage, enduit, peinture, etc.

#### Linéaire (ML, M)
- **Formule**: `Longueur`
- **Champs**: longueur
- **Usage**: Bordures, conduites, câbles, etc.

#### Poids (KG, T)
- **Formule**: `Nombre × Longueur × Poids unitaire`
- **Champs**: nombre, longueur, diamètre
- **Usage**: Ferraillage (acier)
- **Table de poids** (kg/ml):
  - Ø6: 0.222
  - Ø8: 0.395
  - Ø10: 0.617
  - Ø12: 0.888
  - Ø14: 1.208
  - Ø16: 1.578
  - Ø20: 2.466
  - Ø25: 3.854
  - Ø32: 6.313
  - Ø40: 9.864

#### Unité (U, ENS)
- **Formule**: `Nombre`
- **Champs**: nombre
- **Usage**: Équipements, ensembles, etc.

### 3. Composants React

#### `MetrePage.tsx`
Page principale qui affiche :
- Liste des lignes du bordereau
- Statistiques rapides (nombre de lignes, métrés effectués, progression)
- Bouton pour créer un nouveau métré
- Affichage de la progression par ligne

#### `MetreTable.tsx`
Tableau dynamique pour gérer les lignes de métré :
- Colonnes adaptées au type d'unité
- Calcul automatique du partiel
- Total partiel et cumulé
- Pourcentage de réalisation
- Ajout/édition/suppression de lignes

#### `MetreLigneEditor.tsx`
Formulaire modal intelligent :
- Champs dynamiques selon le type d'unité
- Prévisualisation en temps réel du calcul
- Validation des données
- Support du ferraillage avec sélection du diamètre

#### `CreateMetreModal.tsx`
Modal de sélection de la ligne du bordereau :
- Recherche par numéro ou désignation
- Affichage des informations de la ligne
- Création rapide du métré

### 4. Utilitaires de calcul (`metreCalculations.ts`)

#### Fonctions principales

```typescript
// Obtenir la configuration pour un type d'unité
getCalculationType(unite: string): MetreCalculation | undefined

// Calculer le partiel d'une ligne
calculatePartiel(
  unite: UniteType,
  longueur?: number,
  largeur?: number,
  profondeur?: number,
  nombre?: number,
  diametre?: number
): number

// Obtenir le poids unitaire du ferraillage
getPoidsUnitaire(diametre: number): number

// Formater un nombre avec décimales
formatNumber(value: number, decimals?: number): string

// Calculer le pourcentage
calculatePourcentage(quantiteRealisee: number, quantiteBordereau: number): number
```

## Workflow utilisateur

### 1. Accès au module Métré
1. Ouvrir un projet
2. Cliquer sur l'onglet "Métré"
3. Cliquer sur "Gérer les métrés"

### 2. Création d'un métré
1. Cliquer sur "Nouveau métré" ou "Créer métré" sur une ligne
2. Sélectionner la ligne du bordereau (si modal)
3. Le système détecte automatiquement le type d'unité

### 3. Ajout de lignes de métré
1. Cliquer sur "Ajouter une ligne"
2. Remplir la désignation
3. Renseigner les champs selon le type :
   - **M³**: Longueur, Largeur, Profondeur
   - **M²**: Longueur, Largeur
   - **ML/M**: Longueur
   - **KG/T**: Nombre, Longueur, Diamètre (Ø6-Ø40)
   - **U/ENS**: Nombre
4. Voir la prévisualisation du calcul
5. Ajouter des observations (optionnel)
6. Cliquer sur "Ajouter"

### 4. Suivi de la progression
- **Total Partiel**: Somme des lignes du métré actuel
- **Total Cumulé**: Somme de tous les métrés de la ligne du bordereau
- **% Réalisation**: `(Total Cumulé / Quantité Bordereau) × 100`
- **Reste à faire**: `Quantité Bordereau - Total Cumulé`

## Exemples d'utilisation

### Exemple 1: Fouille en M³
```
Désignation: Fouille en pleine masse
Longueur: 10.50 m
Largeur: 3.00 m
Profondeur: 2.00 m
→ Partiel: 63.00 M³
```

### Exemple 2: Ferraillage en KG
```
Désignation: Acier HA pour semelles
Nombre: 20 barres
Longueur: 6.00 m
Diamètre: Ø12
→ Partiel: 106.56 KG (20 × 6.00 × 0.888)
```

### Exemple 3: Carrelage en M²
```
Désignation: Carrelage 30×30
Longueur: 8.00 m
Largeur: 6.00 m
→ Partiel: 48.00 M²
```

### Exemple 4: Bordure en ML
```
Désignation: Bordure T4
Longueur: 25.50 m
→ Partiel: 25.50 ML
```

## Fonctionnalités avancées

### Calculs cumulés
- Tous les métrés d'une même ligne de bordereau sont cumulés
- Le pourcentage tient compte de tous les métrés précédents
- Permet de suivre l'avancement global

### Synchronisation offline-first
- Tous les métrés sont stockés localement dans IndexedDB
- Synchronisation automatique avec CouchDB
- Fonctionne hors ligne

### Traçabilité
- Chaque métré garde la référence de son créateur (`userId`)
- Horodatage de création et modification
- Référence unique auto-générée (METRE N° XX)

## Prochaines étapes

### Export PDF
- Générer un document PDF au format gouvernemental marocain
- En-tête avec logo du ministère
- Tableau avec colonnes dynamiques
- Zone de signatures

### Validation
- Empêcher de dépasser la quantité du bordereau
- Alertes pour les écarts importants
- Workflow d'approbation

### Pièces jointes
- Photos des travaux
- Plans de ferraillage
- Croquis cotés

### Statistiques
- Graphiques d'avancement
- Comparaison prévu/réalisé
- Alertes de dépassement

## Fichiers modifiés/créés

### Nouveaux fichiers
- `frontend-web/src/pages/MetrePage.tsx`
- `frontend-web/src/components/metre/MetreTable.tsx`
- `frontend-web/src/components/metre/MetreLigneEditor.tsx`
- `frontend-web/src/components/metre/CreateMetreModal.tsx`
- `frontend-web/src/components/metre/index.ts`
- `frontend-web/src/utils/metreCalculations.ts`
- `docs/METRE_SYSTEM_DESIGN.md`

### Fichiers modifiés
- `frontend-web/src/App.tsx` (ajout de la route `/projects/:projectId/metre`)
- `frontend-web/src/pages/ProjectDetailPage.tsx` (ajout de l'onglet Métré avec tableau)
- `frontend-web/src/db/database.ts` (interfaces `Metre` et `MetreLigne`)

## Notes techniques

### Performance
- Calculs effectués côté client (pas d'appels API)
- Indexation par `bordereauLigneId` pour requêtes rapides
- Mise à jour optimiste de l'UI

### Sécurité
- Validation des données avant enregistrement
- Vérification de l'utilisateur connecté
- Soft delete (pas de suppression définitive)

### Maintenance
- Code modulaire et réutilisable
- Types TypeScript stricts
- Documentation inline complète
