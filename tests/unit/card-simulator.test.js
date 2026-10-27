import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateCard, luhnValid, cardBrand } from '../../services/sales-service/src/lib/cardSimulator.js';

test('las tarjetas de prueba producen el resultado documentado', () => {
  assert.equal(simulateCard('4242 4242 4242 4242').status, 'APROBADO');
  assert.equal(simulateCard('4000 0000 0000 0002').status, 'RECHAZADO');
  assert.equal(simulateCard('4000-0000-0000-9995').status, 'PENDIENTE');
});

test('rechaza números inválidos (Luhn o longitud)', () => {
  assert.equal(simulateCard('4242 4242 4242 4241').valid, false);
  assert.equal(simulateCard('1234').valid, false);
  assert.equal(simulateCard('').valid, false);
  assert.equal(luhnValid('79927398713'), true);
});

test('solo conserva marca y últimos 4 dígitos', () => {
  const r = simulateCard('4242424242424242');
  assert.deepEqual(Object.keys(r).sort(), ['brand', 'last4', 'message', 'status', 'valid']);
  assert.equal(r.last4, '4242');
  assert.equal(r.brand, 'VISA');
  assert.equal(cardBrand('5555555555554444'), 'MASTERCARD');
});
