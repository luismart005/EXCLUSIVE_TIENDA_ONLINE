import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync('npx', ['prisma', 'generate', '--schema', 'packages/db/prisma/schema.prisma'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0) {
  console.warn('\n[!] No se pudo generar el cliente de Prisma. Revisa tu conexión a internet y ejecuta: npm run db:generate\n');
}
