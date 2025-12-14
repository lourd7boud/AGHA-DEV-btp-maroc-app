import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createDecompt,
  getDecompts,
  getDecomptById,
  updateDecompt,
  deleteDecompt,
  generateDecomptPDF,
} from '../controllers/decompt.controller.pg';

const router = Router();
router.use(authenticate);

router.post('/', createDecompt);
router.get('/project/:projectId', getDecompts);
router.get('/:id', getDecomptById);
router.put('/:id', updateDecompt);
router.delete('/:id', deleteDecompt);
router.get('/:id/pdf', generateDecomptPDF);

export default router;
