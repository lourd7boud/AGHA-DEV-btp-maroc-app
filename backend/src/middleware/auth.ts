import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
}

// Get JWT_SECRET with proper fallback
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Warn if using default secret
if (!process.env.JWT_SECRET || JWT_SECRET === 'your-secret-key') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET in auth middleware. Please set JWT_SECRET in .env file!');
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new ApiError('No token provided', 401);
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error: any) {
    // Log the error for debugging
    console.error('🔒 Token verification failed:', error.message);
    next(new ApiError('Invalid or expired token', 401));
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError('User not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError('Insufficient permissions', 403));
    }

    next();
  };
};
