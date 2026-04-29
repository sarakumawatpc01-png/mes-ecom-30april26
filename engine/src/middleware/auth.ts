import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/client';

const JWT_SECRET = process.env.ENGINE_SECRET!;

export interface JwtPayload {
  sub: string;         // user id
  type: 'customer' | 'admin';
  role?: string;       // admin role
  siteId?: string;     // for site_admin
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function generateTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>) {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  const refreshToken = jwt.sign({ sub: payload.sub, type: payload.type }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// Require authenticated customer
export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = verifyToken(token);
    if (payload.type !== 'customer') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth (attaches user if token present, continues without it)
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // ignore invalid token, continue as guest
    }
  }
  next();
}

// Require admin (any role)
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Admin authentication required' });

  try {
    const payload = verifyToken(token);
    if (payload.type !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Require super admin
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  requireAdmin(req, res, () => {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
}

// Require employee or above
export function requireEmployee(req: Request, res: Response, next: NextFunction) {
  requireAdmin(req, res, () => {
    if (!['super_admin', 'site_admin', 'employee'].includes(req.user?.role || '')) {
      return res.status(403).json({ error: 'Employee access required' });
    }
    next();
  });
}

// For site_admin: ensure they can only access their own site
export function requireSiteAccess(req: Request, res: Response, next: NextFunction) {
  requireAdmin(req, res, () => {
    const { role, siteId } = req.user!;
    if (role === 'super_admin') return next(); // super admin sees all

    const targetSiteId = req.params.siteId || req.body?.siteId || req.site?.id;
    if (siteId && targetSiteId && siteId !== targetSiteId) {
      return res.status(403).json({ error: 'Access denied to this site' });
    }
    next();
  });
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return (req.cookies?.token) || null;
}
