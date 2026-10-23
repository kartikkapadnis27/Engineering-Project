import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export type UserRole = 'BUYER' | 'SELLER' | 'ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'development-secret';

export async function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, message: 'Authentication required.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  let decoded: Partial<AuthUser> & { id?: string; email?: string; role?: UserRole };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as Partial<AuthUser> & { id?: string; email?: string; role?: UserRole };

    if (!decoded.id || !decoded.email || !decoded.role) {
      res.status(401).json({ ok: false, message: 'Invalid authentication payload.' });
      return;
    }
  } catch (error) {
    res.status(401).json({ ok: false, message: 'Invalid or expired token.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      res.status(403).json({ ok: false, message: 'This account is inactive or access has been restricted.' });
      return;
    }
    const role = (['BUYER', 'SELLER', 'ADMIN'] as const).find((value) => value === user.role);
    if (!role) {
      res.status(403).json({ ok: false, message: 'This account does not have a valid marketplace role.' });
      return;
    }
    req.user = {
      id: user.id,
      email: user.email,
      role,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ ok: false, message: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ ok: false, message: 'You do not have permission to access this resource.' });
      return;
    }

    next();
  };
}
