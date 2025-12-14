import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { SyncOperation } from '../models/types';
import logger from '../utils/logger';

/**
 * Push local operations to server
 * Le client envoie un batch d'opérations non synchronisées
 */
export const syncPush = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { operations, deviceId } = req.body;

    if (!operations || !Array.isArray(operations)) {
      throw new ApiError('Invalid operations data', 400);
    }

    const db = getCouchDB();
    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
      conflicts: [] as { id: string; localData: any; remoteData: any }[],
    };

    // Traiter chaque opération
    for (const op of operations) {
      try {
        const { type, entity, entityId, data, timestamp } = op;

        // Vérifier si l'entité existe déjà (pour UPDATE et DELETE)
        let existingDoc;
        if (type === 'UPDATE' || type === 'DELETE') {
          try {
            existingDoc = await db.get(`${entity}:${entityId}`);

            // Détection de conflit basée sur le timestamp
            if (existingDoc.updatedAt && new Date(existingDoc.updatedAt).getTime() > timestamp) {
              results.conflicts.push({
                id: entityId,
                localData: data,
                remoteData: existingDoc,
              });
              continue;
            }
          } catch (error: any) {
            if (error.statusCode !== 404) {
              throw error;
            }
          }
        }

        // Appliquer l'opération
        switch (type) {
          case 'CREATE':
            await db.insert({
              _id: `${entity}:${entityId}`,
              ...data,
              type: entity,
              userId: req.user.id,
              createdAt: new Date(timestamp),
              updatedAt: new Date(timestamp),
            });
            break;

          case 'UPDATE':
            if (!existingDoc) {
              throw new Error('Document not found');
            }
            await db.insert({
              ...existingDoc,
              ...data,
              updatedAt: new Date(timestamp),
            });
            break;

          case 'DELETE':
            if (!existingDoc) {
              throw new Error('Document not found');
            }
            await db.insert({
              ...existingDoc,
              deletedAt: new Date(timestamp),
              updatedAt: new Date(timestamp),
            });
            break;
        }

        // Enregistrer l'opération de sync
        await db.insert({
          _id: `sync:${uuidv4()}`,
          type: 'sync_operation',
          userId: req.user.id,
          deviceId,
          operationType: type,
          entity,
          entityId,
          data,
          timestamp,
          synced: true,
          syncedAt: new Date(),
          createdAt: new Date(),
        });

        results.success.push(entityId);
      } catch (error: any) {
        logger.error('Sync push error:', error);
        results.failed.push({
          id: op.entityId,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Pull remote changes since last sync
 * Le client récupère toutes les modifications depuis son dernier sync
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
    const db = getCouchDB();

    let lastSyncTimestamp = 0;
    if (lastSync && typeof lastSync === 'string') {
      lastSyncTimestamp = parseInt(lastSync);
    }

    // Récupérer toutes les opérations de sync après lastSync
    const result = await db.view('sync', 'pending', {
      startkey: [req.user.id, lastSyncTimestamp],
      endkey: [req.user.id, Date.now()],
      include_docs: true,
    });

    // Filtrer les opérations qui ne proviennent pas du même device
    const operations = result.rows
      .map((row) => row.doc)
      .filter((doc) => doc.deviceId !== deviceId)
      .map((doc) => ({
        id: doc._id,
        type: doc.operationType,
        entity: doc.entity,
        entityId: doc.entityId,
        data: doc.data,
        timestamp: doc.timestamp,
      }));

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
 * Get last sync time for user
 */
export const getLastSyncTime = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const db = getCouchDB();
    const user = await db.get(req.user.id);

    res.json({
      success: true,
      data: {
        lastSync: user.lastSync || null,
        serverTime: Date.now(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve a sync conflict
 * L'utilisateur choisit quelle version conserver (local, remote, ou merge)
 */
export const resolveConflict = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const { id } = req.params;
    const { resolution, mergedData } = req.body;

    if (!['local', 'remote', 'merge'].includes(resolution)) {
      throw new ApiError('Invalid resolution type', 400);
    }

    const db = getCouchDB();
    const syncOp = await db.get(`sync:${id}`);

    if (syncOp.userId !== req.user.id) {
      throw new ApiError('Not authorized', 403);
    }

    if (!syncOp.conflicts) {
      throw new ApiError('No conflict to resolve', 400);
    }

    let finalData;
    switch (resolution) {
      case 'local':
        finalData = syncOp.conflicts.localData;
        break;
      case 'remote':
        finalData = syncOp.conflicts.remoteData;
        break;
      case 'merge':
        if (!mergedData) {
          throw new ApiError('Merged data required', 400);
        }
        finalData = mergedData;
        break;
    }

    // Appliquer la résolution
    const entityDoc = await db.get(`${syncOp.entity}:${syncOp.entityId}`);
    await db.insert({
      ...entityDoc,
      ...finalData,
      updatedAt: new Date(),
    });

    // Marquer le conflit comme résolu
    syncOp.conflicts.resolved = true;
    syncOp.conflicts.resolution = resolution;
    await db.insert(syncOp);

    res.json({
      success: true,
      message: 'Conflict resolved successfully',
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      next(new ApiError('Sync operation not found', 404));
    } else {
      next(error);
    }
  }
};
