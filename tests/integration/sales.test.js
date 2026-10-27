import './_env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, disconnect, actor, createCustomer, createOrder, uid } from './_helpers.js';
import { claimCoupon, validateCoupon } from '../../services/sales-service/src/lib/quote.js';
import { createRefund } from '../../services/sales-service/src/lib/orders.js';

after(disconnect);

async function createCoupon({ usageLimit = null, perCustomerLimit = 1, startsAt = new Date(Date.now() - 86400e3), endsAt = new Date(Date.now() + 86400e3) } = {}) {
  const u = uid();
  const promotion = await prisma.promotion.create({ data: { name: `Cupón de prueba ${u}`, type: 'MONTO_FIJO', value: '10.00', scope: 'TODO', requiresCoupon: true, combinable: true, startsAt, endsAt } });
  return prisma.coupon.create({ data: { code: `PRUEBA${u}`.toUpperCase(), promotionId: promotion.id, usageLimit, perCustomerLimit } });
}

const redeem = (coupon, customerId) =>
  prisma.$transaction(async (tx) => {
    await claimCoupon(tx, coupon.id, customerId);
    const order = await tx.order.create({ data: { code: `T-${uid()}`.toUpperCase(), customerId, idempotencyKey: `idem-${uid()}`, paymentMethod: 'TARJETA', subtotal: '100.00', total: '90.00', couponCode: coupon.code, addressSnapshot: {}, termsVersion: 1 } });
    await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId: order.id, customerId, amount: '10.00' } });
    return order;
  });

test('un cupón con un solo uso disponible no se puede usar dos veces aunque lleguen compras simultáneas', async () => {
  const coupon = await createCoupon({ usageLimit: 1 });
  const customers = await Promise.all(Array.from({ length: 6 }, () => createCustomer()));
  const results = await Promise.allSettled(customers.map((cu) => redeem(coupon, cu.id)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 409));
  const fresh = await prisma.coupon.findUnique({ where: { id: coupon.id } });
  assert.equal(fresh.usedCount, 1);
  assert.equal(await prisma.couponRedemption.count({ where: { couponId: coupon.id } }), 1);
});

test('el límite por cliente se respeta con solicitudes simultáneas del mismo cliente', async () => {
  const coupon = await createCoupon({ usageLimit: null, perCustomerLimit: 1 });
  const customer = await createCustomer();
  const results = await Promise.allSettled([redeem(coupon, customer.id), redeem(coupon, customer.id), redeem(coupon, customer.id)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await prisma.coupon.findUnique({ where: { id: coupon.id } })).usedCount, 1);
});

test('la validación rechaza cupones vencidos o agotados', async () => {
  const expired = await createCoupon({ startsAt: new Date('2026-06-01'), endsAt: new Date('2026-08-31') });
  assert.match((await validateCoupon(expired.code, null)).error, /vigente/);
  const exhausted = await createCoupon({ usageLimit: 1 });
  await redeem(exhausted, (await createCustomer()).id);
  assert.match((await validateCoupon(exhausted.code, null)).error, /límite/);
  assert.match((await validateCoupon('NOEXISTE123', null)).error, /no existe/);
});

test('repetir la confirmación con la misma llave no crea un segundo pedido', async () => {
  const customer = await createCustomer();
  const data = { code: `T-${uid()}`.toUpperCase(), customerId: customer.id, idempotencyKey: 'misma-llave-de-compra', paymentMethod: 'TARJETA', subtotal: '50.00', total: '50.00', addressSnapshot: {}, termsVersion: 1 };
  await prisma.order.create({ data });
  await assert.rejects(prisma.order.create({ data: { ...data, code: `T-${uid()}`.toUpperCase() } }), (e) => e.code === 'P2002');
  assert.equal(await prisma.order.count({ where: { customerId: customer.id } }), 1);
});

test('los reembolsos nunca superan lo pagado y son idempotentes', async () => {
  const order = await createOrder((await createCustomer()).id, { total: '100.00', paid: true });
  const r1 = await prisma.$transaction((tx) => createRefund(tx, actor, order, { amountCents: 6000, reason: 'Devolución parcial', idempotencyKey: `REF-${order.id}-1` }));
  assert.equal(Number(r1.amount), 60);
  assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).paymentStatus, 'REEMBOLSO_PARCIAL');
  await assert.rejects(prisma.$transaction((tx) => createRefund(tx, actor, order, { amountCents: 5000, reason: 'Excede' })), (e) => e.status === 409 && /supera lo pagado/.test(e.message));
  const again = await prisma.$transaction((tx) => createRefund(tx, actor, order, { amountCents: 6000, reason: 'Devolución parcial', idempotencyKey: `REF-${order.id}-1` }));
  assert.equal(again.id, r1.id);
  await prisma.$transaction((tx) => createRefund(tx, actor, order, { amountCents: 4000, reason: 'Resto' }));
  const final = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(final.paymentStatus, 'REEMBOLSADO');
  assert.equal(final.amountRefunded.toString(), '100');
});
