import { Response, NextFunction } from 'express';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { keysToCamel } from '../utils/transform';

// Use canonical keysToCamel (was duplicated here)
const snakeToCamel = keysToCamel;

/**
 * Get all periodes for a project
 */
export const getPeriodes = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
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

    // Accept projectId from params (URL) or body
    const projectIdFromParams = req.params.projectId;
    const { projectId: projectIdFromBody, numero, libelle, dateDebut, dateFin, statut, isDecompteDernier } = req.body;
    const projectId = projectIdFromParams || projectIdFromBody;
    
    if (!projectId) {
      throw new ApiError('Project ID is required', 400);
    }
    
    const pool = getPool();

    // Verify project ownership
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [projectId, req.user.id]
    );

    if (projectCheck.rows.length === 0) {
      throw new ApiError('Project not found or not authorized', 404);
    }

    // 🔒 Check for duplicate: prevent duplicate periode with same numero for same project
    const duplicateCheck = await pool.query(
      'SELECT id FROM periodes WHERE project_id = $1 AND numero = $2 AND deleted_at IS NULL',
      [projectId, numero]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new ApiError(`Une période/métré N°${numero} existe déjà pour ce projet. Veuillez utiliser un numéro différent.`, 409);
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
  } catch (error: any) {
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
    const { libelle, dateDebut, dateFin, statut, isDecompteDernier,
            tauxTVA, tauxRetenue, depensesExercicesAnterieurs, decomptesPrecedents } = req.body;
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
        taux_tva = COALESCE($7, taux_tva),
        taux_retenue = COALESCE($8, taux_retenue),
        depenses_exercices_anterieurs = COALESCE($9, depenses_exercices_anterieurs),
        decomptes_precedents = COALESCE($10, decomptes_precedents),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *`,
      [libelle, dateDebut, dateFin, statut, isDecompteDernier, id,
       tauxTVA, tauxRetenue, depensesExercicesAnterieurs, decomptesPrecedents]
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
 * Insert a new periode BEFORE an existing one
 * Renumbers all subsequent periodes and creates the new one with a draft décompte
 */
export const insertPeriodeBefore = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new ApiError('Not authenticated', 401);

    const { id } = req.params; // ID of the target periode (insert BEFORE this one)
    const pool = getPool();

    // 1. Fetch the target period and verify ownership
    const targetResult = await pool.query(
      `SELECT pe.*, p.user_id as project_owner_id
       FROM periodes pe
       INNER JOIN projects p ON pe.project_id = p.id
       WHERE pe.id = $1 AND p.user_id = $2 AND pe.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [id, req.user.id]
    );

    if (targetResult.rows.length === 0) {
      throw new ApiError('Période non trouvée ou non autorisée', 404);
    }

    const targetPeriode = targetResult.rows[0];
    const projectId = targetPeriode.project_id;
    const insertAtNumero = targetPeriode.numero;

    // 2. Cannot insert before period 1 if there are none before it — actually we CAN.
    //    But inserting before period 1 would create a new period 1 and shift everything.
    //    That's fine. The minimum is insertAtNumero >= 1.

    if (insertAtNumero < 1) {
      throw new ApiError('Numéro de période invalide', 400);
    }

    // 3. Use a transaction to ensure atomicity
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 4. Increment numero for all periodes >= insertAtNumero (in REVERSE order to avoid unique constraint violation)
      //    We go from the highest numero down to insertAtNumero
      const periodestoShift = await client.query(
        `SELECT id, numero FROM periodes 
         WHERE project_id = $1 AND numero >= $2 AND deleted_at IS NULL
         ORDER BY numero DESC`,
        [projectId, insertAtNumero]
      );

      for (const row of periodestoShift.rows) {
        await client.query(
          `UPDATE periodes SET numero = $1, updated_at = NOW() WHERE id = $2`,
          [row.numero + 1, row.id]
        );
      }

      // 5. Update libelle of shifted periodes to match new numero
      for (const row of periodestoShift.rows) {
        await client.query(
          `UPDATE periodes SET libelle = $1 WHERE id = $2 AND libelle LIKE 'Période %'`,
          [`Période ${row.numero + 1}`, row.id]
        );
      }

      // 6. Update decompts numero to match their période's new numero
      for (const row of periodestoShift.rows) {
        await client.query(
          `UPDATE decompts SET numero = $1, updated_at = NOW() 
           WHERE periode_id = $2 AND deleted_at IS NULL`,
          [row.numero + 1, row.id]
        );
      }

      // 7. Create the new période at insertAtNumero
      const now = new Date().toISOString();
      const newPeriodeResult = await client.query(
        `INSERT INTO periodes (
          project_id, user_id, numero, libelle, date_debut, date_fin, statut
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [projectId, req.user.id, insertAtNumero, `Période ${insertAtNumero}`, now, now, 'en_cours']
      );

      const newPeriode = newPeriodeResult.rows[0];

      // 8. Create a draft décompte for the new période
      await client.query(
        `INSERT INTO decompts (
          project_id, periode_id, user_id, numero, statut
        ) VALUES ($1, $2, $3, $4, $5)`,
        [projectId, newPeriode.id, req.user.id, insertAtNumero, 'draft']
      );

      await client.query('COMMIT');

      logger.info(`Inserted new période ${insertAtNumero} before old ${insertAtNumero} (now ${insertAtNumero + 1}) in project ${projectId}`);

      res.status(201).json({
        success: true,
        data: snakeToCamel(newPeriode),
        message: `Période ${insertAtNumero} créée avec succès. Les périodes suivantes ont été renumérotées.`,
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error: any) {
    logger.error('Error inserting periode before:', error);
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
