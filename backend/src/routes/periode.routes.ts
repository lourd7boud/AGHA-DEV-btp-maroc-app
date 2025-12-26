import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPeriode,
  getPeriodes,
  getPeriodeById,
  updatePeriode,
  deletePeriode,
} from '../controllers/periode.controller';

const router = Router();
router.use(authenticate);

router.post('/', createPeriode);
router.post('/project/:projectId', createPeriode); // Alternative route for frontend compatibility
router.get('/project/:projectId', getPeriodes);
router.get('/:id', getPeriodeById);
router.put('/:id', updatePeriode);
router.delete('/:id', deletePeriode);

export default router;
