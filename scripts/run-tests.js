import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { ROOT, connect, parseDbUrl, explainPgError, c, fail, title } from './_lib.js';

const mode = process.argv[2] || 'all';
const files = (dir) =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(dir, f))
    : [];

function run(label, list, env = {}) {
  title(label);
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...list], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status === 0;
}

async function integrationReady() {
  const p = path.join(ROOT, '.env.test');
  if (!fs.existsSync(p)) {
    fail('No existe .env.test. Crea la base de pruebas con: npm run test:db');
    return false;
  }
  const url = dotenv.parse(fs.readFileSync(p)).DATABASE_URL;
  const info = parseDbUrl(url);
  try {
    const db = await connect(url);
    const r = await db.query(`SELECT to_regclass('users') IS NOT NULL AS ok`);
    await db.end();
    if (!r.rows[0].ok) {
      fail('La base de pruebas está vacía. Ejecuta: npm run test:db');
      return false;
    }
  } catch (e) {
    fail(e.code === '3D000' ? `La base de pruebas "${info.database}" no existe. Ejecuta: npm run test:db` : explainPgError(e, info));
    return false;
  }
  return true;
}

let okAll = true;
if (mode === 'unit' || mode === 'all') okAll = run('Pruebas unitarias', files('tests/unit')) && okAll;
if (mode === 'integration' || mode === 'all') {
  if (await integrationReady()) okAll = run('Pruebas de integración (base de pruebas)', files('tests/integration'), { NODE_ENV: 'test' }) && okAll;
  else okAll = false;
}
console.log(okAll ? c.green('\nTodas las pruebas pasaron.\n') : c.red('\nHay pruebas con fallas o pendientes de configuración.\n'));
process.exit(okAll ? 0 : 1);
