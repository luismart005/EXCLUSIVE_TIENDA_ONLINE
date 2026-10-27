import './_env.js';
import { env } from '@exclusive/common';
import { prisma, disconnect } from '@exclusive/db';
import { applyMovement } from '../../services/inventory-service/src/stock.js';

const dbName = (() => {
  try {
    return decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1));
  } catch {
    return '';
  }
})();
if (!/test/i.test(dbName)) {
  throw new Error(`Las pruebas de integración solo se ejecutan sobre una base de PRUEBAS (su nombre debe contener "test"). Base actual: "${dbName}". Ejecuta npm run test:db.`);
}

const RUN = Date.now().toString(36).slice(-6);
let counter = 0;
export const uid = () => `${RUN}${(++counter).toString(36)}`;

export const actor = { user: { id: null, email: 'pruebas@exclusive.gt' }, requestId: 'test' };

export async function createCustomer() {
  const u = uid();
  return prisma.user.create({ data: { email: `cliente-${u}@test.exclusive.gt`, passwordHash: '$2b$10$pruebaSinUsoParaLogin', firstName: 'Cliente', lastName: `Prueba ${u}` } });
}

export async function createVariant({ physical = 0, price = '100.00' } = {}) {
  const u = uid();
  const product = await prisma.product.create({ data: { name: `Prenda de prueba ${u}`, slug: `prenda-prueba-${u}`, description: 'Producto creado por las pruebas automatizadas', categoryId: 1, basePrice: price } });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sizeId: 3, colorId: 1, sku: `TST-${u}`.toUpperCase() } });
  if (physical > 0) {
    await prisma.$transaction((tx) => applyMovement(tx, actor, { variantId: variant.id, type: 'INVENTARIO_INICIAL', quantity: physical, reason: 'Existencias iniciales de prueba' }));
  } else {
    await prisma.inventoryStock.create({ data: { variantId: variant.id, physical: 0, reserved: 0, minStock: 1 } });
  }
  return variant;
}

export async function createOrder(customerId, { total = '100.00', method = 'TARJETA', paid = false } = {}) {
  const u = uid();
  const order = await prisma.order.create({
    data: {
      code: `T-${u}`.toUpperCase(), customerId, idempotencyKey: `idem-${u}`, paymentMethod: method, subtotal: total, total,
      addressSnapshot: { recipientName: 'Cliente Prueba', department: 'Guatemala', municipality: 'Guatemala', line1: '6a. avenida 1-23, zona 1' },
      termsVersion: 1, ...(paid ? { amountPaid: total, paymentStatus: 'APROBADO', status: 'CONFIRMADO' } : {}),
    },
  });
  if (paid) await prisma.payment.create({ data: { orderId: order.id, method, status: 'APROBADO', amount: total, reference: `PAY-T-${u}`.toUpperCase() } });
  return order;
}

export const stockOf = (variantId) => prisma.inventoryStock.findUnique({ where: { variantId } });

export { prisma, disconnect };
