# Système Métré Intelligent - Design Document

## Vue d'ensemble

Le module Métré est conçu pour être **dynamique et intelligent** selon le type d'unité (M³, ML, M², KG, etc.). Chaque unité a sa propre méthode de calcul.

## Architecture Proposée

### 1. Types de Calcul par Unité

```typescript
interface MetreCalculation {
  unite: 'M³' | 'ML' | 'M²' | 'KG' | 'T' | 'U' | 'ENS' | 'M';
  type: 'volume' | 'lineaire' | 'surface' | 'poids' | 'unite';
  formule: string;
  champs: string[];
}

const CALCULATION_TYPES: Record<string, MetreCalculation> = {
  'M³': {
    unite: 'M³',
    type: 'volume',
    formule: 'Longueur × Largeur × Profondeur',
    champs: ['longueur', 'largeur', 'profondeur']
  },
  'ML': {
    unite: 'ML',
    type: 'lineaire',
    formule: 'Longueur',
    champs: ['longueur']
  },
  'M²': {
    unite: 'M²',
    type: 'surface',
    formule: 'Longueur × Largeur',
    champs: ['longueur', 'largeur']
  },
  'M': {
    unite: 'M',
    type: 'lineaire',
    formule: 'Longueur',
    champs: ['longueur']
  },
  'KG': {
    unite: 'KG',
    type: 'poids',
    formule: 'Nombre × Longueur × Poids unitaire',
    champs: ['nombre', 'longueur', 'diametre'] // diamètre pour calcul poids/ml
  },
  'T': {
    unite: 'T',
    type: 'poids',
    formule: 'Nombre × Longueur × Poids unitaire / 1000',
    champs: ['nombre', 'longueur', 'diametre']
  },
  'U': {
    unite: 'U',
    type: 'unite',
    formule: 'Nombre',
    champs: ['nombre']
  },
  'ENS': {
    unite: 'ENS',
    type: 'unite',
    formule: 'Nombre',
    champs: ['nombre']
  }
};
```

### 2. Structure Données Métré

```typescript
interface MetreLigne {
  id: string;
  numero: number;
  designation: string;           // Ex: "seguia nssoula [0.5×0.6]"
  
  // Dimensions selon l'unité
  longueur?: number;              // Pour ML, M, M², M³, KG, T
  largeur?: number;               // Pour M², M³
  profondeur?: number;            // Pour M³ (ou hauteur)
  nombre?: number;                // Pour U, ENS, KG, T (nombre de pièces)
  diametre?: number;              // Pour KG, T (ferraillage)
  
  // Résultats
  partiel: number;                // Résultat de cette ligne
  observations?: string;          // Notes/commentaires
}

interface Metre {
  id: string;
  projectId: string;
  bordereauLigneId: string;       // Référence au bordereau
  userId: string;
  
  // Info bordereau
  reference: string;              // Ex: "METRE N° 01 DU 01/07/2025"
  designationBordereau: string;   // Copié du bordereau
  unite: string;                  // M³, ML, M², KG, etc.
  
  // Lignes de métré
  lignes: MetreLigne[];
  
  // Totaux
  totalPartiel: number;           // Somme des partiels
  totalCumule: number;            // Cumulé avec métrés précédents
  quantiteBordereau: number;      // Quantité prévue dans bordereau
  pourcentageRealisation: number; // (totalCumule / quantiteBordereau) × 100
  
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

### 3. Formules de Calcul par Type

#### **Volume (M³)**
```
Partiel = Longueur × Largeur × Profondeur
```
Exemple: 
- Longueur: 450.00 m
- Largeur: 0.80 m
- Profondeur: 0.22 m
- **Partiel = 450 × 0.80 × 0.22 = 79.20 M³**

#### **Surface (M²)**
```
Partiel = Longueur × Largeur
```
Exemple:
- Longueur: 100 m
- Largeur: 2.5 m
- **Partiel = 100 × 2.5 = 250 M²**

#### **Linéaire (ML, M)**
```
Partiel = Longueur
```
Exemple:
- Longueur: 450.00 m
- **Partiel = 450.00 ML**

#### **Poids - Ferraillage (KG, T)**
```
Poids par ml (kg/ml) selon diamètre:
- Ø6  = 0.222 kg/ml
- Ø8  = 0.395 kg/ml
- Ø10 = 0.617 kg/ml
- Ø12 = 0.888 kg/ml
- Ø14 = 1.208 kg/ml
- Ø16 = 1.578 kg/ml
- Ø20 = 2.466 kg/ml
- Ø25 = 3.854 kg/ml

