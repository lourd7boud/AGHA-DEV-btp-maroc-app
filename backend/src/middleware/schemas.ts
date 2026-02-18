/**
 * Zod Validation Schemas for all API endpoints
 * 
 * Centralizes input validation rules using Zod.
 * Each schema matches the expected request body for its endpoint.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════
// 🔒 AUTH SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const loginSchema = z.object({
  email: z.string().email('Invalid email format').transform(v => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format').transform(v => v.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100).trim(),
  lastName: z.string().min(1, 'Last name is required').max(100).trim(),
});

export const createUserSchema = z.object({
  email: z.string().email('Invalid email format').transform(v => v.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(100).trim(),
  lastName: z.string().min(1, 'Last name is required').max(100).trim(),
  role: z.enum(['user', 'admin', 'super_admin']).optional().default('user'),
  trialEndDate: z.string().datetime().nullable().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  role: z.enum(['user', 'admin', 'super_admin']).optional(),
  isActive: z.boolean().optional(),
  trialEndDate: z.string().datetime().nullable().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export const refreshTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// ═══════════════════════════════════════════════════════════════════════
// 📁 PROJECT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createProjectSchema = z.object({
  objet: z.string().min(1, 'Object is required').max(500),
  marcheNo: z.string().min(1, 'Marché number is required').max(100),
  annee: z.union([z.string(), z.number()]).transform(v => String(v)),
  montant: z.number().nonnegative().optional().default(0),
  maitreDOuvrage: z.string().max(500).optional().default(''),
  delai: z.number().int().nonnegative().optional().default(0),
  dateOrdreService: z.string().optional().default(''),
  entreprise: z.string().max(500).optional().default(''),
  tauxTVA: z.number().min(0).max(100).optional().default(20),
  tauxRetenue: z.number().min(0).max(100).optional().default(10),
});

export const updateProjectSchema = createProjectSchema.partial();

// ═══════════════════════════════════════════════════════════════════════
// 📋 BORDEREAU SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

const bordereauLigneSchema = z.object({
  numero: z.union([z.string(), z.number()]).optional(),
  designation: z.string().optional().default(''),
  unite: z.string().optional().default(''),
  quantite: z.number().optional().default(0),
  prixUnitaire: z.number().optional().default(0),
  montant: z.number().optional().default(0),
}).passthrough();

export const createBordereauSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  lignes: z.array(bordereauLigneSchema).optional().default([]),
});

export const updateBordereauSchema = z.object({
  lignes: z.array(bordereauLigneSchema).optional().default([]),
  montantTotal: z.number().nonnegative().optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// 📐 METRE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createMetreSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  periodeId: z.string().optional(),
  sections: z.any().optional(),
  subSections: z.any().optional(),
  lignes: z.any().optional(),
}).passthrough();

export const updateMetreSchema = z.object({
  sections: z.any().optional(),
  subSections: z.any().optional(),
  lignes: z.any().optional(),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════
// 📄 DECOMPT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createDecomptSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  periodeId: z.string().min(1, 'Période ID is required'),  // 🔒 REQUIRED — no orphan décomptes
  numero: z.union([z.string(), z.number()]),
  montantCumule: z.number().optional().default(0),
  montantActuel: z.number().optional().default(0),
  totalTTC: z.number().optional(),
  totalGeneralTTC: z.number().optional(),
  lignes: z.any().optional(),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════
// 📷 PHOTO SCHEMAS 
// ═══════════════════════════════════════════════════════════════════════

// MIME types whitelist for photos
export const ALLOWED_PHOTO_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

// MIME types whitelist for attachments
export const ALLOWED_ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-rar-compressed',
] as const;

// ═══════════════════════════════════════════════════════════════════════
// 📝 PV SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createPVSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  type: z.string().min(1, 'PV type is required'),
  numero: z.union([z.string(), z.number()]),
  date: z.string().min(1, 'Date is required'),
  objet: z.string().min(1, 'Object is required').max(1000),
  participants: z.any().optional(),
  observations: z.string().optional().default(''),
  decisions: z.any().optional(),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════
// 📅 PERIODE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createPeriodeSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  numero: z.union([z.string(), z.number()]),
  dateDebut: z.string().optional(),
  dateFin: z.string().optional(),
  statut: z.string().optional().default('en_cours'),
}).passthrough();

// ═══════════════════════════════════════════════════════════════════════
// 📊 REVISION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createFormulaSchema = z.object({
  name: z.string().min(1, 'Formula name is required').max(200),
  description: z.string().max(1000).optional(),
  fixedPart: z.number().min(0).max(1),
  weights: z.record(z.string(), z.number().min(0).max(1)),
  isDefault: z.boolean().optional().default(false),
});

export const createIndexSchema = z.object({
  monthDate: z.string().min(1, 'Month date is required'),
  indexValues: z.record(z.string(), z.number()),
  source: z.string().optional().default('Manual'),
});

export const createProjectConfigSchema = z.object({
  formula: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    fixedPart: z.number().min(0).max(1).optional(),
    weights: z.record(z.string(), z.number()).optional(),
  }).optional(),
  formulaId: z.union([z.string(), z.number()]).optional(),
  baseIndexes: z.record(z.string(), z.number()).optional().default({}),
  baseDate: z.string().nullable().optional(),
  isEnabled: z.boolean().optional().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// 📊 INDEX MANAGEMENT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const createMonthIndexesSchema = z.object({
  monthDate: z.string().min(1, 'Month date is required'),
  indexes: z.record(z.string(), z.number()),
  status: z.enum(['provisoire', 'definitif']).optional().default('provisoire'),
  source: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

// ═══════════════════════════════════════════════════════════════════════
// 🔧 COMMON PARAM SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});
