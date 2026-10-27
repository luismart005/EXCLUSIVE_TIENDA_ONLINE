import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { prisma } from '@exclusive/db';
import {
  z, authenticate, hasPermission, audit, badRequest, notFound, conflict, forbidden, unprocessable, toCents, fromCents, customerCanCancel, LABELS,
} from '@exclusive/common';
import { buildQuote, publicQuote, getSetting, claimCoupon } from '../lib/quote.js';
import { simulateCard } from '../lib/cardSimulator.js';
import {
  SERVICE, inventory, changeStatus, lockOrder, nextCode, notifyCustomer, markPaid, cancelOrder, staffAlert, fullOrderInclude,
} from '../lib/orders.js';
import { receiptUpload, saveReceipt, receiptPath } from '../lib/receipts.js';
import { documentPdf } from '../lib/pdf.js';

const itemsSchema = z.array(z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).max(50);

async function cartFor(userId) {
  return prisma.cart.upsert({ where: { customerId: userId }, create: { customerId: userId }, update: {}, include: { items: { orderBy: { addedAt: 'asc' } } } });
}

async function cartResponse(userId, opts = {}) {
  const cart = await cartFor(userId);
  const quote = await buildQuote({ items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), customerId: userId, couponCode: opts.couponCode, department: opts.department });
  return { ...publicQuote(quote), items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) };
}