Partiel (KG) = Nombre × Longueur × Poids_unitaire(diamètre)
Partiel (T)  = Partiel(KG) / 1000
```
Exemple:
- Nombre: 400 barres
- Longueur: 6.00 m
- Diamètre: Ø10
- Poids/ml: 0.617 kg/ml
- **Partiel = 400 × 6.00 × 0.617 = 1,480.8 KG = 1.48 T**

#### **Unité (U, ENS)**
```
Partiel = Nombre
```
Exemple:
- Nombre: 50 pièces
- **Partiel = 50 U**

### 4. Interface Utilisateur Dynamique

```typescript
// Composant intelligent qui s'adapte selon l'unité
<MetreLigneEditor 
  unite="M³"           // Change les champs affichés
  ligne={currentLigne}
  onChange={handleUpdate}
/>

// Pour M³: affiche 3 champs (L × l × P)
// Pour ML: affiche 1 champ (L)
// Pour KG: affiche 3 champs (Nombre, Longueur, Diamètre)
```

### 5. Calculs Automatiques

```typescript
function calculatePartiel(ligne: MetreLigne, unite: string): number {
  const calcType = CALCULATION_TYPES[unite];
  
  switch (calcType.type) {
    case 'volume':
      return (ligne.longueur || 0) × (ligne.largeur || 0) × (ligne.profondeur || 0);
      
    case 'surface':
      return (ligne.longueur || 0) × (ligne.largeur || 0);
      
    case 'lineaire':
      return ligne.longueur || 0;
      
    case 'poids':
      const poidsUnitaire = getPoidsUnitaire(ligne.diametre || 0);
      const total = (ligne.nombre || 0) × (ligne.longueur || 0) × poidsUnitaire;
      return unite === 'T' ? total / 1000 : total;
      
    case 'unite':
      return ligne.nombre || 0;
      
    default:
      return 0;
  }
}

function getPoidsUnitaire(diametre: number): number {
  const table: Record<number, number> = {
    6: 0.222,
    8: 0.395,
    10: 0.617,
    12: 0.888,
    14: 1.208,
    16: 1.578,
    20: 2.466,
    25: 3.854,
    32: 6.313
  };
  return table[diametre] || 0;
}
```

### 6. Tableau Métré Intelligent

```tsx
// Colonnes dynamiques selon l'unité
const MetreTable = ({ unite, lignes }) => {
  const calcType = CALCULATION_TYPES[unite];
  
  return (
    <table>
      <thead>
        <tr>
          <th>N°</th>
          <th>Désignation</th>
          
          {/* Colonnes dynamiques */}
          {calcType.type === 'volume' && (
            <>
              <th>Longueur</th>
              <th>Largeur</th>
              <th>Profondeur</th>
            </>
          )}
          
          {calcType.type === 'surface' && (
            <>
              <th>Longueur</th>
              <th>Largeur</th>
            </>
          )}
          
          {calcType.type === 'lineaire' && (
            <th>Longueur</th>
          )}
          
          {calcType.type === 'poids' && (
            <>
              <th>Nombre</th>
              <th>Longueur</th>
              <th>Ø (mm)</th>
              <th>kg/ml</th>
            </>
          )}
          
          {calcType.type === 'unite' && (
            <th>Nombre</th>
          )}
          
          <th>Partiel ({unite})</th>
          <th>Observations</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map(ligne => (
          <MetreLigneRow 
            key={ligne.id} 
            ligne={ligne} 
            unite={unite}
          />
        ))}
      </tbody>
    </table>
  );
};
```

### 7. Workflow Utilisateur

```
1. Utilisateur ouvre module Métré du projet
   ↓
2. Voit liste des lignes du Bordereau
   ↓
3. Sélectionne une ligne (ex: "Déblais pour ouvrages - M³")
   ↓
4. Système détecte unite = "M³"
   → Affiche formulaire Volume (L × l × P)
   ↓
