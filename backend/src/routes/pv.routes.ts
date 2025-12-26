import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPV,
  getPVs,
  getPVById,
  updatePV,
  deletePV,
} from '../controllers/pv.controller';

const router = Router();
router.use(authenticate);

router.post('/', createPV);
router.get('/project/:projectId', getPVs);
router.get('/:id', getPVById);
router.put('/:id', updatePV);
router.delete('/:id', deletePV);

export default router;
