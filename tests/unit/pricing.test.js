import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from '../../packages/common/src/pricing.js';

const NOW = new Date('2026-10-15T12:00:00Z');
const window = { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T23:59:59Z', active: true };
const camiseta = { variantId: 1, productId: 10, categoryId: 1, unitPriceCents: 12900, quantity: 2 };
const chaqueta = { variantId: 2, productId: 20, categoryId: 5, unitPriceCents: 39900, quantity: 1 };
const zona = { id: 1, department: 'Guatemala', covered: true, rate: '25.00' };

test('sin promociones el total es subtotal + envío', () => {
  const q = calculateQuote({ lines: [camiseta], shippingZone: zona, now: NOW });
  assert.equal(q.subtotalCents, 25800);
  assert.equal(q.discountCents, 0);
  assert.equal(q.shippingCents, 2500);
  assert.equal(q.totalCents, 28300);
});

test('aplica la mejor promoción automática por línea, sin acumular dos en la misma línea', () => {
  const promos = [
    { id: 1, name: '10 % chaquetas', type: 'PORCENTAJE', value: '10', scope: 'CATEGORIA', categoryId: 5, ...window },
    { id: 2, name: '15 % chaquetas', type: 'PORCENTAJE', value: '15', scope: 'CATEGORIA', categoryId: 5, ...window },
  ];
  const q = calculateQuote({ lines: [chaqueta], promotions: promos, now: NOW });
  assert.equal(q.lines[0].discountCents, 5985);
  assert.equal(q.lines[0].promotionId, 2);
  assert.equal(q.appliedPromotions.length, 1);
});

test('ignora promociones fuera de vigencia', () => {
  const vencida = { id: 3, name: 'Verano', type: 'PORCENTAJE', value: '20', scope: 'TODO', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-08-31T23:59:59Z', active: true };
  const q = calculateQuote({ lines: [camiseta], promotions: [vencida], now: NOW });
  assert.equal(q.discountCents, 0);
});

test('un cupón no combinable solo aplica a líneas sin otra promoción', () => {
  const promos = [{ id: 1, name: '15 % chaquetas', type: 'PORCENTAJE', value: '15', scope: 'CATEGORIA', categoryId: 5, ...window }];
  const coupon = { code: 'BIENVENIDA10', promotion: { id: 9, name: 'Bienvenida', type: 'PORCENTAJE', value: '10', scope: 'TODO', combinable: false, requiresCoupon: true, ...window } };
  const q = calculateQuote({ lines: [camiseta, chaqueta], promotions: promos, coupon, now: NOW });
  const [l1, l2] = q.lines;
  assert.equal(l1.discountCents, 2580);
  assert.equal(l2.discountCents, 5985);
  assert.equal(q.coupon.valid, true);
  assert.equal(q.coupon.amountCents, 2580);
});

test('un cupón de monto fijo al pedido se reparte entre líneas y respeta el mínimo de compra', () => {
  const promo = { id: 10, name: 'Q 50 desde Q 400', type: 'MONTO_FIJO', value: '50', scope: 'TODO', minSubtotal: '400', combinable: true, requiresCoupon: true, ...window };
  const ok = calculateQuote({ lines: [camiseta, chaqueta], coupon: { code: 'EXCLUSIVE50', promotion: promo }, now: NOW });
  assert.equal(ok.discountCents, 5000);
  assert.equal(ok.lines.reduce((a, l) => a + l.discountCents, 0), 5000);
  const low = calculateQuote({ lines: [camiseta], coupon: { code: 'EXCLUSIVE50', promotion: promo }, now: NOW });
  assert.equal(low.coupon.valid, false);
  assert.match(low.coupon.message, /compra mínima/);
  assert.equal(low.discountCents, 0);
});

test('envío gratis automático desde un monto mínimo', () => {
  const free = { id: 1, name: 'Envío gratis desde Q 600', type: 'ENVIO_GRATIS', value: '0', scope: 'TODO', minSubtotal: '600', ...window };
  const below = calculateQuote({ lines: [camiseta], promotions: [free], shippingZone: zona, now: NOW });
  assert.equal(below.shippingDiscountCents, 0);
  assert.equal(below.freeShippingRemainingCents, 60000 - 25800);
  const above = calculateQuote({ lines: [camiseta, chaqueta], promotions: [free], shippingZone: zona, now: NOW });
  assert.equal(above.shippingDiscountCents, 2500);
  assert.equal(above.totalCents, 65700);
});

test('los descuentos nunca generan totales negativos', () => {
  const huge = { id: 5, name: 'Q 1000 por prenda', type: 'MONTO_FIJO', value: '1000', scope: 'PRODUCTO', productId: 10, ...window };
  const q = calculateQuote({ lines: [camiseta], promotions: [huge], now: NOW });
  assert.equal(q.lines[0].lineTotalCents, 0);
  assert.equal(q.totalCents, 0);
});

test('destino sin cobertura queda marcado como no disponible', () => {
  const q = calculateQuote({ lines: [camiseta], shippingZone: { id: 9, department: 'Petén', covered: false, rate: '0' }, now: NOW });
  assert.equal(q.shippingAvailable, false);
  assert.equal(q.shippingCents, 0);
});

test('el total coincide con la suma de líneas + envío - descuento de envío', () => {
  const promos = [{ id: 1, name: '10 % todo', type: 'PORCENTAJE', value: '10', scope: 'TODO', ...window }];
  const q = calculateQuote({ lines: [camiseta, chaqueta], promotions: promos, shippingZone: zona, now: NOW });
  const lines = q.lines.reduce((a, l) => a + l.lineTotalCents, 0);
  assert.equal(q.totalCents, lines + q.shippingCents - q.shippingDiscountCents);
});
