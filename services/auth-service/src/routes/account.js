import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '@exclusive/db';
import {
  env, z, email as emailSchema, password as passwordSchema, text, optText, phone, authenticate, audit, badRequest, notFound, conflict,
  sendMail, notifyUser, invalidateUserState,
} from '@exclusive/common';
import { revokeAccount } from '../oidc/adapter.js';

const SERVICE = 'auth-service';
const DEPARTMENTS = ['Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Guatemala', 'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa'];

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function securityEvent(req, type, data = {}) {
  try {
    await prisma.securityEvent.create({ data: { type, email: data.email || null, userId: data.userId || null, ip: req.ip?.slice(0, 64), userAgent: req.get('user-agent')?.slice(0, 255), details: data.details } });
  } catch { }
}

export async function revokeAllSessions(userId, tx = prisma) {
  await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await revokeAccount(userId);
  invalidateUserState(userId);
}

export function accountRoutes() {
  const r = express.Router();

  const resetLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: env.RESET_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Espera unos minutos y vuelve a intentarlo.' } },
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Demasiados registros desde este equipo. Intenta más tarde.' } },
  });

  r.post('/register', registerLimiter, async (req, res) => {
    const data = z
      .object({
        firstName: text(80, 'El nombre'),
        lastName: text(80, 'El apellido'),
        email: emailSchema,
        phone: phone.optional().or(z.literal('')).transform((v) => v || null),
        password: passwordSchema,
        acceptTerms: z.literal(true, { message: 'Debes aceptar los términos y la política de privacidad.' }),
      })
      .parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (exists) throw conflict('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.', [{ field: 'email', message: 'Este correo ya está registrado.' }]);
    const role = await prisma.role.findUnique({ where: { code: 'CLIENTE' } });
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: data.email, passwordHash: await bcrypt.hash(data.password, 10), firstName: data.firstName, lastName: data.lastName,
          phone: data.phone, emailVerified: false, isDemo: false, roles: { create: { roleId: role.id } },
        },
      });
      await tx.cart.create({ data: { customerId: u.id } });
      await audit(req, { service: SERVICE, action: 'USER_REGISTERED', entity: 'user', entityId: u.id, after: { email: u.email, role: 'CLIENTE' }, user: { id: u.id, email: u.email } }, tx);
      await sendMail({
        to: u.email, subject: 'Te damos la bienvenida a Exclusive', category: 'BIENVENIDA', title: `Hola, ${u.firstName}`,
        intro: 'Tu cuenta está lista. Usa el cupón BIENVENIDA10 en tu primera compra para obtener 10 % de descuento.', cta: 'Ir a la tienda', ctaPath: '/tienda',
      }, tx);
      await notifyUser(u.id, { type: 'CUENTA', title: 'Cuenta creada', body: 'Usa el cupón BIENVENIDA10 en tu primera compra.', link: '/tienda' }, tx);
      return u;
    });
    res.status(201).json({ id: user.id, email: user.email, message: 'Cuenta creada. Ya puedes iniciar sesión.' });
  });

  r.post('/password/forgot', resetLimiter, async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const response = { message: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa el buzón de pruebas.' };
    await securityEvent(req, 'RESET_REQUESTED', { email, userId: user?.id });
    if (!user || user.status !== 'ACTIVO') return res.json(response);
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.passwordReset.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + env.RESET_TOKEN_MINUTES * 60_000), requestIp: req.ip?.slice(0, 64) },
      });
      await sendMail({
        to: user.email, subject: 'Restablece tu contraseña', category: 'RECUPERACION', title: 'Restablece tu contraseña',
        intro: `Recibimos una solicitud para restablecer tu contraseña. El enlace vence en ${env.RESET_TOKEN_MINUTES} minutos y solo puede usarse una vez. Si no fuiste tú, ignora este mensaje.`,
        cta: 'Crear una nueva contraseña', ctaPath: `/restablecer?token=${token}`,
      }, tx);
    });
    res.json(response);
  });

  r.post('/password/reset', resetLimiter, async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(req.body);
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date() || row.user.status !== 'ACTIVO') {
      await securityEvent(req, 'RESET_INVALID', { userId: row?.userId });
      throw badRequest('El enlace no es válido o ya venció. Solicita uno nuevo.');
    }
    await prisma.$transaction(async (tx) => {
      const used = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw badRequest('El enlace ya fue utilizado.');
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(password, 10), failedLogins: 0, lockedUntil: null } });
      await audit(req, { service: SERVICE, action: 'PASSWORD_RESET', entity: 'user', entityId: row.userId, user: { id: row.userId, email: row.user.email } }, tx);
      await sendMail({ to: row.user.email, subject: 'Tu contraseña fue cambiada', category: 'SEGURIDAD', title: 'Contraseña actualizada', intro: 'Tu contraseña se cambió correctamente y cerramos tus sesiones abiertas. Si no fuiste tú, contáctanos de inmediato.' }, tx);
    });
    await revokeAllSessions(row.userId);
    await securityEvent(req, 'RESET_COMPLETED', { userId: row.userId, email: row.user.email });
    res.json({ message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' });
  });

  r.get('/me', authenticate(), async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true, lastLoginAt: true, isDemo: true } });
    const unread = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
    res.json({ ...u, roles: req.user.roles, permissions: [...req.user.permissions], isStaff: req.user.isStaff, unreadNotifications: unread });
  });

  r.put('/me', authenticate(), async (req, res) => {
    const data = z.object({ firstName: text(80, 'El nombre'), lastName: text(80, 'El apellido'), phone: phone.optional().or(z.literal('')).transform((v) => v || null) }).parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true, phone: true } });
    const u = await prisma.user.update({ where: { id: req.user.id }, data, select: { id: true, email: true, firstName: true, lastName: true, phone: true } });
    invalidateUserState(req.user.id);
    await audit(req, { service: SERVICE, action: 'PROFILE_UPDATED', entity: 'user', entityId: req.user.id, before, after: data });
    res.json(u);
  });

  r.post('/me/password', authenticate(), async (req, res) => {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1, 'Escribe tu contraseña actual.'), newPassword: passwordSchema }).parse(req.body);
    const u = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, u.passwordHash))) throw badRequest('La contraseña actual no es correcta.', [{ field: 'currentPassword', message: 'La contraseña actual no es correcta.' }]);
    if (await bcrypt.compare(newPassword, u.passwordHash)) throw badRequest('La nueva contraseña debe ser distinta a la actual.', [{ field: 'newPassword', message: 'Usa una contraseña distinta a la actual.' }]);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    await revokeAllSessions(u.id);
    await audit(req, { service: SERVICE, action: 'PASSWORD_CHANGED', entity: 'user', entityId: u.id });
    await securityEvent(req, 'PASSWORD_CHANGED', { userId: u.id, email: u.email });
    await sendMail({ to: u.email, subject: 'Tu contraseña fue cambiada', category: 'SEGURIDAD', title: 'Contraseña actualizada', intro: 'Cambiaste tu contraseña y cerramos todas tus sesiones. Vuelve a iniciar sesión con la nueva contraseña.' });
    res.json({ message: 'Contraseña actualizada. Por seguridad, cerramos tus sesiones: vuelve a iniciar sesión.' });
  });

  r.post('/me/logout-all', authenticate(), async (req, res) => {
    await revokeAllSessions(req.user.id);
    await securityEvent(req, 'SESSIONS_REVOKED', { userId: req.user.id, email: req.user.email });
    res.json({ message: 'Cerramos tu sesión en todos los dispositivos.' });
  });

  const addressSchema = z.object({
    label: text(40, 'La etiqueta'),
    recipientName: text(120, 'El nombre de quien recibe'),
    phone,
    department: z.enum(DEPARTMENTS, { message: 'Selecciona un departamento.' }),
    municipality: text(80, 'El municipio'),
    line1: text(200, 'La dirección'),
    reference: optText(200),
    isDefault: z.boolean().optional().default(false),
  });

  r.get('/me/addresses', authenticate(), async (req, res) => {
    const items = await prisma.address.findMany({ where: { userId: req.user.id, active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    res.json(items);
  });

  r.post('/me/addresses', authenticate(), async (req, res) => {
    const data = addressSchema.parse(req.body);
    const count = await prisma.address.count({ where: { userId: req.user.id, active: true } });
    if (count >= 10) throw badRequest('Puedes guardar hasta 10 direcciones.');
    const a = await prisma.$transaction(async (tx) => {
      const makeDefault = data.isDefault || count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...data, isDefault: makeDefault, userId: req.user.id } });
    });
    res.status(201).json(a);
  });

  r.put('/me/addresses/:id', authenticate(), async (req, res) => {
    const id = Number(req.params.id);
    const data = addressSchema.parse(req.body);
    const current = await prisma.address.findFirst({ where: { id, userId: req.user.id, active: true } });
    if (!current) throw notFound('La dirección no existe.');
    const a = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { ...data, isDefault: data.isDefault || current.isDefault } });
    });
    res.json(a);
  });

  r.delete('/me/addresses/:id', authenticate(), async (req, res) => {
    const id = Number(req.params.id);
    const current = await prisma.address.findFirst({ where: { id, userId: req.user.id, active: true } });
    if (!current) throw notFound('La dirección no existe.');
    await prisma.$transaction(async (tx) => {
      await tx.address.update({ where: { id }, data: { active: false, isDefault: false } });
      if (current.isDefault) {
        const next = await tx.address.findFirst({ where: { userId: req.user.id, active: true }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    res.status(204).end();
  });

  r.get('/departments', (req, res) => res.json(DEPARTMENTS));

  r.get('/me/notifications', authenticate(), async (req, res) => {
    const items = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 });
    const unread = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
    res.json({ items, unread });
  });

  r.post('/me/notifications/read-all', authenticate(), async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  });

  r.post('/me/notifications/:id/read', authenticate(), async (req, res) => {
    await prisma.notification.updateMany({ where: { id: Number(req.params.id), userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  });

  return r;
}
