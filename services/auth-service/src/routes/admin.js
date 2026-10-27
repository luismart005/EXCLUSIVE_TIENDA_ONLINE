import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '@exclusive/db';
import {
  z, email as emailSchema, text, phone, authenticate, requirePermission, audit, badRequest, notFound, conflict, forbidden,
  pageParams, paged, sendMail, invalidateUserState, env,
} from '@exclusive/common';
import { revokeAllSessions } from './account.js';

const SERVICE = 'auth-service';

const userSelect = {
  id: true, email: true, firstName: true, lastName: true, phone: true, status: true, lastLoginAt: true, createdAt: true, isDemo: true,
  lockedUntil: true, roles: { select: { role: { select: { id: true, code: true, name: true, isStaff: true } } } },
};
const shapeUser = (u) => ({ ...u, roles: u.roles.map((r) => r.role), locked: !!(u.lockedUntil && u.lockedUntil > new Date()) });

export function adminRoutes() {
  const r = express.Router();
  r.use(authenticate());

  r.get('/users', requirePermission('users.read', 'users.manage'), async (req, res) => {
    const p = pageParams(req.query);
    const { search, role, status, type } = req.query;
    const where = {
      AND: [
        search ? { OR: [{ email: { contains: String(search), mode: 'insensitive' } }, { firstName: { contains: String(search), mode: 'insensitive' } }, { lastName: { contains: String(search), mode: 'insensitive' } }] } : {},
        role ? { roles: { some: { role: { code: String(role) } } } } : {},
        status ? { status: String(status) } : {},
        type === 'staff' ? { roles: { some: { role: { isStaff: true } } } } : type === 'clientes' ? { roles: { none: { role: { isStaff: true } } } } : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.user.count({ where }),
    ]);
    res.json(paged(items.map(shapeUser), total, p));
  });

  r.get('/users/:id', requirePermission('users.read', 'users.manage'), async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: Number(req.params.id) }, select: { ...userSelect, addresses: { where: { active: true } } } });
    if (!u) throw notFound('El usuario no existe.');
    const [orders, events] = await Promise.all([
      prisma.order.aggregate({ where: { customerId: u.id, status: { not: 'CANCELADO' } }, _count: true, _sum: { total: true } }),
      prisma.securityEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 15 }),
    ]);
    res.json({ ...shapeUser(u), stats: { orders: orders._count, spent: orders._sum.total || 0 }, securityEvents: events });
  });

  const staffSchema = z.object({
    firstName: text(80, 'El nombre'),
    lastName: text(80, 'El apellido'),
    email: emailSchema,
    phone: phone.optional().or(z.literal('')).transform((v) => v || null),
    roleCodes: z.array(z.string()).min(1, 'Asigna al menos un rol.'),
  });

  r.post('/users', requirePermission('users.manage'), async (req, res) => {
    const data = staffSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('Ya existe un usuario con ese correo.', [{ field: 'email', message: 'Correo ya registrado.' }]);
    const roles = await prisma.role.findMany({ where: { code: { in: data.roleCodes } } });
    if (roles.length !== data.roleCodes.length) throw badRequest('Algún rol seleccionado no existe.');
    if (roles.some((x) => x.code === 'ADMIN') && !req.user.roles.includes('ADMIN')) throw forbidden('Solo un administrador puede crear otro administrador.');
    const tempPassword = `Exc-${crypto.randomBytes(4).toString('hex')}A1`;
    const u = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email, firstName: data.firstName, lastName: data.lastName, phone: data.phone, passwordHash: await bcrypt.hash(tempPassword, 10),
          emailVerified: true, isDemo: false, roles: { create: roles.map((x) => ({ roleId: x.id })) },
        },
        select: userSelect,
      });
      await audit(req, { service: SERVICE, action: 'USER_CREATED', entity: 'user', entityId: created.id, after: { email: created.email, roles: data.roleCodes } }, tx);
      await sendMail({
        to: created.email, subject: 'Tu acceso al panel de Exclusive', category: 'CUENTA', title: `Hola, ${created.firstName}`,
        intro: `Se creó tu usuario en el panel. Tu contraseña temporal es ${tempPassword}. Cámbiala desde "Mi cuenta" después de iniciar sesión.`,
        cta: 'Entrar al panel', ctaPath: '/admin',
      }, tx);
      return created;
    });
    res.status(201).json({ ...shapeUser(u), tempPassword });
  });

  r.put('/users/:id', requirePermission('users.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const data = staffSchema.omit({ email: true }).parse(req.body);
    const current = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!current) throw notFound('El usuario no existe.');
    const roles = await prisma.role.findMany({ where: { code: { in: data.roleCodes } } });
    if (roles.length !== data.roleCodes.length) throw badRequest('Algún rol seleccionado no existe.');
    const touchesAdmin = roles.some((x) => x.code === 'ADMIN') !== current.roles.some((x) => x.role.code === 'ADMIN');
    if (touchesAdmin && !req.user.roles.includes('ADMIN')) throw forbidden('Solo un administrador puede asignar o quitar el rol de administrador.');
    if (id === req.user.id && !roles.some((x) => x.code === 'ADMIN') && req.user.roles.includes('ADMIN')) throw badRequest('No puedes quitarte el rol de administrador a ti mismo.');
    const u = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((x) => ({ userId: id, roleId: x.id })) });
      const updated = await tx.user.update({ where: { id }, data: { firstName: data.firstName, lastName: data.lastName, phone: data.phone }, select: userSelect });
      await audit(req, {
        service: SERVICE, action: 'USER_UPDATED', entity: 'user', entityId: id,
        before: { firstName: current.firstName, lastName: current.lastName, phone: current.phone, roles: current.roles.map((x) => x.role.code) },
        after: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, roles: data.roleCodes },
      }, tx);
      return updated;
    });
    invalidateUserState(id);
    res.json(shapeUser(u));
  });

  r.post('/users/:id/status', requirePermission('users.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { status, reason } = z.object({ status: z.enum(['ACTIVO', 'INACTIVO']), reason: z.string().trim().max(200).optional() }).parse(req.body);
    if (id === req.user.id) throw badRequest('No puedes desactivar tu propia cuenta.');
    const current = await prisma.user.findUnique({ where: { id }, select: { status: true, email: true, roles: { select: { role: { select: { code: true } } } } } });
    if (!current) throw notFound('El usuario no existe.');
    if (current.roles.some((x) => x.role.code === 'ADMIN') && !req.user.roles.includes('ADMIN')) throw forbidden('Solo un administrador puede cambiar el estado de otro administrador.');
    await prisma.user.update({ where: { id }, data: { status, lockedUntil: null, failedLogins: 0 } });
    if (status !== 'ACTIVO') await revokeAllSessions(id);
    invalidateUserState(id);
    await audit(req, { service: SERVICE, action: status === 'ACTIVO' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entity: 'user', entityId: id, before: { status: current.status }, after: { status, reason } });
    res.json({ id, status, message: status === 'ACTIVO' ? 'Cuenta activada.' : 'Cuenta desactivada y sesiones cerradas.' });
  });

  r.post('/users/:id/revoke-sessions', requirePermission('users.manage'), async (req, res) => {
    const id = Number(req.params.id);
    await revokeAllSessions(id);
    await audit(req, { service: SERVICE, action: 'SESSIONS_REVOKED', entity: 'user', entityId: id });
    res.json({ message: 'Se cerraron todas las sesiones del usuario.' });
  });

  r.post('/users/:id/unlock', requirePermission('users.manage'), async (req, res) => {
    const id = Number(req.params.id);
    await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLogins: 0 } });
    await audit(req, { service: SERVICE, action: 'USER_UNLOCKED', entity: 'user', entityId: id });
    res.json({ message: 'Usuario desbloqueado.' });
  });

  r.get('/roles', requirePermission('users.read', 'roles.manage', 'users.manage'), async (req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { id: 'asc' },
      include: { permissions: { select: { permission: { select: { code: true } } } }, _count: { select: { users: true } } },
    });
    res.json(roles.map((x) => ({ id: x.id, code: x.code, name: x.name, description: x.description, isSystem: x.isSystem, isStaff: x.isStaff, users: x._count.users, permissions: x.permissions.map((p) => p.permission.code) })));
  });

  r.get('/permissions', requirePermission('users.read', 'roles.manage'), async (req, res) => {
    res.json(await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { id: 'asc' }] }));
  });

  r.put('/roles/:id/permissions', requirePermission('roles.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { permissions } = z.object({ permissions: z.array(z.string()) }).parse(req.body);
    const role = await prisma.role.findUnique({ where: { id }, include: { permissions: { select: { permission: { select: { code: true } } } } } });
    if (!role) throw notFound('El rol no existe.');
    if (role.code === 'ADMIN') throw badRequest('Los permisos del administrador no se pueden reducir: garantizan que siempre exista acceso completo.');
    if (role.code === 'CLIENTE' && permissions.length) throw badRequest('El rol Cliente no puede tener permisos administrativos.');
    const found = await prisma.permission.findMany({ where: { code: { in: permissions } } });
    if (found.length !== new Set(permissions).size) throw badRequest('Algún permiso no existe.');
    const before = role.permissions.map((p) => p.permission.code).sort();
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (found.length) await tx.rolePermission.createMany({ data: found.map((p) => ({ roleId: id, permissionId: p.id })) });
      await audit(req, {
        service: SERVICE, action: 'ROLE_PERMISSIONS_UPDATED', entity: 'role', entityId: id,
        before: { role: role.code, permissions: before }, after: { role: role.code, permissions: [...permissions].sort(), added: permissions.filter((p) => !before.includes(p)), removed: before.filter((p) => !permissions.includes(p)) },
      }, tx);
    });
    invalidateUserState();
    res.json({ message: 'Permisos actualizados.' });
  });

  r.post('/roles', requirePermission('roles.manage'), async (req, res) => {
    const data = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z_]{3,40}$/, 'Usa solo letras mayúsculas y guion bajo.'),
      name: text(80, 'El nombre'),
      description: z.string().trim().max(255).optional(),
      permissions: z.array(z.string()).default([]),
    }).parse(req.body);
    if (await prisma.role.findUnique({ where: { code: data.code } })) throw conflict('Ya existe un rol con ese código.');
    const perms = await prisma.permission.findMany({ where: { code: { in: data.permissions } } });
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({ data: { code: data.code, name: data.name, description: data.description, isSystem: false, isStaff: true, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
      await audit(req, { service: SERVICE, action: 'ROLE_CREATED', entity: 'role', entityId: created.id, after: { code: data.code, permissions: data.permissions } }, tx);
      return created;
    });
    res.status(201).json(role);
  });

  r.get('/security-events', requirePermission('audit.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 30 });
    const where = { ...(req.query.type ? { type: String(req.query.type) } : {}), ...(req.query.email ? { email: { contains: String(req.query.email), mode: 'insensitive' } } : {}) };
    const [items, total] = await Promise.all([prisma.securityEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), prisma.securityEvent.count({ where })]);
    res.json(paged(items, total, p));
  });

  return r;
}

export function mailboxRoutes() {
  const r = express.Router();
  const guard = env.MAILBOX_PUBLIC ? (req, res, next) => next() : [authenticate(), requirePermission('mailbox.read')];
  r.get('/', guard, async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 25 });
    const where = req.query.to ? { toEmail: { contains: String(req.query.to).toLowerCase() } } : {};
    const [items, total] = await Promise.all([
      prisma.mailboxMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, toEmail: true, subject: true, category: true, createdAt: true, readAt: true } }),
      prisma.mailboxMessage.count({ where }),
    ]);
    res.json({ ...paged(items, total, p), public: env.MAILBOX_PUBLIC });
  });
  r.get('/:id', guard, async (req, res) => {
    const m = await prisma.mailboxMessage.findUnique({ where: { id: Number(req.params.id) } });
    if (!m) throw notFound('El mensaje no existe.');
    if (!m.readAt) await prisma.mailboxMessage.update({ where: { id: m.id }, data: { readAt: new Date() } });
    res.json(m);
  });
  return r;
}
