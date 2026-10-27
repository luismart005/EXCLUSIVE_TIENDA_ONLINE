import { prisma } from '@exclusive/db';

const DROP = new Set(['passwordHash', 'password_hash', 'password', 'tokenHash', 'token', 'cardNumber', 'cvv', 'receiptPath']);

export function sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  return JSON.parse(
    JSON.stringify(obj, (key, value) => {
      if (DROP.has(key)) return undefined;
      if (typeof value === 'bigint') return value.toString();
      return value;
    }),
  );
}

export async function audit(req, data, tx = prisma) {
  const user = data.user || req?.user || req?.actingUser || null;
  return tx.auditLog.create({
    data: {
      service: data.service,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId !== undefined && data.entityId !== null ? String(data.entityId) : null,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      before: data.before ? sanitize(data.before) : undefined,
      after: data.after ? sanitize(data.after) : undefined,
      ip: req?.ip ? String(req.ip).slice(0, 64) : null,
      requestId: req?.requestId || null,
    },
  });
}

export function diff(before, after, keys) {
  const b = {};
  const a = {};
  for (const k of keys || Object.keys(after || {})) {
    const bv = before?.[k];
    const av = after?.[k];
    if (JSON.stringify(sanitize({ v: bv })) !== JSON.stringify(sanitize({ v: av }))) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
