import fs from 'node:fs';
import path from 'node:path';
import { ROOT, connect, parseDbUrl, withDatabase, explainPgError, quoteIdent, c, ok, fail, title } from './_lib.js';
import dotenv from 'dotenv';

const envPath = path.join(ROOT, '.env');
const testEnvPath = path.join(ROOT, '.env.test');

function readEnvFile(p) {
  return fs.existsSync(p) ? dotenv.parse(fs.readFileSync(p)) : {};
}

async function main() {
  title('Base de datos de pruebas');
  const main = readEnvFile(envPath);
  if (!main.DATABASE_URL) {
    fail('No existe DATABASE_URL en el archivo .env. Configúralo primero (ver README).');
    process.exit(1);
  }
  if (!fs.existsSync(testEnvPath)) {
    const testUrl = withDatabase(main.DATABASE_URL, 'exclusive_test');
    fs.writeFileSync(
      testEnvPath,
      `# Configuración para las pruebas automatizadas (npm test).\n# Debe apuntar a una base DISTINTA de la demostración.\nDATABASE_URL=${testUrl}\nNODE_ENV=test\nLOG_DIR=logs/test\n`,
    );
    ok('Se creó el archivo .env.test (base exclusive_test)');
  }
  const testEnv = readEnvFile(testEnvPath);
  const test = parseDbUrl(testEnv.DATABASE_URL || '');
  const demo = parseDbUrl(main.DATABASE_URL);
  if (!test.database || (test.database === demo.database && test.host === demo.host && test.port === demo.port)) {
    fail(`La base de pruebas (${test.database}) no puede ser la misma que la de la demostración (${demo.database}). Corrige .env.test.`);
    process.exit(1);
  }

  let admin;
  try {
    admin = await connect(withDatabase(test.url, 'postgres'));
  } catch (e) {
    fail(explainPgError(e, test));
    process.exit(1);
  }
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [test.database]);
  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(test.database)}`);
  await admin.query(`CREATE DATABASE ${quoteIdent(test.database)} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  ok(`Base "${test.database}" creada vacía`);

  const db = await connect(test.url);
  await db.query(fs.readFileSync(path.join(ROOT, 'database/schema.sql'), 'utf8'));
  const tables = (await db.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`)).rows[0].n;
  await db.end();
  ok(`Estructura cargada: ${tables} tablas y catálogos de referencia`);
  console.log(`\n${c.green('Listo.')} Ejecuta ahora: npm test\n`);
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
