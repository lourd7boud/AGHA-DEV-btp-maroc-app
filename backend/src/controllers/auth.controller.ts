import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getCouchDB } from '../config/database';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/types';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_SECRET: Secret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Ensure JWT_SECRET is not empty
if (!JWT_SECRET || JWT_SECRET === 'your-secret-key') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Please set a secure JWT_SECRET in .env file!');
}

/**
 * Generate JWT token
 */
const generateToken = (payload: { id: string; email: string; role: string }): string => {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
  return jwt.sign(payload, JWT_SECRET, options);
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (payload: { id: string; email: string; role: string }): string => {
  const options: SignOptions = { expiresIn: JWT_REFRESH_EXPIRES_IN as any };
  return jwt.sign(payload, JWT_REFRESH_SECRET, options);
};

/**
 * Register new user
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

    const db = getCouchDB();

    // Check if user exists
    try {
      const existingUser = await db.view('users', 'by_email', { key: email });
      if (existingUser.rows.length > 0) {
        throw new ApiError('Email already registered', 400);
      }
    } catch (error: any) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user: User = {
      _id: `user:${uuidv4()}`,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'user',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert({
      ...user,
      type: 'user',
    });

    // Generate token
    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
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
 * Login user
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

    const db = getCouchDB();

    // Find user by email
    const userResult = await db.view('users', 'by_email', { key: email });

    if (userResult.rows.length === 0) {
      throw new ApiError('Invalid credentials', 401);
    }

    const user = userResult.rows[0].value as User;

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new ApiError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      throw new ApiError('Account is disabled', 403);
    }

    // Check trial expiration
    if (user.trialEndDate) {
      const trialEnd = new Date(user.trialEndDate);
      const now = new Date();
      if (trialEnd < now) {
        // Auto-disable expired trial accounts
        await db.insert({
          ...user,
          isActive: false,
          updatedAt: new Date(),
        });
        throw new ApiError('Your trial period has expired. Please contact the administrator.', 403);
      }
    }

    // Generate token
    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role
    });

    // Update last login
    await db.insert({
      ...user,
      lastLogin: new Date().toISOString(),
      lastSync: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: user.isActive,
          trialEndDate: user.trialEndDate,
          createdBy: user.createdBy,
          createdAt: user.createdAt,
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
 * Get current user
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

    const db = getCouchDB();
    const user = await db.get(req.user.id);

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        lastSync: user.lastSync,
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
