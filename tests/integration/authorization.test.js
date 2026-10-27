import './_authz-env.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { env, invalidateUserState } from '@exclusive/common';
import { prisma, disconnect, createCustomer, createOrder, uid } from './_helpers.js';

let jwksServer;
let salesServer;
let signingKey;
let otherKey;
const KID = 'llave-de-prueba';
const BASE = `http://127.0.0.1:${process.env.SALES_PORT}/api/sales`;
const ctx = {};

async function token(user, { key = signingKey, exp = '5m', sv } = {}) {
  return new SignJWT({ sv: sv ?? user.sessionVersion, scope: 'openid profile' })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(env.OIDC_ISSUER)
    .setAudience(env.API_AUDIENCE)
    .setSubject(String(user.id))
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

const get = async (path, tok) => {
  const r = await fetch(BASE + path, { headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  const body = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  return { status: r.status, body };
};

async function withRole(user, code) {
  const role = await prisma.role.findUnique({ where: { code } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}

before(async () => {
  const pair = await generateKeyPair('RS256');
  signingKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  jwksServer = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((r) => jwksServer.listen(Number(process.env.AUTH_PORT), '127.0.0.1', r));

  const { createService } = await import('@exclusive/common');
  const { storeRoutes } = await import('../../services/sales-service/src/routes/store.js');
  const { adminRoutes } = await import('../../services/sales-service/src/routes/admin.js');
  ({ server: salesServer } = await createService({
    name: 'sales-service-pruebas',
    port: env.PORTS.sales,
    setup(app) {
      app.use('/api/sales/admin', adminRoutes());
      app.use('/api/sales', storeRoutes());
    },
  }));
  await new Promise((r) => (salesServer.listening ? r() : salesServer.once('listening', r)));

  ctx.ana = await withRole(await createCustomer(), 'CLIENTE');
  ctx.beto = await withRole(await createCustomer(), 'CLIENTE');
  ctx.ventas = await withRole(await createCustomer(), 'VENTAS');
  ctx.orderAna = await createOrder(ctx.ana.id);
  ctx.orderBeto = await createOrder(ctx.beto.id, { method: 'TRANSFERENCIA' });
  ctx.paymentBeto = await prisma.payment.create({
    data: { orderId: ctx.orderBeto.id, method: 'TRANSFERENCIA', status: 'EN_REVISION', amount: '100.00', reference: `PAY-T-${uid()}`.toUpperCase(), receiptPath: 'demo-transferencia.png', receiptMime: 'image/png' },
  });
});

after(async () => {
  await new Promise((r) => salesServer?.close(r) ?? r());
  await new Promise((r) => jwksServer?.close(r) ?? r());
  await disconnect();
});

test('sin token no se puede consultar pedidos', async () => {
  const r = await get('/orders');
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'LOGIN_REQUIRED');
});

test('un cliente solo ve sus propios pedidos', async () => {
  const t = await token(ctx.ana);
  const list = await get('/orders', t);
  assert.equal(list.status, 200);
  const codes = list.body.map((o) => o.code);
  assert.ok(codes.includes(ctx.orderAna.code));
  assert.equal(codes.includes(ctx.orderBeto.code), false);
  const ajeno = await get(`/orders/${ctx.orderBeto.code}`, t);
  assert.equal(ajeno.status, 404, 'un pedido ajeno debe responder como inexistente');
});

test('un cliente no puede ver el comprobante de transferencia de otro cliente', async () => {
  const r = await get(`/payments/${ctx.paymentBeto.id}/receipt`, await token(ctx.ana));
  assert.equal(r.status, 403);
  const own = await fetch(`${BASE}/payments/${ctx.paymentBeto.id}/receipt`, { headers: { authorization: `Bearer ${await token(ctx.beto)}` } });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'private, no-store');
});

test('un cliente no puede ejecutar acciones administrativas y el intento queda registrado', async () => {
  const t = await token(ctx.ana);
  const r = await get('/admin/orders', t);
  assert.equal(r.status, 403);
  const post = await fetch(`${BASE}/admin/orders/${ctx.orderBeto.id}/prepare`, { method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 403);
  await new Promise((res) => setTimeout(res, 200));
  const events = await prisma.securityEvent.count({ where: { userId: ctx.ana.id, type: 'PERMISSION_DENIED' } });
  assert.ok(events >= 2);
});

test('el personal de ventas sí puede consultar cualquier pedido', async () => {
  const r = await get(`/admin/orders/${ctx.orderBeto.id}`, await token(ctx.ventas));
  assert.equal(r.status, 200);
  assert.equal(r.body.code, ctx.orderBeto.code);
});

test('se rechazan tokens con firma desconocida o vencidos', async () => {
  const forged = await get('/orders', await token(ctx.ana, { key: otherKey }));
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, 'INVALID_TOKEN');
  const expired = await get('/orders', await token(ctx.ana, { exp: Math.floor(Date.now() / 1000) - 60 }));
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'TOKEN_EXPIRED');
});

test('cerrar sesión en todos los dispositivos invalida los tokens emitidos', async () => {
  const user = await withRole(await createCustomer(), 'CLIENTE');
  const t = await token(user);
  assert.equal((await get('/orders', t)).status, 200);
  await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  invalidateUserState(user.id);
  const r = await get('/orders', t);
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'SESSION_REVOKED');
});

test('una cuenta desactivada no puede seguir usando su token', async () => {
  const user = await withRole(await createCustomer(), 'CLIENTE');
  const t = await token(user);
  await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVO' } });
  invalidateUserState(user.id);
  const r = await get('/orders', t);
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'ACCOUNT_DISABLED');
});
