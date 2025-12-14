import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createMetre,
  getMetres,
  getMetreById,
  updateMetre,
  deleteMetre,
} from '../controllers/metre.controller.pg';

const router = Router();
router.use(authenticate);

router.post('/', createMetre);
router.get('/project/:projectId', getMetres);
router.get('/:id', getMetreById);
router.put('/:id', updateMetre);
router.delete('/:id', deleteMetre);

export default router;
