import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { prisma } from '@exclusive/db';
import { env, serviceUrl } from './env.js';
import { unauthorized, forbidden } from './errors.js';

let jwks = null;
const getJwks = () => {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${serviceUrl('auth')}/oidc/jwks`), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000, timeoutDuration: 5000 });
  return jwks;
};

export async function verifyToken(token, audience) {
  try {
    const { payload } = await jwtVerify(token, getJwks(), { issuer: env.OIDC_ISSUER, audience, clockTolerance: 5 });
    return payload;
  } catch (e) {
    if (e instanceof joseErrors.JWTExpired) throw unauthorized('Tu sesión expiró. Inicia sesión de nuevo.', 'TOKEN_EXPIRED');
    throw unauthorized('El token de acceso no es válido.', 'INVALID_TOKEN');
  }
}

const STATE_TTL = 10_000;
const cache = new Map();

export async function loadUserState(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < STATE_TTL) return hit.state;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, firstName: true, lastName: true, status: true, sessionVersion: true,
      roles: { select: { role: { select: { code: true, isStaff: true, permissions: { select: { permission: { select: { code: true } } } } } } } },
    },
  });
  const state = u
    ? {
        id: u.id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`,
        firstName: u.firstName,
        status: u.status,
        sessionVersion: u.sessionVersion,
        roles: u.roles.map((r) => r.role.code),
        isStaff: u.roles.some((r) => r.role.isStaff),
        permissions: new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
      }
    : null;
  cache.set(userId, { at: Date.now(), state });
  return state;
}

export function invalidateUserState(userId) {
  if (userId === undefined) cache.clear();
  else cache.delete(Number(userId));
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

export function authenticate({ optional = false } = {}) {
  return async (req, res, next) => {
    try {
      const token = bearer(req);
      if (!token) {
        if (optional) return next();
        throw unauthorized('Inicia sesión para continuar.', 'LOGIN_REQUIRED');
      }
      const payload = await verifyToken(token, env.API_AUDIENCE);
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId)) throw unauthorized('El token no corresponde a un usuario.', 'INVALID_TOKEN');
      const state = await loadUserState(userId);
      if (!state) throw unauthorized('La cuenta ya no existe.', 'ACCOUNT_GONE');
      if (state.status !== 'ACTIVO') throw unauthorized('La cuenta está desactivada.', 'ACCOUNT_DISABLED');
      if (Number(payload.sv) !== state.sessionVersion) throw unauthorized('Tu sesión fue cerrada. Inicia sesión de nuevo.', 'SESSION_REVOKED');
      req.user = { ...state, tokenId: payload.jti };
      next();
    } catch (e) {
      if (optional && e.status === 401) return next();
      if (e.status === 401) res.set('WWW-Authenticate', `Bearer error="invalid_token"`);
      next(e);
    }
  };
}

async function securityEvent(req, type, details) {
  try {
    await prisma.securityEvent.create({
      data: { type, email: req.user?.email || null, userId: req.user?.id || null, ip: req.ip?.slice(0, 64), userAgent: req.get('user-agent')?.slice(0, 255), details },
    });
  } catch {
  }
}

export function requirePermission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (codes.some((c) => req.user.permissions.has(c))) return next();
    securityEvent(req, 'PERMISSION_DENIED', { required: codes, path: req.originalUrl, method: req.method });
    next(forbidden());
  };
}

export const requireStaff = () => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.isStaff) return next();
  securityEvent(req, 'PERMISSION_DENIED', { required: 'staff', path: req.originalUrl });
  next(forbidden());
};

export const hasPermission = (req, code) => !!req.user && req.user.permissions.has(code);

export function requireService() {
  return async (req, res, next) => {
    try {
      const token = bearer(req);
      if (!token) throw unauthorized('Se requiere un token de servicio.', 'SERVICE_TOKEN_REQUIRED');
      const payload = await verifyToken(token, env.INTERNAL_AUDIENCE);
      const clientId = payload.client_id || payload.sub;
      if (!String(clientId).startsWith('svc-') || !String(payload.scope || '').split(' ').includes('internal')) {
        throw forbidden('El token no pertenece a un servicio autorizado.');
      }
      req.service = { clientId };
      const actingId = req.get('x-acting-user-id');
      req.actingUser = actingId ? { id: Number(actingId), email: req.get('x-acting-user-email') || null } : null;
      next();
    } catch (e) {
      next(e);
    }
  };
}
