import express from 'express';
import { prisma } from '@exclusive/db';
import { authenticate, requirePermission, pageParams, paged, sendCSV, audit } from '@exclusive/common';

function where(q) {
  const and = [];
  if (q.userId) and.push({ userId: Number(q.userId) });
  if (q.user) and.push({ userEmail: { contains: String(q.user), mode: 'insensitive' } });
  if (q.service) and.push({ service: String(q.service) });
  if (q.action) and.push({ action: String(q.action) });
  if (q.entity) and.push({ entity: String(q.entity) });
  if (q.entityId) and.push({ entityId: String(q.entityId) });
  if (q.from) and.push({ createdAt: { gte: new Date(`${q.from}T00:00:00-06:00`) } });
  if (q.to) and.push({ createdAt: { lte: new Date(`${q.to}T23:59:59.999-06:00`) } });
  return { AND: and };
}

export function auditRoutes() {
  const r = express.Router();
  r.use(authenticate());

  r.get('/audit', requirePermission('audit.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 30 });
    const w = where(req.query);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where: w, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.auditLog.count({ where: w }),
    ]);
    res.json(paged(items.map((x) => ({ ...x, id: x.id.toString() })), total, p));
  });

  r.get('/audit/meta', requirePermission('audit.read'), async (req, res) => {
    const [services, actions, entities] = await Promise.all([
      prisma.auditLog.findMany({ distinct: ['service'], select: { service: true }, orderBy: { service: 'asc' } }),
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    ]);
    res.json({ services: services.map((x) => x.service), actions: actions.map((x) => x.action), entities: entities.map((x) => x.entity) });
  });

  r.get('/audit/export', requirePermission('audit.read'), async (req, res) => {
    if (!req.user.permissions.has('reports.export')) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para exportar.' } });
    const items = await prisma.auditLog.findMany({ where: where(req.query), orderBy: { id: 'asc' }, take: 20000 });
    await audit(req, { service: 'analytics-service', action: 'AUDIT_EXPORTED', entity: 'audit_log', after: { filters: req.query, rows: items.length } });
    sendCSV(res, `auditoria-${new Date().toISOString().slice(0, 10)}.csv`, items.map((x) => ({ ...x, id: x.id.toString(), before: x.before ? JSON.stringify(x.before) : '', after: x.after ? JSON.stringify(x.after) : '' })), [
      { key: 'id', label: 'Evento' }, { key: 'createdAt', label: 'Fecha (UTC)' }, { key: 'service', label: 'Servicio' }, { key: 'action', label: 'Acción' },
      { key: 'entity', label: 'Entidad' }, { key: 'entityId', label: 'Registro' }, { key: 'userEmail', label: 'Usuario' }, { key: 'ip', label: 'IP' },
      { key: 'requestId', label: 'Solicitud' }, { key: 'before', label: 'Antes' }, { key: 'after', label: 'Después' },
    ]);
  });

  r.get('/errors', requirePermission('system.health', 'audit.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 30 });
    const w = req.query.errorId ? { errorId: String(req.query.errorId).toUpperCase() } : {};
    const [items, total] = await Promise.all([prisma.errorLog.findMany({ where: w, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }), prisma.errorLog.count({ where: w })]);
    res.json(paged(items, total, p));
  });

  return r;
}
