import Dexie, { Table } from 'dexie';

// Types locaux (miroir des types backend)
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'admin' | 'user';
  isActive: boolean;
  trialEndDate?: string;          // تاريخ انتهاء الفترة التجريبية
  createdBy?: string;             // من أنشأ الحساب
  createdAt: string;
  lastLogin?: string;
  token?: string;
  lastSync?: number;
}

export interface Project {
  id: string;
  userId: string;
  objet: string;
  marcheNo: string;
  annee: string;
  dateOuverture: string;
  montant: number;
  typeMarche?: 'normal' | 'negocie';  // نوع المشروع: عادي أو تفاوضي
  commune?: string;                   // الجماعة (Commune) - Province de Tata
  // Informations entreprise (pour PDF)
  societe?: string;              // Nom de la société
  rc?: string;                   // R.C. n° (Registre de Commerce)
  cb?: string;                   // C.B n° (Compte Bancaire)
  cnss?: string;                 // C.N.S.S. n° (Caisse Nationale de Sécurité Sociale)
  patente?: string;              // Numéro de patente
  // Informations projet supplémentaires (pour PDF)
  programme?: string;            // Programme budgétaire
  projet?: string;               // Numéro de projet
  ligne?: string;                // Ligne budgétaire
  chapitre?: string;             // Chapitre budgétaire
  ordreService?: string;         // Date ordre de service (format: DD/MM/YYYY)
  delaisExecution?: number;      // Délais d'exécution en mois
  
  // === Gestion des délais ===
  osc?: string;                  // Ordre de Service de Commencement (date début travaux)
  // Arrêts et reprises (jusqu'à 5)
  arrets?: ArretTravaux[];       // Liste des arrêts de travaux
  // Dates de réception
  dateReceptionProvisoire?: string;   // Date réception provisoire
  dateReceptionDefinitive?: string;   // Date réception définitive
  achevementTravaux?: string;         // Date achèvement travaux (ACH TVX)
  
  // Champs anciens (à supprimer progressivement)
  snss?: string;                 // @deprecated: use cnss instead
  cbn?: string;                  // @deprecated: use cb instead
  rcn?: string;                  // @deprecated: use rc instead
  delaisEntreeService?: string;  // @deprecated: use delaisExecution instead
  status: 'draft' | 'active' | 'completed' | 'archived';
  progress: number;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  _rev?: string;
}

// Interface pour les arrêts de travaux
export interface ArretTravaux {
  id: string;
  dateArret: string;      // OSA - Date d'arrêt
  dateReprise?: string;   // OSR - Date de reprise
  motif: string;          // Motif de l'arrêt
}

export interface Bordereau {
  id: string;
  projectId: string;
  userId: string;
  reference: string;
  designation: string;
  lignes: Array<{
    id: string;
    numero: number;
    designation: string;
    unite: string;
    quantite: number;
    prixUnitaire: number;
    montant: number;
  }>;
  montantTotal: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// ============== HIERARCHICAL METRE STRUCTURE ==============
// Structure: Section (Douar) → SubSection (Element) → MetreLigne (Measurement)

/**
 * Section principale - représente un lieu/douar
 * Exemple: "AIT WARKHAN-AIT WAHMAN", "DOUAR TAFRAOUT"
 */
export interface MetreSection {
  id: string;
  titre: string;                    // Titre de la section (ex: "pour (AIT WARKHAN-AIT WAHMAN)")
  ordre: number;                    // Ordre d'affichage
  couleur?: string;                 // Couleur pour différencier (optionnel)
  isCollapsed?: boolean;            // État plié/déplié
  isFromPreviousPeriode?: boolean;  // 🔴 لتحديد إذا كان من فترة سابقة
}

/**
 * Sous-section - représente un élément de construction
 * Exemple: "semeille", "Potaux", "radier", "voile", "dalle"
 */
export interface MetreSubSection {
  id: string;
  sectionId: string;                // Référence à la section parente
  titre: string;                    // Titre (ex: "semeille", "radier + voile")
  ordre: number;                    // Ordre d'affichage dans la section
  isCollapsed?: boolean;            // État plié/déplié
  nombreElements?: number;          // Nombre d'éléments/structures (ex: nombre de poteaux)
  isFromPreviousPeriode?: boolean;  // 🔴 لتحديد إذا كان من فترة سابقة
}

/**
 * Ligne de mesure - les données de calcul réelles
 */
export interface MetreLigne {
  id: string;
  sectionId?: string;               // Référence à la section (optionnel pour rétrocompatibilité)
  subSectionId?: string;            // Référence à la sous-section (optionnel)
  numero: number;
  designation: string;
  
