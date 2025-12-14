import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

/**
 * Create metre (PostgreSQL version)
 */
export const createMetre = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('=== METRE CREATE REQUEST ===');
    logger.info('Creating metre...');
    
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { projectId, periodeId, bordereauLigneId, data } = req.body;

    if (!projectId) {
      throw new ApiError('Project ID required', 400);
    }

    const pool = getPool();
    const metreId = uuidv4();

    // Check project exists and belongs to user
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, req.user.id]
    );

    if (projectCheck.rows.length === 0) {
      throw new ApiError('Project not found or not authorized', 404);
    }

    const result = await pool.query(
      `INSERT INTO metres (id, project_id, periode_id, bordereau_ligne_id, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [metreId, projectId, periodeId || null, bordereauLigneId || null, JSON.stringify(data || {})]
    );

    logger.info(`Metre created: ${metreId}`);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error creating metre:', error);
    next(error);
  }
};

/**
 * Get all metres for a project (PostgreSQL version)
 */
export const getMetres = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log('=== METRES GET ALL REQUEST ===');
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
      `SELECT * FROM metres WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [projectId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error('Error fetching metres:', error);
    next(error);
  }
};

/**
 * Get metre by ID (PostgreSQL version)
 */
export const getMetreById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const pool = getPool();

    const result = await pool.query(
      `SELECT m.* FROM metres m
       INNER JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND p.user_id = $2 AND m.deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Metre not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update metre (PostgreSQL version)
 */
export const updateMetre = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const { periodeId, bordereauLigneId, data } = req.body;
    const pool = getPool();

    // Check ownership
    const existing = await pool.query(
      `SELECT m.* FROM metres m
       INNER JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND p.user_id = $2 AND m.deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      throw new ApiError('Metre not found', 404);
    }

    const result = await pool.query(
      `UPDATE metres SET 
        periode_id = COALESCE($1, periode_id),
        bordereau_ligne_id = COALESCE($2, bordereau_ligne_id),
        data = COALESCE($3, data),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [periodeId, bordereauLigneId, data ? JSON.stringify(data) : null, id]
    );

    logger.info(`Metre updated: ${id}`);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete metre (PostgreSQL version)
 */
export const deleteMetre = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params;
    const pool = getPool();

    // Check ownership
    const existing = await pool.query(
      `SELECT m.* FROM metres m
       INNER JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND p.user_id = $2 AND m.deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (existing.rows.length === 0) {
      throw new ApiError('Metre not found', 404);
    }

    await pool.query(
      `UPDATE metres SET deleted_at = NOW() WHERE id = $1`,
      [id]
    );

    logger.info(`Metre deleted: ${id}`);

    res.json({
      success: true,
      message: 'Metre deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
