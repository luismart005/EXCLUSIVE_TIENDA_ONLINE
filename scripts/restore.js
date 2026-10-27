import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { loadEnv, connect, parseDbUrl, explainPgError, quoteIdent, dirSize, FILE_DIRS, ROOT, c, ok, warn, fail, title } from './_lib.js';

const args = process.argv.slice(2);
const yes = args.includes('--yes') || args.includes('-y');
const folderArg = args.find((a) => !a.startsWith('-'));

function findBackup() {
  if (folderArg) return path.resolve(folderArg);
  const base = path.join(ROOT, 'backups');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'manifest.json'))).sort();
  return dirs.length ? path.join(base, dirs[dirs.length - 1]) : null;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('No existe DATABASE_URL. Revisa el archivo .env en la raíz del proyecto.');
    process.exit(1);
  }
  const info = parseDbUrl(url);
  const dir = findBackup();
  if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) {
    fail('No se encontró ninguna copia. Crea una con "npm run backup" o indica la carpeta: npm run restore -- "ruta\\de\\la\\copia"');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  title(`Restaurar copia del ${new Date(manifest.createdAt).toLocaleString('es-GT')}`);
  console.log(`  Carpeta: ${dir}`);
  console.log(`  Destino: base "${info.database}" en ${info.host}:${info.port}`);
  console.log(`  Contiene: ${manifest.summary.usuarios} usuarios · ${manifest.summary.pedidos} pedidos · ${manifest.summary.variantes} variantes · ${manifest.summary.movimientosInventario} movimientos`);

  const rawText = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'database.json.gz'))).toString('utf8');
  const digest = crypto.createHash('sha256').update(rawText).digest('hex');
  if (digest !== manifest.sha256) {
    fail('La copia está dañada: su huella SHA-256 no coincide con la del manifiesto. No se restauró nada.');
    process.exit(1);
  }
  ok('Integridad de la copia verificada (SHA-256)');
  const data = JSON.parse(rawText);

  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\n${c.yellow('Se reemplazarán TODOS los datos e imágenes actuales.')} Escribe SI para continuar: `);
    rl.close();
    if (answer.trim().toUpperCase() !== 'SI') {
      console.log('Cancelado. No se modificó nada.');
      return;
    }
  }

  let client;
  try {
    client = await connect(url);
  } catch (e) {
    fail(explainPgError(e, info));
    process.exit(1);
  }

  const hasUsers = (await client.query(`SELECT to_regclass('users') IS NOT NULL AS ok`)).rows[0].ok;
  if (!hasUsers) {
    const schema = fs.readFileSync(path.join(ROOT, 'database/schema.sql'), 'utf8');
    await client.query(schema);
    ok('Base vacía: estructura creada con database/schema.sql');
  }

  const targetTables = new Map();
  const cols = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY ordinal_position`);
  const baseTables = new Set((await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`)).rows.map((r) => r.table_name));
  for (const r of cols.rows) {
    if (!baseTables.has(r.table_name)) continue;
    if (!targetTables.has(r.table_name)) targetTables.set(r.table_name, new Set());
    targetTables.get(r.table_name).add(r.column_name);
  }

  const started = Date.now();
  try {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL session_replication_role = replica');
    } catch {
      throw new Error(`El usuario "${info.user}" no tiene permisos de superusuario. Restaura con el usuario postgres (cámbialo en DATABASE_URL).`);
    }
    const toTruncate = [...targetTables.keys()].filter((t) => t !== '_prisma_migrations');
    await client.query(`TRUNCATE ${toTruncate.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`);

    for (const t of data.tables) {
      const targetCols = targetTables.get(t.name);
      if (!targetCols) {
        warn(`La tabla ${t.name} ya no existe en esta versión; se omite.`);
        continue;
      }
      const keep = t.columns.map((col, i) => ({ col, i })).filter((x) => targetCols.has(x.col));
      if (!t.rows.length || !keep.length) continue;
      const batch = Math.max(1, Math.floor(30000 / keep.length));
      for (let start = 0; start < t.rows.length; start += batch) {
        const chunk = t.rows.slice(start, start + batch);
        const params = [];
        const values = chunk.map((row) => `(${keep.map((k) => { params.push(row[k.i]); return `$${params.length}`; }).join(', ')})`);
        await client.query(`INSERT INTO ${quoteIdent(t.name)} (${keep.map((k) => quoteIdent(k.col)).join(', ')}) VALUES ${values.join(', ')}`, params);
      }
    }

    const existingSeq = new Set((await client.query(`SELECT sequencename FROM pg_sequences WHERE schemaname = current_schema()`)).rows.map((r) => r.sequencename));
    for (const s of data.sequences || []) {
      if (!existingSeq.has(s.name)) continue;
      await client.query(`SELECT setval($1::regclass, $2::bigint, $3::boolean)`, [quoteIdent(s.name), s.last_value ?? 1, s.last_value === null ? false : s.is_called !== false]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
    fail(`No se restauró la base de datos: ${e.message}`);
    process.exit(1);
  }
  ok(`Base de datos restaurada en ${((Date.now() - started) / 1000).toFixed(1)} s`);

  for (const d of FILE_DIRS) {
    const src = path.join(dir, 'files', d.key);
    const old = `${d.path}.anterior`;
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(d.path)) fs.renameSync(d.path, old);
    if (fs.existsSync(src)) fs.cpSync(src, d.path, { recursive: true });
    else fs.mkdirSync(d.path, { recursive: true });
    fs.rmSync(old, { recursive: true, force: true });
    ok(`${d.label}: restaurados`);
  }

  title('Comprobación');
  const check = async (table) => Number((await client.query(`SELECT count(*)::int AS n FROM ${quoteIdent(table)}`)).rows[0].n);
  const rows = [
    ['Usuarios', 'users'],
    ['Pedidos', 'orders'],
    ['Detalle de pedidos', 'order_items'],
    ['Pagos', 'payments'],
    ['Variantes', 'product_variants'],
    ['Existencias', 'inventory_stock'],
    ['Movimientos de inventario', 'inventory_movements'],
    ['Bitácora de auditoría', 'audit_logs'],
  ];
  let allOk = true;
  for (const [label, table] of rows) {
    const expected = manifest.tables[table] ?? 0;
    const actual = await check(table);
    if (expected === actual) ok(`${label}: ${actual}`);
    else {
      allOk = false;
      fail(`${label}: ${actual} (la copia tenía ${expected})`);
    }
  }
  const stock = (await client.query(`SELECT COALESCE(sum(physical),0)::int AS physical, COALESCE(sum(reserved),0)::int AS reserved FROM inventory_stock`)).rows[0];
  ok(`Inventario: ${stock.physical} unidades físicas, ${stock.reserved} reservadas`);
  for (const d of FILE_DIRS) {
    const expected = manifest.files?.[d.key]?.files ?? 0;
    const actual = dirSize(d.path).files;
    if (expected === actual) ok(`${d.label}: ${actual} archivos`);
    else {
      allOk = false;
      fail(`${d.label}: ${actual} archivos (la copia tenía ${expected})`);
    }
  }
  await client.end();
  console.log(allOk ? `\n${c.green('Restauración completa y verificada.')} Inicia el sistema con npm run dev (las sesiones anteriores se cerraron).\n` : `\n${c.red('La restauración terminó con diferencias.')} Revisa los mensajes anteriores.\n`);
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
