import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, percentOf, allocate, formatGTQ } from '../../packages/common/src/money.js';

test('convierte montos decimales a centavos sin errores de punto flotante', () => {
  assert.equal(toCents('129.00'), 12900);
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('1999.99'), 199999);
  assert.equal(toCents(''), 0);
  assert.equal(toCents(null), 0);
  assert.equal(toCents('-25.50'), -2550);
});

test('redondea al centavo con la regla mitad hacia arriba', () => {
  assert.equal(toCents('10.005'), 1001);
  assert.equal(toCents('10.004'), 1000);
  assert.equal(toCents('2.675'), 268);
});

test('rechaza textos que no son montos', () => {
  assert.throws(() => toCents('Q 10'), /Monto inválido/);
  assert.throws(() => toCents('10,50'), /Monto inválido/);
});

test('convierte centavos al formato decimal de la base de datos', () => {
  assert.equal(fromCents(12900), '129.00');
  assert.equal(fromCents(5), '0.05');
  assert.equal(fromCents(-2550), '-25.50');
  assert.equal(fromCents(0), '0.00');
});

test('calcula porcentajes con redondeo comercial', () => {
  assert.equal(percentOf(81700, 10), 8170);
  assert.equal(percentOf(29900, 15), 4485);
  assert.equal(percentOf(12345, 12.5), 1543);
  assert.equal(percentOf(1, 50), 1);
});

test('reparte un monto entre líneas sin perder ni sobrar centavos', () => {
  const parts = allocate(1000, [1, 1, 1]);
  assert.deepEqual(parts, [334, 333, 333]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
  const parts2 = allocate(5000, [29900, 15900, 4500]);
  assert.equal(parts2.reduce((a, b) => a + b, 0), 5000);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
});

test('muestra montos en quetzales', () => {
  assert.equal(formatGTQ(123450), 'Q 1,234.50');
  assert.equal(formatGTQ(0), 'Q 0.00');
});
