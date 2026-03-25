/**
 * 🔐 Auth Controller
 * Handles user authentication
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prismaClient as prisma } from '../utils/prisma';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, role, division, subDivision } = req.body;

    // Validation
    if (!email || !password || !name) {
      res.status(400).json({ success: false, error: 'Email, password, and name are required' });
      return;
    }

    // Role-based validation
    if (role === 'CREATOR' || role === 'APPROVER') {
      if (!division || !subDivision) {
        res.status(400).json({ success: false, error: 'Division and Sub-Division are required for Creators and Approvers' });
        return;
      }
    }

    if (role === 'CATEGORY_HEAD' && !division) {
      res.status(400).json({ success: false, error: 'Division is required for Category Head' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      res.status(409).json({ success: false, error: 'User already exists with this email' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: role || 'USER', // Default role if not provided
        division: role === 'PO_COMMITTEE' ? null : (division || null),
        subDivision: (role === 'CATEGORY_HEAD' || role === 'PO_COMMITTEE') ? null : (subDivision || null),
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        division: true,
        subDivision: true,
      },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        division: user.division,
        subDivision: user.subDivision,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      data: {
        token,
        user,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, error: 'Account is disabled' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        division: user.division,
        subDivision: user.subDivision,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          division: user.division,
          subDivision: user.subDivision,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }

    res.json({ success: true, data: { user } });
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * Get current user info (protected route)
 * Requires authentication middleware
 */
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // User is already attached by authenticate middleware
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Fetch fresh user data from database
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        division: true,
        subDivision: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        division: user.division,
        subDivision: user.subDivision,
        createdAt: user.createdAt.toISOString(),
        lastLogin: user.lastLogin?.toISOString(),
      }
    });
  } catch (error: any) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user info' });
  }
};
