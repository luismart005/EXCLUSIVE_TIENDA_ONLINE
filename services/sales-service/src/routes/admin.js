import express from 'express';
import { prisma, Prisma } from '@exclusive/db';
import {
  z, authenticate, requirePermission, requireStaff, audit, badRequest, notFound, conflict, pageParams, paged, toCents, fromCents, canDispatch, assertTransition,
  LABELS, sendCSV,
} from '@exclusive/common';
import {
  SERVICE, inventory, changeStatus, lockOrder, issueDocument, notifyCustomer, markPaid, cancelOrder, createRefund, fullOrderInclude, nextCode,
} from '../lib/orders.js';

const dateRange = (q) => ({
  ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00-06:00`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999-06:00`) } : {}) } } : {}),
});

function orderWhere(q) {
  const and = [dateRange(q)];
  if (q.status) and.push({ status: String(q.status) });
  if (q.paymentStatus) and.push({ paymentStatus: String(q.paymentStatus) });
  if (q.shippingStatus) and.push({ shippingStatus: String(q.shippingStatus) });
  if (q.method) and.push({ paymentMethod: String(q.method) });
  if (q.customerId) and.push({ customerId: Number(q.customerId) });
  if (q.queue === 'por-preparar') and.push({ status: 'CONFIRMADO' });
  if (q.queue === 'por-despachar') and.push({ status: 'EN_PREPARACION' });
  if (q.queue === 'en-ruta') and.push({ status: 'ENVIADO' });
  if (q.queue === 'pago-pendiente') and.push({ status: 'PENDIENTE_PAGO' });
  if (q.search) {
    const s = String(q.search).trim();
    and.push({ OR: [{ code: { contains: s, mode: 'insensitive' } }, { customer: { email: { contains: s, mode: 'insensitive' } } }, { customer: { firstName: { contains: s, mode: 'insensitive' } } }, { customer: { lastName: { contains: s, mode: 'insensitive' } } }, { shipment: { trackingNumber: { contains: s, mode: 'insensitive' } } }] });
  }
  return { AND: and };
}

const listInclude = { customer: { select: { id: true, email: true, firstName: true, lastName: true } }, items: { select: { quantity: true } }, shipment: { select: { trackingNumber: true, carrier: { select: { name: true } } } } };
const shapeListOrder = (o) => ({
  id: o.id, code: o.code, createdAt: o.createdAt, customer: o.customer, status: o.status, paymentStatus: o.paymentStatus, shippingStatus: o.shippingStatus,
  paymentMethod: o.paymentMethod, total: o.total, amountRefunded: o.amountRefunded, units: o.items.reduce((a, i) => a + i.quantity, 0),
  department: o.addressSnapshot?.department, tracking: o.shipment?.trackingNumber || null, carrier: o.shipment?.carrier?.name || null, reservationExpiresAt: o.reservationExpiresAt,
});

