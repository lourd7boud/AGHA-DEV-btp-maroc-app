/**
 * Sync Manager V3 - Complete Read Model Fix with Realtime Support
 * 
 * Features:
 * - Ordered operation application (CREATE → UPDATE → DELETE)
 * - Dexie transaction support with bulkPut
 * - Comprehensive error logging
 * - Sync inspector for debugging
 * - Proper ID normalization
 * - Realtime WebSocket integration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { apiService } from '../services/apiService';
import {
  getDeviceId,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  isOnline,
  setupOnlineListener,
} from '../services/syncService';
import { realtimeSync, RealtimeOperation } from '../services/realtimeSync';
import { realtimeEvents, REALTIME_EVENTS } from './useRealtimeSync';

// ==================== TYPES ====================

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'pulling' | 'realtime';

interface SyncState {
  status: SyncStatus;
  lastSyncTime: number | null;
  pendingOperations: number;
  error: string | null;
  lastPullCount: number;
  realtimeConnected: boolean;
}

interface RemoteOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId: string;
  data: any;
  timestamp: string | number;
  serverSeq?: number;
}

interface SyncLog {
  timestamp: Date;
  action: string;
  entity?: string;
  entityId?: string;
  success: boolean;
  error?: string;
  data?: any;
}

// ==================== ENTITY MAPPING ====================

const ENTITY_TO_TABLE: Record<string, string> = {
  'project': 'projects',
  'bordereau': 'bordereaux',
  'metre': 'metres',
  'decompt': 'decompts',
  'pv': 'pvs',
  'periode': 'periodes',
  'photo': 'photos',
  'attachment': 'attachments',
  'user': 'users',
  'company': 'companies',
  'auditLog': 'auditLogs',
};

// ==================== ID UTILITIES ====================

/**
 * Normalize entity ID to include prefix (entity:uuid)
 */
export const normalizeEntityId = (entity: string, id: string): string => {
  if (!id) return '';
  const cleanId = id.includes(':') ? id.split(':').pop()! : id;
  return `${entity}:${cleanId}`;
};

/**
 * Clean entity ID (remove prefix)
 */
export const cleanEntityId = (id: string): string => {
  if (!id) return '';
  return id.includes(':') ? id.split(':').pop()! : id;
};

// ==================== SYNC LOGS ====================

const syncLogs: SyncLog[] = [];
const MAX_LOGS = 500;

const addSyncLog = (log: Omit<SyncLog, 'timestamp'>) => {
  syncLogs.unshift({ ...log, timestamp: new Date() });
  if (syncLogs.length > MAX_LOGS) {
    syncLogs.pop();
  }

  // Also log to console
  const emoji = log.success ? '✅' : '❌';
  console.log(`${emoji} [SYNC] ${log.action}`, log.entity ? `${log.entity}:${log.entityId}` : '', log.error || '');
};

export const getSyncLogs = () => [...syncLogs];
export const clearSyncLogs = () => { syncLogs.length = 0; };

// ==================== SYNC INSPECTOR ====================

export interface SyncInspectorResult {
  localCounts: Record<string, number>;
  missingEntities: { entity: string; id: string }[];
  orphanedEntities: { entity: string; id: string }[];
  errors: string[];
}

/**
 * Compare local Dexie data with server data
 */
export const inspectSync = async (_userId: string): Promise<SyncInspectorResult> => {
  const result: SyncInspectorResult = {
    localCounts: {},
    missingEntities: [],
    orphanedEntities: [],
    errors: [],
  };

  try {
    // Get local counts
    result.localCounts = {
      projects: await db.projects.count(),
      bordereaux: await db.bordereaux.count(),
      metres: await db.metres.count(),
      decompts: await db.decompts.count(),
      periodes: await db.periodes.count(),
      pvs: await db.pvs.count(),
      photos: await db.photos.count(),
      attachments: await db.attachments.count(),
    };

    // Get server data for comparison
    const serverProjects = await apiService.getProjects();
    const projects = serverProjects.data || serverProjects;

    if (Array.isArray(projects)) {
      for (const serverProject of projects) {
        const localId = normalizeEntityId('project', serverProject.id);
        const localProject = await db.projects.get(localId);

        if (!localProject) {
          result.missingEntities.push({ entity: 'project', id: serverProject.id });
        }
      }
    }

    // Check for orphaned local data
    const localProjects = await db.projects.toArray();
    for (const localProject of localProjects) {
      const serverId = cleanEntityId(localProject.id);
      const exists = Array.isArray(projects) && projects.some(p =>
        cleanEntityId(p.id) === serverId || p.id === serverId
      );

      if (!exists && !localProject.deletedAt) {
        result.orphanedEntities.push({ entity: 'project', id: localProject.id });
      }
    }

    addSyncLog({ action: 'INSPECT', success: true, data: result });

  } catch (error: any) {
    result.errors.push(error.message);
    addSyncLog({ action: 'INSPECT', success: false, error: error.message });
  }

  return result;
};

