import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { loadEnv, connect, parseDbUrl, explainPgError, quoteIdent, stamp, dirSize, mb, FILE_DIRS, ROOT, c, ok, fail, title } from './_lib.js';

const SKIP_TABLES = new Set(['oidc_payloads']);

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('No existe DATABASE_URL. Revisa el archivo .env en la raíz del proyecto.');
    process.exit(1);
  }
  const info = parseDbUrl(url);
  const baseDir = path.resolve(process.argv[2] || path.join(ROOT, 'backups'));
  const target = path.join(baseDir, stamp());
  fs.mkdirSync(target, { recursive: true });

  title(`Respaldo de Exclusive → ${target}`);
  let client;
  try {
    client = await connect(url, { raw: true });
  } catch (e) {
    fail(explainPgError(e, info));
    fs.rmSync(target, { recursive: true, force: true });
    process.exit(1);
  }

  const started = Date.now();
  const tables = (
    await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`)
  ).rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t) && t !== '_prisma_migrations');

  const migration = (await client.query(`SELECT migration_name, checksum FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1`).catch(() => ({ rows: [] }))).rows[0] || null;
  const sequences = [];
  for (const { name } of (await client.query(`SELECT sequencename AS name FROM pg_sequences WHERE schemaname = current_schema() ORDER BY 1`)).rows) {
    const r = (await client.query(`SELECT last_value, is_called FROM ${quoteIdent(name)}`)).rows[0];
    sequences.push({ name, last_value: r.last_value, is_called: r.is_called === 't' || r.is_called === true });
  }

  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const gzip = zlib.createGzip({ level: 9 });
  const hash = crypto.createHash('sha256');
  const dbFile = path.join(target, 'database.json.gz');
  const out = fs.createWriteStream(dbFile);
  gzip.pipe(out);
  const write = (s) => {
    hash.update(s);
    if (!gzip.write(s)) return new Promise((r) => gzip.once('drain', r));
    return null;
  };

  const counts = {};
  await write('{"format":"exclusive-backup","version":1,"tables":[\n');
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const res = await client.query(`SELECT * FROM ${quoteIdent(t)}`);
    const columns = res.fields.map((f) => f.name);
    counts[t] = res.rows.length;
    await write(`${i ? ',\n' : ''}{"name":${JSON.stringify(t)},"columns":${JSON.stringify(columns)},"rows":[`);
    for (let j = 0; j < res.rows.length; j++) {
      const row = columns.map((col) => res.rows[j][col]);
      const p = write(`${j ? ',' : ''}\n${JSON.stringify(row)}`);
      if (p) await p;
    }
    await write(']}');
  }
  await write(`\n],"sequences":${JSON.stringify(sequences)}}\n`);
  await client.query('COMMIT');
  await client.end();
  gzip.end();
  await new Promise((r) => out.on('finish', r));
  ok(`Base de datos: ${tables.length} tablas, ${Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString('es-GT')} filas (${mb(fs.statSync(dbFile).size)})`);

  const files = {};
  for (const d of FILE_DIRS) {
    const dest = path.join(target, 'files', d.key);
    if (fs.existsSync(d.path)) {
      fs.cpSync(d.path, dest, { recursive: true });
      const s = dirSize(dest);
      files[d.key] = s;
      ok(`${d.label}: ${s.files} archivos (${mb(s.bytes)})`);
    } else {
      files[d.key] = { files: 0, bytes: 0 };
      ok(`${d.label}: carpeta vacía`);
    }
  }

  const manifest = {
    app: 'Exclusive',
    createdAt: new Date().toISOString(),
    database: { name: info.database, host: info.host, migration },
    sha256: hash.digest('hex'),
    tables: counts,
    files,
    summary: {
      usuarios: counts.users || 0,
      pedidos: counts.orders || 0,
      variantes: counts.product_variants || 0,
      movimientosInventario: counts.inventory_movements || 0,
      bitacora: counts.audit_logs || 0,
    },
    durationMs: Date.now() - started,
  };
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n${c.green('Respaldo terminado')} en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`  Usuarios ${manifest.summary.usuarios} · Pedidos ${manifest.summary.pedidos} · Variantes ${manifest.summary.variantes} · Movimientos ${manifest.summary.movimientosInventario}`);
  console.log(`  Carpeta: ${target}`);
  console.log(c.gray('  Para restaurarla: npm run restore -- "' + target + '"\n'));
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
