import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../models/User";
import { PermissionKey } from "../models/Role";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface AuthPayload {
  userId: string;
  role: UserRole;
  name: string;
  department?: string;
  // Resolved once at login/register, alongside department (the raw
  // Mongo ObjectId) — this is the actual scoping key dept_admin and
  // field_officer routes use, since checking a code string is simpler
  // than comparing ObjectIds and avoids a DB lookup on every request.
  departmentCode?: string;
  // Resolved from the user's Role document at login/register time and
  // embedded in the signed token, so permission checks never need a DB
  // round-trip per request. Empty for citizen/field_officer/cm, which
  // use requireRole's structural identity check instead (see Role.ts
  // header for why those three aren't permission-bundle-able).
  permissions: PermissionKey[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization token" });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * SSE-specific auth. The browser's EventSource API cannot set custom
 * request headers, so there is no way to send a Bearer token the normal
 * way for a long-lived streaming connection — the token has to travel
 * as a query parameter instead. This is scoped to the one route that
 * genuinely needs it (the alerts stream) rather than weakening
 * requireAuth's header-only contract everywhere, since query-string
 * tokens are more exposed (server access logs, browser history,
 * Referer headers) than an Authorization header.
 */
export function requireAuthSSE(req: Request, res: Response, next: NextFunction) {
  const token = (req.query.token as string) || "";
  if (!token) {
    return res.status(401).json({ error: "Missing token query parameter" });
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    next();
  };
}

/**
 * Permission-based gate for the admin-tier dashboard surface — the
 * counterpart to requireRole for routes that custom roles should be
 * able to unlock. A request passes if the token's permissions array
 * contains ANY of the listed permissions (matching how requireRole
 * worked: accessible if your role/permission set is in the allowed list).
 * super_admin implicitly passes every check regardless of its permission
 * list, since it's the role that manages permissions in the first place.
 */
export function requirePermission(...perms: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
    if (req.auth.role === "super_admin") return next();
    const has = perms.some((p) => req.auth!.permissions?.includes(p));
    if (!has) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    next();
  };
}

/** Optional auth — populates req.auth if a valid token is present, but doesn't reject if absent.
 *  Used on citizen-facing endpoints that work both logged-out (phone-only tracking) and logged-in. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.auth = jwt.verify(header.slice(7), JWT_SECRET) as AuthPayload;
    } catch {
      // ignore invalid token on optional routes
    }
  }
  next();
}