export function storeRoutes() {
  const r = express.Router();

  r.post('/cart/preview', async (req, res) => {
    const { items, couponCode, department } = z.object({ items: itemsSchema, couponCode: z.string().max(40).optional(), department: z.string().max(40).optional() }).parse(req.body);
    res.json(publicQuote(await buildQuote({ items, couponCode, department })));
  });

  r.get('/shipping/zones', async (req, res) => {
    res.json(await prisma.shippingZone.findMany({ orderBy: { department: 'asc' }, select: { id: true, department: true, covered: true, rate: true, estimatedDays: true } }));
  });

  r.get('/cart', authenticate(), async (req, res) => res.json(await cartResponse(req.user.id)));

  r.put('/cart/items/:variantId', authenticate(), async (req, res) => {
    const variantId = Number(req.params.variantId);
    const { quantity } = z.object({ quantity: z.coerce.number().int().min(0, 'Cantidad inválida.').max(20) }).parse(req.body);
    const cart = await cartFor(req.user.id);
    if (quantity === 0) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    } else {
      const v = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: { select: { status: true } } } });
      if (!v || !v.active || v.product.status !== 'ACTIVO') throw notFound('El producto no está disponible.');
      await prisma.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId } }, create: { cartId: cart.id, variantId, quantity }, update: { quantity } });
    }
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    res.json(await cartResponse(req.user.id));
  });

  r.post('/cart/items', authenticate(), async (req, res) => {
    const { variantId, quantity } = z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20).default(1) }).parse(req.body);
    const v = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: { select: { status: true } }, stock: true } });
    if (!v || !v.active || v.product.status !== 'ACTIVO') throw notFound('El producto no está disponible.');
    const cart = await cartFor(req.user.id);
    const current = cart.items.find((i) => i.variantId === variantId)?.quantity || 0;
    const available = v.stock ? v.stock.physical - v.stock.reserved : 0;
    if (available <= 0) throw conflict('Esta talla y color se agotaron.');
    const next = Math.min(current + quantity, 20, available);
    await prisma.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId } }, create: { cartId: cart.id, variantId, quantity: next }, update: { quantity: next } });
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    res.status(201).json({ ...(await cartResponse(req.user.id)), limited: next < current + quantity ? `Solo hay ${available} disponibles; ajustamos la cantidad.` : null });
  });

  r.post('/cart/merge', authenticate(), async (req, res) => {
    const { items } = z.object({ items: itemsSchema }).parse(req.body);
    const cart = await cartFor(req.user.id);
    for (const it of items) {
      const existing = cart.items.find((i) => i.variantId === it.variantId);
      const quantity = Math.min(20, Math.max(existing?.quantity || 0, it.quantity));
      const v = await prisma.productVariant.findUnique({ where: { id: it.variantId }, select: { id: true } });
      if (!v) continue;
      await prisma.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId: it.variantId } }, create: { cartId: cart.id, variantId: it.variantId, quantity }, update: { quantity } });
    }
    res.json(await cartResponse(req.user.id));
  });

  r.delete('/cart', authenticate(), async (req, res) => {
    const cart = await cartFor(req.user.id);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    res.json(await cartResponse(req.user.id));
  });

  r.post('/checkout/quote', authenticate(), async (req, res) => {
    const { addressId, couponCode } = z.object({ addressId: z.coerce.number().int().positive().optional(), couponCode: z.string().trim().max(40).optional().or(z.literal('')) }).parse(req.body);
    let department;
    if (addressId) {
      const a = await prisma.address.findFirst({ where: { id: addressId, userId: req.user.id, active: true } });
      if (!a) throw notFound('La dirección no existe.');
      department = a.department;
    }
    const terms = await prisma.policy.findFirst({ where: { slug: 'terminos', isCurrent: true }, select: { version: true, title: true } });
    res.json({ ...(await cartResponse(req.user.id, { couponCode: couponCode || undefined, department })), terms });
  });

  r.post('/checkout/confirm', authenticate(), async (req, res) => {
    const idemKey = req.get('idempotency-key');
    if (!idemKey || idemKey.length < 8 || idemKey.length > 80) throw badRequest('Falta la llave de idempotencia de la compra.');
    const data = z
      .object({
        addressId: z.coerce.number().int().positive('Selecciona una dirección de entrega.'),
        paymentMethod: z.enum(['TARJETA', 'TRANSFERENCIA', 'CONTRA_ENTREGA'], { message: 'Selecciona un método de pago.' }),
        couponCode: z.string().trim().max(40).optional().or(z.literal('')),
        acceptTerms: z.literal(true, { message: 'Debes aceptar los términos y condiciones.' }),
        termsVersion: z.coerce.number().int(),
        note: z.string().trim().max(400).optional().or(z.literal('')),
      })
      .parse(req.body);

    const previous = await prisma.order.findUnique({ where: { customerId_idempotencyKey: { customerId: req.user.id, idempotencyKey: idemKey } } });
    if (previous) return res.json({ order: { id: previous.id, code: previous.code, total: previous.total, status: previous.status, paymentMethod: previous.paymentMethod }, duplicated: true });

    const address = await prisma.address.findFirst({ where: { id: data.addressId, userId: req.user.id, active: true } });
    if (!address) throw notFound('La dirección no existe.');
    const terms = await prisma.policy.findFirst({ where: { slug: 'terminos', isCurrent: true } });
    if (terms && terms.version !== data.termsVersion) throw conflict('Los términos y condiciones se actualizaron. Revísalos y vuelve a aceptarlos.', { termsVersion: terms.version });
    const cart = await cartFor(req.user.id);
    if (!cart.items.length) throw badRequest('Tu carrito está vacío.');
    const quote = await buildQuote({ items: cart.items, couponCode: data.couponCode || undefined, department: address.department, customerId: req.user.id });
    if (!quote.shippingAvailable) throw unprocessable(`Por ahora no tenemos cobertura de entrega en ${address.department}. Elige otra dirección.`, [{ field: 'addressId', message: 'Destino sin cobertura.' }]);
    const blocking = quote.problems.filter((p) => ['OUT_OF_STOCK', 'INSUFFICIENT', 'UNAVAILABLE'].includes(p.code));
    if (blocking.length) throw conflict('Algunos productos de tu carrito cambiaron de disponibilidad. Revisa tu carrito.', blocking);
    if (!quote.lines.length) throw badRequest('Tu carrito está vacío.');
    if (data.couponCode && !quote.coupon?.valid) throw unprocessable(quote.coupon?.message || 'El cupón no es válido.', [{ field: 'couponCode', message: quote.coupon?.message }]);
    if (data.paymentMethod === 'CONTRA_ENTREGA' && toCents(quote.total) > 300000) throw unprocessable('El pago contra entrega está disponible para compras de hasta Q 3,000.00.');

    const commerce = await getSetting('commerce');
    const expiresAt = data.paymentMethod === 'TARJETA'
      ? new Date(Date.now() + (commerce.reservationMinutesCard || 30) * 60_000)
      : data.paymentMethod === 'TRANSFERENCIA'
        ? new Date(Date.now() + (commerce.reservationHoursTransfer || 48) * 3600_000)
        : null;

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        if (quote.couponId) await claimCoupon(tx, quote.couponId, req.user.id);
        const code = await nextCode(tx, 'order_code_seq', 'EXC-');
        const o = await tx.order.create({
          data: {
            code, customerId: req.user.id, idempotencyKey: idemKey, paymentMethod: data.paymentMethod,
            subtotal: quote.subtotal, discountTotal: quote.discount, shippingCost: quote.shipping, shippingDiscount: quote.shippingDiscount, total: quote.total,
            couponCode: quote.couponId ? quote.coupon.code : null, shippingZoneId: quote.shippingZone.id,
            addressSnapshot: { label: address.label, recipientName: address.recipientName, phone: address.phone, department: address.department, municipality: address.municipality, line1: address.line1, reference: address.reference },
            pricingSnapshot: { appliedPromotions: quote.appliedPromotions, coupon: quote.couponId ? { code: quote.coupon.code, amount: fromCents(quote.couponAmountCents) } : null, calculatedAt: new Date().toISOString() },
            termsVersion: terms?.version || 1, customerNote: data.note || null, reservationExpiresAt: expiresAt, isSimulation: true,
            items: {
              create: quote.lines.map((l) => ({
                productId: l.productId, variantId: l.variantId, categoryId: l.categoryId, sku: l.sku, productName: l.name, sizeName: l.size, colorName: l.color, imageUrl: l.image,
                unitPrice: l.unitPrice, discountAmount: l.discount, quantity: l.quantity, lineTotal: l.total, promotionName: l.promotion,
              })),
            },
            history: {
              create: [
                { kind: 'PEDIDO', toStatus: 'PENDIENTE_PAGO', note: 'Pedido creado', userId: req.user.id, userEmail: req.user.email },
                { kind: 'PAGO', toStatus: 'PENDIENTE', note: `Método: ${data.paymentMethod}`, userId: req.user.id, userEmail: req.user.email },
                { kind: 'ENVIO', toStatus: 'PENDIENTE', userId: req.user.id, userEmail: req.user.email },
              ],
            },
          },
        });
        if (quote.couponId) await tx.couponRedemption.create({ data: { couponId: quote.couponId, orderId: o.id, customerId: req.user.id, amount: fromCents(quote.couponAmountCents) } });
        return o;
      });
    } catch (e) {
      if (e.code === 'P2002') {
        const dup = await prisma.order.findUnique({ where: { customerId_idempotencyKey: { customerId: req.user.id, idempotencyKey: idemKey } } });
        if (dup) return res.json({ order: { id: dup.id, code: dup.code, total: dup.total, status: dup.status, paymentMethod: dup.paymentMethod }, duplicated: true });
      }
      throw e;
    }

    try {
      await inventory.post('/internal/reservations', {
        orderId: order.id, orderCode: order.code, expiresAt: expiresAt ? expiresAt.toISOString() : null,
        items: quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }, { req });
    } catch (e) {
      await prisma.$transaction(async (tx) => {
        const red = await tx.couponRedemption.findUnique({ where: { orderId: order.id } });
        if (red) await tx.coupon.update({ where: { id: red.couponId }, data: { usedCount: { decrement: 1 } } });
        await tx.order.delete({ where: { id: order.id } });
      });
      if (e.status === 409) throw conflict('Mientras confirmabas, otra persona compró las últimas unidades de algún producto. Revisa tu carrito.', e.details);
      throw e;
    }

    if (data.paymentMethod === 'CONTRA_ENTREGA') {
      await prisma.$transaction(async (tx) => {
        const o = await lockOrder(tx, order.id);
        await changeStatus(tx, o, 'PEDIDO', 'CONFIRMADO', { user: req.user, note: 'Pago contra entrega: se cobra al recibir' });
      });
      await inventory.post(`/internal/reservations/${order.id}/confirm`, {}, { req }).catch(() => {});
    }

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId: { in: quote.lines.map((l) => l.variantId) } } });
    const fresh = await prisma.order.findUnique({ where: { id: order.id }, include: { customer: true } });
    await audit(req, { service: SERVICE, action: 'ORDER_CREATED', entity: 'order', entityId: order.id, after: { code: order.code, total: order.total, method: data.paymentMethod, items: quote.lines.length, coupon: order.couponCode } });
    const next = { TARJETA: 'Completa el pago con tarjeta para confirmar tu pedido.', TRANSFERENCIA: 'Realiza la transferencia y sube tu comprobante.', CONTRA_ENTREGA: 'Pagarás al recibir tu pedido.' }[data.paymentMethod];
    await notifyCustomer(fresh, { title: `Recibimos tu pedido ${order.code}`, body: `Total Q ${Number(order.total).toFixed(2)}. ${next}`, mail: {} });
    if (data.paymentMethod === 'CONTRA_ENTREGA') await staffAlert('orders.manage', `Nuevo pedido ${order.code}`, 'Pedido contra entrega listo para preparar.', `/admin/pedidos/${order.id}`);
    res.status(201).json({ order: { id: order.id, code: order.code, total: order.total, status: fresh.status, paymentMethod: order.paymentMethod, reservationExpiresAt: expiresAt } });
  });

  const mine = async (req, code) => {
    const o = await prisma.order.findFirst({ where: { code: String(code), customerId: req.user.id }, include: fullOrderInclude });
    if (!o) throw notFound('No encontramos ese pedido en tu cuenta.');
    return o;
  };

  r.get('/orders', authenticate(), async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { productName: true, imageUrl: true, quantity: true, colorName: true, sizeName: true } }, shipment: { select: { trackingNumber: true, status: true } } },
      take: 100,
    });
    res.json(orders.map((o) => ({
      id: o.id, code: o.code, createdAt: o.createdAt, status: o.status, paymentStatus: o.paymentStatus, shippingStatus: o.shippingStatus, paymentMethod: o.paymentMethod,
      total: o.total, itemCount: o.items.reduce((a, i) => a + i.quantity, 0), items: o.items.slice(0, 4), tracking: o.shipment?.trackingNumber || null, reservationExpiresAt: o.reservationExpiresAt,
    })));
  });

  r.get('/orders/:code', authenticate(), async (req, res) => {
    const o = await mine(req, req.params.code);
    const bank = await getSetting('bank_transfer');
    const commerce = await getSetting('commerce');
    const { customer, payments, ...rest } = o;
    res.json({
      ...rest,
      payments: payments.map(({ receiptPath: rp, idempotencyKey, ...p }) => ({ ...p, hasReceipt: !!rp })),
      bankTransfer: o.paymentMethod === 'TRANSFERENCIA' ? bank : undefined,
      canCancel: customerCanCancel(o),
      canPay: o.status === 'PENDIENTE_PAGO' && ['PENDIENTE', 'RECHAZADO'].includes(o.paymentStatus),
      returnDeadline: o.deliveredAt ? new Date(o.deliveredAt.getTime() + (commerce.returnDays || 30) * 86400e3) : null,
    });
  });

  r.post('/orders/:code/cancel', authenticate(), async (req, res) => {
    const o = await mine(req, req.params.code);
    if (!customerCanCancel(o)) throw conflict(`El pedido está ${LABELS[o.status].toLowerCase()} y ya no se puede cancelar desde tu cuenta. Escríbenos si necesitas ayuda.`);
    const { reason } = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body || {});
    await cancelOrder(req, o.id, { user: req.user, reason: `Cancelado por el cliente${reason ? `: ${reason}` : ''}` });
    res.json({ message: 'Pedido cancelado.' });
  });

  r.post('/orders/:code/payments/card', authenticate(), async (req, res) => {
    const data = z.object({
      cardNumber: z.string().trim().min(12, 'Número de tarjeta inválido.').max(23),
      holder: z.string().trim().min(3, 'Escribe el nombre como aparece en la tarjeta.').max(80),
      expMonth: z.coerce.number().int().min(1).max(12),
      expYear: z.coerce.number().int().min(2000).max(2100),
      cvv: z.string().regex(/^\d{3,4}$/, 'CVV inválido.'),
    }).parse(req.body);
    const o = await mine(req, req.params.code);
    if (o.paymentMethod !== 'TARJETA') throw badRequest('Este pedido no se paga con tarjeta.');
    if (o.status !== 'PENDIENTE_PAGO' || !['PENDIENTE', 'RECHAZADO'].includes(o.paymentStatus)) throw conflict('Este pedido ya no admite pagos.');
    if (o.reservationExpiresAt && o.reservationExpiresAt < new Date()) throw conflict('La reserva de tu pedido venció. Vuelve a agregar los productos al carrito.');
    const endOfMonth = new Date(Date.UTC(data.expYear, data.expMonth, 0, 23, 59, 59));
    if (endOfMonth < new Date()) throw badRequest('La tarjeta está vencida.', [{ field: 'exp', message: 'Fecha de vencimiento pasada.' }]);
    const sim = simulateCard(data.cardNumber);
    if (!sim.valid) throw badRequest('El número de tarjeta no es válido.', [{ field: 'cardNumber', message: 'Revisa el número de la tarjeta.' }]);
    const idem = req.get('idempotency-key') ? `CARD:${o.id}:${req.get('idempotency-key')}` : null;
    if (idem) {
      const dup = await prisma.payment.findUnique({ where: { idempotencyKey: idem } });
      if (dup) return res.json({ payment: { id: dup.id, status: dup.status, reference: dup.reference, message: dup.responseMessage }, duplicated: true });
    }
    const payment = await prisma.$transaction(async (tx) => {
      const reference = await nextCode(tx, 'payment_ref_seq', 'PAY-SIM-');
      const p = await tx.payment.create({
        data: { orderId: o.id, method: 'TARJETA', status: sim.status === 'APROBADO' ? 'PENDIENTE' : sim.status, amount: o.total, reference, cardBrand: sim.brand, cardLast4: sim.last4, responseMessage: sim.message, idempotencyKey: idem },
      });
      const lo = await lockOrder(tx, o.id);
      if (sim.status === 'RECHAZADO') await changeStatus(tx, lo, 'PAGO', 'RECHAZADO', { user: req.user, note: `${reference}: ${sim.message}` });
      if (sim.status === 'PENDIENTE') {
        await changeStatus(tx, lo, 'PAGO', 'EN_REVISION', { user: req.user, note: `${reference}: ${sim.message}` });
        await tx.order.update({ where: { id: o.id }, data: { reservationExpiresAt: null } });
        await tx.reservation.updateMany({ where: { orderId: o.id, status: 'ACTIVA' }, data: { expiresAt: null } });
      }
      await audit(req, { service: SERVICE, action: 'PAYMENT_ATTEMPT', entity: 'payment', entityId: p.id, after: { orderCode: o.code, result: sim.status, brand: sim.brand, last4: sim.last4, amount: o.total } }, tx);
      return p;
    });
    if (sim.status === 'APROBADO') await markPaid(req, o.id, payment, { user: null, note: `${payment.reference}: pago con tarjeta aprobado (simulado)` });
    if (sim.status === 'PENDIENTE') await staffAlert('payments.review', `Pago pendiente · ${o.code}`, 'Un pago con tarjeta quedó pendiente de confirmación.', '/admin/pagos');
    res.status(201).json({ payment: { id: payment.id, status: sim.status, reference: payment.reference, message: sim.message, brand: sim.brand, last4: sim.last4 } });
  });

  r.post('/orders/:code/payments/transfer', authenticate(), receiptUpload.single('receipt'), async (req, res) => {
    const o = await mine(req, req.params.code);
    if (o.paymentMethod !== 'TRANSFERENCIA') throw badRequest('Este pedido no se paga con transferencia.');
    if (o.status !== 'PENDIENTE_PAGO' || !['PENDIENTE', 'RECHAZADO'].includes(o.paymentStatus)) throw conflict('Este pedido ya no admite comprobantes.');
    if (o.reservationExpiresAt && o.reservationExpiresAt < new Date()) throw conflict('La reserva de tu pedido venció.');
    if (!req.file) throw badRequest('Adjunta la imagen o PDF del comprobante.');
    const { bankReference } = z.object({ bankReference: z.string().trim().max(60).optional() }).parse(req.body || {});
    const saved = await saveReceipt(req.file.buffer, o.id);
    const payment = await prisma.$transaction(async (tx) => {
      const reference = await nextCode(tx, 'payment_ref_seq', 'PAY-SIM-');
      const p = await tx.payment.create({
        data: { orderId: o.id, method: 'TRANSFERENCIA', status: 'EN_REVISION', amount: o.total, reference, receiptPath: saved.file, receiptMime: saved.mime, responseMessage: bankReference ? `Referencia bancaria indicada: ${bankReference}` : 'Comprobante recibido' },
      });
      const lo = await lockOrder(tx, o.id);
      await changeStatus(tx, lo, 'PAGO', 'EN_REVISION', { user: req.user, note: `${reference}: comprobante cargado` });
      await tx.order.update({ where: { id: o.id }, data: { reservationExpiresAt: null } });
      await tx.reservation.updateMany({ where: { orderId: o.id, status: 'ACTIVA' }, data: { expiresAt: null } });
      await audit(req, { service: SERVICE, action: 'TRANSFER_RECEIPT_UPLOADED', entity: 'payment', entityId: p.id, after: { orderCode: o.code, amount: o.total } }, tx);
      return p;
    });
    await notifyCustomer(o, { title: `Comprobante recibido · ${o.code}`, body: 'Validaremos tu transferencia y te avisaremos cuando el pago quede confirmado.', type: 'PAGO' });
    await staffAlert('payments.review', `Comprobante por revisar · ${o.code}`, `Transferencia por Q ${Number(o.total).toFixed(2)}.`, '/admin/pagos');
    res.status(201).json({ payment: { id: payment.id, status: payment.status, reference: payment.reference } });
  });

  r.get('/payments/:id/receipt', authenticate(), async (req, res) => {
    const p = await prisma.payment.findUnique({ where: { id: Number(req.params.id) }, include: { order: { select: { customerId: true, code: true } } } });
    if (!p || !p.receiptPath) throw notFound('No hay comprobante para este pago.');
    if (p.order.customerId !== req.user.id && !hasPermission(req, 'payments.review') && !hasPermission(req, 'orders.read')) throw forbidden();
    const file = receiptPath(p.receiptPath);
    if (!fs.existsSync(file)) throw notFound('El archivo del comprobante no está disponible.');
    res.setHeader('Content-Type', p.receiptMime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="comprobante-${p.order.code}${p.receiptMime === 'application/pdf' ? '.pdf' : '.webp'}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(file).pipe(res);
  });

  r.get('/documents/:number/pdf', authenticate(), async (req, res) => {
    const doc = await prisma.saleDocument.findUnique({ where: { number: String(req.params.number) }, include: { order: { select: { customerId: true } } } });
    if (!doc) throw notFound('El documento no existe.');
    if (doc.order.customerId !== req.user.id && !hasPermission(req, 'orders.read')) throw forbidden();
    const store = await getSetting('store_info');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.number}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    documentPdf(doc, store).pipe(res);
  });

  r.post('/orders/:code/post-sale', authenticate(), async (req, res) => {
    const data = z.object({
      type: z.enum(['CAMBIO', 'DEVOLUCION', 'RECLAMO']),
      reason: z.string().trim().min(3, 'Selecciona o escribe el motivo.').max(120),
      description: z.string().trim().min(10, 'Cuéntanos qué pasó (mínimo 10 caracteres).').max(1000),
      items: z.array(z.object({ orderItemId: z.coerce.number().int(), quantity: z.coerce.number().int().min(1) })).default([]),
      desiredVariantId: z.coerce.number().int().positive().optional().nullable(),
    }).parse(req.body);
    const o = await mine(req, req.params.code);
    const commerce = await getSetting('commerce');
    if (o.status === 'CANCELADO') throw conflict('El pedido está cancelado.');
    if (data.type !== 'RECLAMO') {
      if (o.status !== 'ENTREGADO') throw conflict('Puedes solicitar cambios o devoluciones cuando el pedido haya sido entregado.');
      const deadline = new Date(o.deliveredAt.getTime() + (commerce.returnDays || 30) * 86400e3);
      if (deadline < new Date()) throw conflict(`El plazo de ${commerce.returnDays || 30} días para cambios y devoluciones terminó.`);
      if (!data.items.length) throw badRequest('Selecciona las prendas que quieres cambiar o devolver.');
      if (data.type === 'CAMBIO' && !data.desiredVariantId) throw badRequest('Selecciona la talla o color que quieres recibir.', [{ field: 'desiredVariantId', message: 'Selecciona la variante deseada.' }]);
    }
    const already = await prisma.postSaleItem.groupBy({ by: ['orderItemId'], where: { request: { orderId: o.id, status: { notIn: ['RECHAZADA'] }, type: { not: 'RECLAMO' } } }, _sum: { quantity: true } });
    const used = new Map(already.map((a) => [a.orderItemId, a._sum.quantity || 0]));
    for (const it of data.items) {
      const oi = o.items.find((x) => x.id === it.orderItemId);
      if (!oi) throw badRequest('Alguna prenda no pertenece a este pedido.');
      if (data.type !== 'RECLAMO' && it.quantity + (used.get(oi.id) || 0) > oi.quantity) throw conflict(`Ya existe una solicitud para ${oi.productName}; no puedes solicitar más unidades de las compradas.`);
    }
    if (data.desiredVariantId) {
      const v = await prisma.productVariant.findUnique({ where: { id: data.desiredVariantId } });
      if (!v || !data.items.some((it) => o.items.find((x) => x.id === it.orderItemId)?.productId === v.productId)) throw badRequest('El cambio debe ser por otra talla o color del mismo producto.');
    }
    const ps = await prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, 'postsale_code_seq', 'PV-');
      const created = await tx.postSaleRequest.create({
        data: {
          code, orderId: o.id, customerId: req.user.id, type: data.type, reason: data.reason, description: data.description, desiredVariantId: data.desiredVariantId || null,
          items: { create: data.items.map((it) => ({ orderItemId: it.orderItemId, quantity: it.quantity })) },
          history: { create: { toStatus: 'SOLICITADA', note: 'Solicitud creada por el cliente', userId: req.user.id, userEmail: req.user.email } },
        },
      });
      await audit(req, { service: SERVICE, action: 'POSTSALE_CREATED', entity: 'post_sale_request', entityId: created.id, after: { code, orderCode: o.code, type: data.type, items: data.items } }, tx);
      await notifyCustomer(o, { title: `Solicitud ${code} recibida`, body: `Registramos tu solicitud de ${data.type.toLowerCase()}. Te avisaremos cada avance.`, type: 'POSVENTA', mail: {} }, tx);
      return created;
    });
    await staffAlert('postsale.manage', `Nueva solicitud ${ps.code}`, `${data.type} del pedido ${o.code}.`, `/admin/posventa/${ps.id}`);
    res.status(201).json(ps);
  });

  r.get('/post-sale', authenticate(), async (req, res) => {
    const items = await prisma.postSaleRequest.findMany({
      where: { customerId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { code: true } }, items: { include: { orderItem: { select: { productName: true, sizeName: true, colorName: true, imageUrl: true } } } }, history: { orderBy: { id: 'asc' } }, refunds: { select: { amount: true, reference: true, createdAt: true } } },
    });
    res.json(items.map(({ assignedTo, ...x }) => ({ ...x, history: x.history.map(({ userEmail, userId, ...h }) => h) })));
  });

  r.get('/notifications/summary', authenticate(), async (req, res) => {
    const [cart, orders] = await Promise.all([
      prisma.cartItem.aggregate({ where: { cart: { customerId: req.user.id } }, _sum: { quantity: true } }),
      prisma.order.count({ where: { customerId: req.user.id, status: { in: ['PENDIENTE_PAGO', 'CONFIRMADO', 'EN_PREPARACION', 'ENVIADO'] } } }),
    ]);
    res.json({ cartItems: cart._sum.quantity || 0, activeOrders: orders });
  });

  return r;
}

export const randomKey = () => crypto.randomUUID();
