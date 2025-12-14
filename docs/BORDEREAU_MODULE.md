# Module Bordereau - Documentation

## Vue d'ensemble

Le module **Bordereau** est un composant central de l'application de gestion de projets. Il permet aux utilisateurs de créer, gérer et suivre les bordereaux de prix unitaires (BPU) pour chaque projet.

## Fonctionnalités principales

### 1. **Création de bordereau - 4 méthodes**

#### a) Nouveau bordereau vide
- Créer un bordereau from scratch
- Saisie manuelle avec auto-complétion intelligente
- Calculs automatiques des montants

#### b) Depuis bibliothèque de modèles
- Plus de 20 modèles prédéfinis
- Catégories: Terrassement, Béton, Ferraillage, Hydro-Agricole, Maçonnerie, Finition, etc.
- Prix de référence inclus
- Recherche et filtrage par catégorie
- Sélection multiple d'articles

#### c) Copier depuis un projet existant
- Dupliquer un bordereau d'un autre projet
- Conservation des désignations et prix unitaires
- Réinitialisation automatique des quantités
- Modification possible avant sauvegarde

#### d) Importer depuis Excel
- Support des fichiers .xlsx et .xls
- Format attendu: N°, Désignation, Unité, Quantité, Prix unitaire
- Prévisualisation des données avant import
- Validation automatique des lignes
- Détection et signalement des erreurs

### 2. **Édition interactive du bordereau**

#### Table éditable
- Ajout/suppression de lignes en temps réel
- Édition inline avec navigation au clavier
- Unités standards: M³, ML, M², KG, T, U, ENS, M

#### Auto-complétion intelligente
- Recherche dans la bibliothèque de modèles (2+ caractères)
- Suggestions contextuelles avec code, désignation et prix
- Navigation au clavier (↑↓, Enter, Escape)
- Remplissage automatique des prix de référence

#### Calculs automatiques
- **Montant = Quantité × Prix unitaire**
- **Total HT** = Somme des montants
- **TVA 20%** = Total HT × 0.20
- **Total TTC** = Total HT + TVA

### 3. **Export et partage**

- **Export CSV** avec totaux (HT, TVA, TTC)
- Format compatible Excel/LibreOffice
- Nom de fichier automatique basé sur la référence

### 4. **Synchronisation offline-first**

- Sauvegarde dans IndexedDB
- Opérations de sync loguées pour synchronisation ultérieure
- Fonctionne sans connexion internet
- Sync automatique lors de la reconnexion

## Architecture technique

### Structure des fichiers

```
src/
├── pages/
│   └── BordereauPage.tsx          # Page principale
├── components/
│   └── bordereau/
│       ├── index.ts                # Exports centralisés
│       ├── BordereauTable.tsx      # Table éditable
│       ├── CreateBordereauModal.tsx # Modal création vide
│       ├── TemplateLibraryModal.tsx # Modal bibliothèque
│       ├── CopyFromProjectModal.tsx # Modal copie projet
│       └── ImportExcelModal.tsx    # Modal import Excel
└── data/
    └── bordereauTemplates.ts       # Bibliothèque de modèles
```

### Modèle de données

```typescript
interface Bordereau {
  id: string;
  projectId: string;
  userId: string;
  reference: string;              // Ex: "BPU-2024-01"
  designation: string;            // Ex: "Bordereau des Prix Unitaires - Terrassement"
  lignes: Array<{
    id: string;
    numero: number;
    designation: string;
    unite: string;               // M³, ML, M², KG, T, U, ENS, M
    quantite: number;
    prixUnitaire: number;
    montant: number;             // quantite × prixUnitaire
  }>;
  montantTotal: number;          // Total HT
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

### Bibliothèque de modèles

```typescript
interface BordereauTemplate {
  id: string;
  code: string;                  // Ex: "DEB-001"
  designation: string;           // Description complète
  unite: string;
  prixReference: number;         // Prix en MAD
  categorie: string;
  tags: string[];
}
```

**Modèles disponibles (20+):**
- **Terrassement**: Déblais, Remblais, Groisil
- **Béton**: Béton 300kg/m³, 350kg/m³
- **Ferraillage**: Acier haute adhérence
- **Hydro-Agricole**: Gabions, Khettaras, Assainissement
- **Maçonnerie**: Briques, Agglos, Enduits
- **Finition**: Carrelage, Peinture, Faux plafond
- **Étanchéité**: Membranes, Bitume
- **Métallerie**: Charpentes, Garde-corps
- **Charpente**: Bois, Métallique
- **Couverture**: Tuiles, Bac acier

## Utilisation

### 1. Accéder au module Bordereau

```
Projects → [Sélectionner projet] → Tab "Bordereau" → Ajouter un bordereau
```

Ou directement depuis la vue détail du projet:
```
Actions rapides → Ajouter un bordereau
```

### 2. Créer un bordereau vide

1. Cliquer sur "Nouveau vide"
2. Renseigner:
   - Référence (ex: BPU-2024-01)
   - Désignation (ex: Bordereau des Prix Unitaires)
3. Cliquer "Créer"
4. Ajouter des lignes manuellement

### 3. Utiliser la bibliothèque de modèles

1. Cliquer sur "Depuis bibliothèque"
2. Rechercher par mot-clé ou filtrer par catégorie
3. Sélectionner les articles souhaités (checkbox)
4. Renseigner référence et désignation
5. Cliquer "Créer avec X article(s)"
6. Ajuster les quantités dans le tableau

### 4. Copier depuis un projet

1. Cliquer sur "Copier un projet"
2. Sélectionner le projet source
3. Sélectionner le bordereau à copier
4. Renseigner la nouvelle référence et désignation
5. Cliquer "Copier le bordereau"
6. Les quantités sont réinitialisées à 0

### 5. Importer depuis Excel

1. Cliquer sur "Importer Excel"
2. Renseigner référence et désignation
3. Glisser-déposer ou sélectionner un fichier .xlsx/.xls
4. Vérifier la prévisualisation
   - ✓ Vert = ligne valide
   - ✗ Rouge = erreur (désignation manquante, etc.)
5. Cliquer "Importer (X lignes)"

**Format Excel attendu:**
| N° | Désignation | U | Quantité | Prix unitaire |
|----|-------------|---|----------|---------------|
| 1  | Déblais... | M³ | 100 | 48.00 |
| 2  | Gabions... | M³ | 50 | 400.00 |

### 6. Éditer un bordereau

1. Cliquer sur le bordereau dans la liste
2. Table interactive:
   - **Désignation**: Taper 2+ caractères pour auto-complétion
   - **Unité**: Sélectionner dans liste déroulante
   - **Quantité**: Saisir le nombre
   - **Prix unitaire**: Saisir le prix (auto-rempli si template)
   - **Montant**: Calculé automatiquement
3. Navigation clavier:
   - **Enter** sur "Prix unitaire" → Ajoute nouvelle ligne
   - **↑↓** dans auto-complétion → Navigation
   - **Enter** sur suggestion → Sélection
   - **Escape** → Fermer suggestions
4. Cliquer "+" ou Enter pour ajouter des lignes
5. Cliquer icône poubelle pour supprimer une ligne
6. Cliquer "Enregistrer" pour sauvegarder

### 7. Exporter un bordereau

1. Dans l'éditeur de bordereau
2. Cliquer "Exporter CSV"
3. Fichier téléchargé avec nom `{reference}.csv`
4. Contient toutes les lignes + totaux (HT, TVA, TTC)

## Cas d'usage

### Cas 1: Nouveau projet de terrassement
```
1. Créer projet "Aménagement routier N-1 2024"
2. Bordereau → Depuis bibliothèque
3. Catégorie "Terrassement"
4. Sélectionner: Déblais, Remblais, Groisil
5. Ajuster quantités selon étude
6. Enregistrer
```

### Cas 2: Projet similaire au précédent
```
1. Créer nouveau projet
2. Bordereau → Copier projet
3. Sélectionner ancien projet
4. Choisir bordereau à dupliquer
5. Modifier quantités si nécessaire
6. Enregistrer
```

### Cas 3: Import depuis étude Excel existante
```
1. Avoir fichier Excel avec colonnes:
   N°, Désignation, U, Quantité, Prix unitaire
