/**
 * 🔐 Authentication & Authorization Middleware
 * Handles JWT verification and role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../generated/prisma';
import { prismaClient as prisma, withPrismaRetry } from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const AUTH_USER_CACHE_TTL_MS = 60 * 1000;

type CachedAuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  division: string | null;
  subDivision: string | null;
  isActive: boolean;
};

const authUserCache = new Map<number, { user: CachedAuthUser; expiresAt: number }>();

function getCachedAuthUser(userId: number): CachedAuthUser | null {
  const cached = authUserCache.get(userId);
  if (!cached) return null;

  if (cached.expiresAt < Date.now()) {
    authUserCache.delete(userId);
    return null;
  }

  return cached.user;
}

function setCachedAuthUser(user: CachedAuthUser): void {
  authUserCache.set(user.id, {
    user,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS
  });
}

function isPoolExhaustionError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('maxclientsinsessionmode') ||
    message.includes('max clients reached') ||
    message.includes('too many clients')
  );
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role: UserRole;
        name: string;
        division?: string | null;
        subDivision?: string | null;
      };
    }
  }
}

/**
 * Authenticate JWT token and attach user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid token.',
        code: 'NO_TOKEN'
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          error: 'Token has expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: 'Invalid token. Please login again.',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    const userId = Number(decoded.id);
    let user = Number.isFinite(userId) ? getCachedAuthUser(userId) : null;

    // Fetch user from database only when cache miss
    if (!user) {
      user = await withPrismaRetry(() =>
        prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            division: true,
            subDivision: true,
            isActive: true,
          },
        })
      ) as CachedAuthUser | null;

      if (user) {
        setCachedAuthUser(user);
      }
    }

    // Check if user exists
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found. Please login again.',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      res.status(403).json({
        success: false,
        error: 'Your account has been deactivated. Please contact support.',
        code: 'ACCOUNT_INACTIVE'
      });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      division: user.division,
      subDivision: user.subDivision,
    };

    next();
  } catch (error: any) {
    console.error('Authentication error:', error);

    if (isPoolExhaustionError(error)) {
      res.status(503).json({
        success: false,
        error: 'Database connection pool is busy. Please retry in a few seconds.',
        code: 'DB_POOL_EXHAUSTED'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication service error. Please try again.',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Require ADMIN role
 * Must be used after authenticate middleware
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if user is attached (authenticate middleware should have run first)
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please login.',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  // Check if user has ADMIN role
  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Admin access required. You do not have permission to access this resource.',
      code: 'INSUFFICIENT_PERMISSIONS',
      requiredRole: 'ADMIN',
      userRole: req.user.role
    });
    return;
  }

  next();
};

/**
 * Require USER or ADMIN role
 * Must be used after authenticate middleware
 */
export const requireUser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if user is attached (authenticate middleware should have run first)
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please login.',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  // CREATOR, APPROVER, CATEGORY_HEAD and ADMIN roles are allowed
  const role = String(req.user.role || '');
  if (role !== 'CREATOR' && role !== 'APPROVER' && role !== 'CATEGORY_HEAD' && role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'User access required. Invalid role.',
      code: 'INVALID_ROLE',
      userRole: role
    });
    return;
  }

  next();
};

/**
 * Require APPROVER, CATEGORY_HEAD or ADMIN role
 * Must be used after authenticate middleware
 */
export const requireApprover = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if user is attached (authenticate middleware should have run first)
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Please login.',
      code: 'NOT_AUTHENTICATED'
    });
    return;
  }

  // APPROVER, CATEGORY_HEAD and ADMIN roles are allowed
  const role = String(req.user.role || '');
  if (role !== 'APPROVER' && role !== 'CATEGORY_HEAD' && role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Approver access required. You do not have permission to access this resource.',
      code: 'INSUFFICIENT_PERMISSIONS',
      requiredRole: 'APPROVER',
      userRole: role
    });
    return;
  }

  next();
};

/**
 * Optional authentication - attach user if token present, but don't fail
 * Useful for endpoints that have different behavior for authenticated users
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // If no token, just continue
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Try to verify token
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // Try to fetch user
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          division: true,
          subDivision: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          division: user.division,
          subDivision: user.subDivision,
        };
      }
    } catch (jwtError) {
      // Token invalid or expired - just continue without user
    }

    next();
  } catch (error) {
    // Any error - just continue without user
    next();
  }
};

/**
 * Check if user owns the resource
 * Useful for ensuring users can only access their own data
 */
export const requireOwnership = (resourceUserIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
        code: 'NOT_AUTHENTICATED'
      });
      return;
    }

    // ADMIN can access any resource
    if (req.user.role === 'ADMIN') {
      next();
      return;
    }

    // Check if resource belongs to user
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (!resourceUserId) {
      res.status(400).json({
        success: false,
        error: 'Resource user ID not found.',
        code: 'MISSING_RESOURCE_ID'
      });
      return;
    }

    if (parseInt(resourceUserId) !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'You do not have permission to access this resource.',
        code: 'NOT_RESOURCE_OWNER'
      });
      return;
    }

    next();
  };
};
