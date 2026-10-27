import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, assertTransition, canDispatch, customerCanCancel, TransitionError } from '../../packages/common/src/stateMachines.js';

test('el pedido sigue el flujo permitido', () => {
  assert.ok(canTransition('PEDIDO', 'PENDIENTE_PAGO', 'CONFIRMADO'));
  assert.ok(canTransition('PEDIDO', 'CONFIRMADO', 'EN_PREPARACION'));
  assert.ok(canTransition('PEDIDO', 'EN_PREPARACION', 'ENVIADO'));
  assert.ok(canTransition('PEDIDO', 'ENVIADO', 'ENTREGADO'));
});

test('no se puede saltar ni retroceder estados del pedido', () => {
  assert.equal(canTransition('PEDIDO', 'PENDIENTE_PAGO', 'ENVIADO'), false);
  assert.equal(canTransition('PEDIDO', 'ENTREGADO', 'CANCELADO'), false);
  assert.equal(canTransition('PEDIDO', 'ENVIADO', 'CANCELADO'), false);
  assert.throws(() => assertTransition('PEDIDO', 'CANCELADO', 'CONFIRMADO'), TransitionError);
});

test('un pago rechazado puede reintentarse; uno reembolsado ya no cambia', () => {
  assert.ok(canTransition('PAGO', 'RECHAZADO', 'APROBADO'));
  assert.ok(canTransition('PAGO', 'APROBADO', 'REEMBOLSO_PARCIAL'));
  assert.equal(canTransition('PAGO', 'REEMBOLSADO', 'APROBADO'), false);
});

test('el envío registra incidencias y devoluciones', () => {
  assert.ok(canTransition('ENVIO', 'EN_TRANSITO', 'INCIDENCIA'));
  assert.ok(canTransition('ENVIO', 'INCIDENCIA', 'DEVUELTO'));
  assert.equal(canTransition('ENVIO', 'PENDIENTE', 'ENTREGADO'), false);
});

test('posventa: una solicitud rechazada solo puede cerrarse', () => {
  assert.deepEqual(['CERRADA'].filter((s) => canTransition('POSVENTA', 'RECHAZADA', s)), ['CERRADA']);
  assert.equal(canTransition('POSVENTA', 'RECHAZADA', 'RESUELTA'), false);
});

test('solo se despacha con pago aprobado, salvo contra entrega', () => {
  assert.equal(canDispatch({ status: 'EN_PREPARACION', paymentMethod: 'TRANSFERENCIA', paymentStatus: 'EN_REVISION' }).ok, false);
  assert.equal(canDispatch({ status: 'EN_PREPARACION', paymentMethod: 'TARJETA', paymentStatus: 'APROBADO' }).ok, true);
  assert.equal(canDispatch({ status: 'EN_PREPARACION', paymentMethod: 'CONTRA_ENTREGA', paymentStatus: 'PENDIENTE' }).ok, true);
  assert.equal(canDispatch({ status: 'CONFIRMADO', paymentMethod: 'TARJETA', paymentStatus: 'APROBADO' }).ok, false);
});

test('el cliente solo cancela antes de la preparación', () => {
  assert.ok(customerCanCancel({ status: 'PENDIENTE_PAGO' }));
  assert.ok(customerCanCancel({ status: 'CONFIRMADO' }));
  assert.equal(customerCanCancel({ status: 'EN_PREPARACION' }), false);
  assert.equal(customerCanCancel({ status: 'ENVIADO' }), false);
});