2. Bordereau → Importer Excel
3. Sélectionner fichier
4. Vérifier prévisualisation
5. Corriger erreurs éventuelles
6. Importer
```

## Bonnes pratiques

### 1. **Nommage des références**
- Format recommandé: `BPU-{année}-{numéro}`
- Exemple: `BPU-2024-01`, `BPU-2024-02`
- Utiliser des numéros séquentiels

### 2. **Désignations claires**
- Indiquer le type: "Bordereau des Prix Unitaires"
- Ajouter spécialité si pertinent: "BPU - Terrassement"
- Exemple: "Bordereau des Prix Unitaires - Lot Gros Œuvre"

### 3. **Utilisation des modèles**
- Privilégier les modèles existants pour cohérence
- Modifier prix si nécessaire (évolution marché)
- Ajouter nouveaux articles courants à la bibliothèque

### 4. **Gestion des quantités**
- Saisir quantités précises issues des métrés
- Ne pas arrondir excessivement
- Mettre 0 si article prévu mais non encore quantifié

### 5. **Sauvegarde régulière**
- Cliquer "Enregistrer" régulièrement
- Données sauvegardées localement (IndexedDB)
- Sync automatique quand en ligne

### 6. **Export pour partage**
- Exporter en CSV pour compatibilité
- Ouvrable dans Excel, Google Sheets, etc.
- Inclut automatiquement totaux et TVA

## Dépannage

### Problème: Auto-complétion ne fonctionne pas
**Solution**: Taper au moins 2 caractères dans le champ Désignation

### Problème: Import Excel échoue
**Solutions**:
- Vérifier format: N°, Désignation, U, Quantité, Prix unitaire
- S'assurer que toutes les lignes ont une désignation
- Supprimer lignes vides
- Vérifier que les nombres sont bien des nombres (pas de texte)

### Problème: Calculs incorrects
**Solutions**:
- Vérifier format des nombres (point ou virgule)
- S'assurer que quantité et prix sont > 0
- Recharger la page et réessayer

### Problème: Bordereau non sauvegardé
**Solutions**:
- Cliquer explicitement "Enregistrer"
- Vérifier connexion si online
- Consulter onglet Application > IndexedDB dans DevTools

## Évolutions futures

### Court terme
- [ ] Export PDF avec mise en page professionnelle
- [ ] Duplication de bordereau au sein du même projet
- [ ] Historique des modifications
- [ ] Commentaires sur les lignes

### Moyen terme
- [ ] Import depuis autres formats (CSV, ODS)
- [ ] Bibliothèque de modèles personnalisée par utilisateur
- [ ] Catégories personnalisables
- [ ] Formules de prix complexes (déboursés + coefficients)

### Long terme
- [ ] Intégration avec métrés pour calcul automatique quantités
- [ ] Comparaison entre bordereaux (ancien vs nouveau)
- [ ] Analyse prix marché et suggestions
- [ ] Templates de bordereaux complets par type de projet

## Support

Pour toute question ou problème:
- Consulter cette documentation
- Vérifier les logs de sync dans DevTools
- Contacter support technique

---

**Version**: 1.0.0  
**Dernière mise à jour**: Décembre 2024  
**Auteur**: Équipe de développement
