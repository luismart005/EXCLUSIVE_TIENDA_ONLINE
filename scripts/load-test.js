import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, c, ok, fail, title } from './_lib.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const USERS = Number(arg('users', 20));
const SECONDS = Number(arg('seconds', 30));
const BASE = arg('url', 'http://localhost:4000').replace(/\/$/, '');
const THINK_MS = [150, 450];

const samples = new Map();
let errors = 0;
let requests = 0;

async function hit(name, url) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + url, { headers: { accept: 'application/json' } });
    await r.arrayBuffer();
    if (!r.ok) {
      errors++;
      if (r.status === 429) throw new Error('El límite de solicitudes (API_RATE_LIMIT) bloqueó la prueba. Súbelo temporalmente en .env.');
    }
  } catch (e) {
    if (e.message.includes('API_RATE_LIMIT')) throw e;
    errors++;
  } finally {
    const ms = performance.now() - t0;
    requests++;
    if (!samples.has(name)) samples.set(name, []);
    samples.get(name).push(ms);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const think = () => sleep(THINK_MS[0] + Math.random() * (THINK_MS[1] - THINK_MS[0]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] || 0;
};

async function main() {
  title(`Prueba de rendimiento del catálogo: ${USERS} usuarios concurrentes durante ${SECONDS} s`);
  let health;
  try {
    health = await (await fetch(`${BASE}/api/health`)).json();
  } catch {
    fail(`No se pudo conectar con ${BASE}. Inicia el sistema primero (npm start).`);
    process.exit(1);
  }
  const first = await (await fetch(`${BASE}/api/catalog/products?pageSize=48`)).json();
  const slugs = (first.items || []).map((p) => p.slug).filter(Boolean);
  const categories = (await (await fetch(`${BASE}/api/catalog/categories`)).json()).map((x) => x.slug);
  const totalProducts = first.total ?? slugs.length;
  if (!slugs.length) {
    fail('El catálogo está vacío: importa database/exclusive_db.sql antes de la prueba.');
    process.exit(1);
  }
  const terms = ['camisa', 'lino', 'denim', 'vestido', 'algodón', 'chaqueta'];
  const sorts = ['relevancia', 'nuevos', 'precio-asc', 'precio-desc', 'nombre'];

  const end = Date.now() + SECONDS * 1000;
  const user = async () => {
    while (Date.now() < end) {
      await hit('Destacados de inicio', '/api/catalog/products?sort=relevancia&pageSize=8');
      await think();
      await hit('Listado por categoría', `/api/catalog/products?category=${pick(categories)}&sort=${pick(sorts)}&page=1&pageSize=24`);
      await think();
      await hit('Búsqueda', `/api/catalog/products?search=${encodeURIComponent(pick(terms))}&pageSize=24`);
      await think();
      await hit('Detalle de producto', `/api/catalog/products/${pick(slugs)}`);
      await think();
      await hit('Categorías', '/api/catalog/categories');
      await think();
    }
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: USERS }, () => user()));
  const elapsed = (Date.now() - started) / 1000;

  const all = [...samples.values()].flat();
  const rows = [...samples.entries()].map(([name, arr]) => ({ name, n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), max: Math.max(...arr) }));
  const p95 = pct(all, 95);
  const under2s = (all.filter((ms) => ms < 2000).length / all.length) * 100;
  const pass = under2s >= 95 && errors === 0;

  console.log('');
  for (const r of rows) console.log(`  ${r.name.padEnd(24)} ${String(r.n).padStart(5)} solicitudes · p50 ${r.p50.toFixed(0).padStart(4)} ms · p95 ${r.p95.toFixed(0).padStart(4)} ms · máx ${r.max.toFixed(0)} ms`);
  console.log(`\n  Total: ${requests} solicitudes en ${elapsed.toFixed(1)} s (${(requests / elapsed).toFixed(1)} por segundo) · errores: ${errors}`);
  console.log(`  ${under2s.toFixed(1)} % respondió en menos de 2 s · p95 general ${p95.toFixed(0)} ms`);
  (pass ? ok : fail)(pass ? 'Cumple RNF-11: el 95 % de las consultas respondió en menos de 2 segundos.' : 'No cumple RNF-11 en este equipo.');

  const cpu = os.cpus()[0]?.model?.trim() || 'desconocido';
  const md = `# Evidencia de rendimiento (RNF-11)

Fecha: ${new Date().toLocaleString('es-GT')}
Resultado: **${pass ? 'CUMPLE' : 'NO CUMPLE'}** — ${under2s.toFixed(1)} % de las consultas respondió en menos de 2 s (p95 general: ${p95.toFixed(0)} ms).

## Condiciones

| Dato | Valor |
|---|---|
| Usuarios concurrentes | ${USERS} |
| Duración | ${elapsed.toFixed(1)} s |
| Pausa entre pasos | ${THINK_MS[0]}–${THINK_MS[1]} ms |
| URL | ${BASE} |
| Modo del gateway | ${health?.gateway?.mode || '—'} |
| Productos activos en catálogo | ${totalProducts} |
| Equipo | ${cpu} · ${os.cpus().length} núcleos · ${(os.totalmem() / 1073741824).toFixed(1)} GB de RAM |
| Sistema operativo | ${os.type()} ${os.release()} (${os.arch()}) |
| Node.js | ${process.version} |

## Resultados por consulta

| Consulta | Solicitudes | p50 (ms) | p95 (ms) | Máximo (ms) |
|---|---:|---:|---:|---:|
${rows.map((r) => `| ${r.name} | ${r.n} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.max.toFixed(0)} |`).join('\n')}
| **Total** | **${requests}** | **${pct(all, 50).toFixed(0)}** | **${p95.toFixed(0)}** | **${Math.max(...all).toFixed(0)}** |

Errores: ${errors}. Rendimiento: ${(requests / elapsed).toFixed(1)} solicitudes por segundo.

Generado con \`npm run perf\` (scripts/load-test.js).
`;
  const outDir = path.join(ROOT, 'docs/evidencias');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'rendimiento.md'), md);
  console.log(c.gray(`\n  Evidencia guardada en docs/evidencias/rendimiento.md\n`));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
