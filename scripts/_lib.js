import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export function loadEnv({ test = false } = {}) {
  const files = test ? ['.env.test', '.env'] : ['.env'];
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) dotenv.config({ path: p, quiet: true });
  }
  return process.env;
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = { green: paint(32), red: paint(31), yellow: paint(33), cyan: paint(36), gray: paint(90), bold: paint(1) };

export const ok = (msg) => console.log(`  ${c.green('✔')} ${msg}`);
export const warn = (msg) => console.log(`  ${c.yellow('!')} ${msg}`);
export const fail = (msg) => console.log(`  ${c.red('✖')} ${msg}`);
export const title = (msg) => console.log(`\n${c.bold(msg)}`);

export function parseDbUrl(url) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: Number(u.port || 5432),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    url,
  };
}

export function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(database)}`;
  return u.toString();
}

export async function connect(url, { raw = false } = {}) {
  const client = new pg.Client({
    connectionString: url,
    ...(raw ? { types: { getTypeParser: () => (v) => v } } : {}),
  });
  await client.connect();
  return client;
}

export function explainPgError(e, info) {
  const where = info ? `${info.host}:${info.port}` : 'el servidor';
  if (e.code === 'ECONNREFUSED') return `No hay un servidor PostgreSQL escuchando en ${where}. Abre "Servicios" de Windows y verifica que el servicio postgresql esté "En ejecución".`;
  if (e.code === '28P01') return `La contraseña del usuario "${info?.user}" es incorrecta. Corrígela en DATABASE_URL del archivo .env.`;
  if (e.code === '3D000') return `La base de datos "${info?.database}" no existe. Créala en pgAdmin e importa database/exclusive_db.sql.`;
  if (e.code === '28000') return `El usuario "${info?.user}" no existe en PostgreSQL.`;
  return e.message;
}

export const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function dirSize(dir) {
  let files = 0;
  let bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const s = dirSize(p);
      files += s.files;
      bytes += s.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += fs.statSync(p).size;
    }
  }
  return { files, bytes };
}

export const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

export const FILE_DIRS = [
  { key: 'uploads', label: 'Imágenes de productos y categorías', path: path.join(ROOT, 'services/catalog-service/uploads') },
  { key: 'storage', label: 'Comprobantes de transferencia', path: path.join(ROOT, 'services/sales-service/storage') },
];
