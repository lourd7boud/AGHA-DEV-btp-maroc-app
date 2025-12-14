import { Response, NextFunction } from 'express';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

/**
 * Convert snake_case to camelCase for API response
 */
const snakeToCamel = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  
  if (typeof obj !== 'object') return obj;
  
  const newObj: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    let value = obj[key];
    
    if (value instanceof Date) {
      value = value.toISOString();
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        value = date.toISOString();
      }
    }
    
    newObj[camelKey] = snakeToCamel(value);
  }
  return newObj;
};

/**
 * Get all periodes for a project
 */
export const getPeriodes = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('=== PERIODES GET ALL REQUEST ===');
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId } = req.params;
    const pool = getPool();

    // Verify project ownership
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, req.user.id]
    );

    if (projectCheck.rows.length === 0) {
      throw new ApiError('Project not found or not authorized', 404);
    }

    const result = await pool.query(
      `SELECT * FROM periodes WHERE project_id = $1 AND deleted_at IS NULL ORDER BY numero ASC`,
      [projectId]
    );

    console.log(`Found ${result.rows.length} periodes for project ${projectId}`);

    res.json({
      success: true,
      data: result.rows.map(snakeToCamel),
      count: result.rows.length,
    });
  } catch (error) {
    logger.error('Error fetching periodes:', error);
    next(error);
  }
};

/**
 * Get periode by ID
 */
export const getPeriodeById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT pe.* FROM periodes pe
       INNER JOIN projects p ON pe.project_id = p.id
       WHERE pe.id = $1 AND p.user_id = $2 AND pe.deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Periode not found', 404);
    }

    res.json({
      success: true,
      data: snakeToCamel(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new periode
 */
export const createPeriode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId, numero, libelle, dateDebut, dateFin, statut, isDecompteDernier } = req.body;
    const pool = getPool();

    // Verify project ownership
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, req.user.id]
    );

    if (projectCheck.rows.length === 0) {
      throw new ApiError('Project not found or not authorized', 404);
    }

    const result = await pool.query(
      `INSERT INTO periodes (
        project_id, user_id, numero, libelle, date_debut, date_fin, statut, is_decompte_dernier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [projectId, req.user.id, numero, libelle, dateDebut, dateFin, statut || 'en_cours', isDecompteDernier || false]
    );

    res.status(201).json({
      success: true,
      data: snakeToCamel(result.rows[0]),
    });
  } catch (error) {
    logger.error('Error creating periode:', error);
    next(error);
  }
};

/**
 * Update periode
 */
export const updatePeriode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const { libelle, dateDebut, dateFin, statut, isDecompteDernier } = req.body;
    const pool = getPool();

    // Check ownership
    const ownerCheck = await pool.query(
      `SELECT pe.id FROM periodes pe
       INNER JOIN projects p ON pe.project_id = p.id
       WHERE pe.id = $1 AND p.user_id = $2`,
      [id, req.user.id]
    );

    if (ownerCheck.rows.length === 0) {
      throw new ApiError('Periode not found or not authorized', 404);
    }

    const result = await pool.query(
      `UPDATE periodes SET 
        libelle = COALESCE($1, libelle),
        date_debut = COALESCE($2, date_debut),
        date_fin = COALESCE($3, date_fin),
        statut = COALESCE($4, statut),
        is_decompte_dernier = COALESCE($5, is_decompte_dernier),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *`,
      [libelle, dateDebut, dateFin, statut, isDecompteDernier, id]
    );

    res.json({
      success: true,
      data: snakeToCamel(result.rows[0]),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete periode (soft delete)
 */
export const deletePeriode = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const pool = getPool();

    // Check ownership
    const ownerCheck = await pool.query(
      `SELECT pe.id FROM periodes pe
       INNER JOIN projects p ON pe.project_id = p.id
       WHERE pe.id = $1 AND p.user_id = $2`,
      [id, req.user.id]
    );

    if (ownerCheck.rows.length === 0) {
      throw new ApiError('Periode not found or not authorized', 404);
    }

    await pool.query(
      `UPDATE periodes SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Periode deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
