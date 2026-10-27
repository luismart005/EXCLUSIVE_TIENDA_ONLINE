import { prisma } from '@exclusive/db';
import { conflict, badRequest, notFound, audit, notifyPermission } from '@exclusive/common';

export const SERVICE = 'inventory-service';

export const MOVEMENT_TYPES = {
  INVENTARIO_INICIAL: { direction: 'ENTRADA', label: 'Inventario inicial' },
  ENTRADA_COMPRA: { direction: 'ENTRADA', label: 'Entrada por compra' },
  ENTRADA_DEVOLUCION: { direction: 'ENTRADA', label: 'Entrada por devolución de cliente' },
  ENTRADA_AJUSTE: { direction: 'ENTRADA', label: 'Ajuste de entrada' },
  SALIDA_VENTA: { direction: 'SALIDA', label: 'Salida por venta (despacho)' },
  SALIDA_CAMBIO: { direction: 'SALIDA', label: 'Salida por cambio' },
  SALIDA_DEVOLUCION_PROVEEDOR: { direction: 'SALIDA', label: 'Devolución a proveedor' },
  SALIDA_DANIO: { direction: 'SALIDA', label: 'Salida por daño' },
  SALIDA_PERDIDA: { direction: 'SALIDA', label: 'Salida por pérdida' },
  SALIDA_AJUSTE: { direction: 'SALIDA', label: 'Ajuste de salida' },
};

export const MANUAL_TYPES = ['ENTRADA_AJUSTE', 'SALIDA_AJUSTE', 'SALIDA_DANIO', 'SALIDA_PERDIDA', 'SALIDA_DEVOLUCION_PROVEEDOR', 'INVENTARIO_INICIAL'];

async function lockStock(tx, variantId) {
  await tx.$executeRaw`INSERT INTO inventory_stock (variant_id, physical, reserved, min_stock, updated_at) VALUES (${variantId}, 0, 0, 3, now()) ON CONFLICT (variant_id) DO NOTHING`;
  const rows = await tx.$queryRaw`SELECT physical, reserved, min_stock FROM inventory_stock WHERE variant_id = ${variantId} FOR UPDATE`;
  return { physical: rows[0].physical, reserved: rows[0].reserved, minStock: rows[0].min_stock };
}

export async function applyMovement(tx, req, m) {
  const variant = await tx.productVariant.findUnique({ where: { id: m.variantId }, select: { id: true, sku: true } });
  if (!variant) throw notFound(`La variante ${m.variantId} no existe.`);
  if (m.idempotencyKey) {
    const existing = await tx.inventoryMovement.findUnique({ where: { idempotencyKey: m.idempotencyKey } });
    if (existing) return { movement: existing, duplicated: true, crossedLow: false };
  }
  const meta = MOVEMENT_TYPES[m.type];
  if (!meta) throw badRequest('Tipo de movimiento inválido.');
  const qty = Number(m.quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw badRequest('La cantidad debe ser un entero mayor que cero.');

  const before = await lockStock(tx, m.variantId);
  const physicalAfter = meta.direction === 'ENTRADA' ? before.physical + qty : before.physical - qty;
  const reservedAfter = m.consumeReserved ? before.reserved - qty : before.reserved;
  if (physicalAfter < 0) throw conflict(`Existencias insuficientes para ${variant.sku}: hay ${before.physical} unidades físicas.`);
  if (reservedAfter < 0) throw conflict(`La reserva de ${variant.sku} es menor a la cantidad a despachar.`);
  if (reservedAfter > physicalAfter) {
    throw conflict(`No se puede retirar ${qty} unidad(es) de ${variant.sku}: ${before.reserved} están reservadas para pedidos y quedarían sin respaldo.`);
  }
  await tx.$executeRaw`UPDATE inventory_stock SET physical = ${physicalAfter}, reserved = ${reservedAfter}, updated_at = now() WHERE variant_id = ${m.variantId}`;

  const user = req?.user || req?.actingUser || null;
  const movement = await tx.inventoryMovement.create({
    data: {
      variantId: m.variantId,
      type: m.type,
      direction: meta.direction,
      quantity: qty,
      physicalBefore: before.physical,
      physicalAfter,
      reservedBefore: before.reserved,
      reservedAfter,
      unitCost: m.unitCost ?? null,
      reason: m.reason.slice(0, 255),
      referenceType: m.referenceType || null,
      referenceId: m.referenceId || null,
      referenceCode: m.referenceCode || null,
      documentRef: m.documentRef || null,
      supplierId: m.supplierId || null,
      correctsId: m.correctsId || null,
      idempotencyKey: m.idempotencyKey || null,
      userId: user?.id || null,
      userEmail: user?.email || null,
    },
  });
  const availBefore = before.physical - before.reserved;
  const availAfter = physicalAfter - reservedAfter;
  return { movement, duplicated: false, crossedLow: availBefore > before.minStock && availAfter <= before.minStock, sku: variant.sku, availAfter };
}

export async function notifyLowStock(results) {
  const low = results.filter((r) => r.crossedLow);
  if (!low.length) return;
  await notifyPermission('inventory.move', {
    type: 'INVENTARIO',
    title: low.length === 1 ? `Existencias bajas: ${low[0].sku}` : `${low.length} variantes con existencias bajas`,
    body: low.map((r) => `${r.sku}: ${r.availAfter} disponibles`).join(' · ').slice(0, 480),
    link: '/admin/inventario?filtro=bajas',
  }).catch(() => {});
}

export async function reserveForOrder(req, input) {
  const existing = await prisma.reservation.findMany({ where: { orderId: input.orderId } });
  if (existing.length) return { reservations: existing, duplicated: true };

  const items = [...input.items].sort((a, b) => a.variantId - b.variantId);
  const shortages = [];
  try {
    const reservations = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const it of items) {
        const rows = await tx.$queryRaw`
          UPDATE inventory_stock SET reserved = reserved + ${it.quantity}, updated_at = now()
          WHERE variant_id = ${it.variantId} AND physical - reserved >= ${it.quantity}
          RETURNING physical, reserved`;
        if (!rows.length) {
          const s = await tx.inventoryStock.findUnique({ where: { variantId: it.variantId }, include: { variant: { select: { sku: true } } } });
          shortages.push({ variantId: it.variantId, sku: s?.variant.sku, requested: it.quantity, available: s ? Math.max(0, s.physical - s.reserved) : 0 });
          continue;
        }
        created.push(
          await tx.reservation.create({
            data: { orderId: input.orderId, variantId: it.variantId, quantity: it.quantity, status: 'ACTIVA', expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
          }),
        );
      }
      if (shortages.length) throw conflict('Algunos productos ya no tienen existencias suficientes.', shortages);
      await audit(req, { service: SERVICE, action: 'STOCK_RESERVED', entity: 'order', entityId: input.orderId, after: { orderCode: input.orderCode, items, expiresAt: input.expiresAt } }, tx);
      return created;
    });
    return { reservations, duplicated: false };
  } catch (e) {
    if (e.code === 'P2002') {
      return { reservations: await prisma.reservation.findMany({ where: { orderId: input.orderId } }), duplicated: true };
    }
    throw e;
  }
}

