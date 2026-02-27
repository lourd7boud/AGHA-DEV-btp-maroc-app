import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth';
import {
  getProfile,
  updateProfile,
  uploadSignature,
  deleteSignature,
  uploadStamp,
  deleteStamp,
  signDocument,
  verifyDocument,
} from '../controllers/profile.controller';

const router = Router();

// Multer config for signature/stamp uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'signatures'));
  },
  filename: (_req, file, cb) => {
    cb(null, `temp_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, and WEBP files are allowed'));
    }
  },
});

// Protected routes
router.get('/', authenticate, getProfile);
router.put('/', authenticate, updateProfile);
router.post('/signature', authenticate, upload.single('signature'), uploadSignature);
router.delete('/signature', authenticate, deleteSignature);
router.post('/stamp', authenticate, upload.single('stamp'), uploadStamp);
router.delete('/stamp', authenticate, deleteStamp);
router.post('/sign-document', authenticate, signDocument);

// Public verification route
router.get('/verify/:code', verifyDocument);

export default router;
