import { prisma } from '@exclusive/db';
import {
  assertTransition, LABELS, audit, serviceClient, sendMail, notifyUser, notifyPermission, conflict, badRequest, notFound, toCents, fromCents, createLogger,
} from '@exclusive/common';

export const SERVICE = 'sales-service';
export const inventory = serviceClient('sales', 'inventory');
const logger = createLogger('sales-service');

const FIELD = { PEDIDO: 'status', PAGO: 'paymentStatus', ENVIO: 'shippingStatus' };

export const fullOrderInclude = {
  customer: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  items: { orderBy: { id: 'asc' } },
  history: { orderBy: { id: 'asc' } },
  payments: { orderBy: { id: 'asc' } },
  refunds: { orderBy: { id: 'asc' } },
  documents: { orderBy: { id: 'asc' }, select: { id: true, number: true, type: true, total: true, issuedAt: true, voided: true } },
  shipment: { include: { carrier: true, events: { orderBy: { id: 'asc' } } } },
  postSales: { orderBy: { id: 'desc' }, select: { id: true, code: true, type: true, status: true, createdAt: true } },
  shippingZone: true,
};

export async function changeStatus(tx, order, kind, to, { user, note } = {}) {
  const field = FIELD[kind];
  const from = order[field];
  if (from === to) return order;
  assertTransition(kind, from, to);
  const updated = await tx.order.update({ where: { id: order.id }, data: { [field]: to } });
  await tx.orderStatusHistory.create({ data: { orderId: order.id, kind, fromStatus: from, toStatus: to, note: note?.slice(0, 400) || null, userId: user?.id || null, userEmail: user?.email || null } });
  Object.assign(order, updated);
  return order;
}

export async function lockOrder(tx, id) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
  const o = await tx.order.findUnique({ where: { id }, include: { customer: { select: { id: true, email: true, firstName: true, lastName: true } }, items: true } });
  if (!o) throw notFound('El pedido no existe.');
  return o;
}

export async function nextCode(tx, seq, prefix, pad = 6) {
  const [{ n }] = await tx.$queryRawUnsafe(`SELECT nextval('${seq}')::int AS n`);
  return `${prefix}${String(n).padStart(pad, '0')}`;
}

export async function notifyCustomer(order, { title, body, mail, type = 'PEDIDO' }, tx = prisma) {
  const link = `/cuenta/pedidos/${order.code}`;
  await notifyUser(order.customerId, { type, title, body, link }, tx);
  if (mail && order.customer?.email) {
    await sendMail({ to: order.customer.email, subject: title, category: type, title, intro: body, body: mail.body || '', cta: 'Ver mi pedido', ctaPath: link }, tx);
  }
}

export async function issueDocument(tx, order) {
  const existing = await tx.saleDocument.findFirst({ where: { orderId: order.id, voided: false } });
  if (existing) return existing;
  const items = order.items || (await tx.orderItem.findMany({ where: { orderId: order.id } }));
  const customer = order.customer || (await tx.user.findUnique({ where: { id: order.customerId } }));
  const number = await nextCode(tx, 'document_number_seq', 'SIM-');
  const net = toCents(order.shippingCost) - toCents(order.shippingDiscount);
  return tx.saleDocument.create({
    data: {
      orderId: order.id, number, total: order.total,
      snapshot: {
        legend: 'SIMULACIÓN — SIN VALIDEZ FISCAL', number, orderCode: order.code,
        customer: { name: `${customer.firstName} ${customer.lastName}`, nit: 'CF', email: customer.email },
        items: items.map((i) => ({ sku: i.sku, description: `${i.productName} · ${i.colorName} · ${i.sizeName}`, quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2), discount: i.discountAmount.toFixed(2), total: i.lineTotal.toFixed(2) })),
        subtotal: order.subtotal.toFixed(2), discount: order.discountTotal.toFixed(2), shipping: fromCents(net), total: order.total.toFixed(2), paymentMethod: order.paymentMethod,
      },
    },
  });
}

export async function markPaid(req, orderId, payment, { user, note }) {
  const order = await prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'APROBADO', reviewedBy: user?.id || null, reviewedAt: user ? new Date() : null, reviewNote: note || null } });
    if (o.paymentStatus !== 'APROBADO') await changeStatus(tx, o, 'PAGO', 'APROBADO', { user, note: note || `Pago ${payment.reference} aprobado (simulado)` });
    await tx.order.update({ where: { id: o.id }, data: { amountPaid: fromCents(toCents(o.amountPaid) + toCents(payment.amount)), reservationExpiresAt: null } });
    if (o.status === 'PENDIENTE_PAGO') await changeStatus(tx, o, 'PEDIDO', 'CONFIRMADO', { user, note: 'Pago confirmado' });
    o.amountPaid = fromCents(toCents(o.amountPaid) + toCents(payment.amount));
    const doc = await issueDocument(tx, o);
    await audit(req, { service: SERVICE, action: 'PAYMENT_APPROVED', entity: 'payment', entityId: payment.id, after: { orderCode: o.code, amount: payment.amount, method: payment.method, document: doc.number } }, tx);
    await notifyCustomer(o, { title: `Pago aprobado · ${o.code}`, body: `Recibimos tu pago de Q ${Number(payment.amount).toFixed(2)} (simulado). Ya estamos preparando tu pedido. Comprobante ${doc.number}.`, mail: {} }, tx);
    return o;
  });
  try {
    await inventory.post(`/internal/reservations/${orderId}/confirm`, {}, { req });
  } catch (e) {
    logger.warn('No se pudo confirmar la reserva; el job la reconciliará', { orderId, message: e.message });
  }
  return order;
}

