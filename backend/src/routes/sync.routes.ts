import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  syncPush,
  syncPull,
  getSyncStatus,
  resolveConflict,
} from '../controllers/sync.controller.pg';

const router = Router();
router.use(authenticate);

/**
 * @route   POST /api/sync/push
 * @desc    Push local operations to server
 * @access  Private
 */
router.post('/push', syncPush);

/**
 * @route   GET /api/sync/pull
 * @desc    Pull remote changes since last sync
 * @access  Private
 */
router.get('/pull', syncPull);

/**
 * @route   GET /api/sync/last
 * @desc    Get sync status
 * @access  Private
 */
router.get('/last', getSyncStatus);
router.get('/status', getSyncStatus);

/**
 * @route   POST /api/sync/conflict/:id
 * @desc    Resolve a sync conflict
 * @access  Private
 */
router.post('/conflict/:id', resolveConflict);

export default router;
