import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../config/postgres';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_SECRET: Secret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

if (!JWT_SECRET || JWT_SECRET === 'your-secret-key') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Please set a secure JWT_SECRET in .env file!');
}

const generateToken = (payload: { id: string; email: string; role: string }): string => {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
  return jwt.sign(payload, JWT_SECRET, options);
};

const generateRefreshToken = (payload: { id: string; email: string; role: string }): string => {
  const options: SignOptions = { expiresIn: JWT_REFRESH_EXPIRES_IN as any };
  return jwt.sign(payload, JWT_REFRESH_SECRET, options);
};

/**
 * Register new user (PostgreSQL version)
 */
export const register = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      throw new ApiError('All fields are required', 400);
    }

    const pool = getPool();

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new ApiError('Email already registered', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    const result = await pool.query(
      `INSERT INTO users (id, email, password, first_name, last_name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, email, first_name, last_name, role, is_active, created_at`,
      [userId, email, hashedPassword, firstName, lastName, 'user', true]
    );

    const user = result.rows[0];

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user (PostgreSQL version)
 */
export const login = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ApiError('Email and password are required', 400);
    }

    const pool = getPool();

    // Find user by email
    const result = await pool.query(
      `SELECT id, email, password, first_name, last_name, role, is_active, 
              trial_end_date, created_by, created_at, last_login
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new ApiError('Invalid credentials', 401);
    }

    const user = result.rows[0];

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new ApiError('Invalid credentials', 401);
    }

    if (!user.is_active) {
      throw new ApiError('Account is disabled', 403);
    }

    // Check trial expiration
    if (user.trial_end_date) {
      const trialEnd = new Date(user.trial_end_date);
      const now = new Date();
      if (trialEnd < now) {
        await pool.query(
          'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
          [user.id]
        );
        throw new ApiError('Your trial period has expired. Please contact the administrator.', 403);
      }
    }

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW(), last_sync = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active,
          trialEndDate: user.trial_end_date,
          createdBy: user.created_by,
          createdAt: user.created_at,
          lastLogin: new Date().toISOString(),
        },
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user (PostgreSQL version)
 */
export const getCurrentUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, last_sync, is_active
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('User not found', 404);
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        lastSync: user.last_sync,
        isActive: user.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh token
 */
export const refreshToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ApiError('Token is required', 400);
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const newToken = generateToken({
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    });

    res.json({
      success: true,
      data: { token: newToken },
    });
  } catch (error) {
    next(new ApiError('Invalid token', 401));
  }
};

/**
 * Get all users (admin only)
 */
export const getAllUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      throw new ApiError('Not authorized', 403);
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, is_active, 
              trial_end_date, created_by, created_at, last_login
       FROM users ORDER BY created_at DESC`
    );

    const users = result.rows.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      trialEndDate: user.trial_end_date,
      createdBy: user.created_by,
      createdAt: user.created_at,
      lastLogin: user.last_login,
    }));

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create user (admin only)
 */
export const createUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      throw new ApiError('Not authorized', 403);
    }

    const { email, password, firstName, lastName, role, trialEndDate } = req.body;

    if (!email || !password || !firstName || !lastName) {
      throw new ApiError('All fields are required', 400);
    }

    const pool = getPool();

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new ApiError('Email already registered', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = uuidv4();
    const result = await pool.query(
      `INSERT INTO users (id, email, password, first_name, last_name, role, is_active, trial_end_date, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, NOW(), NOW())
       RETURNING id, email, first_name, last_name, role, is_active, trial_end_date, created_at`,
      [userId, email, hashedPassword, firstName, lastName, role || 'user', trialEndDate || null, req.user.id]
    );

    const user = result.rows[0];

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isActive: user.is_active,
        trialEndDate: user.trial_end_date,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user (admin only)
 */
export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      throw new ApiError('Not authorized', 403);
    }

    const { id } = req.params;
    const { firstName, lastName, role, isActive, trialEndDate, password } = req.body;

    const pool = getPool();

    // Build update query dynamically
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (firstName) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(firstName);
    }
    if (lastName) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(lastName);
    }
    if (role) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (typeof isActive === 'boolean') {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }
    if (trialEndDate !== undefined) {
      updates.push(`trial_end_date = $${paramIndex++}`);
      values.push(trialEndDate);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramIndex++}`);
      values.push(hashedPassword);
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, role, is_active, trial_end_date`,
      values
    );

    if (result.rows.length === 0) {
      throw new ApiError('User not found', 404);
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isActive: user.is_active,
        trialEndDate: user.trial_end_date,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user (admin only)
 */
export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError('Not authenticated', 401);
    }

    if (req.user.role !== 'super_admin') {
      throw new ApiError('Not authorized', 403);
    }

    const { id } = req.params;

    if (id === req.user.id) {
      throw new ApiError('Cannot delete yourself', 400);
    }

    const pool = getPool();

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      throw new ApiError('User not found', 404);
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