export async function cancelOrder(req, orderId, { user, reason, system = false }) {
  const order = await prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    assertTransition('PEDIDO', o.status, 'CANCELADO');
    await changeStatus(tx, o, 'PEDIDO', 'CANCELADO', { user, note: reason });
    await tx.order.update({ where: { id: o.id }, data: { cancelReason: reason.slice(0, 255), cancelledAt: new Date(), reservationExpiresAt: null } });
    const red = await tx.couponRedemption.findUnique({ where: { orderId: o.id } });
    if (red && !red.reversedAt) {
      await tx.couponRedemption.update({ where: { id: red.id }, data: { reversedAt: new Date() } });
      await tx.coupon.update({ where: { id: red.couponId }, data: { usedCount: { decrement: 1 } } });
    }
    const pending = toCents(o.amountPaid) - toCents(o.amountRefunded);
    if (pending > 0) await createRefund(tx, req, o, { amountCents: pending, reason: `Cancelación del pedido: ${reason}`.slice(0, 255), user, idempotencyKey: `CANCEL:${o.id}` });
    await audit(req, { service: SERVICE, action: system ? 'ORDER_EXPIRED' : 'ORDER_CANCELLED', entity: 'order', entityId: o.id, before: { status: 'activo' }, after: { status: 'CANCELADO', reason, code: o.code }, user: user || undefined }, tx);
    await notifyCustomer(o, { title: `Pedido ${o.code} cancelado`, body: `${reason}.${pending > 0 ? ` Registramos el reembolso simulado de Q ${fromCents(pending)}.` : ''}`, mail: {} }, tx);
    return o;
  });
  try {
    await inventory.post(`/internal/reservations/${orderId}/release`, { reason }, { req, user });
  } catch (e) {
    logger.warn('No se pudo liberar la reserva; el job reintentará', { orderId, message: e.message });
  }
  return order;
}

export async function createRefund(tx, req, order, { amountCents, reason, user, postSaleRequestId = null, idempotencyKey = null }) {
  if (idempotencyKey) {
    const dup = await tx.refund.findUnique({ where: { idempotencyKey } });
    if (dup) return dup;
  }
  const o = await tx.order.findUnique({ where: { id: order.id } });
  const paid = toCents(o.amountPaid);
  const refunded = toCents(o.amountRefunded);
  if (amountCents <= 0) throw badRequest('El monto del reembolso debe ser mayor que cero.');
  if (refunded + amountCents > paid) throw conflict(`El reembolso supera lo pagado. Disponible para reembolsar: Q ${fromCents(paid - refunded)}.`);
  const payment = await tx.payment.findFirst({ where: { orderId: o.id, status: 'APROBADO' }, orderBy: { id: 'desc' } });
  if (!payment) throw conflict('El pedido no tiene un pago aprobado para reembolsar.');
  const reference = await nextCode(tx, 'payment_ref_seq', 'REF-SIM-');
  const refund = await tx.refund.create({
    data: { paymentId: payment.id, orderId: o.id, postSaleRequestId, amount: fromCents(amountCents), reason, reference, idempotencyKey, createdBy: user?.id || null },
  });
  const total = refunded + amountCents;
  await tx.order.update({ where: { id: o.id }, data: { amountRefunded: fromCents(total) } });
  const target = total >= paid ? 'REEMBOLSADO' : 'REEMBOLSO_PARCIAL';
  await changeStatus(tx, o, 'PAGO', target, { user, note: `${reference}: Q ${fromCents(amountCents)} — ${reason}` });
  await audit(req, { service: SERVICE, action: 'REFUND_CREATED', entity: 'refund', entityId: refund.id, after: { orderCode: o.code, amount: fromCents(amountCents), reason, reference, totalRefunded: fromCents(total) }, user: user || undefined }, tx);
  return refund;
}

export async function staffAlert(permission, title, body, link) {
  await notifyPermission(permission, { type: 'OPERACION', title, body, link }).catch(() => {});
}

export const statusLabel = (s) => LABELS[s] || s;