// ==================== OPERATION SORTING ====================

/**
 * Sort operations: CREATE first, then UPDATE, then DELETE
 */
const sortOperations = (operations: RemoteOperation[]): RemoteOperation[] => {
  const typeOrder = { 'CREATE': 0, 'UPDATE': 1, 'DELETE': 2 };

  return [...operations].sort((a, b) => {
    // First by type
    const typeCompare = typeOrder[a.type] - typeOrder[b.type];
    if (typeCompare !== 0) return typeCompare;

    // Then by timestamp
    const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
    const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
    return timeA - timeB;
  });
};

// ==================== APPLY OPERATIONS ====================

/**
 * Apply remote operations with transaction support
 */
const applyRemoteOperations = async (operations: RemoteOperation[]): Promise<{
  applied: number;
  skipped: number;
  errors: { op: RemoteOperation; error: string }[];
}> => {
  const result = { applied: 0, skipped: 0, errors: [] as { op: RemoteOperation; error: string }[] };

  if (operations.length === 0) {
    return result;
  }

  // Sort operations for proper ordering
  const sortedOps = sortOperations(operations);

  console.log(`📥 Applying ${sortedOps.length} operations (sorted: CREATE→UPDATE→DELETE)...`);

  // Filter out conflicts (ops that have local pending changes)
  const nonConflictingOps: RemoteOperation[] = [];

  for (const op of sortedOps) {
    const entityId = normalizeEntityId(op.entity, op.entityId);

    // Check for pending local sync op
    const pendingConflict = await db.syncOperations
      .where('entityId')
      .equals(entityId)
      .filter(p => p.entity === op.entity && !p.synced)
      .count();

    if (pendingConflict > 0) {
      console.warn(`🛡️ Conflict detected for ${op.entity}:${entityId} during PULL. Skipping remote update.`);
      result.skipped++;
      addSyncLog({ action: 'SKIP_CONFLICT', entity: op.entity, entityId: op.entityId, success: false, error: 'Local pending changes exist' });
      continue;
    }

    nonConflictingOps.push(op);
  }

  // Group operations by table for bulk operations
  const opsByTable: Record<string, { creates: any[]; updates: any[]; deletes: string[] }> = {};

  for (const op of nonConflictingOps) {
    const tableName = ENTITY_TO_TABLE[op.entity];
    if (!tableName) {
      result.skipped++;
      addSyncLog({ action: 'SKIP', entity: op.entity, entityId: op.entityId, success: false, error: `Unknown entity: ${op.entity}` });
      continue;
    }

    if (!opsByTable[tableName]) {
      opsByTable[tableName] = { creates: [], updates: [], deletes: [] };
    }

    const entityId = normalizeEntityId(op.entity, op.entityId);

    // Normalize foreign keys
    const normalizedData = op.data ? { ...op.data } : {};

    if (normalizedData.projectId) {
      normalizedData.projectId = normalizeEntityId('project', normalizedData.projectId);
    }
    if (normalizedData.periodeId && String(normalizedData.periodeId).trim() !== '') {
      normalizedData.periodeId = normalizeEntityId('periode', normalizedData.periodeId);
    }
    if (normalizedData.bordereauId) {
      normalizedData.bordereauId = normalizeEntityId('bordereau', normalizedData.bordereauId);
    }

    switch (op.type) {
      case 'CREATE':
        opsByTable[tableName].creates.push({ ...normalizedData, id: entityId });
        break;
      case 'UPDATE':
        opsByTable[tableName].updates.push({ id: entityId, data: normalizedData });
        break;
      case 'DELETE':
        opsByTable[tableName].deletes.push(entityId);
        break;
    }
  }

  // Apply operations using Dexie transaction
  // Note: Dexie.transaction accepts up to 7 tables, so we need to group them
  try {
    const allTables = [
      db.projects,
      db.bordereaux,
      db.metres,
      db.decompts,
      db.periodes,
      db.pvs,
      db.photos
    ];

    await db.transaction('rw', allTables, async () => {
      for (const [tableName, ops] of Object.entries(opsByTable)) {
        const table = (db as any)[tableName];
        if (!table) continue;

        // Bulk create/update using bulkPut
        if (ops.creates.length > 0) {
          try {
            await table.bulkPut(ops.creates);
            result.applied += ops.creates.length;
            addSyncLog({ action: 'BULK_CREATE', entity: tableName, success: true, data: { count: ops.creates.length } });
          } catch (error: any) {
            // Fallback to individual puts
            for (const item of ops.creates) {
              try {
                await table.put(item);
                result.applied++;
                addSyncLog({ action: 'CREATE', entity: tableName, entityId: item.id, success: true });
              } catch (putError: any) {
                result.errors.push({ op: { type: 'CREATE', entity: tableName, entityId: item.id, data: item } as any, error: putError.message });
                addSyncLog({ action: 'CREATE', entity: tableName, entityId: item.id, success: false, error: putError.message });
              }
            }
          }
        }

        // Updates
        for (const upd of ops.updates) {
          try {
            // First check if entity exists
            const existing = await table.get(upd.id);
            if (existing) {
              await table.update(upd.id, upd.data);
            } else {
              // If not exists, create it (server says update, but we don't have it)
              await table.put({ ...upd.data, id: upd.id });
            }
            result.applied++;
            addSyncLog({ action: 'UPDATE', entity: tableName, entityId: upd.id, success: true });
          } catch (error: any) {
            result.errors.push({ op: { type: 'UPDATE', entity: tableName, entityId: upd.id, data: upd.data } as any, error: error.message });
            addSyncLog({ action: 'UPDATE', entity: tableName, entityId: upd.id, success: false, error: error.message });
          }
        }

        // Bulk deletes
        if (ops.deletes.length > 0) {
          try {
            await table.bulkDelete(ops.deletes);
            result.applied += ops.deletes.length;
            addSyncLog({ action: 'BULK_DELETE', entity: tableName, success: true, data: { count: ops.deletes.length } });
          } catch (error: any) {
            // Fallback to individual deletes
            for (const id of ops.deletes) {
              try {
                await table.delete(id);
                result.applied++;
                addSyncLog({ action: 'DELETE', entity: tableName, entityId: id, success: true });
              } catch (delError: any) {
                result.errors.push({ op: { type: 'DELETE', entity: tableName, entityId: id } as any, error: delError.message });
                addSyncLog({ action: 'DELETE', entity: tableName, entityId: id, success: false, error: delError.message });
              }
            }
          }
        }
      }
    }
    );

  } catch (txError: any) {
    console.error('❌ Transaction error:', txError);
    addSyncLog({ action: 'TRANSACTION', success: false, error: txError.message });

    // Transaction failed, try individual operations
    for (const op of sortedOps) {
      try {
        const tableName = ENTITY_TO_TABLE[op.entity];
        if (!tableName) continue;

        const table = (db as any)[tableName];
        if (!table) continue;

        const entityId = normalizeEntityId(op.entity, op.entityId);
        const normalizedData = op.data ? { ...op.data } : {};

        if (normalizedData.projectId) {
          normalizedData.projectId = normalizeEntityId('project', normalizedData.projectId);
        }

        switch (op.type) {
          case 'CREATE':
            await table.put({ ...normalizedData, id: entityId });
            break;
          case 'UPDATE':
            await table.put({ ...normalizedData, id: entityId });
            break;
          case 'DELETE':
            await table.delete(entityId);
            break;
        }
        result.applied++;
        addSyncLog({ action: op.type, entity: op.entity, entityId, success: true });
      } catch (error: any) {
        result.errors.push({ op, error: error.message });
        addSyncLog({ action: op.type, entity: op.entity, entityId: op.entityId, success: false, error: error.message });
      }
    }
  }

  console.log(`📥 Applied: ${result.applied}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
  return result;
};

// ==================== DIRECT DATA FETCH ====================

/**
 * Fetch all data directly from API (for initial sync or recovery)
 */
export const pullLatestData = async (projectId?: string): Promise<number> => {
  let totalPulled = 0;

  console.log('📥 Starting direct data pull...', projectId ? `for project: ${projectId}` : 'all data');
  addSyncLog({ action: 'PULL_START', success: true, data: { projectId } });

  try {
    // Fetch projects
    const projectsResponse = await apiService.getProjects();
    const projects = projectsResponse.data || projectsResponse;

    if (Array.isArray(projects)) {
      await db.transaction('rw', db.projects, async () => {
        for (const project of projects) {
          if (projectId && cleanEntityId(project.id) !== cleanEntityId(projectId)) {
            continue;
          }

          const normalizedId = normalizeEntityId('project', project.id);
          await db.projects.put({
            ...project,
            id: normalizedId,
            userId: project.userId ? normalizeEntityId('user', project.userId) : project.userId,
          });
          totalPulled++;
        }
      });

      // Fetch related data for each project
      const targetProjects = projectId
        ? projects.filter(p => cleanEntityId(p.id) === cleanEntityId(projectId))
        : projects;

      for (const project of targetProjects) {
        const cleanProjId = cleanEntityId(project.id);
        const normalizedProjId = normalizeEntityId('project', cleanProjId);

        // Bordereaux
        try {
          const bordereauxResponse = await apiService.getBordereaux(cleanProjId);
          const bordereaux = bordereauxResponse.data || bordereauxResponse;

          if (Array.isArray(bordereaux) && bordereaux.length > 0) {
            await db.transaction('rw', db.bordereaux, async () => {
              for (const item of bordereaux) {
                await db.bordereaux.put({
                  ...item,
                  id: normalizeEntityId('bordereau', item.id),
                  projectId: normalizedProjId,
                });
                totalPulled++;
              }
            });
          }
        } catch (e) { console.log('No bordereaux for project:', cleanProjId); }

        // Periodes
        try {
          const periodesResponse = await apiService.getPeriodes?.(cleanProjId);
          const periodes = periodesResponse?.data || periodesResponse;

          if (Array.isArray(periodes) && periodes.length > 0) {
            await db.transaction('rw', db.periodes, async () => {
              for (const item of periodes) {
                await db.periodes.put({
                  ...item,
                  id: normalizeEntityId('periode', item.id),
                  projectId: normalizedProjId,
                });
                totalPulled++;
              }
            });
          }
        } catch (e) { console.log('No periodes for project:', cleanProjId); }

        // Metres
        try {
          const metresResponse = await apiService.getMetres(cleanProjId);
          const metres = metresResponse.data || metresResponse;

          if (Array.isArray(metres) && metres.length > 0) {
            await db.transaction('rw', db.metres, async () => {
              for (const item of metres) {
                await db.metres.put({
                  ...item,
                  id: normalizeEntityId('metre', item.id),
                  projectId: normalizedProjId,
                  periodeId: item.periodeId ? normalizeEntityId('periode', item.periodeId) : '',
                });
                totalPulled++;
              }
            });
          }
        } catch (e) { console.log('No metres for project:', cleanProjId); }

        // Decompts
        try {
          const decomptsResponse = await apiService.getDecompts(cleanProjId);
          const decompts = decomptsResponse.data || decomptsResponse;

          if (Array.isArray(decompts) && decompts.length > 0) {
            await db.transaction('rw', db.decompts, async () => {
              for (const item of decompts) {
                await db.decompts.put({
                  ...item,
                  id: normalizeEntityId('decompt', item.id),
                  projectId: normalizedProjId,
                  periodeId: item.periodeId ? normalizeEntityId('periode', item.periodeId) : '',
                });
                totalPulled++;
              }
            });
          }
        } catch (e) { console.log('No decompts for project:', cleanProjId); }
      }
    }

    addSyncLog({ action: 'PULL_COMPLETE', success: true, data: { totalPulled } });
    console.log(`📥 Direct pull complete: ${totalPulled} items`);

  } catch (error: any) {
    console.error('❌ Direct pull error:', error);
    addSyncLog({ action: 'PULL_ERROR', success: false, error: error.message });
    throw error;
  }

  return totalPulled;
};

// ==================== MAIN HOOK ====================

export const useSyncManagerV3 = (userId: string | null) => {
  // ==================== PENDING COUNT (REACTIVE) ====================
  const pendingCount = useLiveQuery(async () => {
    if (!userId) return 0;
    return await db.syncOperations.where('synced').equals(0).count();
  }, [userId]) || 0;

  const [syncState, setSyncState] = useState<SyncState>({
    status: isOnline() ? 'idle' : 'offline',
    lastSyncTime: getLastSyncTimestamp() || null,
    pendingOperations: 0,
    error: null,
    lastPullCount: 0,
    realtimeConnected: false,
  });

  // Sync state update effect
  useEffect(() => {
    setSyncState(prev => ({ ...prev, pendingOperations: pendingCount }));
  }, [pendingCount]);

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const syncInProgressRef = useRef(false);
  const realtimeSetupRef = useRef(false);

  // ==================== REALTIME CONNECTION ====================

  const connectRealtime = useCallback(() => {
    if (!userId || realtimeSetupRef.current) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    const deviceId = getDeviceId();

    // Get server URL
    let serverUrl = 'http://localhost:3000';
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      serverUrl = window.location.origin;
    }
    // Electron uses production server
    if (window.navigator.userAgent.includes('Electron') || (window as any).electronAPI) {
      serverUrl = 'http://162.55.219.151';
    }

    console.log('🔌 Connecting to realtime server:', serverUrl);
    realtimeSync.connect(serverUrl, token, deviceId, userId);
    realtimeSetupRef.current = true;

    // Listen for status changes
    const unsubStatus = realtimeSync.onStatusChange((status) => {
      setSyncState(prev => ({
        ...prev,
        realtimeConnected: status === 'connected',
        status: status === 'connected' ? 'realtime' : prev.status,
      }));
    });

    // Listen for operations
    const unsubOp = realtimeSync.onOperation((op: RealtimeOperation) => {
      console.log('🔄 Realtime op in sync manager:', op.type, op.entity);

      // Emit event for UI components
      const eventMap: Record<string, string> = {
        project: REALTIME_EVENTS.PROJECT_UPDATED,
        bordereau: REALTIME_EVENTS.BORDEREAU_UPDATED,
        periode: REALTIME_EVENTS.PERIODE_UPDATED,
        metre: REALTIME_EVENTS.METRE_UPDATED,
        decompt: REALTIME_EVENTS.DECOMPT_UPDATED,
        photo: REALTIME_EVENTS.PHOTO_UPDATED,
        pv: REALTIME_EVENTS.PV_UPDATED,
        attachment: REALTIME_EVENTS.ATTACHMENT_UPDATED,
      };

      const event = eventMap[op.entity];
      if (event) {
        realtimeEvents.emit(event, {
          type: op.type,
          entityId: op.entityId,
          data: op.data,
        });
      }
      realtimeEvents.emit(REALTIME_EVENTS.DATA_CHANGED, {
        entity: op.entity,
        type: op.type,
        entityId: op.entityId,
        data: op.data,
      });
    });

    return () => {
      unsubStatus();
      unsubOp();
    };
  }, [userId]);

  // ==================== PENDING COUNT ====================

  const updatePendingCount = useCallback(async () => {
    if (!userId) return;

    try {
      const pending = await db.syncOperations
        .where('synced')
        .equals(0)
        .count();
      setSyncState((prev) => ({ ...prev, pendingOperations: pending }));
    } catch (error) {
      console.error('Error updating pending count:', error);
    }
  }, [userId]);

  // ==================== SYNC PUSH ====================

  const syncPush = useCallback(async (): Promise<void> => {
    if (!userId || !isOnline()) {
      console.log('🚫 Cannot push: user not authenticated or offline');
      return;
    }

    console.log('📤 [v3] Starting sync push...');
    addSyncLog({ action: 'PUSH_START', success: true });

    try {
      // Get pending operations
      const pendingOps = await db.syncOperations
        .filter(op => !op.synced && op.userId === userId)
        .toArray();

      if (pendingOps.length === 0) {
        console.log('📤 No pending operations');
        return;
      }

      console.log(`📤 Found ${pendingOps.length} pending operations`);

      // Transform for API
      const transformedOps = pendingOps.map(op => ({
        id: op.id,
        type: op.type,
        entity: op.entity,
        entityId: cleanEntityId(op.entityId),
        data: op.data,
        timestamp: op.timestamp,
      }));

      // Send to server
      const result = await apiService.syncPush(transformedOps, getDeviceId());
      console.log('📤 Server response:', result);

      // Mark successful operations as synced
      const ackOps = result.data?.success || result.success || [];
      if (Array.isArray(ackOps) && ackOps.length > 0) {
        const ackedIds = pendingOps
          .filter(op => ackOps.includes(op.id) || ackOps.includes(cleanEntityId(op.entityId)))
          .map(op => op.id);

        if (ackedIds.length > 0) {
          // Update each record individually (Dexie doesn't have bulkUpdate)
          await db.transaction('rw', db.syncOperations, async () => {
            for (const id of ackedIds) {
              await db.syncOperations.update(id, { synced: true, syncedAt: new Date().toISOString() });
            }
          });
        }
      }

      // Handle errors
      const errors = result.data?.failed || result.failed || [];
      if (errors.length > 0) {
        console.error('❌ Some operations failed:', errors);
        addSyncLog({ action: 'PUSH_ERRORS', success: false, data: { errors } });
      }

      addSyncLog({ action: 'PUSH_COMPLETE', success: true, data: { pushed: ackOps.length } });

    } catch (error: any) {
      console.error('❌ Push error:', error);
      addSyncLog({ action: 'PUSH_ERROR', success: false, error: error.message });
      throw error;
    }
  }, [userId]);

  // ==================== SYNC PULL ====================

  const syncPull = useCallback(async (): Promise<void> => {
    if (!userId || !isOnline()) {
      console.log('🚫 Cannot pull: user not authenticated or offline');
      return;
    }

    console.log('📥 [v3] Starting sync pull...');
    setSyncState(prev => ({ ...prev, status: 'pulling' }));
    addSyncLog({ action: 'PULL_START', success: true });

    try {
      const lastSync = getLastSyncTimestamp();

      // Request changes from server
      const result = await apiService.syncPull(lastSync, getDeviceId());
      console.log('📥 Pull response received');

      const operations = result.data?.operations || result.operations || [];
      const serverTime = result.data?.serverTime || result.serverTime || Date.now();

      if (operations.length === 0 && lastSync === 0) {
        // Initial sync - fetch all data directly
        console.log('📥 No sync operations, performing direct fetch...');
        const pulled = await pullLatestData();
        setSyncState(prev => ({ ...prev, lastPullCount: pulled }));
      } else if (operations.length > 0) {
        // Apply received operations
        const applyResult = await applyRemoteOperations(operations);
        setSyncState(prev => ({ ...prev, lastPullCount: applyResult.applied }));

        if (applyResult.errors.length > 0) {
          // Log errors to server (optional)
          console.error('❌ Some operations failed to apply:', applyResult.errors);
        }
      }

      // Update last sync timestamp
      setLastSyncTimestamp(serverTime);

      addSyncLog({ action: 'PULL_COMPLETE', success: true });

    } catch (error: any) {
      console.error('❌ Pull error:', error);
      addSyncLog({ action: 'PULL_ERROR', success: false, error: error.message });

      // Don't throw for 401 - will be handled by auth interceptor
      if (error.response?.status !== 401) {
        throw error;
      }
    }
  }, [userId]);

  // ==================== FULL SYNC ====================

  const sync = useCallback(async (): Promise<void> => {
    if (syncInProgressRef.current) {
      console.log('🚫 Sync already in progress');
      return;
    }

    if (!userId || !isOnline()) {
      setSyncState(prev => ({
        ...prev,
        status: 'offline',
        error: 'Cannot sync while offline',
      }));
      return;
    }

    syncInProgressRef.current = true;
    setSyncState(prev => ({ ...prev, status: 'syncing', error: null }));

    try {
      // 1. Push local changes
      await syncPush();

      // 2. Pull remote changes
      await syncPull();



      // 4. Clean old operations
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      await db.syncOperations
        .where('syncedAt')
        .below(thirtyDaysAgo.toISOString())
        .delete();

      setSyncState(prev => ({
        ...prev,
        status: 'synced',
        lastSyncTime: Date.now(),
        error: null,
      }));

      addSyncLog({ action: 'SYNC_COMPLETE', success: true });

    } catch (error: any) {
      setSyncState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Sync failed',
      }));
      addSyncLog({ action: 'SYNC_ERROR', success: false, error: error.message });
    } finally {
      syncInProgressRef.current = false;
    }
  }, [userId, syncPush, syncPull, updatePendingCount]);

  // ==================== EFFECTS ====================

  // Handle online/offline
  useEffect(() => {
    const handleOnline = () => {
      setSyncState(prev => ({ ...prev, status: 'idle' }));
      if (autoSyncEnabled) {
        setTimeout(() => sync(), 1000);
      }
    };

    const handleOffline = () => {
      setSyncState(prev => ({ ...prev, status: 'offline' }));
    };

    const cleanup = setupOnlineListener(handleOnline, handleOffline);
    return cleanup;
  }, [sync, autoSyncEnabled]);

  // Auto-sync every 5 minutes
  useEffect(() => {
    if (!autoSyncEnabled || !isOnline()) return;

    const interval = setInterval(() => {
      sync().catch(console.error);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [sync, autoSyncEnabled]);

  // Update pending count on mount
  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  // Connect to realtime when user is available
  useEffect(() => {
    if (userId && isOnline()) {
      const cleanup = connectRealtime();
      return () => {
        if (cleanup) cleanup();
        realtimeSetupRef.current = false;
      };
    }
  }, [userId, connectRealtime]);

  // Reconnect realtime when coming online
  useEffect(() => {
    const handleOnline = () => {
      if (userId && !realtimeSync.isConnected()) {
        console.log('🌐 Back online, reconnecting realtime...');
        connectRealtime();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [userId, connectRealtime]);

  // ==================== CLEAR PENDING OPERATIONS ====================

  /**
   * Clear all pending (failed) sync operations from local database
   * Use this when sync is stuck due to invalid operations
   */
  const clearPendingOperations = useCallback(async () => {
    try {
      // Get pending operations
      const pending = await db.syncOperations
        .filter(op => op.synced === false || op.synced === undefined)
        .toArray();

      if (pending.length === 0) {
        console.log('📭 No pending operations to clear');
        return { cleared: 0 };
      }

      console.log(`🗑️ Clearing ${pending.length} pending operations...`);

      // Delete all pending operations
      const ids = pending.map(op => op.id).filter((id): id is string => id !== undefined && id !== null);
      await db.syncOperations.bulkDelete(ids);

      // Update state
      setSyncState(prev => ({
        ...prev,
        pendingOperations: 0,
        error: null,
        status: 'idle',
      }));

      console.log(`✅ Cleared ${pending.length} pending operations`);
      return { cleared: pending.length };
    } catch (error: any) {
      console.error('❌ Failed to clear pending operations:', error);
      return { cleared: 0, error: error.message };
    }
  }, []);

  /**
   * Full reset: Clear all local data and re-sync from server
   */
  const resetAndResync = useCallback(async () => {
    if (!userId) return;

    try {
      console.log('🔄 Starting full reset and resync...');

      // 1. Clear pending operations
      await clearPendingOperations();

      // 2. Reset sync timestamp
      setLastSyncTimestamp(0);

      // 3. Pull fresh data from server
      await pullLatestData();

      console.log('✅ Reset and resync completed');
    } catch (error: any) {
      console.error('❌ Reset and resync failed:', error);
    }
  }, [userId, clearPendingOperations, pullLatestData]);

  return {
    syncState,
    sync,
    syncPush,
    syncPull,
    pullLatestData,
    updatePendingCount,
    autoSyncEnabled,
    setAutoSyncEnabled,
    isOnline: isOnline(),
    isRealtimeConnected: syncState.realtimeConnected,
    // Realtime controls
    connectRealtime,
    disconnectRealtime: () => realtimeSync.disconnect(),
    subscribeToProject: (projectId: string) => realtimeSync.subscribeToProject(projectId),
    unsubscribeFromProject: (projectId: string) => realtimeSync.unsubscribeFromProject(projectId),
    // Recovery tools
    clearPendingOperations,
    resetAndResync,
    // Debug tools
    getSyncLogs,
    clearSyncLogs,
    inspectSync: () => userId ? inspectSync(userId) : Promise.resolve({
      localCounts: {},
      missingEntities: [],
      orphanedEntities: [],
      errors: ['No user ID'],
    }),
  };
};

// Export default
export { useSyncManagerV3 as useSyncManager };