export async function confirmReservation(req, orderId) {
  const { count } = await prisma.reservation.updateMany({ where: { orderId, status: 'ACTIVA' }, data: { status: 'CONFIRMADA', expiresAt: null } });
  if (count) await audit(req, { service: SERVICE, action: 'RESERVATION_CONFIRMED', entity: 'order', entityId: orderId, after: { reservations: count } });
  return { confirmed: count };
}

export async function releaseReservation(req, orderId, reason) {
  return prisma.$transaction(async (tx) => {
    const active = await tx.reservation.findMany({ where: { orderId, status: { in: ['ACTIVA', 'CONFIRMADA'] } }, orderBy: { variantId: 'asc' } });
    for (const r of active) {
      await lockStock(tx, r.variantId);
      await tx.$executeRaw`UPDATE inventory_stock SET reserved = reserved - ${r.quantity}, updated_at = now() WHERE variant_id = ${r.variantId}`;
      await tx.reservation.update({ where: { id: r.id }, data: { status: 'LIBERADA', releaseReason: reason?.slice(0, 200) || 'Liberada', expiresAt: null } });
    }
    if (active.length) await audit(req, { service: SERVICE, action: 'RESERVATION_RELEASED', entity: 'order', entityId: orderId, after: { reason, items: active.map((r) => ({ variantId: r.variantId, quantity: r.quantity })) } }, tx);
    return { released: active.length };
  });
}

export async function dispatchOrder(req, orderId, orderCode) {
  const results = await prisma.$transaction(async (tx) => {
    const reservations = await tx.reservation.findMany({ where: { orderId }, orderBy: { variantId: 'asc' } });
    if (!reservations.length) throw notFound('El pedido no tiene existencias reservadas.');
    if (reservations.every((r) => r.status === 'CONSUMIDA')) return [];
    const out = [];
    for (const r of reservations) {
      if (r.status === 'CONSUMIDA') continue;
      if (r.status === 'LIBERADA') throw conflict('La reserva del pedido fue liberada; no se puede despachar.');
      const res = await applyMovement(tx, req, {
        variantId: r.variantId, type: 'SALIDA_VENTA', quantity: r.quantity, consumeReserved: true, reason: `Despacho del pedido ${orderCode}`,
        referenceType: 'PEDIDO', referenceId: orderId, referenceCode: orderCode, idempotencyKey: `DESPACHO:${orderId}:${r.variantId}`,
      });
      await tx.reservation.update({ where: { id: r.id }, data: { status: 'CONSUMIDA', expiresAt: null } });
      out.push(res);
    }
    await audit(req, { service: SERVICE, action: 'ORDER_STOCK_DISPATCHED', entity: 'order', entityId: orderId, after: { orderCode, movements: out.map((x) => x.movement.id) } }, tx);
    return out;
  });
  await notifyLowStock(results);
  return { movements: results.map((r) => r.movement.id), alreadyDispatched: results.length === 0 };
}

export async function expiredReservations() {
  return prisma.reservation.findMany({ where: { status: 'ACTIVA', expiresAt: { lt: new Date(Date.now() - 15 * 60_000) } }, select: { orderId: true }, distinct: ['orderId'] });
}
