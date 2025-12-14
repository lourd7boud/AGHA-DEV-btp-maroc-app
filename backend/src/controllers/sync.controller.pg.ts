import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

// Helper function to convert snake_case to camelCase and format dates
const snakeToCamel = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);

  // Convert Date objects to ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (typeof obj !== 'object') return obj;

  const newObj: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    let value = obj[key];

    // Convert Date objects to ISO string
    if (value instanceof Date) {
      value = value.toISOString();
    }
    // Convert PostgreSQL timestamp strings to ISO format
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value)) {
      // It's already a date string, ensure it's in ISO format
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
 * Push local operations to server (PostgreSQL version)
 * Using actual table schema: sync_operations(id, client_id, user_id, operation_type, table_name, record_id, payload, timestamp, synced_at)
 */
export const syncPush = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { operations, deviceId } = req.body;

    if (!operations || !Array.isArray(operations)) {
      throw new ApiError('Invalid operations data', 400);
    }

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
      conflicts: [] as { id: string; localData: any; remoteData: any }[],
    };

    // Process each operation independently (no global transaction)
    for (const op of operations) {
      try {
        const { type, entity, entityId: rawEntityId, data, timestamp } = op;

        // Clean the entity ID (remove prefix like "project:", "bordereau:", etc.)
        const entityId = rawEntityId.includes(':') ? rawEntityId.split(':').pop() : rawEntityId;

        // Map entity to table name
        const tableMap: Record<string, string> = {
          project: 'projects',
          bordereau: 'bordereaux',
          periode: 'periodes',
          metre: 'metres',
          decompt: 'decompts',
          attachment: 'attachments',
        };

        const tableName = tableMap[entity];
        if (!tableName) {
          results.failed.push({ id: rawEntityId, error: `Unknown entity type: ${entity}` });
          continue;
        }

        logger.info(`Processing ${type} operation for ${entity}:${entityId}`);

        // Check for conflicts (UPDATE and DELETE)
        if (type === 'UPDATE' || type === 'DELETE') {
          const existing = await pool.query(
            `SELECT * FROM ${tableName} WHERE id = $1`,
            [entityId]
          );

          if (existing.rows.length > 0) {
            const existingDoc = existing.rows[0];
            const existingTimestamp = new Date(existingDoc.updated_at).getTime();

            if (existingTimestamp > timestamp) {
              results.conflicts.push({
                id: entityId,
                localData: data,
                remoteData: existingDoc,
              });
              continue;
            }
          }
        }

        // Apply operation
        switch (type) {
          case 'CREATE':
            await applyCreate(pool, tableName, entityId, data, req.user.id);
            break;
          case 'UPDATE':
            await applyUpdate(pool, tableName, entityId, data);
            break;
          case 'DELETE':
            await applyDelete(pool, tableName, entityId);
            break;
        }

        // Log sync operation using correct column names
        await pool.query(
          `INSERT INTO sync_operations (id, client_id, user_id, operation_type, table_name, record_id, payload, timestamp, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [uuidv4(), deviceId || 'default', req.user.id, type, tableName, entityId, JSON.stringify(data), timestamp]
        );

        results.success.push(rawEntityId);
      } catch (error: any) {
        logger.error('Sync push error for operation:', error.message);
        results.failed.push({
          id: op.entityId,
          error: error.message,
        });
        // Continue with next operation - don't fail the whole batch
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

/**
 * Pull remote changes since last sync (PostgreSQL version)
 * Using actual table schema: sync_operations(id, client_id, user_id, operation_type, table_name, record_id, payload, timestamp, synced_at)
 */
export const syncPull = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { lastSync, deviceId } = req.query;
    const pool = getPool();

    let lastSyncTimestamp = 0;
    if (lastSync && typeof lastSync === 'string') {
      lastSyncTimestamp = parseInt(lastSync);
    }

    const operations: any[] = [];

    // If lastSync is 0 or very small, this is a full sync - return all existing data
    if (lastSyncTimestamp === 0 || lastSyncTimestamp < 1000000000000) {
      logger.info(`Full sync requested for user ${req.user.id}, lastSync: ${lastSyncTimestamp}`);

      // CRITICAL FIX: Get ONLY active projects - NO deleted ones in INIT SYNC
      // Deleted projects should NEVER be sent in full sync to prevent DELETE loops
      const projectsQuery = `SELECT * FROM projects WHERE user_id = $1 AND deleted_at IS NULL`;
      logger.info(`Executing projects query: ${projectsQuery} with userId: ${req.user.id}`);

      const projects = await pool.query(projectsQuery, [req.user.id]);

      logger.info(`Found ${projects.rows.length} active projects in database for user ${req.user.id}`);

      for (const project of projects.rows) {
        // Only CREATE operations for active projects
        operations.push({
          id: `full-sync-project-${project.id}`,
          type: 'CREATE',
          entity: 'project',
          entityId: project.id,
          data: snakeToCamel(project),
          timestamp: new Date(project.updated_at || project.created_at).getTime(),
        });
      }

      // Get all bordereaux for user's projects
      const bordereaux = await pool.query(
        `SELECT b.* FROM bordereaux b
         INNER JOIN projects p ON b.project_id = p.id
         WHERE p.user_id = $1 AND b.deleted_at IS NULL`,
        [req.user.id]
      );

      for (const bordereau of bordereaux.rows) {
        operations.push({
          id: `full-sync-bordereau-${bordereau.id}`,
          type: 'CREATE',
          entity: 'bordereau',
          entityId: bordereau.id,
          data: snakeToCamel(bordereau),
          timestamp: new Date(bordereau.updated_at || bordereau.created_at).getTime(),
        });
      }

      // Get all periodes
      const periodes = await pool.query(
        `SELECT pe.* FROM periodes pe
         INNER JOIN projects p ON pe.project_id = p.id
         WHERE p.user_id = $1 AND pe.deleted_at IS NULL`,
        [req.user.id]
      );

      for (const periode of periodes.rows) {
        operations.push({
          id: `full-sync-periode-${periode.id}`,
          type: 'CREATE',
          entity: 'periode',
          entityId: periode.id,
          data: snakeToCamel(periode),
          timestamp: new Date(periode.updated_at || periode.created_at).getTime(),
        });
      }

      // Get all metres
      const metres = await pool.query(
        `SELECT m.* FROM metres m
         INNER JOIN projects p ON m.project_id = p.id
         WHERE p.user_id = $1 AND m.deleted_at IS NULL`,
        [req.user.id]
      );

      for (const metre of metres.rows) {
        operations.push({
          id: `full-sync-metre-${metre.id}`,
          type: 'CREATE',
          entity: 'metre',
          entityId: metre.id,
          data: snakeToCamel(metre),
          timestamp: new Date(metre.updated_at || metre.created_at).getTime(),
        });
      }

      // Get all decompts
      const decompts = await pool.query(
        `SELECT d.* FROM decompts d
         INNER JOIN projects p ON d.project_id = p.id
         WHERE p.user_id = $1 AND d.deleted_at IS NULL`,
        [req.user.id]
      );

      for (const decompt of decompts.rows) {
        operations.push({
          id: `full-sync-decompt-${decompt.id}`,
          type: 'CREATE',
          entity: 'decompt',
          entityId: decompt.id,
          data: snakeToCamel(decompt),
          timestamp: new Date(decompt.updated_at || decompt.created_at).getTime(),
        });
      }

      logger.info(`Full sync: returning ${operations.length} operations for user ${req.user.id}`);
    } else {
      // Incremental sync - get only sync operations after lastSync
      const result = await pool.query(
        `SELECT id, operation_type as type, table_name, record_id, payload, timestamp
         FROM sync_operations 
         WHERE user_id = $1 
           AND timestamp > $2
           AND client_id != $3
         ORDER BY timestamp ASC`,
        [req.user.id, lastSyncTimestamp, deviceId || '']
      );

      // Map table names back to entity names
      const reverseTableMap: Record<string, string> = {
        projects: 'project',
        bordereaux: 'bordereau',
        periodes: 'periode',
        metres: 'metre',
        decompts: 'decompt',
        attachments: 'attachment',
      };

      for (const row of result.rows) {
        operations.push({
          id: row.id,
          type: row.type,
          entity: reverseTableMap[row.table_name] || row.table_name,
          entityId: row.record_id,
          data: row.payload,
          timestamp: row.timestamp,
        });
      }
    }

    res.json({
      success: true,
      data: {
        operations,
        serverTime: Date.now(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get sync status
 */
export const getSyncStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const pool = getPool();

    // Count operations (no 'synced' column, so just count total)
    const totalCount = await pool.query(
      `SELECT COUNT(*) FROM sync_operations WHERE user_id = $1`,
      [req.user.id]
    );

    const lastSync = await pool.query(
      `SELECT MAX(synced_at) as last_sync FROM sync_operations WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        totalOperations: parseInt(totalCount.rows[0].count),
        lastSync: lastSync.rows[0].last_sync,
        serverTime: Date.now(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve sync conflict
 */
export const resolveConflict = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { resolution, entity, entityId, mergedData } = req.body;

    if (!['local', 'remote', 'merge'].includes(resolution)) {
      throw new ApiError('Invalid resolution type', 400);
    }

    await client.query('BEGIN');

    const tableMap: Record<string, string> = {
      project: 'projects',
      bordereau: 'bordereaux',
      periode: 'periodes',
      metre: 'metres',
      decompt: 'decompts',
      attachment: 'attachments',
    };

    const tableName = tableMap[entity];
    if (!tableName) {
      throw new ApiError('Unknown entity type', 400);
    }

    if (resolution === 'local' || resolution === 'merge') {
      const dataToApply = resolution === 'merge' ? mergedData : req.body.localData;
      await applyUpdate(client, tableName, entityId, dataToApply);
    }
    // If 'remote', we keep the current server data (no action needed)

    // Mark conflict as resolved using correct column name 'payload'
    await client.query(
      `UPDATE sync_operations SET payload = jsonb_set(COALESCE(payload, '{}')::jsonb, '{conflictResolved}', 'true')
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Conflict resolved successfully',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

// Helper functions

// Clean entity ID by removing prefix (e.g., "project:uuid" -> "uuid")
function cleanEntityId(entityId: string): string {
  if (entityId.includes(':')) {
    return entityId.split(':').pop() || entityId;
  }
  return entityId;
}

async function applyCreate(client: any, table: string, id: string, data: any, userId: string) {
  // Clean the ID
  const cleanId = cleanEntityId(id);

  // Map of allowed columns per table to avoid inserting invalid columns
  const allowedColumns: Record<string, string[]> = {
    projects: ['objet', 'marche_no', 'annee', 'date_ouverture', 'montant', 'type_marche', 'commune', 'societe', 'rc', 'cb', 'cnss', 'patente', 'programme', 'projet', 'ligne', 'chapitre', 'delais_execution', 'osc', 'date_reception_provisoire', 'date_reception_definitive', 'status', 'progress', 'folder_path'],
    bordereaux: ['project_id', 'numero', 'designation', 'unite', 'quantite', 'prix_unitaire', 'montant'],
    periodes: ['project_id', 'numero', 'date_debut', 'date_fin', 'description'],
    metres: ['project_id', 'bordereau_id', 'periode_id', 'numero', 'designation', 'quantite', 'observations'],
    decompts: ['project_id', 'periode_id', 'numero', 'montant', 'date_decompt', 'status', 'observations'],
    attachments: ['project_id', 'type', 'filename', 'path', 'size', 'mime_type'],
  };

  // Filter data to only include allowed columns
  const allowed = allowedColumns[table] || [];
  const filteredData: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const snakeKey = toSnakeCase(key);
    if (allowed.includes(snakeKey) && value !== undefined && value !== null) {
      // Clean IDs in the data as well (e.g., projectId, bordereauId)
      if (snakeKey.endsWith('_id') && typeof value === 'string' && value.includes(':')) {
        filteredData[snakeKey] = cleanEntityId(value);
      } else {
        filteredData[snakeKey] = value;
      }
    }
  }

  if (Object.keys(filteredData).length === 0) {
    logger.warn(`No valid columns to insert for table ${table}`);
    return;
  }

  const columns = ['id', 'user_id', ...Object.keys(filteredData)];
  const values = [cleanId, userId, ...Object.values(filteredData)];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  logger.info(`Inserting into ${table}: columns=${columns.join(', ')}`);

  await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}, created_at, updated_at)
     VALUES (${placeholders}, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET ${Object.keys(filteredData).map((col, i) => `${col} = $${i + 3}`).join(', ')}, updated_at = NOW()`,
    values
  );
}

async function applyUpdate(client: any, table: string, id: string, data: any) {
  const cleanId = cleanEntityId(id);

  // Filter out invalid columns
  const filteredData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = toSnakeCase(key);
    if (value !== undefined && !['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', '_id', '_rev'].includes(snakeKey)) {
      if (snakeKey.endsWith('_id') && typeof value === 'string' && value.includes(':')) {
        filteredData[snakeKey] = cleanEntityId(value);
      } else {
        filteredData[snakeKey] = value;
      }
    }
  }

  if (Object.keys(filteredData).length === 0) {
    logger.warn(`No valid columns to update for table ${table}`);
    return;
  }

  const updates = Object.keys(filteredData)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(', ');
  const values = [cleanId, ...Object.values(filteredData)];

  await client.query(
    `UPDATE ${table} SET ${updates}, updated_at = NOW() WHERE id = $1`,
    values
  );
}

async function applyDelete(client: any, table: string, id: string) {
  const cleanId = cleanEntityId(id);
  await client.query(
    `UPDATE ${table} SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [cleanId]
  );
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
