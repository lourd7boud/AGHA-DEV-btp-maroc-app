import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createBordereau,
  getBordereaux,
  getBordereauById,
  updateBordereau,
  deleteBordereau,
} from '../controllers/bordereau.controller';

const router = Router();
router.use(authenticate);

router.post('/', createBordereau);
router.get('/project/:projectId', getBordereaux);
router.get('/:id', getBordereauById);
router.put('/:id', updateBordereau);
router.delete('/:id', deleteBordereau);

export default router;
