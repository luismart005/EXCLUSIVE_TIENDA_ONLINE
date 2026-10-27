import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

test('la misma contraseña produce hashes distintos (sal individual) y se verifica correctamente', async () => {
  const a = await bcrypt.hash('Cliente123!', 10);
  const b = await bcrypt.hash('Cliente123!', 10);
  assert.notEqual(a, b);
  assert.match(a, /^\$2[aby]\$10\$/);
  assert.ok(await bcrypt.compare('Cliente123!', a));
  assert.equal(await bcrypt.compare('cliente123!', a), false);
});

test('el script de la base de datos no contiene contraseñas en texto plano y cada usuario tiene su propia sal', () => {
  const sql = fs.readFileSync(new URL('../../database/exclusive_db.sql', import.meta.url), 'utf8');
  const usersBlock = sql.slice(sql.indexOf('INSERT INTO "users"'), sql.indexOf('INSERT INTO "user_roles"'));
  const hashes = usersBlock.match(/\$2[aby]\$10\$[./A-Za-z0-9]{53}/g) || [];
  const rows = (usersBlock.match(/@/g) || []).length;
  assert.ok(hashes.length > 0 && hashes.length === rows, 'cada usuario debe tener un hash bcrypt');
  assert.equal(new Set(hashes).size, hashes.length, 'no debe haber hashes repetidos');
  assert.equal(/Admin123!|Cliente123!/.test(usersBlock), false);
});
