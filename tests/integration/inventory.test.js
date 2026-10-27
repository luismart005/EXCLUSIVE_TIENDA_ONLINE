import './_env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, disconnect, actor, createCustomer, createVariant, createOrder, stockOf, uid } from './_helpers.js';
import { reserveForOrder, releaseReservation, dispatchOrder, applyMovement } from '../../services/inventory-service/src/stock.js';

after(disconnect);

const reserve = (order, items, expiresAt = null) => reserveForOrder(actor, { orderId: order.id, orderCode: order.code, items, expiresAt });

test('compra simultánea de la última unidad: solo una reserva es válida', async () => {
  const variant = await createVariant({ physical: 1 });
  const customer = await createCustomer();
  const orders = await Promise.all(Array.from({ length: 8 }, () => createOrder(customer.id)));
  const results = await Promise.allSettled(orders.map((o) => reserve(o, [{ variantId: variant.id, quantity: 1 }])));
  const okCount = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(okCount, 1, 'exactamente una compra debe obtener la última unidad');
  assert.equal(rejected.length, 7);
  for (const r of rejected) assert.equal(r.reason.status, 409);
  const stock = await stockOf(variant.id);
  assert.equal(stock.reserved, 1);
  assert.equal(stock.physical, 1);
  assert.equal(await prisma.reservation.count({ where: { variantId: variant.id } }), 1);
});

test('si un producto del pedido no alcanza, no se reserva ninguno (transacción completa)', async () => {
  const a = await createVariant({ physical: 5 });
  const b = await createVariant({ physical: 0 });
  const customer = await createCustomer();
  const order = await createOrder(customer.id);
  await assert.rejects(reserve(order, [{ variantId: a.id, quantity: 2 }, { variantId: b.id, quantity: 1 }]), (e) => e.status === 409 && e.details?.[0]?.variantId === b.id);
  assert.equal((await stockOf(a.id)).reserved, 0, 'la reserva parcial debe revertirse');
  assert.equal(await prisma.reservation.count({ where: { orderId: order.id } }), 0);
});

test('repetir la reserva de un pedido no aparta unidades dos veces', async () => {
  const variant = await createVariant({ physical: 4 });
  const order = await createOrder((await createCustomer()).id);
  const first = await reserve(order, [{ variantId: variant.id, quantity: 2 }]);
  const again = await Promise.all([reserve(order, [{ variantId: variant.id, quantity: 2 }]), reserve(order, [{ variantId: variant.id, quantity: 2 }])]);
  assert.equal(first.duplicated, false);
  assert.ok(again.every((r) => r.duplicated));
  assert.equal((await stockOf(variant.id)).reserved, 2);
});

test('un movimiento con la misma llave de idempotencia se registra una sola vez', async () => {
  const variant = await createVariant({ physical: 3 });
  const key = `ENTRADA-${uid()}`;
  const move = () => prisma.$transaction((tx) => applyMovement(tx, actor, { variantId: variant.id, type: 'ENTRADA_AJUSTE', quantity: 5, reason: 'Conteo físico', idempotencyKey: key }));
  const r1 = await move();
  const r2 = await move();
  assert.equal(r1.duplicated, false);
  assert.equal(r2.duplicated, true);
  assert.equal(r2.movement.id, r1.movement.id);
  assert.equal((await stockOf(variant.id)).physical, 8);
});

test('no se pueden retirar unidades que respaldan reservas de pedidos', async () => {
  const variant = await createVariant({ physical: 2 });
  const order = await createOrder((await createCustomer()).id);
  await reserve(order, [{ variantId: variant.id, quantity: 2 }]);
  await assert.rejects(
    prisma.$transaction((tx) => applyMovement(tx, actor, { variantId: variant.id, type: 'SALIDA_DANIO', quantity: 1, reason: 'Prenda manchada' })),
    (e) => e.status === 409 && /reservadas/.test(e.message),
  );
  await assert.rejects(
    prisma.$transaction((tx) => applyMovement(tx, actor, { variantId: variant.id, type: 'SALIDA_PERDIDA', quantity: 5, reason: 'Pérdida' })),
    (e) => e.status === 409,
  );
  assert.equal((await stockOf(variant.id)).physical, 2);
});

test('el despacho convierte la reserva en salida física una sola vez', async () => {
  const variant = await createVariant({ physical: 3 });
  const order = await createOrder((await createCustomer()).id);
  await reserve(order, [{ variantId: variant.id, quantity: 2 }]);
  const d1 = await dispatchOrder(actor, order.id, order.code);
  const d2 = await dispatchOrder(actor, order.id, order.code);
  assert.equal(d1.movements.length, 1);
  assert.equal(d2.alreadyDispatched, true);
  const stock = await stockOf(variant.id);
  assert.deepEqual([stock.physical, stock.reserved], [1, 0]);
  assert.equal(await prisma.inventoryMovement.count({ where: { variantId: variant.id, type: 'SALIDA_VENTA' } }), 1);
});

test('liberar la reserva devuelve la disponibilidad y no se puede despachar después', async () => {
  const variant = await createVariant({ physical: 2 });
  const order = await createOrder((await createCustomer()).id);
  await reserve(order, [{ variantId: variant.id, quantity: 2 }]);
  const r = await releaseReservation(actor, order.id, 'Reserva vencida');
  assert.equal(r.released, 1);
  assert.equal((await stockOf(variant.id)).reserved, 0);
  await assert.rejects(dispatchOrder(actor, order.id, order.code), (e) => e.status === 409);
});

test('kardex: el saldo físico es igual a entradas menos salidas y cada movimiento guarda saldos', async () => {
  const variant = await createVariant({ physical: 10 });
  await prisma.$transaction((tx) => applyMovement(tx, actor, { variantId: variant.id, type: 'SALIDA_AJUSTE', quantity: 3, reason: 'Conteo' }));
  await prisma.$transaction((tx) => applyMovement(tx, actor, { variantId: variant.id, type: 'ENTRADA_COMPRA', quantity: 7, reason: 'Compra', unitCost: '55.00' }));
  const moves = await prisma.inventoryMovement.findMany({ where: { variantId: variant.id }, orderBy: { id: 'asc' } });
  const sum = moves.reduce((a, m) => a + (m.direction === 'ENTRADA' ? m.quantity : -m.quantity), 0);
  const stock = await stockOf(variant.id);
  assert.equal(sum, stock.physical);
  assert.equal(stock.physical, 14);
  for (let i = 1; i < moves.length; i++) assert.equal(moves[i].physicalBefore, moves[i - 1].physicalAfter, 'los saldos del kardex deben encadenarse');
});

test('la base de datos impide reservar más de lo que existe físicamente', async () => {
  const variant = await createVariant({ physical: 1 });
  await assert.rejects(prisma.$executeRaw`UPDATE inventory_stock SET reserved = 5 WHERE variant_id = ${variant.id}`);
});
