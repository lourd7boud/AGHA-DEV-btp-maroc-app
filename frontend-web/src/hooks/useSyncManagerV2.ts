/**
 * Enhanced Sync Manager Hook v2 - Ops-Log Pattern
 * 
 * Features:
 * - Server sequence-based synchronization
 * - Exponential backoff with jitter
 * - Idempotent operations
 * - Conflict detection and handling
 * - Robust error handling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../db/database';
import { apiService } from '../services/apiService';
import {
  getPendingSyncOperations,
  markOperationsAsSynced,
  deleteOperations,
  getDeviceId,
  getServerSeq,
  setServerSeq,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  isOnline,
  setupOnlineListener,
  cleanOldSyncOperations,
  scheduleRetry,
  cancelRetry,
  normalizeEntityId,
  cleanEntityId,
  SYNC_CONFIG,
} from '../services/syncServiceV2';

// ==================== TYPES ====================

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'retrying';

interface SyncState {
  status: SyncStatus;
  lastSyncTime: number | null;
  serverSeq: number;
  pendingOperations: number;
  error: string | null;
  retryCount: number;
}

interface SyncResult {
  pushed: number;
  pulled: number;
  errors: number;
  conflicts: number;
}

// ==================== ENTITY MAPPING ====================

const entityToTable: Record<string, keyof typeof db> = {
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
};

// ==================== MAIN HOOK ====================

export const useSyncManagerV2 = (userId: string | null) => {
  const [syncState, setSyncState] = useState<SyncState>({
    status: isOnline() ? 'idle' : 'offline',
    lastSyncTime: getLastSyncTimestamp() || null,
    serverSeq: getServerSeq(),
    pendingOperations: 0,
    error: null,
    retryCount: 0,
  });

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const syncInProgressRef = useRef(false);
  const autoSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ==================== PENDING COUNT ====================
  
  const updatePendingCount = useCallback(async () => {
    if (!userId) return;
    
    try {
      const pending = await getPendingSyncOperations(userId);
      setSyncState((prev) => ({ ...prev, pendingOperations: pending.length }));
    } catch (error) {
      console.error('Error updating pending count:', error);
    }
  }, [userId]);

  // ==================== SYNC PUSH ====================

  const syncPush = useCallback(async (): Promise<{ success: boolean; pushed: number; errors: number }> => {
    if (!userId || !isOnline()) {
      console.log('🚫 Cannot push: user not authenticated or offline');
      return { success: false, pushed: 0, errors: 0 };
    }

    console.log('📤 [v2] Starting sync push...');
    
    // Get pending operations
    const pendingOps = await getPendingSyncOperations(userId);
    
    if (pendingOps.length === 0) {
      console.log('📤 No pending operations to push');
      return { success: true, pushed: 0, errors: 0 };
    }

    console.log(`📤 Found ${pendingOps.length} pending operations`);
    
    let totalPushed = 0;
    let totalErrors = 0;
    
    // Process in batches
    const batches: typeof pendingOps[] = [];
    for (let i = 0; i < pendingOps.length; i += SYNC_CONFIG.BATCH_SIZE) {
      batches.push(pendingOps.slice(i, i + SYNC_CONFIG.BATCH_SIZE));
    }
    
    for (const batch of batches) {
      try {
        // Transform operations for API
        const transformedOps = batch.map(op => ({
          id: op.id,
          type: op.type,
          entity: op.entity,
          entityId: cleanEntityId(op.entityId),
          data: op.data,
          timestamp: op.timestamp,
        }));
        
        console.log(`📤 Pushing batch of ${transformedOps.length} operations...`);
        
        // Send to server
        const result = await apiService.syncPush(transformedOps, getDeviceId());
        
        console.log('📤 Server response:', result);
        
        // Handle successful operations
        const ackOps = result.data?.ackOps || result.data?.success || result.ackOps || result.success || [];
        if (ackOps.length > 0) {
          // Find the operation IDs that were acknowledged
          const ackedOpIds = batch
            .filter(op => ackOps.includes(op.id) || ackOps.includes(cleanEntityId(op.entityId)))
            .map(op => op.id);
          
          if (ackedOpIds.length > 0) {
            await markOperationsAsSynced(ackedOpIds);
            totalPushed += ackedOpIds.length;
          }
        }
        
        // Update server sequence
        const newServerSeq = result.data?.serverSeq || result.serverSeq;
        if (newServerSeq) {
          setServerSeq(newServerSeq);
          setSyncState(prev => ({ ...prev, serverSeq: newServerSeq }));
        }
        
        // Handle errors
        const errors = result.data?.failed || result.data?.errors || result.failed || result.errors || [];
        if (errors.length > 0) {
          console.error('❌ Some operations failed:', errors);
          
          // Delete permanently failed operations (schema errors, etc.)
          const permanentlyFailedIds: string[] = [];
          
          for (const error of errors) {
            const errorMsg = typeof error === 'object' ? error.error : '';
            const opId = typeof error === 'object' ? error.opId : error;
            
            const isPermanentError = errorMsg && (
              errorMsg.includes('column') && errorMsg.includes('does not exist') ||
              errorMsg.includes('invalid input syntax') ||
              errorMsg.includes('violates') ||
              errorMsg.includes('duplicate key')
            );
            
            if (isPermanentError) {
              const failedOp = batch.find(op => op.id === opId || cleanEntityId(op.entityId) === opId);
              if (failedOp) {
                permanentlyFailedIds.push(failedOp.id);
              }
            }
          }
          
          if (permanentlyFailedIds.length > 0) {
            console.log(`🗑️ Deleting ${permanentlyFailedIds.length} permanently failed operations`);
            await deleteOperations(permanentlyFailedIds);
          }
          
          totalErrors += errors.length - permanentlyFailedIds.length;
        }
        
      } catch (error: any) {
        console.error('❌ Batch push error:', error);
        
        if (error.response?.status === 401) {
          throw error; // Re-throw auth errors
        }
        
        totalErrors += batch.length;
      }
    }
    
    console.log(`📤 Push complete: ${totalPushed} pushed, ${totalErrors} errors`);
    
    return {
      success: totalErrors === 0,
      pushed: totalPushed,
      errors: totalErrors,
    };
  }, [userId]);

  // ==================== SYNC PULL ====================

  const syncPull = useCallback(async (): Promise<{ success: boolean; pulled: number; conflicts: number }> => {
    if (!userId || !isOnline()) {
      console.log('🚫 Cannot pull: user not authenticated or offline');
      return { success: false, pulled: 0, conflicts: 0 };
    }

    console.log('📥 [v2] Starting sync pull...');
    
    const currentServerSeq = getServerSeq();
    const lastSync = getLastSyncTimestamp();
    
    console.log(`📥 Current state - serverSeq: ${currentServerSeq}, lastSync: ${lastSync}`);
    
    let totalPulled = 0;
    let totalConflicts = 0;
    
    try {
      // Request changes from server
      const result = await apiService.syncPull(lastSync, getDeviceId());
      
      console.log('📥 Pull response:', result);
      
      const operations = result.data?.operations || result.operations || [];
      const newServerSeq = result.data?.serverSeq || result.serverSeq || 0;
      const serverTime = result.data?.serverTime || result.serverTime || Date.now();
      
      console.log(`📥 Received ${operations.length} operations`);
      
      // If no operations and this is initial sync, try direct fetch
      if (operations.length === 0 && lastSync === 0) {
        console.log('📥 No sync operations, performing direct data fetch...');
        
        try {
          // Fetch projects
          const projectsResponse = await apiService.getProjects();
          const projects = projectsResponse.data || projectsResponse;
          
          if (Array.isArray(projects)) {
            for (const project of projects) {
              const projectId = normalizeEntityId('project', project.id);
              await db.projects.put({ ...project, id: projectId });
              totalPulled++;
            }
            
            // Fetch related data for each project
            for (const project of projects) {
              const cleanProjectId = cleanEntityId(project.id);
              const normalizedProjectId = normalizeEntityId('project', cleanProjectId);
              
              // Bordereaux
              try {
                const bordereauxResponse = await apiService.getBordereaux(cleanProjectId);
                const bordereaux = bordereauxResponse.data || bordereauxResponse;
                if (Array.isArray(bordereaux)) {
                  for (const bordereau of bordereaux) {
                    const bordereauId = normalizeEntityId('bordereau', bordereau.id);
                    await db.bordereaux.put({
                      ...bordereau,
                      id: bordereauId,
                      projectId: normalizedProjectId,
                    });
                    totalPulled++;
                  }
                }
              } catch (e) { /* Ignore */ }
              
              // Metres
              try {
                const metresResponse = await apiService.getMetres(cleanProjectId);
                const metres = metresResponse.data || metresResponse;
                if (Array.isArray(metres)) {
                  for (const metre of metres) {
                    const metreId = normalizeEntityId('metre', metre.id);
                    await db.metres.put({
                      ...metre,
                      id: metreId,
                      projectId: normalizedProjectId,
                    });
                    totalPulled++;
                  }
                }
              } catch (e) { /* Ignore */ }
              
              // Decompts
              try {
                const decomptsResponse = await apiService.getDecompts(cleanProjectId);
                const decompts = decomptsResponse.data || decomptsResponse;
                if (Array.isArray(decompts)) {
                  for (const decompt of decompts) {
                    const decomptId = normalizeEntityId('decompt', decompt.id);
                    await db.decompts.put({
                      ...decompt,
                      id: decomptId,
                      projectId: normalizedProjectId,
                    });
                    totalPulled++;
                  }
                }
              } catch (e) { /* Ignore */ }
            }
          }
          
          console.log(`📥 Direct fetch completed: ${totalPulled} items`);
          
        } catch (directFetchError) {
          console.error('Error in direct data fetch:', directFetchError);
        }
        
      } else {
        // Apply received operations
        for (const op of operations) {
          try {
            if (!op.entity || !op.entityId) {
              console.warn('⚠️ Skipping operation with missing entity or entityId:', op);
              continue;
            }
            
            const tableName = entityToTable[op.entity];
            if (!tableName) {
              console.warn(`⚠️ Unknown entity type: ${op.entity}`);
              continue;
            }
            
            const table = db[tableName] as any;
            if (!table || typeof table.put !== 'function') {
              console.error(`❌ Table not found: ${tableName}`);
              continue;
            }
            
            const entityId = normalizeEntityId(op.entity, op.entityId);
            
            // Normalize foreign keys in data
            const normalizedData = { ...op.data };
            if (normalizedData.projectId) {
              normalizedData.projectId = normalizeEntityId('project', normalizedData.projectId);
            }
            if (normalizedData.periodeId) {
              normalizedData.periodeId = normalizeEntityId('periode', normalizedData.periodeId);
            }
            if (normalizedData.bordereauId) {
              normalizedData.bordereauId = normalizeEntityId('bordereau', normalizedData.bordereauId);
            }
            
            console.log(`📥 Applying ${op.type} for ${op.entity}:${entityId}`);
            
            switch (op.type) {
              case 'CREATE':
              case 'UPDATE':
                await table.put({ ...normalizedData, id: entityId });
                totalPulled++;
                break;
                
              case 'DELETE':
                await table.delete(entityId);
                totalPulled++;
                break;
            }
            
          } catch (error) {
            console.error('Error applying remote operation:', error);
            totalConflicts++;
          }
        }
      }
      
      // Update sync state
      if (newServerSeq > 0) {
        setServerSeq(newServerSeq);
        setSyncState(prev => ({ ...prev, serverSeq: newServerSeq }));
      }
      setLastSyncTimestamp(serverTime);
      
      console.log(`📥 Pull complete: ${totalPulled} applied, ${totalConflicts} conflicts`);
      
      return {
        success: true,
        pulled: totalPulled,
        conflicts: totalConflicts,
      };
      
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log('🔒 Pull sync failed: unauthorized');
        return { success: false, pulled: 0, conflicts: 0 };
      }
      
      console.error('Pull sync error:', error);
      throw error;
    }
  }, [userId]);

  // ==================== FULL SYNC ====================

  const sync = useCallback(async (): Promise<SyncResult> => {
    if (syncInProgressRef.current) {
      console.log('⏳ Sync already in progress, skipping...');
      return { pushed: 0, pulled: 0, errors: 0, conflicts: 0 };
    }

    if (!userId || !isOnline()) {
      setSyncState((prev) => ({
        ...prev,
        status: 'offline',
        error: 'Cannot sync while offline',
      }));
      return { pushed: 0, pulled: 0, errors: 0, conflicts: 0 };
    }

    syncInProgressRef.current = true;
    setSyncState((prev) => ({ ...prev, status: 'syncing', error: null }));

    const result: SyncResult = { pushed: 0, pulled: 0, errors: 0, conflicts: 0 };

    try {
      // 1. Push local changes
      const pushResult = await syncPush();
      result.pushed = pushResult.pushed;
      result.errors = pushResult.errors;

      // 2. Pull remote changes
      const pullResult = await syncPull();
      result.pulled = pullResult.pulled;
      result.conflicts = pullResult.conflicts;

      // 3. Clean old operations
      await cleanOldSyncOperations();

      // 4. Update pending count
      await updatePendingCount();

      // 5. Reset retry state on success
      cancelRetry();

      setSyncState((prev) => ({
        ...prev,
        status: 'synced',
        lastSyncTime: Date.now(),
        error: null,
        retryCount: 0,
      }));

      console.log('✅ Sync completed:', result);

    } catch (error: any) {
      if (error.response?.status === 401) {
        setSyncState((prev) => ({
          ...prev,
          status: 'idle',
          error: null,
        }));
      } else {
        setSyncState((prev) => ({
          ...prev,
          status: 'error',
          error: error.message || 'Sync failed',
          retryCount: prev.retryCount + 1,
        }));
        
        // Schedule retry
        scheduleRetry(async () => { await sync(); });
      }
      
      console.error('Sync error:', error);
    } finally {
      syncInProgressRef.current = false;
    }

    return result;
  }, [userId, syncPush, syncPull, updatePendingCount]);

  // ==================== FORCE FULL SYNC ====================

  const forceFullSync = useCallback(async (): Promise<void> => {
    // Clear local sync state
    setServerSeq(0);
    setLastSyncTimestamp(0);
    
    // Clear local data (except sync operations queue)
    await db.projects.clear();
    await db.bordereaux.clear();
    await db.periodes.clear();
    await db.metres.clear();
    await db.decompts.clear();
    await db.photos.clear();
    await db.pvs.clear();
    await db.attachments.clear();
    
    console.log('🔄 Local data cleared, starting full sync...');
    
    // Trigger full sync
    await sync();
  }, [sync]);

  // ==================== AUTO SYNC SETUP ====================

  // Online/offline listener
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network online');
      setSyncState((prev) => ({ ...prev, status: 'idle' }));
      
      if (autoSyncEnabled) {
        setTimeout(() => sync(), SYNC_CONFIG.QUICK_SYNC_DELAY);
      }
    };

    const handleOffline = () => {
      console.log('📴 Network offline');
      setSyncState((prev) => ({ ...prev, status: 'offline' }));
      cancelRetry();
    };

    const cleanup = setupOnlineListener(handleOnline, handleOffline);
    return cleanup;
  }, [sync, autoSyncEnabled]);

  // Periodic auto-sync
  useEffect(() => {
    if (!autoSyncEnabled || !isOnline()) return;

    autoSyncIntervalRef.current = setInterval(() => {
      sync().catch(console.error);
    }, SYNC_CONFIG.AUTO_SYNC_INTERVAL);

    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
      }
    };
  }, [sync, autoSyncEnabled]);

  // Initial pending count
  useEffect(() => {
    updatePendingCount();
  }, [updatePendingCount]);

  // ==================== RETURN ====================

  return {
    syncState,
    sync,
    syncPush,
    syncPull,
    forceFullSync,
    updatePendingCount,
    autoSyncEnabled,
    setAutoSyncEnabled,
    isOnline: isOnline(),
  };
};

// Export alias for backward compatibility
export const useSyncManager = useSyncManagerV2;
