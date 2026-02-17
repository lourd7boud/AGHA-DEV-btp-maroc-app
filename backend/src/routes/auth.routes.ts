import { Router } from 'express';
import { 
  register, 
  login, 
  getCurrentUser, 
  refreshToken,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginSchema, registerSchema, createUserSchema, updateUserSchema, refreshTokenSchema } from '../middleware/schemas';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register', validate({ body: registerSchema }), register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validate({ body: loginSchema }), login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, getCurrentUser);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', validate({ body: refreshTokenSchema }), refreshToken);

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (admin only)
 * @access  Private
 */
router.get('/users', authenticate, getAllUsers);

/**
 * @route   POST /api/auth/users
 * @desc    Create user (admin only)
 * @access  Private
 */
router.post('/users', authenticate, validate({ body: createUserSchema }), createUser);

/**
 * @route   PUT /api/auth/users/:id
 * @desc    Update user (admin only)
 * @access  Private
 */
router.put('/users/:id', authenticate, validate({ body: updateUserSchema }), updateUser);

/**
 * @route   DELETE /api/auth/users/:id
 * @desc    Delete user (admin only)
 * @access  Private
 */
router.delete('/users/:id', authenticate, deleteUser);

export default router;
