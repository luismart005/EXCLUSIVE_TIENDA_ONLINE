import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, ROLES } from '../../packages/common/src/permissions.js';
import { redact } from '../../packages/common/src/logger.js';
import { sanitize } from '../../packages/common/src/audit.js';
import { toCSV } from '../../packages/common/src/csv.js';

const role = (code) => ROLES.find((r) => r.code === code);

test('el administrador tiene todos los permisos y el cliente ninguno administrativo', () => {
  assert.equal(role('ADMIN').permissions.length, PERMISSIONS.length);
  assert.deepEqual(role('CLIENTE').permissions, []);
  assert.equal(role('CLIENTE').isStaff, false);
});

test('cada rol tiene solo los permisos de su función', () => {
  assert.ok(role('VENTAS').permissions.includes('payments.review'));
  assert.equal(role('VENTAS').permissions.includes('users.manage'), false);
  assert.equal(role('INVENTARIO').permissions.includes('payments.review'), false);
  assert.ok(role('ATENCION').permissions.includes('refunds.create'));
  assert.equal(role('GERENCIA').permissions.includes('orders.manage'), false);
  const codes = new Set(PERMISSIONS.map((p) => p.code));
  for (const r of ROLES) for (const p of r.permissions) assert.ok(codes.has(p), `${r.code} usa un permiso inexistente: ${p}`);
});

test('los registros técnicos ocultan contraseñas, tokens y tarjetas', () => {
  const out = redact({ email: 'a@b.gt', password: 'Secreta123!', headers: { authorization: 'Bearer x' }, cardNumber: '4242', nested: { refresh_token: 'abc' } });
  assert.equal(out.email, 'a@b.gt');
  assert.equal(out.password, '[oculto]');
  assert.equal(out.headers.authorization, '[oculto]');
  assert.equal(out.cardNumber, '[oculto]');
  assert.equal(out.nested.refresh_token, '[oculto]');
});

test('la bitácora nunca guarda hashes de contraseña ni rutas de comprobantes', () => {
  const out = sanitize({ id: 1, email: 'x@y.gt', passwordHash: '$2b$10$...', receiptPath: '/storage/x.png', amount: 10n });
  assert.deepEqual(out, { id: 1, email: 'x@y.gt', amount: '10' });
});

test('la exportación CSV neutraliza fórmulas (inyección CSV) y conserva acentos', () => {
  const csv = toCSV([{ n: '=HYPERLINK("http://x")', m: 'Camisa Oxford Clásica', v: -25.5 }], [{ label: 'Nombre', key: 'n' }, { label: 'Producto', key: 'm' }, { label: 'Valor', key: 'v' }]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.match(csv, /Clásica/);
  assert.match(csv, /,-25\.5\r\n$/);
});