  // Nombre des parties semblables (multiplicateur)
  nombreSemblables?: number;
  
  // Dimensions selon l'unité
  longueur?: number;
  largeur?: number;
  profondeur?: number;
  nombre?: number;
  diametre?: number;
  
  // Résultats
  partiel: number;
  observations?: string;
  isFromPreviousPeriode?: boolean;  // 🔴 لتحديد إذا كان من فترة سابقة
}

export interface Metre {
  id: string;
  projectId: string;
  periodeId: string;
  bordereauLigneId: string;
  userId: string;
  
  // Info bordereau
  reference: string;
  designationBordereau: string;
  unite: string;
  
  // ============== HIERARCHICAL STRUCTURE ==============
  // Sections et sous-sections pour organisation hiérarchique
  sections?: MetreSection[];        // Sections principales (Douars, Lieux)
  subSections?: MetreSubSection[];  // Sous-sections (Éléments: semeille, radier, etc.)
  
  // Lignes de métré
  lignes: MetreLigne[];
  
  // Totaux
  totalPartiel: number;
  totalCumule: number;
  quantiteBordereau: number;
  pourcentageRealisation: number;
  
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Periode {
  id: string;
  projectId: string;
  userId: string;
  numero: number;
  libelle: string;
  dateDebut: string;
  dateFin: string;
  statut: 'en_cours' | 'validee' | 'facturee';
  isDecompteDernier?: boolean; // True si c'est le dernier décompte
  observations?: string;
  // Paramètres financiers du décompte
  tauxTVA?: number; // Taux TVA (défaut: 20%)
  tauxRetenue?: number; // Taux retenue de garantie (défaut: 10%)
  depensesExercicesAnterieurs?: number; // Dépenses imputées sur exercices antérieurs
  decomptesPrecedents?: number; // Montant des acomptes délivrés sur l'exercice en cours
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Decompt {
  id: string;
  projectId: string;
  periodeId: string;
  userId: string;
  numero: number;
  lignes: Array<{
    prixNo: number;
    designation: string;
    unite: string;
    quantiteBordereau: number;
    quantiteRealisee: number;
    prixUnitaireHT: number;
    montantHT: number;
    bordereauLigneId: string;
    metreId?: string;
  }>;
  montantTotal: number;
  totalTTC?: number;
  statut: 'draft' | 'submitted' | 'validated' | 'paid';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Photo {
  id: string;
  projectId: string;
  userId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  tags: string[];
  location?: { latitude: number; longitude: number };
  localPath?: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;                // 'create_user', 'disable_user', 'enable_user', etc.
  entityType: string;            // 'user', 'project', 'decompte', etc.
  entityId?: string;
  details: any;                  // معلومات إضافية عن العملية
  ipAddress?: string;
  timestamp: string;
}

export interface PV {
  id: string;
  projectId: string;
  userId: string;
  type: 'installation' | 'reception' | 'constat' | 'other';
  numero: string;
  date: string;
  objet: string;
  contenu: string;
  participants: Array<{
    nom: string;
    fonction: string;
    signature?: string;
  }>;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Attachment {
  id: string;
  projectId: string;
  userId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  category: 'facture' | 'bp' | 'plan' | 'autre';
  description?: string;
  linkedTo?: {
    type: 'project' | 'bordereau' | 'metre' | 'decompt' | 'pv';
    id: string;
  };
  localPath?: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SyncOperation {
  id: string;
  userId: string;
  deviceId: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'project' | 'bordereau' | 'periode' | 'metre' | 'decompt' | 'photo' | 'pv' | 'attachment' | 'company';
  entityId: string;
  data: any;
  timestamp: number;
  synced: boolean;
  syncedAt?: number;
  conflicts?: {
    localData: any;
    remoteData: any;
    resolved: boolean;
    resolution?: 'local' | 'remote' | 'merge';
  };
}

// Informations de l'entreprise/société (pour autocomplétion)
export interface Company {
  id: string;
  userId: string;
  nom: string;           // Nom de la société
  rc?: string;           // Registre de Commerce
  cb?: string;           // Compte Bancaire
  cnss?: string;         // CNSS
  patente?: string;      // Numéro de patente
  adresse?: string;      // Adresse
  telephone?: string;    // Téléphone
  email?: string;        // Email
  usageCount: number;    // Nombre de fois utilisée (pour tri par popularité)
  lastUsed: string;      // Dernière utilisation
  createdAt: string;
  updatedAt: string;
}

// Base de données Dexie
export class ProjetDatabase extends Dexie {
  users!: Table<User, string>;
  projects!: Table<Project, string>;
  bordereaux!: Table<Bordereau, string>;
  periodes!: Table<Periode, string>;
  metres!: Table<Metre, string>;
  decompts!: Table<Decompt, string>;
  photos!: Table<Photo, string>;
  pvs!: Table<PV, string>;
  attachments!: Table<Attachment, string>;
  syncOperations!: Table<SyncOperation, string>;
  auditLogs!: Table<AuditLog, string>;
  companies!: Table<Company, string>;

  constructor() {
    super('ProjetGestionDB');
    
    // Version 1: Schema initial
    this.version(1).stores({
      users: 'id, email',
      projects: 'id, userId, status, annee, marcheNo',
      bordereaux: 'id, projectId, userId, reference',
      metres: 'id, projectId, bordereauLigneId, userId, reference',
      decompts: 'id, projectId, userId, periode, numero',
      photos: 'id, projectId, userId, syncStatus',
      pvs: 'id, projectId, userId, type, date',
      attachments: 'id, projectId, userId, category, syncStatus',
      syncOperations: 'id, userId, deviceId, entity, timestamp, synced, syncedAt',
    });

    // Version 2: Ajout de l'index syncedAt pour syncOperations
    this.version(2).stores({
      syncOperations: 'id, userId, deviceId, entity, timestamp, synced, syncedAt',
    });

    // Version 3: Ajout de Periode et mise à jour de Metre/Decompt avec periodeId
    this.version(3).stores({
      periodes: 'id, projectId, userId, numero, statut',
      metres: 'id, projectId, periodeId, bordereauLigneId, userId, reference',
      decompts: 'id, projectId, periodeId, userId, numero',
    });

    // Version 4: Ajout des paramètres financiers dans Periode (pas besoin de changer les stores)
    this.version(4).stores({
      periodes: 'id, projectId, userId, numero, statut',
    });

    // Version 5: Ajout des champs entreprise et projet pour PDF (pas besoin de changer les stores)
    this.version(5).stores({
      projects: 'id, userId, status, annee, marcheNo',
    });

    // Version 6: Ajout de AuditLog et mise à jour de User avec nouveaux champs
    this.version(6).stores({
      users: 'id, email, role, isActive, createdBy',
      auditLogs: 'id, userId, action, entityType, timestamp',
    });

    // Version 7: Ajout de la table Companies pour l'autocomplétion
    this.version(7).stores({
      companies: 'id, userId, nom, rc, cnss, usageCount, lastUsed',
    });

    // Version 8: Enhanced indexes for sync operations
    this.version(8).stores({
      syncOperations: 'id, userId, deviceId, entity, entityId, timestamp, synced, syncedAt, [userId+synced]',
      projects: 'id, userId, status, annee, marcheNo, deletedAt',
      bordereaux: 'id, projectId, userId, reference, deletedAt',
      metres: 'id, projectId, periodeId, bordereauLigneId, userId, deletedAt',
      decompts: 'id, projectId, periodeId, userId, numero, deletedAt',
      periodes: 'id, projectId, userId, numero, statut, deletedAt',
    });
  }
}

export const db = new ProjetDatabase();
