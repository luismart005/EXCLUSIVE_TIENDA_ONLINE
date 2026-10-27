import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '@exclusive/db';
import { env } from '@exclusive/common';
import { loginPage, errorPage } from './views.js';

const GENERIC_ERROR = 'Correo o contraseña incorrectos. Si fallaste varios intentos, espera unos minutos antes de volver a intentarlo.';
const DUMMY_HASH = '$2b$10$E5M1jiAQzZs.2x8YSxZR8.x6tnIu1A5/dB1IZkfNY/ZujZpyJVYx2';

async function securityEvent(req, type, { email, userId, details } = {}) {
  try {
    await prisma.securityEvent.create({ data: { type, email: email?.slice(0, 160) || null, userId: userId || null, ip: req.ip?.slice(0, 64), userAgent: req.get('user-agent')?.slice(0, 255), details } });
  } catch {
  }
}

function noCache(req, res, next) {
  res.set('cache-control', 'no-store');
  next();
}

export function interactionRoutes(app, provider, logger) {
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: env.LOGIN_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: async (req, res) => {
      await securityEvent(req, 'RATE_LIMIT', { email: req.body?.email, details: { route: 'login' } });
      res.status(429).type('html').send(loginPage({ uid: req.params.uid, email: req.body?.email, error: 'Demasiados intentos desde este equipo. Espera unos minutos y vuelve a intentarlo.', demo: env.DEMO_HINTS }));
    },
  });

  app.get('/oidc/interaction/:uid', noCache, async (req, res, next) => {
    try {
      const details = await provider.interactionDetails(req, res);
      const { uid, prompt, params, session } = details;

      if (prompt.name === 'login') {
        const notice = params.registered === '1' ? 'Tu cuenta fue creada. Inicia sesión para continuar.' : null;
        return res.type('html').send(loginPage({ uid, email: params.login_hint || '', notice, demo: env.DEMO_HINTS, returnTo: '/' }));
      }

      if (prompt.name === 'consent') {
        let grant = details.grantId ? await provider.Grant.find(details.grantId) : null;
        if (!grant) grant = new provider.Grant({ accountId: session.accountId, clientId: params.client_id });
        const d = prompt.details || {};
        if (d.missingOIDCScope) grant.addOIDCScope(d.missingOIDCScope.join(' '));
        if (d.missingOIDCClaims) grant.addOIDCClaims(d.missingOIDCClaims);
        if (d.missingResourceScopes) {
          for (const [indicator, scopes] of Object.entries(d.missingResourceScopes)) grant.addResourceScope(indicator, scopes.join(' '));
        }
        const grantId = await grant.save();
        return provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
      }

      return res.status(400).type('html').send(errorPage({ error: 'invalid_request' }));
    } catch (e) {
      logger.warn('Interacción OIDC inválida', { message: e.message });
      return res.status(400).type('html').send(errorPage({ error: e.error || 'session_not_found' }));
    }
  });

  app.post('/oidc/interaction/:uid/login', noCache, express.urlencoded({ extended: false, limit: '10kb' }), loginLimiter, async (req, res) => {
    let uid = req.params.uid;
    try {
      const details = await provider.interactionDetails(req, res);
      uid = details.uid;
      if (details.prompt.name !== 'login') return res.status(400).type('html').send(errorPage({ error: 'invalid_request' }));

      const email = String(req.body.email || '').trim().toLowerCase().slice(0, 160);
      const password = String(req.body.password || '').slice(0, 200);
      const remember = req.body.remember === 'yes';
      const fail = async (reason, user) => {
        await securityEvent(req, 'LOGIN_FAILED', { email, userId: user?.id, details: { reason } });
        return res.status(401).type('html').send(loginPage({ uid, email, error: GENERIC_ERROR, demo: env.DEMO_HINTS }));
      };
      if (!email || !password) {
        return res.status(400).type('html').send(loginPage({ uid, email, error: 'Escribe tu correo y tu contraseña.', demo: env.DEMO_HINTS }));
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        await bcrypt.compare(password, DUMMY_HASH);
        return fail('Cuenta inexistente');
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await bcrypt.compare(password, DUMMY_HASH);
        return fail('Cuenta bloqueada temporalmente', user);
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        const failed = user.failedLogins + 1;
        const lock = failed >= env.MAX_FAILED_LOGINS;
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + env.LOCK_MINUTES * 60_000) : user.lockedUntil },
        });
        if (lock) await securityEvent(req, 'ACCOUNT_LOCKED', { email, userId: user.id, details: { minutes: env.LOCK_MINUTES } });
        return fail('Contraseña incorrecta', user);
      }
      if (user.status !== 'ACTIVO') return fail(`Cuenta ${user.status.toLowerCase()}`, user);

      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await securityEvent(req, 'LOGIN_OK', { email, userId: user.id });

      return provider.interactionFinished(req, res, { login: { accountId: String(user.id), remember } }, { mergeWithLastSubmission: false });
    } catch (e) {
      logger.warn('Inicio de sesión fallido por interacción inválida', { message: e.message });
      return res.status(400).type('html').send(errorPage({ error: 'session_not_found' }));
    }
  });
}
