/**
 * Sync Manager - Main Export
 * 
 * Re-exports from V3 (latest version with complete fix)
 */

export { 
  useSyncManagerV3 as useSyncManager,
  useSyncManagerV3,
  normalizeEntityId,
  cleanEntityId,
  getSyncLogs,
  clearSyncLogs,
  inspectSync,
  pullLatestData,
} from './useSyncManagerV3';

export type { SyncStatus } from './useSyncManagerV3';