5. Utilisateur saisit plusieurs lignes de mesures:
   - Ligne 1: "seguia nssoula" → 450 × 0.80 × 0.22 = 79.20 M³
   - Ligne 2: "seguia dar wanou" → 435 × 0.80 × 0.22 = 76.56 M³
   - Ligne 3: "siphon aferdou" → 32 × 2.00 × 2.00 = 128 M³
   ↓
6. Calcul automatique:
   - Total Partiel = 283.76 M³
   - Quantité Bordereau = 300 M³
   - % Réalisation = 94.59%
   ↓
7. Enregistrement + Sync offline
```

### 8. Gestion Multi-Métrés

```typescript
// Un bordereau peut avoir plusieurs métrés dans le temps
interface MetreHistory {
  bordereauLigneId: string;
  metres: Metre[];              // Chronologique
  totalCumule: number;          // Somme de tous les métrés
  quantiteBordereau: number;
  reste: number;                // Quantité restante à réaliser
  pourcentage: number;          // Avancement global
}
```

### 9. Affichage Visuel

```
┌─────────────────────────────────────────────────────┐
│ MÉTRÉ N° 01 - Déblais pour ouvrages (M³)           │
│ Bordereau: BPU-2024-01 | Qté prévue: 300 M³       │
├─────────────────────────────────────────────────────┤
│ N° │ Désignation          │ L     │ l    │ P    │ Partiel│
├────┼─────────────────────┼───────┼──────┼──────┼────────┤
│ 1  │ seguia nssoula      │ 450.00│ 0.80 │ 0.22 │  79.20 │
│ 2  │ seguia dar wanou    │ 435.00│ 0.80 │ 0.22 │  76.56 │
│ 3  │ siphon aferdou      │  32.00│ 2.00 │ 2.00 │ 128.00 │
├────┴─────────────────────┴───────┴──────┴──────┼────────┤
│ TOTAL PARTIEL                                   │ 283.76 │
│ CUMULÉ (avec métrés précédents)                │ 283.76 │
│ QUANTITÉ BORDEREAU                              │ 300.00 │
│ RESTE À RÉALISER                                │  16.24 │
│ POURCENTAGE DE RÉALISATION                      │ 94.59% │
└─────────────────────────────────────────────────────────┘

[Progress Bar: ████████████████████░ 94.59%]
```

### 10. Fonctionnalités Avancées

#### A. Templates par Type d'Ouvrage
```typescript
const METRE_TEMPLATES = {
  'Déblais': [
    { designation: 'Axe principal', longueur: 0, largeur: 0, profondeur: 0 },
    { designation: 'Axe secondaire', longueur: 0, largeur: 0, profondeur: 0 }
  ],
  'Béton': [...],
  'Ferraillage': [...]
};
```

#### B. Import depuis Fichier Excel
- Même fonctionnalité que Bordereau
- Détection automatique du type de colonnes selon l'unité

#### C. Export PDF Détaillé
- En-tête avec logo ministère (comme image)
- Tableau formaté selon l'unité
- Signature et cachets

#### D. Photos Attachées
- Lier photos aux lignes de métré
- Géolocalisation automatique

#### E. Alertes Intelligentes
```typescript
// Si dépassement quantité bordereau
if (totalCumule > quantiteBordereau) {
  alert(`⚠️ Attention: Dépassement de ${((totalCumule/quantiteBordereau - 1) * 100).toFixed(2)}%`);
}

// Si proche de la fin
if (pourcentage >= 90 && pourcentage < 100) {
  alert(`ℹ️ Bientôt terminé: ${pourcentage.toFixed(2)}% réalisé`);
}
```

## Avantages du Système

✅ **Flexible**: S'adapte à tous types d'unités
✅ **Intelligent**: Calculs automatiques précis
✅ **Conforme**: Respecte format réel des métrés marocains
✅ **Évolutif**: Facile d'ajouter nouveaux types
✅ **Intuitif**: Interface change selon contexte
✅ **Professionnel**: Export PDF conforme aux normes
✅ **Offline-first**: Fonctionne sans connexion
✅ **Traçable**: Historique complet des métrés

## Prochaines Étapes

1. ✅ Créer interfaces TypeScript
2. ✅ Implémenter logique calculs
3. ✅ Développer composants UI dynamiques
4. ✅ Intégrer avec Bordereau
5. ✅ Ajouter export PDF
6. ✅ Tester avec données réelles
7. ✅ Déployer

---

**Prêt à commencer l'implémentation?** 🚀
