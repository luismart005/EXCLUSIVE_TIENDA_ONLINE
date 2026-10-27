import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ROOT, loadEnv, connect, parseDbUrl, explainPgError, c, ok, warn, fail, title } from './_lib.js';

let problems = 0;
const bad = (msg) => {
  problems++;
  fail(msg);
};

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

async function main() {
  title('Verificación de la instalación de Exclusive');

  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj > 20 || (maj === 20 && min >= 19)) ok(`Node.js ${process.version}`);
  else bad(`Node.js ${process.version} es muy antiguo. Instala Node.js 22 LTS desde https://nodejs.org`);

  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8').replace(/=cambia-esto.*$/gm, () => `=${crypto.randomBytes(24).toString('hex')}`);
    fs.writeFileSync(envPath, example);
    warn('No existía el archivo .env: se creó a partir de .env.example con secretos aleatorios. Revisa la contraseña de PostgreSQL en DATABASE_URL.');
  } else ok('Archivo .env encontrado');
  loadEnv();

  if (fs.existsSync(path.join(ROOT, 'node_modules'))) ok('Dependencias instaladas (node_modules)');
  else bad('Faltan las dependencias. Ejecuta: npm install');
  try {
    const require = createRequire(path.join(ROOT, 'packages/db/package.json'));
    const client = require.resolve('.prisma/client/index.js');
    if (fs.existsSync(client)) ok('Cliente de Prisma (ORM) generado');
    else throw new Error();
  } catch {
    bad('El cliente de Prisma no está generado. Ejecuta: npm run db:generate');
  }

  const url = process.env.DATABASE_URL;
  if (!url) bad('DATABASE_URL no está definida en .env');
  else {
    const info = parseDbUrl(url);
    try {
      const db = await connect(url);
      ok(`Conexión a PostgreSQL (${info.host}:${info.port}, base "${info.database}")`);
      const ver = (await db.query('SHOW server_version')).rows[0].server_version;
      if (parseInt(ver, 10) >= 14) ok(`PostgreSQL ${ver}`);
      else warn(`PostgreSQL ${ver}: se recomienda la versión 14 o superior`);
      const hasUsers = (await db.query(`SELECT to_regclass('users') IS NOT NULL AS ok`)).rows[0].ok;
      if (!hasUsers) bad('La base existe pero está vacía. Importa database/exclusive_db.sql en pgAdmin (Query Tool → abrir archivo → F5).');
      else {
        const r = (await db.query(`SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM products)::int AS products, (SELECT count(*) FROM orders)::int AS orders`)).rows[0];
        ok(`Datos cargados: ${r.users} usuarios, ${r.products} productos, ${r.orders} pedidos`);
        const admin = (await db.query(`SELECT count(*)::int AS n FROM users WHERE email = 'admin@exclusive.gt'`)).rows[0].n;
        if (admin) ok('Usuario administrador de prueba disponible (admin@exclusive.gt)');
        else warn('No existe admin@exclusive.gt: vuelve a importar database/exclusive_db.sql si necesitas los usuarios de prueba.');
      }
      await db.end();
    } catch (e) {
      bad(explainPgError(e, info));
    }
  }

  const imgDir = path.join(ROOT, 'services/catalog-service/uploads/products');
  const imgs = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).filter((f) => f.endsWith('.webp')).length : 0;
  if (imgs > 0) ok(`Imágenes de productos: ${imgs} archivos`);
  else bad('No hay imágenes en services/catalog-service/uploads/products. Copia de nuevo la carpeta del proyecto completa.');

  if (fs.existsSync(path.join(ROOT, 'frontend/dist/index.html'))) ok('Frontend compilado (frontend/dist) para npm start');
  else warn('El frontend no está compilado: usa npm run dev, o ejecuta npm run build antes de npm start.');

  const ports = [4000, 4001, 4002, 4003, 4004, 4005, 5173];
  const busy = [];
  for (const p of ports) if (!(await portFree(p))) busy.push(p);
  if (!busy.length) ok('Puertos 4000–4005 y 5173 libres');
  else warn(`Puertos en uso: ${busy.join(', ')}. Si el sistema ya está abierto, está bien; si no, cierra el programa que los usa.`);

  const pub = process.env.PUBLIC_URL || 'http://localhost:4000';
  ok(`El sistema se abrirá en ${pub}`);

  console.log(problems ? `\n${c.red(`Hay ${problems} problema(s) por corregir.`)}\n` : `\n${c.green('Todo listo.')} Inicia el sistema con: npm run dev\n`);
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
