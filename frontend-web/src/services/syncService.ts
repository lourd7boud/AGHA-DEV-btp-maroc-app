/**
 * Sync Service - Re-exporting from v2 for backward compatibility
 * All new code should import from syncServiceV2.ts directly
 */

export {
  getDeviceId,
  getLastSyncTimestamp,
  setLastSyncTimestamp,
  getServerSeq,
  setServerSeq,
  logSyncOperation,
  getPendingSyncOperations,
  markOperationsAsSynced,
  cleanOldSyncOperations,
  isOnline,
  setupOnlineListener,
  normalizeEntityId,
  cleanEntityId,
  SYNC_CONFIG,
} from './syncServiceV2';

