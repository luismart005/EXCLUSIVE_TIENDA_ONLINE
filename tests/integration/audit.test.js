import './_env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { audit } from '@exclusive/common';
import { prisma, disconnect, actor, createVariant } from './_helpers.js';

after(disconnect);

test('la bitácora es de solo inserción: no se puede editar ni borrar', async () => {
  const row = await audit(actor, { service: 'pruebas', action: 'TEST_EVENT', entity: 'test', entityId: 1, after: { ok: true } });
  await assert.rejects(prisma.$executeRaw`UPDATE audit_logs SET action = 'MODIFICADO' WHERE id = ${row.id}`, /solo inserción/);
  await assert.rejects(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${row.id}`, /solo inserción/);
  const still = await prisma.auditLog.findUnique({ where: { id: row.id } });
  assert.equal(still.action, 'TEST_EVENT');
});

test('el kardex tampoco se puede modificar: las correcciones son movimientos nuevos', async () => {
  const variant = await createVariant({ physical: 2 });
  const m = await prisma.inventoryMovement.findFirst({ where: { variantId: variant.id } });
  await assert.rejects(prisma.$executeRaw`UPDATE inventory_movements SET quantity = 99 WHERE id = ${m.id}`, /solo inserción/);
  await assert.rejects(prisma.$executeRaw`DELETE FROM inventory_movements WHERE id = ${m.id}`, /solo inserción/);
});

test('la bitácora descarta contraseñas y datos de tarjeta', async () => {
  const row = await audit(actor, { service: 'pruebas', action: 'USER_UPDATED', entity: 'user', entityId: 7, before: { email: 'a@b.gt', passwordHash: '$2b$10$x' }, after: { email: 'a@b.gt', cardNumber: '4242424242424242', cvv: '123' } });
  assert.deepEqual(row.before, { email: 'a@b.gt' });
  assert.deepEqual(row.after, { email: 'a@b.gt' });
});