export function adminRoutes() {
  const r = express.Router();
  r.use(authenticate(), requireStaff());

  r.get('/summary', requirePermission('dashboard.view'), async (req, res) => {
    const [toReview, toPrepare, toDispatch, inRoute, pendingPayment, postsaleOpen, incidents] = await Promise.all([
      prisma.payment.count({ where: { status: { in: ['EN_REVISION', 'PENDIENTE'] }, method: { not: 'CONTRA_ENTREGA' }, order: { status: 'PENDIENTE_PAGO' } } }),
      prisma.order.count({ where: { status: 'CONFIRMADO' } }),
      prisma.order.count({ where: { status: 'EN_PREPARACION' } }),
      prisma.order.count({ where: { status: 'ENVIADO' } }),
      prisma.order.count({ where: { status: 'PENDIENTE_PAGO' } }),
      prisma.postSaleRequest.count({ where: { status: { in: ['SOLICITADA', 'EN_REVISION', 'APROBADA', 'PRENDA_RECIBIDA'] } } }),
      prisma.order.count({ where: { shippingStatus: 'INCIDENCIA' } }),
    ]);
    res.json({ toReview, toPrepare, toDispatch, inRoute, pendingPayment, postsaleOpen, incidents });
  });

  r.get('/orders', requirePermission('orders.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 20 });
    const where = orderWhere(req.query);
    const [items, total, sums] = await Promise.all([
      prisma.order.findMany({ where, include: listInclude, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.order.count({ where }),
      prisma.order.aggregate({ where, _sum: { total: true } }),
    ]);
    res.json({ ...paged(items.map(shapeListOrder), total, p), sumTotal: sums._sum.total || 0 });
  });

  r.get('/orders/export', requirePermission('reports.export'), async (req, res) => {
    const items = await prisma.order.findMany({ where: orderWhere(req.query), include: listInclude, orderBy: { id: 'asc' }, take: 20000 });
    await audit(req, { service: SERVICE, action: 'ORDERS_EXPORTED', entity: 'order', after: { filters: req.query, rows: items.length } });
    sendCSV(res, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`, items.map(shapeListOrder), [
      { key: 'code', label: 'Pedido' }, { key: 'createdAt', label: 'Fecha (UTC)' }, { label: 'Cliente', value: (o) => `${o.customer.firstName} ${o.customer.lastName}` },
      { label: 'Correo', value: (o) => o.customer.email }, { key: 'department', label: 'Departamento' }, { key: 'status', label: 'Estado' }, { key: 'paymentStatus', label: 'Pago' },
      { key: 'shippingStatus', label: 'Envío' }, { key: 'paymentMethod', label: 'Método' }, { key: 'units', label: 'Unidades' }, { key: 'total', label: 'Total (Q)' },
      { key: 'amountRefunded', label: 'Reembolsado (Q)' }, { key: 'tracking', label: 'Guía' },
    ]);
  });

  r.get('/orders/:id', requirePermission('orders.read'), async (req, res) => {
    const o = await prisma.order.findUnique({ where: { id: Number(req.params.id) }, include: { ...fullOrderInclude, reservations: true, redemption: { include: { coupon: { select: { code: true } } } } } });
    if (!o) throw notFound('El pedido no existe.');
    const [audits, previousOrders] = await Promise.all([
      prisma.auditLog.findMany({ where: { OR: [{ entity: 'order', entityId: String(o.id) }, { entity: 'payment', entityId: { in: o.payments.map((p) => String(p.id)) } }] }, orderBy: { createdAt: 'asc' } }),
      prisma.order.count({ where: { customerId: o.customerId, id: { not: o.id } } }),
    ]);
    res.json({
      ...o,
      payments: o.payments.map(({ receiptPath, idempotencyKey, ...p }) => ({ ...p, hasReceipt: !!receiptPath })),
      audits,
      customerStats: { previousOrders },
      actions: {
        canPrepare: o.status === 'CONFIRMADO',
        canDispatch: canDispatch(o).ok,
        dispatchBlock: o.status === 'EN_PREPARACION' ? canDispatch(o).reason || null : null,
        canTransit: o.shippingStatus === 'DESPACHADO' || o.shippingStatus === 'INCIDENCIA',
        canDeliver: ['DESPACHADO', 'EN_TRANSITO', 'INCIDENCIA'].includes(o.shippingStatus),
        canIncident: ['DESPACHADO', 'EN_TRANSITO'].includes(o.shippingStatus),
        canCancel: ['PENDIENTE_PAGO', 'CONFIRMADO', 'EN_PREPARACION'].includes(o.status),
        refundable: fromCents(toCents(o.amountPaid) - toCents(o.amountRefunded)),
      },
    });
  });

  r.post('/orders/:id/prepare', requirePermission('orders.manage', 'shipping.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const o = await prisma.$transaction(async (tx) => {
      const lo = await lockOrder(tx, id);
      if (lo.status !== 'CONFIRMADO') throw conflict(`El pedido está ${LABELS[lo.status].toLowerCase()}; solo se preparan pedidos confirmados.`);
      await changeStatus(tx, lo, 'PEDIDO', 'EN_PREPARACION', { user: req.user, note: 'Pedido en preparación' });
      await changeStatus(tx, lo, 'ENVIO', 'PREPARANDO', { user: req.user });
      const shipment = await tx.shipment.upsert({ where: { orderId: id }, create: { orderId: id, status: 'PREPARANDO' }, update: { status: 'PREPARANDO' } });
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'PREPARANDO', description: 'Pedido en preparación en bodega', location: 'Bodega central', userId: req.user.id } });
      await audit(req, { service: SERVICE, action: 'ORDER_PREPARING', entity: 'order', entityId: id, before: { status: 'CONFIRMADO' }, after: { status: 'EN_PREPARACION' } }, tx);
      await notifyCustomer(lo, { title: `Preparando tu pedido ${lo.code}`, body: 'Estamos empacando tus prendas.', type: 'ENVIO' }, tx);
      return lo;
    });
    res.json({ id: o.id, status: o.status });
  });

  r.post('/orders/:id/dispatch', requirePermission('shipping.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { carrierId, trackingNumber } = z.object({ carrierId: z.coerce.number().int().positive('Selecciona el transportista.'), trackingNumber: z.string().trim().max(40).optional().or(z.literal('')) }).parse(req.body);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw notFound('El pedido no existe.');
    const check = canDispatch(order);
    if (!check.ok) throw conflict(check.reason);
    const carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier || !carrier.active) throw badRequest('El transportista no existe o está inactivo.');
    await inventory.post(`/internal/reservations/${id}/dispatch`, { orderCode: order.code }, { req });
    const guide = trackingNumber || `${carrier.prefix}${String(id).padStart(5, '0')}${Math.floor(100 + Math.random() * 900)}`;
    const o = await prisma.$transaction(async (tx) => {
      const lo = await lockOrder(tx, id);
      if (lo.status === 'ENVIADO') return lo;
      await changeStatus(tx, lo, 'PEDIDO', 'ENVIADO', { user: req.user, note: `Despachado con ${carrier.name}` });
      await changeStatus(tx, lo, 'ENVIO', 'DESPACHADO', { user: req.user, note: `Guía ${guide} (ficticia)` });
      const s = await tx.shipment.upsert({
        where: { orderId: id },
        create: { orderId: id, carrierId, trackingNumber: guide, status: 'DESPACHADO', dispatchedAt: new Date() },
        update: { carrierId, trackingNumber: guide, status: 'DESPACHADO', dispatchedAt: new Date() },
      });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: 'DESPACHADO', description: `Entregado a ${carrier.name}. Guía ${guide} (ficticia)`, location: 'Bodega central', userId: req.user.id } });
      await audit(req, { service: SERVICE, action: 'ORDER_DISPATCHED', entity: 'order', entityId: id, before: { status: 'EN_PREPARACION' }, after: { status: 'ENVIADO', carrier: carrier.name, tracking: guide } }, tx);
      await notifyCustomer(lo, { title: `Tu pedido ${lo.code} va en camino`, body: `Lo despachamos con ${carrier.name}. Guía ${guide}.`, type: 'ENVIO', mail: {} }, tx);
      return lo;
    });
    res.json({ id: o.id, status: o.status, trackingNumber: guide });
  });

  r.post('/orders/:id/transit', requirePermission('shipping.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { location, description } = z.object({ location: z.string().trim().max(120).optional(), description: z.string().trim().max(255).optional() }).parse(req.body || {});
    await prisma.$transaction(async (tx) => {
      const lo = await lockOrder(tx, id);
      await changeStatus(tx, lo, 'ENVIO', 'EN_TRANSITO', { user: req.user, note: description });
      const s = await tx.shipment.update({ where: { orderId: id }, data: { status: 'EN_TRANSITO' } });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: 'EN_TRANSITO', description: description || 'En ruta hacia el destino', location: location || lo.addressSnapshot?.department, userId: req.user.id } });
    });
    res.json({ ok: true });
  });

  r.post('/orders/:id/incident', requirePermission('shipping.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { description } = z.object({ description: z.string().trim().min(5, 'Describe la incidencia.').max(255) }).parse(req.body);
    await prisma.$transaction(async (tx) => {
      const lo = await lockOrder(tx, id);
      await changeStatus(tx, lo, 'ENVIO', 'INCIDENCIA', { user: req.user, note: description });
      const s = await tx.shipment.update({ where: { orderId: id }, data: { status: 'INCIDENCIA' } });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: 'INCIDENCIA', description, isIncident: true, location: lo.addressSnapshot?.department, userId: req.user.id } });
      await audit(req, { service: SERVICE, action: 'SHIPMENT_INCIDENT', entity: 'order', entityId: id, after: { description } }, tx);
      await notifyCustomer(lo, { title: `Novedad en la entrega de ${lo.code}`, body: description, type: 'ENVIO', mail: {} }, tx);
    });
    res.json({ ok: true });
  });

  r.post('/orders/:id/deliver', requirePermission('shipping.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { receivedBy } = z.object({ receivedBy: z.string().trim().min(3, 'Indica quién recibió el pedido.').max(120) }).parse(req.body);
    const o = await prisma.$transaction(async (tx) => {
      const lo = await lockOrder(tx, id);
      await changeStatus(tx, lo, 'ENVIO', 'ENTREGADO', { user: req.user, note: `Recibido por ${receivedBy}` });
      await changeStatus(tx, lo, 'PEDIDO', 'ENTREGADO', { user: req.user, note: 'Entrega confirmada' });
      await tx.order.update({ where: { id }, data: { deliveredAt: new Date() } });
      const s = await tx.shipment.update({ where: { orderId: id }, data: { status: 'ENTREGADO', deliveredAt: new Date(), receivedBy } });
      await tx.shipmentEvent.create({ data: { shipmentId: s.id, status: 'ENTREGADO', description: `Recibido por ${receivedBy}`, location: lo.addressSnapshot?.department, userId: req.user.id } });
      if (lo.paymentMethod === 'CONTRA_ENTREGA' && lo.paymentStatus === 'PENDIENTE') {
        const reference = await nextCode(tx, 'payment_ref_seq', 'PAY-SIM-');
        await tx.payment.create({ data: { orderId: id, method: 'CONTRA_ENTREGA', status: 'APROBADO', amount: lo.total, reference, responseMessage: 'Cobro contra entrega registrado (simulado)', reviewedBy: req.user.id, reviewedAt: new Date(), reviewNote: 'Efectivo recibido por el mensajero (simulado)' } });
        await changeStatus(tx, lo, 'PAGO', 'APROBADO', { user: req.user, note: `${reference}: cobro contra entrega` });
        await tx.order.update({ where: { id }, data: { amountPaid: lo.total } });
        await issueDocument(tx, lo);
      }
      await audit(req, { service: SERVICE, action: 'ORDER_DELIVERED', entity: 'order', entityId: id, after: { receivedBy } }, tx);
      await notifyCustomer(lo, { title: `Pedido ${lo.code} entregado`, body: '¡Gracias por comprar en Exclusive! Si algo no te quedó, tienes 30 días para solicitar un cambio.', type: 'ENVIO', mail: {} }, tx);
      return lo;
    });
    res.json({ id: o.id, status: o.status });
  });

  r.post('/orders/:id/cancel', requirePermission('orders.manage'), async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(5, 'Explica el motivo de la cancelación.').max(200) }).parse(req.body);
    await cancelOrder(req, Number(req.params.id), { user: req.user, reason: `Cancelado por la tienda: ${reason}` });
    res.json({ message: 'Pedido cancelado; existencias liberadas.' });
  });

  r.post('/orders/:id/refunds', requirePermission('refunds.create'), async (req, res) => {
    const id = Number(req.params.id);
    const { amount, reason, postSaleRequestId } = z.object({
      amount: z.coerce.number().positive('El monto debe ser mayor que cero.').max(1_000_000),
      reason: z.string().trim().min(5, 'Explica el motivo del reembolso.').max(255),
      postSaleRequestId: z.coerce.number().int().positive().optional().nullable(),
    }).parse(req.body);
    const idem = req.get('idempotency-key') ? `MANUAL:${req.get('idempotency-key')}` : null;
    const refund = await prisma.$transaction(async (tx) => {
      const lo = await lockOrder(tx, id);
      const rf = await createRefund(tx, req, lo, { amountCents: toCents(amount), reason, user: req.user, postSaleRequestId: postSaleRequestId || null, idempotencyKey: idem });
      await notifyCustomer(lo, { title: `Reembolso registrado · ${lo.code}`, body: `Registramos un reembolso simulado de Q ${Number(rf.amount).toFixed(2)} (${rf.reference}).`, type: 'PAGO', mail: {} }, tx);
      return rf;
    });
    res.status(201).json(refund);
  });

  r.get('/payments', requirePermission('payments.review', 'orders.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 20 });
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.method ? { method: String(req.query.method) } : {}),
      ...(req.query.queue === 'revision' ? { status: { in: ['EN_REVISION', 'PENDIENTE'] }, method: { not: 'CONTRA_ENTREGA' }, order: { status: 'PENDIENTE_PAGO' } } : {}),
      ...dateRange(req.query),
    };
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, include: { order: { select: { id: true, code: true, total: true, status: true, paymentStatus: true, customer: { select: { firstName: true, lastName: true, email: true } } } } }, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.payment.count({ where }),
    ]);
    res.json(paged(items.map(({ receiptPath, idempotencyKey, ...x }) => ({ ...x, hasReceipt: !!receiptPath })), total, p));
  });

  r.post('/payments/:id/review', requirePermission('payments.review'), async (req, res) => {
    const id = Number(req.params.id);
    const { decision, note } = z.object({ decision: z.enum(['APROBAR', 'RECHAZAR']), note: z.string().trim().max(400).optional() }).parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment) throw notFound('El pago no existe.');
    if (!['EN_REVISION', 'PENDIENTE'].includes(payment.status) || payment.method === 'CONTRA_ENTREGA') throw conflict('Este pago ya fue revisado.');
    if (payment.order.status !== 'PENDIENTE_PAGO') throw conflict('El pedido ya no está pendiente de pago.');
    if (decision === 'RECHAZAR' && (!note || note.length < 5)) throw badRequest('Indica al cliente por qué se rechaza el comprobante.', [{ field: 'note', message: 'Escribe el motivo del rechazo.' }]);
    if (decision === 'APROBAR') {
      await markPaid(req, payment.orderId, payment, { user: req.user, note: note || 'Comprobante verificado (simulado)' });
      await audit(req, { service: SERVICE, action: 'PAYMENT_REVIEWED', entity: 'payment', entityId: id, before: { status: payment.status }, after: { status: 'APROBADO', note } });
      return res.json({ status: 'APROBADO' });
    }
    const hours = 48;
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id }, data: { status: 'RECHAZADO', reviewedBy: req.user.id, reviewedAt: new Date(), reviewNote: note } });
      const lo = await lockOrder(tx, payment.orderId);
      await changeStatus(tx, lo, 'PAGO', 'RECHAZADO', { user: req.user, note });
      const expires = new Date(Date.now() + hours * 3600_000);
      await tx.order.update({ where: { id: lo.id }, data: { reservationExpiresAt: expires } });
      await tx.reservation.updateMany({ where: { orderId: lo.id, status: 'ACTIVA' }, data: { expiresAt: expires } });
      await audit(req, { service: SERVICE, action: 'PAYMENT_REJECTED', entity: 'payment', entityId: id, before: { status: payment.status }, after: { status: 'RECHAZADO', note } }, tx);
      await notifyCustomer(lo, { title: `Revisa tu pago · ${lo.code}`, body: `No pudimos validar el pago: ${note}. Tienes ${hours} horas para enviar un comprobante válido.`, type: 'PAGO', mail: {} }, tx);
    });
    res.json({ status: 'RECHAZADO' });
  });

  r.get('/shipments', requirePermission('shipping.manage', 'orders.read'), async (req, res) => {
    const p = pageParams(req.query);
    const where = { ...(req.query.status ? { status: String(req.query.status) } : {}), ...(req.query.carrierId ? { carrierId: Number(req.query.carrierId) } : {}) };
    const [items, total] = await Promise.all([
      prisma.shipment.findMany({ where, include: { carrier: true, order: { select: { id: true, code: true, addressSnapshot: true, customer: { select: { firstName: true, lastName: true } } } }, events: { orderBy: { id: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.shipment.count({ where }),
    ]);
    res.json(paged(items, total, p));
  });

  r.get('/carriers', requirePermission('shipping.manage', 'shipping.config', 'orders.read'), async (req, res) => {
    res.json(await prisma.carrier.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { shipments: true } } } }));
  });

  const carrierSchema = z.object({ name: z.string().trim().min(3).max(80), phone: z.string().trim().max(20).optional().nullable(), prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, 'Usa de 2 a 6 letras.'), active: z.boolean().optional().default(true) });
  r.post('/carriers', requirePermission('shipping.config'), async (req, res) => {
    const data = carrierSchema.parse(req.body);
    const c = await prisma.carrier.create({ data });
    await audit(req, { service: SERVICE, action: 'CARRIER_CREATED', entity: 'carrier', entityId: c.id, after: data });
    res.status(201).json(c);
  });
  r.put('/carriers/:id', requirePermission('shipping.config'), async (req, res) => {
    const id = Number(req.params.id);
    const data = carrierSchema.parse(req.body);
    const before = await prisma.carrier.findUnique({ where: { id } });
    if (!before) throw notFound('El transportista no existe.');
    const c = await prisma.carrier.update({ where: { id }, data });
    await audit(req, { service: SERVICE, action: 'CARRIER_UPDATED', entity: 'carrier', entityId: id, before, after: data });
    res.json(c);
  });

  r.put('/shipping/zones/:id', requirePermission('shipping.config'), async (req, res) => {
    const id = Number(req.params.id);
    const data = z.object({ covered: z.boolean(), rate: z.coerce.number().nonnegative('La tarifa no puede ser negativa.').max(1000), estimatedDays: z.string().trim().min(3).max(30) }).parse(req.body);
    const before = await prisma.shippingZone.findUnique({ where: { id } });
    if (!before) throw notFound('La zona no existe.');
    const z1 = await prisma.shippingZone.update({ where: { id }, data: { ...data, rate: fromCents(toCents(data.rate)) } });
    await audit(req, { service: SERVICE, action: 'SHIPPING_ZONE_UPDATED', entity: 'shipping_zone', entityId: id, before: { covered: before.covered, rate: before.rate, estimatedDays: before.estimatedDays }, after: data });
    res.json(z1);
  });

  r.get('/post-sale', requirePermission('postsale.read'), async (req, res) => {
    const p = pageParams(req.query);
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.type ? { type: String(req.query.type) } : {}),
      ...(req.query.open === '1' ? { status: { in: ['SOLICITADA', 'EN_REVISION', 'APROBADA', 'PRENDA_RECIBIDA'] } } : {}),
      ...(req.query.search ? { OR: [{ code: { contains: String(req.query.search), mode: 'insensitive' } }, { order: { code: { contains: String(req.query.search), mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.postSaleRequest.findMany({ where, include: { order: { select: { id: true, code: true } }, customer: { select: { firstName: true, lastName: true, email: true } }, _count: { select: { items: true } } }, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.postSaleRequest.count({ where }),
    ]);
    res.json(paged(items, total, p));
  });

  const loadPs = async (id) => {
    const ps = await prisma.postSaleRequest.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, code: true, total: true, amountPaid: true, amountRefunded: true, paymentMethod: true, deliveredAt: true, paymentStatus: true } },
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        items: { include: { orderItem: true } },
        history: { orderBy: { id: 'asc' } },
        refunds: true,
      },
    });
    if (!ps) throw notFound('La solicitud no existe.');
    const desired = ps.desiredVariantId ? await prisma.productVariant.findUnique({ where: { id: ps.desiredVariantId }, include: { size: true, color: true, product: { select: { name: true } }, stock: true } }) : null;
    return { ...ps, desired };
  };

  r.get('/post-sale/:id', requirePermission('postsale.read'), async (req, res) => res.json(await loadPs(Number(req.params.id))));

  r.post('/post-sale/:id/status', requirePermission('postsale.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { to, note } = z.object({ to: z.enum(['EN_REVISION', 'APROBADA', 'RECHAZADA', 'CERRADA']), note: z.string().trim().max(400).optional() }).parse(req.body);
    const ps = await loadPs(id);
    assertTransition('POSVENTA', ps.status, to);
    if (to === 'RECHAZADA' && (!note || note.length < 5)) throw badRequest('Explica al cliente por qué se rechaza la solicitud.', [{ field: 'note', message: 'Escribe el motivo.' }]);
    await prisma.$transaction(async (tx) => {
      await tx.postSaleRequest.update({ where: { id }, data: { status: to, assignedTo: ps.assignedTo || req.user.id, ...(to === 'CERRADA' ? { closedAt: new Date() } : {}) } });
      await tx.postSaleHistory.create({ data: { requestId: id, fromStatus: ps.status, toStatus: to, note: note || null, userId: req.user.id, userEmail: req.user.email } });
      await audit(req, { service: SERVICE, action: `POSTSALE_${to}`, entity: 'post_sale_request', entityId: id, before: { status: ps.status }, after: { status: to, note } }, tx);
      const order = await tx.order.findUnique({ where: { id: ps.order.id }, include: { customer: true } });
      await notifyCustomer(order, { title: `Solicitud ${ps.code}: ${LABELS[to].toLowerCase()}`, body: note || `Tu solicitud cambió a "${LABELS[to]}".`, type: 'POSVENTA', mail: ['APROBADA', 'RECHAZADA'].includes(to) ? {} : null }, tx);
    });
    res.json({ status: to });
  });

  r.post('/post-sale/:id/receive', requirePermission('postsale.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { items, note } = z.object({
      items: z.array(z.object({ itemId: z.number().int(), receivedQty: z.number().int().min(0), condition: z.enum(['BUENA', 'DANADA']), notes: z.string().trim().max(400).optional() })).min(1),
      note: z.string().trim().max(400).optional(),
    }).parse(req.body);
    const ps = await loadPs(id);
    if (ps.type === 'RECLAMO') throw badRequest('Los reclamos no requieren recepción de prendas.');
    assertTransition('POSVENTA', ps.status, 'PRENDA_RECIBIDA');
    const restock = [];
    for (const it of items) {
      const psi = ps.items.find((x) => x.id === it.itemId);
      if (!psi) throw badRequest('Alguna prenda no pertenece a la solicitud.');
      if (it.receivedQty > psi.quantity) throw badRequest('No puedes recibir más unidades de las solicitadas.');
      if (it.condition === 'BUENA' && it.receivedQty > 0 && !psi.restocked) restock.push({ variantId: psi.orderItem.variantId, quantity: it.receivedQty, itemId: psi.id });
    }
    if (restock.length) await inventory.post('/internal/returns', { postSaleId: id, postSaleCode: ps.code, items: restock }, { req });
    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        await tx.postSaleItem.update({
          where: { id: it.itemId },
          data: { receivedQty: it.receivedQty, condition: it.condition, notes: it.notes || null, inspectedAt: new Date(), inspectedBy: req.user.id, restocked: restock.some((x) => x.itemId === it.itemId) || undefined },
        });
      }
      await tx.postSaleRequest.update({ where: { id }, data: { status: 'PRENDA_RECIBIDA' } });
      await tx.postSaleHistory.create({ data: { requestId: id, fromStatus: ps.status, toStatus: 'PRENDA_RECIBIDA', note: note || `Prendas revisadas: ${items.map((i) => `${i.receivedQty} en estado ${i.condition === 'BUENA' ? 'bueno' : 'dañado'}`).join(', ')}`, userId: req.user.id, userEmail: req.user.email } });
      await audit(req, { service: SERVICE, action: 'POSTSALE_ITEMS_RECEIVED', entity: 'post_sale_request', entityId: id, after: { items, restocked: restock } }, tx);
    });
    res.json({ status: 'PRENDA_RECIBIDA', restocked: restock.length });
  });

  r.post('/post-sale/:id/resolve', requirePermission('postsale.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { resolution, refundAmount, performExchange } = z.object({
      resolution: z.string().trim().min(5, 'Describe cómo se resolvió.').max(1000),
      refundAmount: z.coerce.number().nonnegative().max(1_000_000).optional().default(0),
      performExchange: z.boolean().optional().default(false),
    }).parse(req.body);
    const ps = await loadPs(id);
    assertTransition('POSVENTA', ps.status, 'RESUELTA');
    if (ps.type !== 'RECLAMO' && ps.status !== 'PRENDA_RECIBIDA') throw conflict('Primero registra la recepción y revisión de la prenda.');
    if (refundAmount > 0 && !req.user.permissions.has('refunds.create')) throw badRequest('No tienes permiso para registrar reembolsos.');
    if (performExchange) {
      if (ps.type !== 'CAMBIO' || !ps.desiredVariantId) throw badRequest('La solicitud no es un cambio con variante definida.');
      await inventory.post('/internal/exchange-out', { postSaleId: id, postSaleCode: ps.code, variantId: ps.desiredVariantId, quantity: ps.items.reduce((a, i) => a + i.quantity, 0) }, { req });
    }
    await prisma.$transaction(async (tx) => {
      if (refundAmount > 0) {
        const lo = await lockOrder(tx, ps.order.id);
        await createRefund(tx, req, lo, { amountCents: toCents(refundAmount), reason: `${ps.type === 'DEVOLUCION' ? 'Devolución' : 'Compensación'} ${ps.code}`, user: req.user, postSaleRequestId: id, idempotencyKey: `POSVENTA:${id}` });
      }
      await tx.postSaleRequest.update({ where: { id }, data: { status: 'RESUELTA', resolution } });
      await tx.postSaleHistory.create({ data: { requestId: id, fromStatus: ps.status, toStatus: 'RESUELTA', note: resolution, userId: req.user.id, userEmail: req.user.email } });
      await audit(req, { service: SERVICE, action: 'POSTSALE_RESOLVED', entity: 'post_sale_request', entityId: id, after: { resolution, refundAmount, performExchange } }, tx);
      const order = await tx.order.findUnique({ where: { id: ps.order.id }, include: { customer: true } });
      await notifyCustomer(order, { title: `Solicitud ${ps.code} resuelta`, body: resolution, type: 'POSVENTA', mail: {} }, tx);
    });
    res.json({ status: 'RESUELTA' });
  });

  const promoSchema = z.object({
    name: z.string().trim().min(3, 'Escribe un nombre.').max(120),
    description: z.string().trim().max(400).optional().nullable(),
    type: z.enum(['PORCENTAJE', 'MONTO_FIJO', 'ENVIO_GRATIS']),
    value: z.coerce.number().nonnegative().max(100000).default(0),
    scope: z.enum(['TODO', 'CATEGORIA', 'PRODUCTO']).default('TODO'),
    categoryId: z.coerce.number().int().positive().optional().nullable(),
    productId: z.coerce.number().int().positive().optional().nullable(),
    minSubtotal: z.coerce.number().nonnegative().max(100000).optional().nullable(),
    maxDiscount: z.coerce.number().positive().max(100000).optional().nullable(),
    requiresCoupon: z.boolean().default(false),
    combinable: z.boolean().default(false),
    priority: z.coerce.number().int().min(0).max(100).default(0),
    startsAt: z.coerce.date({ message: 'Fecha de inicio inválida.' }),
    endsAt: z.coerce.date({ message: 'Fecha de fin inválida.' }),
    active: z.boolean().default(true),
    coupon: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, 'Usa de 4 a 20 letras o números, sin espacios.'), usageLimit: z.coerce.number().int().positive().optional().nullable(), perCustomerLimit: z.coerce.number().int().min(1).max(100).default(1) }).optional().nullable(),
  }).superRefine((p, ctx) => {
    if (p.endsAt <= p.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'La fecha de fin debe ser posterior al inicio.' });
    if (p.type === 'PORCENTAJE' && (p.value <= 0 || p.value > 90)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'El porcentaje debe estar entre 1 y 90.' });
    if (p.type === 'MONTO_FIJO' && p.value <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'El monto debe ser mayor que cero.' });
    if (p.scope === 'CATEGORIA' && !p.categoryId) ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Selecciona la categoría.' });
    if (p.scope === 'PRODUCTO' && !p.productId) ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Selecciona el producto.' });
    if (p.requiresCoupon && !p.coupon) ctx.addIssue({ code: 'custom', path: ['coupon', 'code'], message: 'Define el código del cupón.' });
  });

  r.get('/promotions', requirePermission('promotions.manage', 'reports.read'), async (req, res) => {
    const items = await prisma.promotion.findMany({ orderBy: [{ active: 'desc' }, { endsAt: 'desc' }], include: { category: { select: { name: true } }, product: { select: { name: true } }, coupons: true } });
    const usage = await prisma.order.groupBy({ by: ['couponCode'], where: { couponCode: { not: null }, status: { not: 'CANCELADO' } }, _count: true, _sum: { discountTotal: true } });
    const now = new Date();
    res.json(items.map((p) => ({ ...p, state: !p.active ? 'INACTIVA' : p.startsAt > now ? 'PROGRAMADA' : p.endsAt < now ? 'VENCIDA' : 'VIGENTE', usage: p.coupons.map((c) => usage.find((u) => u.couponCode === c.code) || null).filter(Boolean) })));
  });

  async function savePromotion(req, id, data) {
    const payload = {
      name: data.name, description: data.description || null, type: data.type, value: fromCents(toCents(data.value)), scope: data.scope,
      categoryId: data.scope === 'CATEGORIA' ? data.categoryId : null, productId: data.scope === 'PRODUCTO' ? data.productId : null,
      minSubtotal: data.minSubtotal ? fromCents(toCents(data.minSubtotal)) : null, maxDiscount: data.maxDiscount ? fromCents(toCents(data.maxDiscount)) : null,
      requiresCoupon: data.requiresCoupon, combinable: data.combinable, priority: data.priority, startsAt: data.startsAt, endsAt: data.endsAt, active: data.active,
    };
    return prisma.$transaction(async (tx) => {
      const before = id ? await tx.promotion.findUnique({ where: { id }, include: { coupons: true } }) : null;
      if (id && !before) throw notFound('La promoción no existe.');
      const p = id ? await tx.promotion.update({ where: { id }, data: payload }) : await tx.promotion.create({ data: { ...payload, createdBy: req.user.id } });
      if (data.coupon) {
        const existing = await tx.coupon.findUnique({ where: { code: data.coupon.code } });
        if (existing && existing.promotionId !== p.id) throw conflict('Ese código de cupón ya está en uso.', [{ field: 'coupon.code', message: 'Código en uso.' }]);
        if (existing) await tx.coupon.update({ where: { id: existing.id }, data: { usageLimit: data.coupon.usageLimit || null, perCustomerLimit: data.coupon.perCustomerLimit, active: data.active } });
        else await tx.coupon.create({ data: { code: data.coupon.code, promotionId: p.id, usageLimit: data.coupon.usageLimit || null, perCustomerLimit: data.coupon.perCustomerLimit } });
      }
      await audit(req, { service: SERVICE, action: id ? 'PROMOTION_UPDATED' : 'PROMOTION_CREATED', entity: 'promotion', entityId: p.id, before, after: { ...payload, coupon: data.coupon } }, tx);
      return p;
    });
  }

  r.post('/promotions', requirePermission('promotions.manage'), async (req, res) => res.status(201).json(await savePromotion(req, null, promoSchema.parse(req.body))));
  r.put('/promotions/:id', requirePermission('promotions.manage'), async (req, res) => res.json(await savePromotion(req, Number(req.params.id), promoSchema.parse(req.body))));
  r.post('/promotions/:id/active', requirePermission('promotions.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const p = await prisma.promotion.update({ where: { id }, data: { active } });
    await prisma.coupon.updateMany({ where: { promotionId: id }, data: { active } });
    await audit(req, { service: SERVICE, action: active ? 'PROMOTION_ACTIVATED' : 'PROMOTION_DEACTIVATED', entity: 'promotion', entityId: id, after: { active } });
    res.json(p);
  });

  r.get('/products/:productId/sales', requirePermission('orders.read', 'catalog.read'), async (req, res) => {
    const productId = Number(req.params.productId);
    const items = await prisma.orderItem.findMany({
      where: { productId },
      include: { order: { select: { id: true, code: true, createdAt: true, status: true, paymentStatus: true, customer: { select: { firstName: true, lastName: true } } } } },
      orderBy: { order: { createdAt: 'desc' } },
      take: 500,
    });
    const monthly = await prisma.$queryRaw`
      SELECT to_char(date_trunc('month', o.created_at AT TIME ZONE 'America/Guatemala'), 'YYYY-MM') AS month,
             sum(oi.quantity) FILTER (WHERE o.status <> 'CANCELADO')::int AS units,
             COALESCE(sum(oi.line_total) FILTER (WHERE o.status <> 'CANCELADO'), 0)::text AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = ${productId}
      GROUP BY 1 ORDER BY 1`;
    res.json({
      lines: items.map((i) => ({
        orderId: i.order.id, code: i.order.code, date: i.order.createdAt, status: i.order.status, paymentStatus: i.order.paymentStatus,
        customer: `${i.order.customer.firstName} ${i.order.customer.lastName}`, sku: i.sku, size: i.sizeName, color: i.colorName,
        quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discountAmount, total: i.lineTotal, promotion: i.promotionName,
      })),
      monthly,
    });
  });

  return r;
}
