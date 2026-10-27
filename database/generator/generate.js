import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { garmentSVG } from './garments.js';
import * as D from './data.js';
import { PERMISSIONS, ROLES } from '../../packages/common/src/permissions.js';
import { calculateQuote } from '../../packages/common/src/pricing.js';
import { toCents, fromCents, allocate } from '../../packages/common/src/money.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const UPLOADS = path.join(ROOT, 'services/catalog-service/uploads/products');
const RECEIPTS = path.join(ROOT, 'services/sales-service/storage/receipts');
const SKIP_IMAGES = process.argv.includes('--no-images');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261023);
const randint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
function weighted(items, w) {
  const ws = items.map(w);
  const sum = ws.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
function poisson(lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss()));
  const L = Math.exp(-lambda); let k = 0; let p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}
function gauss() { const u = 1 - rand(); const v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const code3 = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

const gt = (y, m, d, h = 0, mi = 0) => new Date(Date.UTC(y, m - 1, d, h + 6, mi));
const addH = (t, h) => new Date(t.getTime() + h * 3600e3);
const addD = (t, d) => new Date(t.getTime() + d * 86400e3);
const local = (t) => new Date(t.getTime() - 6 * 3600e3);
const dateOnly = (t) => local(t).toISOString().slice(0, 10);
const monthOf = (t) => local(t).getUTCMonth() + 1;
const dayOf = (t) => local(t).getUTCDate();
const hourOf = (t) => local(t).getUTCHours();
function businessTime(t) {
  let x = new Date(t.getTime());
  for (let i = 0; i < 10; i++) {
    const l = local(x);
    const dow = l.getUTCDay();
    const h = l.getUTCHours();
    if (dow === 0) { x = gt(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate() + 1, 8, randint(0, 59)); continue; }
    if (h < 8) { x = gt(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate(), 8, randint(0, 59)); continue; }
    if (h >= 18) { x = gt(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate() + 1, 8, randint(0, 59)); continue; }
    break;
  }
  return x;
}

const START = gt(2025, 10, 20);
const NOW = gt(2026, 10, 23, 16, 30);
const SEED_CREATED = gt(2025, 10, 1, 9, 0);

class Dec { constructor(v) { this.v = v; } }
class Json { constructor(v) { this.v = v; } }
const dec = (cents) => new Dec(fromCents(cents));
const decQ = (q) => new Dec(Number(q).toFixed(2));
const json = (v) => new Json(v);
const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Dec) return v.v;
  if (v instanceof Json) return `'${JSON.stringify(v.v).replace(/'/g, "''")}'`;
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const T = {};
const ORDER = [];
function table(name) { if (!T[name]) { T[name] = []; ORDER.push(name); } return T[name]; }
function ins(name, row) { table(name).push(row); return row; }
const ids = {};
const nextId = (name) => (ids[name] = (ids[name] || 0) + 1);

console.log('› Roles, permisos y usuarios…');
table('roles'); table('permissions'); table('role_permissions');
const permId = {};
PERMISSIONS.forEach((p, i) => { permId[p.code] = i + 1; ins('permissions', { id: i + 1, code: p.code, name: p.name, module: p.module }); });
const roleId = {};
ROLES.forEach((r, i) => {
  roleId[r.code] = i + 1;
  ins('roles', { id: i + 1, code: r.code, name: r.name, description: r.description, is_system: true, is_staff: r.isStaff, created_at: SEED_CREATED });
  for (const p of r.permissions) ins('role_permissions', { role_id: i + 1, permission_id: permId[p] });
});

const hash = (pw) => bcrypt.hashSync(pw, 10);
const users = [];
function addUser({ email, password, first, last, phone, role, created }) {
  const id = nextId('users');
  const u = {
    id, email, password_hash: hash(password), first_name: first, last_name: last, phone, status: 'ACTIVO',
    email_verified: true, session_version: 1, failed_logins: 0, locked_until: null, last_login_at: null,
    is_demo: true, created_at: created, updated_at: created,
  };
  ins('users', u);
  ins('user_roles', { user_id: id, role_id: roleId[role], assigned_at: created });
  users.push({ ...u, role });
  return u;
}
const STAFF = {
  admin: addUser({ email: 'admin@exclusive.gt', password: 'Admin123!', first: 'Andrea', last: 'Cifuentes', phone: '5500 1001', role: 'ADMIN', created: SEED_CREATED }),
  ventas: addUser({ email: 'ventas@exclusive.gt', password: 'Ventas123!', first: 'Kevin', last: 'Orellana', phone: '5500 1002', role: 'VENTAS', created: SEED_CREATED }),
  inventario: addUser({ email: 'inventario@exclusive.gt', password: 'Inventario123!', first: 'Marta', last: 'Sandoval', phone: '5500 1003', role: 'INVENTARIO', created: SEED_CREATED }),
  atencion: addUser({ email: 'atencion@exclusive.gt', password: 'Atencion123!', first: 'Paola', last: 'Recinos', phone: '5500 1004', role: 'ATENCION', created: SEED_CREATED }),
  gerencia: addUser({ email: 'gerencia@exclusive.gt', password: 'Gerencia123!', first: 'Rodrigo', last: 'Arriola', phone: '5500 1005', role: 'GERENCIA', created: SEED_CREATED }),
};
const CLIENT = addUser({ email: 'cliente@exclusive.gt', password: 'Cliente123!', first: 'María José', last: 'López', phone: '5512 3456', role: 'CLIENTE', created: gt(2025, 10, 5, 19, 12) });

const customers = [{ user: CLIENT, loyalty: 1.4, addresses: [] }];
const usedEmails = new Set(users.map((u) => u.email));
for (let i = 0; i < 72; i++) {
  const female = chance(0.58);
  const first = pick(female ? D.FIRST_NAMES_F : D.FIRST_NAMES_M);
  const last = `${pick(D.LAST_NAMES)} ${pick(D.LAST_NAMES)}`;
  let email = `${slugify(first.split(' ')[0])}.${slugify(last.split(' ')[0])}@demo.exclusive.gt`;
  let n = 2;
  while (usedEmails.has(email)) email = email.replace(/(\d*)@/, `${n++}@`);
  usedEmails.add(email);
  const created = i < 18 ? addD(gt(2025, 9, 15, 10), randint(0, 30)) : addD(gt(2025, 10, 25, 10), Math.floor((i - 18) * (330 / 54)) + randint(0, 5));
  const id = nextId('users');
  const u = {
    id, email, password_hash: hash('Cliente123!'), first_name: first, last_name: last, phone: `${pick(['3', '4', '5'])}${randint(100, 999)} ${randint(1000, 9999)}`,
    status: 'ACTIVO', email_verified: true, session_version: 1, failed_logins: 0, locked_until: null, last_login_at: null,
    is_demo: true, created_at: created, updated_at: created,
  };
  ins('users', u);
  ins('user_roles', { user_id: id, role_id: roleId.CLIENTE, assigned_at: created });
  customers.push({ user: u, loyalty: 0.4 + rand() * 1.6, addresses: [] });
}

const deptByName = Object.fromEntries(D.DEPARTMENTS.map((d) => [d.name, d]));
function addAddress(c, dept, label, isDefault) {
  const d = deptByName[dept];
  const muni = pick(d.munis);
  const zone = dept === 'Guatemala' && muni === 'Guatemala' ? `zona ${pick([1, 4, 5, 7, 10, 11, 12, 14, 15, 16, 18])}` : `zona ${randint(1, 6)}`;
  const a = {
    id: nextId('addresses'), user_id: c.user.id, label, recipient_name: `${c.user.first_name} ${c.user.last_name}`,
    phone: c.user.phone, department: dept, municipality: muni,
    line1: `${randint(1, 30)}a. avenida ${randint(1, 40)}-${String(randint(1, 99)).padStart(2, '0')}, ${zone}`,
    reference: pick([null, 'Portón negro', 'Frente a la iglesia', 'Casa de dos niveles', 'Edificio, apartamento 302', 'A la par de la farmacia']),
    is_default: isDefault, active: true, created_at: c.user.created_at,
  };
  ins('addresses', a);
  c.addresses.push(a);
  return a;
}
addAddress(customers[0], 'Guatemala', 'Casa', true);
addAddress(customers[0], 'Petén', 'Casa de mis papás', false);
for (const c of customers.slice(1)) {
  const dept = weighted(D.DEPARTMENTS.filter((d) => d.covered), (d) => d.w).name;
  addAddress(c, dept, pick(['Casa', 'Casa', 'Trabajo', 'Apartamento']), true);
  if (chance(0.15)) addAddress(c, 'Guatemala', 'Trabajo', false);
}

console.log('› Catálogo…');
for (const c of D.COLORS) ins('colors', { id: c.id, name: c.name, hex: c.hex, sort_order: c.id, active: true });
for (const s of D.SIZES) ins('sizes', { id: s.id, code: s.code, name: s.name, sort_order: s.id, active: true });
for (const g of D.SIZE_GUIDES) ins('size_guides', { id: g.id, name: g.name, unit: 'cm', columns: json(g.columns), rows: json(g.rows), notes: g.notes, created_at: SEED_CREATED });
for (const c of D.CATEGORIES) {
  ins('categories', {
    id: c.id, name: c.name, slug: c.slug, description: c.description, image_url: `/uploads/products/cat-${c.slug}.webp`,
    sort_order: c.id, active: true, created_at: SEED_CREATED, updated_at: SEED_CREATED,
  });
}
const catById = Object.fromEntries(D.CATEGORIES.map((c) => [c.id, c]));
const colorById = Object.fromEntries(D.COLORS.map((c) => [c.id, c]));
const sizeById = Object.fromEntries(D.SIZES.map((s) => [s.id, s]));
const CAT_CODES = { 1: 'CAM', 2: 'CYB', 3: 'PAN', 4: 'VES', 5: 'FAL', 6: 'CHA', 7: 'SUD', 8: 'SHO' };
const LAUNCH = {
  'Blusa Bordada Atitlán': gt(2026, 7, 1, 9),
  'Camiseta Oversize Lago': gt(2026, 8, 15, 9),
  'Cortavientos Pacaya': gt(2026, 9, 1, 9),
  'Vestido Cruzado Grana': gt(2026, 10, 1, 9),
};
const COMPARE_AT = { 'Chaqueta Bomber Ligera': 629, 'Blazer Estructurado': 649, 'Jeans Recto Clásico': 429 };

const products = [];
const variants = [];
const imageJobs = [];
D.PRODUCTS.forEach((p, idx) => {
  const id = idx + 1;
  const cat = catById[p.cat];
  const created = LAUNCH[p.name] || SEED_CREATED;
  const prod = {
    id, name: p.name, slug: slugify(p.name), description: p.description, category_id: p.cat, size_guide_id: cat.guide,
    base_price: decQ(p.price), compare_at_price: COMPARE_AT[p.name] ? decQ(COMPARE_AT[p.name]) : null,
    material: p.material, care: p.care, gender: p.gender, featured: !!p.featured, status: 'ACTIVO',
    created_by: STAFF.inventario.id, created_at: created, updated_at: created,
  };
  ins('products', prod);
  const sumP = D.PRODUCTS.filter((x) => x.cat === p.cat).reduce((a, x) => a + x.p, 0);
  const shape = p.shape || cat.shape;
  const meta = { ...p, id, prod, cat, created, priceCents: p.price * 100, shareInCat: p.p / sumP, variants: [], shape };
  products.push(meta);
  p.colors.forEach((colorId, ci) => {
    const color = colorById[colorId];
    const file = `p${id}-c${colorId}`;
    imageJobs.push({ file, shape, color: color.hex, pattern: p.pattern, accent: p.accent });
    ins('product_images', {
      id: nextId('product_images'), product_id: id, color_id: colorId, url: `/uploads/products/${file}.webp`,
      thumb_url: `/uploads/products/${file}-t.webp`, alt: `${p.name} color ${color.name.toLowerCase()}`, sort_order: ci, created_at: created,
    });
    for (const s of D.SIZES) {
      const vid = nextId('product_variants');
      const v = {
        id: vid, product_id: id, size_id: s.id, color_id: colorId, sku: `EXC-${CAT_CODES[p.cat]}${String(id).padStart(3, '0')}-${code3(color.name)}${color.name.includes(' ') ? code3(color.name.split(' ')[1])[0] : ''}-${s.code}`,
        price: null, active: true, created_at: created,
      };
      ins('product_variants', v);
      const colorShare = (ci === 0 ? 1.35 : 1) / p.colors.reduce((a, _, k) => a + (k === 0 ? 1.35 : 1), 0);
      const weekly = cat.base * meta.shareInCat * D.SIZE_WEIGHTS[s.id] * colorShare;
      const vm = {
        ...v, product: meta, color, size: s, weekly, physical: 0, reserved: 0, created,
        target: Math.max(4, Math.round(weekly * 4.2 + 3)), reorder: Math.max(2, Math.round(weekly * 1.8 + 1)), minStock: Math.max(2, Math.round(weekly * 1.2 + 1)),
        unitCostCents: Math.round((p.price * (0.42 + rand() * 0.06)) * 2) * 50,
      };
      variants.push(vm);
      meta.variants.push(vm);
    }
  });
});
const variantById = Object.fromEntries(variants.map((v) => [v.id, v]));
const firstImage = (prodId, colorId) => `/uploads/products/p${prodId}-c${colorId}-t.webp`;

console.log('› Configuración y políticas…');
const settings = {
  store_info: {
    name: 'Exclusive', legalName: 'Exclusive Moda (empresa ficticia para fines académicos)', nit: 'CF — demostración',
    address: '6a. avenida 10-25, zona 1, Retalhuleu', phone: '+502 7700 0000', email: 'hola@exclusive.gt', whatsapp: '+502 5500 0000',
    hours: 'Lunes a sábado, 9:00 a 18:00', sellerInfo: 'Vendedor: Exclusive Moda. Datos de demostración, sin operación comercial real.',
  },
  commerce: {
    currency: 'GTQ', reservationMinutesCard: 30, reservationHoursTransfer: 48, maxQtyPerItem: 10, returnDays: 30,
    lowStockDefault: 3, rounding: 'Mitad hacia arriba, al centavo, por línea',
  },
  bank_transfer: {
    accounts: [
      { bank: 'Banco de Demostración, S.A.', type: 'Monetaria', number: '000-000000-0', holder: 'Exclusive Moda (cuenta simulada)' },
    ],
    instructions: 'Realiza la transferencia por el total exacto y sube la captura del comprobante. El pago se confirma solo después de la revisión.',
  },
  security: { maxFailedLogins: 5, lockMinutes: 15, resetTokenMinutes: 30 },
  simulation: {
    banner: 'Entorno académico: pagos, facturación y envíos simulados. Ningún documento tiene validez fiscal.',
    testCards: [
      { number: '4242 4242 4242 4242', result: 'Aprobado' },
      { number: '4000 0000 0000 0002', result: 'Rechazado (fondos insuficientes)' },
      { number: '4000 0000 0000 9995', result: 'Pendiente de confirmación' },
    ],
  },
};
for (const [key, value] of Object.entries(settings)) ins('store_settings', { key, value: json(value), updated_by: STAFF.admin.id, updated_at: SEED_CREATED });

const POLICIES = [
  ['terminos', 'Términos y condiciones de compra', 1, `Versión anterior conservada para trazabilidad de pedidos antiguos.\n\nAl confirmar un pedido aceptas que los precios se expresan en quetzales e incluyen IVA. Las existencias se reservan al confirmar el pedido.`],
  ['terminos', 'Términos y condiciones de compra', 2, `## 1. Alcance\nEstos términos regulan las compras realizadas en Exclusive. Al confirmar un pedido aceptas la versión vigente, que queda registrada en tu pedido.\n\n## 2. Precios y disponibilidad\nLos precios se expresan en quetzales (GTQ) e incluyen IVA. El total, los descuentos y el envío se calculan en nuestro servidor al confirmar. Agregar un producto al carrito no lo reserva: las existencias se reservan al confirmar el pedido y la reserva vence si el pago no se completa en el plazo indicado.\n\n## 3. Pagos\nAceptamos tarjeta, transferencia bancaria y pago contra entrega. Un comprobante de transferencia no confirma por sí solo el pago: se valida antes de preparar el pedido.\n\n## 4. Entregas\nEl tiempo de entrega depende del departamento de destino. Te notificaremos el número de guía al despachar.\n\n## 5. Cambios y devoluciones\nTienes 30 días a partir de la entrega para solicitar un cambio o devolución, según la política correspondiente.\n\n## 6. Entorno académico\nEste sitio es un proyecto académico. Los pagos, la facturación y los envíos son simulados y ningún documento tiene validez fiscal.`],
  ['privacidad', 'Política de privacidad', 1, `## Datos que recopilamos\nNombre, correo, teléfono y direcciones de entrega, necesarios para procesar tus pedidos.\n\n## Uso\nUsamos tus datos solo para gestionar compras, entregas y atención posventa. No vendemos ni compartimos tu información con terceros con fines publicitarios.\n\n## Seguridad\nLas contraseñas se almacenan cifradas con un algoritmo de hash y sal individual. El acceso a datos personales y comprobantes está restringido por roles.\n\n## Tus derechos\nPuedes actualizar tus datos desde "Mi cuenta" o solicitar su eliminación escribiendo a hola@exclusive.gt.`],
  ['cambios-y-devoluciones', 'Cambios y devoluciones', 1, `## Plazo\n30 días desde la entrega.\n\n## Condiciones\nLa prenda debe estar sin uso, con etiquetas y en su empaque. Revisamos cada prenda al recibirla antes de reintegrarla al inventario.\n\n## Proceso\n1. Solicita el cambio o la devolución desde el detalle de tu pedido.\n2. Atención al cliente revisa la solicitud.\n3. Entregas la prenda y la revisamos.\n4. Realizamos el cambio o el reembolso.\n\n## Reembolsos\nEl reembolso nunca supera lo pagado y se registra por separado de la recepción de la prenda.`],
  ['envios', 'Política de envíos', 1, `Realizamos envíos a los departamentos con cobertura. La tarifa y el tiempo estimado dependen del destino y se muestran antes de confirmar la compra. Envío gratis en compras desde Q 600.00 en productos.`],
  ['reclamos', 'Atención de reclamos', 1, `Puedes presentar un reclamo desde el detalle de tu pedido y daremos seguimiento a su estado.\n\nEste formulario interno no sustituye a los medios oficiales: también puedes acudir a la Dirección de Atención y Asistencia al Consumidor (DIACO).`],
];
POLICIES.forEach(([slug, title, version, content]) => {
  const latest = !POLICIES.some(([s, , v]) => s === slug && v > version);
  ins('policies', { id: nextId('policies'), slug, title, content, version, is_current: latest, published_at: version === 1 && slug === 'terminos' ? SEED_CREATED : gt(2026, 3, 1, 9), created_by: STAFF.admin.id });
});
const termsVersionAt = (t) => (t >= gt(2026, 3, 1, 9) ? 2 : 1);

const zones = D.DEPARTMENTS.map((d, i) => {
  const z = { id: i + 1, department: d.name, covered: d.covered, rate: decQ(d.rate), estimated_days: d.days, updated_at: SEED_CREATED };
  ins('shipping_zones', z);
  return { ...z, rateCents: d.rate * 100, daysMax: d.covered ? parseInt(d.days.match(/a (\d)/)?.[1] || '3', 10) : 0 };
});
const zoneByDept = Object.fromEntries(zones.map((z) => [z.department, z]));
for (const c of D.CARRIERS) ins('carriers', { id: c.id, name: c.name, phone: c.phone, prefix: c.prefix, active: true, created_at: SEED_CREATED });

for (const s of D.SUPPLIERS) ins('suppliers', { ...s, active: true, created_at: SEED_CREATED });

console.log('› Promociones…');
const PROMOS = [
  { name: 'Envío gratis desde Q 600', description: 'Envío sin costo cuando los productos suman Q 600.00 o más.', type: 'ENVIO_GRATIS', value: 0, scope: 'TODO', minSubtotal: 600, startsAt: gt(2025, 10, 1), endsAt: gt(2027, 12, 31, 23, 59), combinable: true },
  { name: 'Black Friday 2025', description: '25 % en toda la tienda.', type: 'PORCENTAJE', value: 25, scope: 'TODO', startsAt: gt(2025, 11, 28), endsAt: gt(2025, 12, 1, 23, 59), priority: 10 },
  { name: 'Navidad Exclusive', description: '10 % en toda la tienda del 15 al 24 de diciembre.', type: 'PORCENTAJE', value: 10, scope: 'TODO', startsAt: gt(2025, 12, 15), endsAt: gt(2025, 12, 24, 23, 59), priority: 5 },
  { name: 'Semana Santa: vestidos', description: '15 % en vestidos.', type: 'PORCENTAJE', value: 15, scope: 'CATEGORIA', categoryId: 4, startsAt: gt(2026, 3, 27), endsAt: gt(2026, 4, 5, 23, 59), priority: 5 },
  { name: 'Bono 14: shorts y camisetas', description: 'Q 20 de descuento por unidad en shorts.', type: 'MONTO_FIJO', value: 20, scope: 'CATEGORIA', categoryId: 8, startsAt: gt(2026, 7, 1), endsAt: gt(2026, 7, 15, 23, 59), priority: 3 },
  { name: 'Temporada de chaquetas', description: '15 % en chaquetas durante octubre y noviembre.', type: 'PORCENTAJE', value: 15, scope: 'CATEGORIA', categoryId: 6, startsAt: gt(2026, 10, 1), endsAt: gt(2026, 11, 30, 23, 59), priority: 5 },
  { name: 'Lanzamiento Vestido Cruzado Grana', description: '20 % en el lanzamiento del Vestido Cruzado Grana.', type: 'PORCENTAJE', value: 20, scope: 'PRODUCTO', productName: 'Vestido Cruzado Grana', startsAt: gt(2026, 10, 15), endsAt: gt(2026, 11, 15, 23, 59), priority: 6 },
  { name: 'Cupón de bienvenida', description: '10 % en tu primera compra. Se combina con otras promociones.', type: 'PORCENTAJE', value: 10, scope: 'TODO', requiresCoupon: true, combinable: true, maxDiscount: 150, startsAt: gt(2025, 10, 1), endsAt: gt(2027, 12, 31, 23, 59), coupon: { code: 'BIENVENIDA10', usageLimit: 1000, perCustomerLimit: 1 } },
  { name: 'Cupón Q 50 en compras desde Q 400', description: 'Q 50 de descuento en compras desde Q 400. No se combina.', type: 'MONTO_FIJO', value: 50, scope: 'TODO', requiresCoupon: true, combinable: false, minSubtotal: 400, startsAt: gt(2025, 10, 1), endsAt: gt(2027, 6, 30, 23, 59), coupon: { code: 'EXCLUSIVE50', usageLimit: 300, perCustomerLimit: 2 } },
  { name: 'Cupón envío gratis', description: 'Envío sin costo en cualquier compra.', type: 'ENVIO_GRATIS', value: 0, scope: 'TODO', requiresCoupon: true, combinable: true, startsAt: gt(2025, 10, 1), endsAt: gt(2027, 12, 31, 23, 59), coupon: { code: 'ENVIOGRATIS', usageLimit: 60, perCustomerLimit: 1 } },
  { name: 'Cupón verano 2026 (vencido)', description: '15 % en shorts y vestidos. Vigencia terminada.', type: 'PORCENTAJE', value: 15, scope: 'CATEGORIA', categoryId: 8, requiresCoupon: true, combinable: false, startsAt: gt(2026, 3, 1), endsAt: gt(2026, 5, 31, 23, 59), coupon: { code: 'VERANO2026', usageLimit: 200, perCustomerLimit: 1 } },
];
const promotions = [];
const coupons = {};
for (const p of PROMOS) {
  const id = nextId('promotions');
  const productId = p.productName ? products.find((x) => x.name === p.productName).id : null;
  const row = {
    id, name: p.name, description: p.description, type: p.type, value: decQ(p.value), scope: p.scope,
    category_id: p.categoryId || null, product_id: productId, min_subtotal: p.minSubtotal ? decQ(p.minSubtotal) : null,
    max_discount: p.maxDiscount ? decQ(p.maxDiscount) : null, requires_coupon: !!p.requiresCoupon, combinable: !!p.combinable,
    priority: p.priority || 0, starts_at: p.startsAt, ends_at: p.endsAt, active: true, created_by: STAFF.admin.id,
    created_at: addD(p.startsAt < SEED_CREATED ? SEED_CREATED : p.startsAt, -3), updated_at: addD(p.startsAt < SEED_CREATED ? SEED_CREATED : p.startsAt, -3),
  };
  ins('promotions', row);
  const engine = {
    id, name: p.name, type: p.type, value: String(p.value), scope: p.scope, categoryId: p.categoryId || null, productId,
    minSubtotal: p.minSubtotal ? String(p.minSubtotal) : null, maxDiscount: p.maxDiscount ? String(p.maxDiscount) : null,
    requiresCoupon: !!p.requiresCoupon, combinable: !!p.combinable, priority: p.priority || 0, startsAt: p.startsAt, endsAt: p.endsAt, active: true,
  };
  promotions.push(engine);
  if (p.coupon) {
    const cid = nextId('coupons');
    coupons[p.coupon.code] = { id: cid, code: p.coupon.code, promotion: engine, used: 0, usageLimit: p.coupon.usageLimit, perCustomer: p.coupon.perCustomerLimit, byCustomer: {} };
  }
}

console.log('› Simulando un año de operación…');
class Heap {
  constructor() { this.a = []; }
  push(e) { const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].t <= a[i].t) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  peek() { return this.a[0]; }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < a.length && a[l].t < a[m].t) m = l; if (r < a.length && a[r].t < a[m].t) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}
const queue = new Heap();
let seq = 0;
const schedule = (t, type, data) => queue.push({ t: t.getTime() + (seq++ % 1000) / 1000, time: t, type, data });

const movements = [];
const stockoutsByCatWeek = {};
const weekKey = (t) => {
  const l = local(t);
  const dow = (l.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
};
function move(v, t, type, direction, qty, extra = {}) {
  const pb = v.physical; const rb = v.reserved;
  if (direction === 'ENTRADA') v.physical += qty; else v.physical -= qty;
  if (extra.consumeReserved) v.reserved -= qty;
  if (v.physical < 0 || v.reserved < 0 || v.reserved > v.physical) throw new Error(`Inconsistencia de existencias ${v.sku} ${type}`);
  const m = {
    id: 0, variant_id: v.id, type, direction, quantity: qty, physical_before: pb, physical_after: v.physical, reserved_before: rb, reserved_after: v.reserved,
    unit_cost: extra.unitCostCents != null ? dec(extra.unitCostCents) : null, reason: extra.reason, reference_type: extra.refType || null,
    reference_id: extra.refId || null, reference_code: extra.refCode || null, document_ref: extra.doc || null, supplier_id: extra.supplierId || null,
    corrects_id: null, idempotency_key: extra.key || null, user_id: extra.user ? extra.user.id : null, user_email: extra.user ? extra.user.email : null,
    created_at: t, _t: t.getTime(),
  };
  movements.push(m);
  if (v.physical - v.reserved === 0) {
    const k = `${v.product.cat.id}|${weekKey(t)}`;
    stockoutsByCatWeek[k] = (stockoutsByCatWeek[k] || 0) + 1;
  }
  return m;
}

for (const p of products) {
  const t = p.created === SEED_CREATED ? gt(2025, 10, 18, 10) : addH(p.created, -2);
  for (const v of p.variants) {
    const qty = v.target + randint(0, 3);
    move(v, t, 'INVENTARIO_INICIAL', 'ENTRADA', qty, { reason: 'Inventario inicial de apertura', refType: 'INICIAL', unitCostCents: v.unitCostCents, user: STAFF.inventario, key: `INICIAL:${v.id}` });
  }
}

const purchases = [];
for (let w = 0; w < 60; w++) {
  const t = addD(gt(2025, 10, 20, 7, 30), w * 7);
  if (t > NOW) break;
  schedule(t, 'restock', {});
}
for (let w = 1; w < 52; w += 2) schedule(addD(gt(2025, 10, 22, 15, 10), w * 7 + randint(0, 3)), 'adjust', {});

function seasonFactor(cat, t) {
  const m = monthOf(t); const d = dayOf(t);
  let f = 1;
  if (cat.season === 'calido') f *= [0.8, 0.85, 1.25, 1.4, 1.3, 1.1, 1.1, 1.05, 1, 0.95, 0.85, 0.85][m - 1];
  if (cat.season === 'frio') f *= [1.45, 1.25, 0.75, 0.6, 0.65, 0.85, 0.9, 0.9, 0.95, 1.15, 1.4, 1.6][m - 1];
  if (m === 11 && d >= 24 && d <= 30) f *= 2.1;
  if (m === 12 && d <= 1) f *= 2.1;
  if (m === 12 && d >= 2 && d <= 24) f *= 1.6;
  if (m === 12 && d > 24) f *= 0.9;
  if (m === 1) f *= 0.72;
  if (m === 7 && d <= 15) f *= 1.3;
  if (m === 9 && d <= 15) f *= 1.15;
  if (m === 5 && d >= 1 && d <= 10 && [2, 4, 5].includes(cat.id)) f *= 1.35;
  return f;
}
const trend = (t) => 1 + 0.22 * ((t - START) / (365 * 864e5));

const orders = [];
const plannedUnits = [];
const DOW = [1.15, 0.9, 0.95, 0.95, 1.0, 1.1, 1.2];
for (let week = 0; ; week++) {
  const weekStart = addD(START, week * 7);
  if (weekStart > NOW) break;
  for (const cat of D.CATEGORIES) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const dayStart = addD(weekStart, d);
      if (dayStart > NOW) break;
      days.push({ dayStart, lambda: (cat.base * 0.9 / 7) * DOW[local(dayStart).getUTCDay()] * seasonFactor(cat, addH(dayStart, 12)) * trend(dayStart) });
    }
    const lambdaWeek = days.reduce((a, x) => a + x.lambda, 0);
    const units = Math.max(0, Math.round(lambdaWeek * (1 + 0.12 * gauss())));
    for (let u = 0; u < units; u++) {
      const day = weighted(days, (x) => x.lambda);
      const hour = weighted([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], (h) => (h >= 19 && h <= 22 ? 3 : h >= 12 && h <= 14 ? 2 : 1));
      const t = addH(day.dayStart, hour + rand());
      if (t < addH(NOW, -0.25)) plannedUnits.push({ t, cat });
    }
  }
}
plannedUnits.sort((a, b) => a.t - b.t);
const baskets = [];
for (let i = 0; i < plannedUnits.length;) {
  const size = weighted([1, 2, 3], (k) => [0.55, 0.32, 0.13][k - 1]);
  const group = plannedUnits.slice(i, i + size);
  baskets.push({ t: group[0].t, cats: group.map((g) => g.cat) });
  i += size;
}

const SCENARIOS = [
  { t: gt(2025, 11, 29, 20, 15), customer: CLIENT, items: [['Sudadera con Capucha Esencial', 'Gris jaspe', 'M', 1], ['Jeans Recto Clásico', 'Denim', 'S', 1]], method: 'TARJETA', fate: 'ENTREGADO' },
  { t: gt(2026, 3, 30, 19, 40), customer: CLIENT, items: [['Vestido Midi Floral', 'Crudo', 'S', 1]], method: 'TRANSFERENCIA', fate: 'ENTREGADO', coupon: 'BIENVENIDA10' },
  { t: gt(2026, 8, 20, 21, 5), customer: CLIENT, items: [['Camiseta Básica Pima', 'Blanco', 'S', 2]], method: 'CONTRA_ENTREGA', fate: 'ENTREGADO' },
  { t: gt(2026, 10, 2, 20, 30), customer: CLIENT, items: [['Falda Midi Plisada', 'Oliva', 'S', 1], ['Blusa Satinada Volcán', 'Crudo', 'S', 1]], method: 'TARJETA', fate: 'ENTREGADO', postSale: { type: 'DEVOLUCION', at: gt(2026, 10, 20, 18, 45), itemIdx: 0, reason: 'La talla no me quedó', description: 'La falda me quedó grande de cintura. Quisiera devolverla; está sin uso y con etiquetas.', status: 'SOLICITADA' } },
  { t: gt(2026, 10, 21, 19, 10), customer: CLIENT, items: [['Cortavientos Pacaya', 'Verde jade', 'M', 1]], method: 'TARJETA', fate: 'EN_TRANSITO' },
  { t: gt(2026, 10, 23, 10, 15), customer: CLIENT, items: [['Vestido Cruzado Grana', 'Rojo grana', 'S', 1]], method: 'TRANSFERENCIA', fate: 'EN_REVISION' },
  { t: gt(2026, 10, 22, 20, 10), customerIdx: 3, items: [['Chaqueta Denim Clásica', 'Denim', 'M', 1], ['Camiseta Básica Pima', 'Negro', 'M', 1]], method: 'TRANSFERENCIA', fate: 'EN_REVISION' },
  { t: gt(2026, 10, 23, 9, 40), customerIdx: 7, items: [['Sudadera con Capucha Esencial', 'Verde jade', 'L', 1]], method: 'TRANSFERENCIA', fate: 'EN_REVISION' },
  { t: gt(2026, 10, 23, 11, 5), customerIdx: 9, items: [['Blazer Estructurado', 'Negro', 'S', 1]], method: 'TARJETA', fate: 'CONFIRMADO' },
  { t: gt(2026, 10, 23, 8, 20), customerIdx: 11, items: [['Pantalón Chino Slim', 'Arena', 'M', 1], ['Camisa Oxford Clásica', 'Celeste', 'M', 1]], method: 'CONTRA_ENTREGA', fate: 'CONFIRMADO' },
  { t: gt(2026, 10, 22, 15, 30), customerIdx: 13, items: [['Cortavientos Pacaya', 'Mostaza', 'M', 1]], method: 'TARJETA', fate: 'EN_PREPARACION' },
  { t: gt(2026, 10, 22, 18, 45), customerIdx: 15, items: [['Vestido Midi Floral', 'Crudo', 'M', 1], ['Falda Midi Plisada', 'Negro', 'S', 1]], method: 'TARJETA', fate: 'EN_PREPARACION' },
  { t: gt(2026, 10, 23, 15, 50), customerIdx: 17, items: [['Jeans Recto Clásico', 'Denim', 'M', 1]], method: 'TRANSFERENCIA', fate: 'PENDIENTE' },
];

function findVariant(name, colorName, sizeCode) {
  const p = products.find((x) => x.name === name);
  return p.variants.find((v) => v.color.name === colorName && v.size.code === sizeCode);
}

const arrivals = [
  ...baskets.map((b) => ({ ...b, kind: 'basket' })),
  ...SCENARIOS.map((s) => ({ ...s, kind: 'scenario' })),
].sort((a, b) => a.t - b.t);

function processEventsUntil(t) {
  while (queue.size && queue.peek().time <= t) {
    const e = queue.pop();
    handlers[e.type](e.time, e.data);
  }
}

const reservationsByOrder = {};
const handlers = {
  restock(t) {
    const bySupplier = {};
    for (const v of variants) {
      if (v.created > t) continue;
      const available = v.physical - v.reserved;
      const lean = t > addD(NOW, -21) && v.id % 3 === 0;
      if (available <= (lean ? 0 : v.reorder)) {
        const qty = v.target - available + randint(0, 2);
        if (qty <= 0) continue;
        const sid = v.product.cat.supplier;
        (bySupplier[sid] = bySupplier[sid] || []).push({ v, qty });
      }
    }
    for (const [sid, lines] of Object.entries(bySupplier)) {
      const id = nextId('purchases');
      const code = `COM-${String(99 + id).padStart(6, '0')}`;
      const doc = `FAC-${D.SUPPLIERS[sid - 1].name.slice(0, 3).toUpperCase()}-${randint(10000, 99999)}`;
      let total = 0;
      const items = lines.map(({ v, qty }) => {
        const subtotal = v.unitCostCents * qty;
        total += subtotal;
        return { id: nextId('purchase_items'), purchase_id: id, variant_id: v.id, quantity: qty, unit_cost: dec(v.unitCostCents), subtotal: dec(subtotal), v };
      });
      const pur = {
        id, code, supplier_id: Number(sid), document_number: doc, purchase_date: dateOnly(t), status: 'REGISTRADA', total: dec(total),
        notes: 'Reabastecimiento semanal', idempotency_key: `seed-purchase-${id}`, created_by: STAFF.inventario.id, created_at: t,
      };
      purchases.push({ row: pur, items });
      for (const it of items) {
        move(it.v, t, 'ENTRADA_COMPRA', 'ENTRADA', it.quantity, {
          reason: `Compra a proveedor ${code}`, refType: 'COMPRA', refId: id, refCode: code, doc, supplierId: Number(sid),
          unitCostCents: it.v.unitCostCents, user: STAFF.inventario, key: `COMPRA:${id}:${it.v.id}`,
        });
      }
      audit(t, STAFF.inventario, 'inventory-service', 'PURCHASE_CREATED', 'purchase', id, null, { code, supplierId: Number(sid), documentNumber: doc, total: fromCents(total), items: items.length });
    }
  },
  adjust(t) {
    const v = pick(variants.filter((x) => x.created <= t && x.physical - x.reserved > 2));
    if (!v) return;
    const kind = weighted(['SALIDA_DANIO', 'SALIDA_PERDIDA', 'ENTRADA_AJUSTE', 'SALIDA_AJUSTE'], (k) => ({ SALIDA_DANIO: 4, SALIDA_PERDIDA: 1, ENTRADA_AJUSTE: 2, SALIDA_AJUSTE: 1 })[k]);
    const reasons = {
      SALIDA_DANIO: 'Prenda con mancha detectada en revisión de bodega',
      SALIDA_PERDIDA: 'Faltante detectado en conteo físico',
      ENTRADA_AJUSTE: 'Sobrante detectado en conteo físico',
      SALIDA_AJUSTE: 'Ajuste por diferencia en conteo cíclico',
    };
    const id = nextId('adjustments');
    const m = move(v, t, kind, kind.startsWith('ENTRADA') ? 'ENTRADA' : 'SALIDA', 1, { reason: reasons[kind], refType: 'AJUSTE', refId: id, refCode: `AJ-${String(id).padStart(5, '0')}`, user: STAFF.inventario, key: `AJUSTE:${id}` });
    audit(t, STAFF.inventario, 'inventory-service', 'INVENTORY_ADJUSTED', 'variant', v.id, null, { type: kind, quantity: 1, reason: reasons[kind], sku: v.sku, movementTempId: m._t });
  },
  release(t, { order, reason }) {
    for (const r of reservationsByOrder[order.id] || []) {
      if (r.status !== 'ACTIVA' && r.status !== 'CONFIRMADA') continue;
      r.v.reserved -= r.quantity;
      r.status = 'LIBERADA';
      r.release_reason = reason;
      r.updated_at = t;
    }
  },
  confirmReservation(t, { order }) {
    for (const r of reservationsByOrder[order.id] || []) if (r.status === 'ACTIVA') { r.status = 'CONFIRMADA'; r.expires_at = null; r.updated_at = t; }
  },
  dispatch(t, { order }) {
    for (const r of reservationsByOrder[order.id] || []) {
      if (r.status === 'LIBERADA' || r.status === 'CONSUMIDA') continue;
      move(r.v, t, 'SALIDA_VENTA', 'SALIDA', r.quantity, {
        consumeReserved: true, reason: `Despacho del pedido ${order.code}`, refType: 'PEDIDO', refId: order.id, refCode: order.code,
        user: STAFF.ventas, key: `DESPACHO:${order.id}:${r.v.id}`, unitCostCents: r.v.unitCostCents,
      });
      r.status = 'CONSUMIDA'; r.updated_at = t;
    }
  },
  restockReturn(t, { order, ps, item, qty, v }) {
    move(v, t, 'ENTRADA_DEVOLUCION', 'ENTRADA', qty, {
      reason: `Devolución ${ps.code} reintegrada tras revisión`, refType: 'POSVENTA', refId: ps.id, refCode: ps.code,
      user: STAFF.atencion, key: `DEVOLUCION:${ps.id}:${item.id}`, unitCostCents: v.unitCostCents,
    });
  },
  exchangeOut(t, { ps, v, plan }) {
    if (v.physical - v.reserved < 1) { plan.exchangeFailed = true; return; }
    move(v, t, 'SALIDA_CAMBIO', 'SALIDA', 1, {
      reason: `Entrega por cambio ${ps.code}`, refType: 'POSVENTA', refId: ps.id, refCode: ps.code, user: STAFF.atencion, key: `CAMBIO:${ps.id}:${v.id}`, unitCostCents: v.unitCostCents,
    });
  },
};

const auditRows = [];
function audit(t, user, service, action, entity, entityId, before, after) {
  auditRows.push({
    id: 0, service, action, entity, entity_id: entityId != null ? String(entityId) : null, user_id: user ? user.id : null, user_email: user ? user.email : null,
    before: before ? json(before) : null, after: after ? json(after) : null, ip: '192.168.1.' + randint(10, 60), request_id: crypto.randomUUID(), created_at: t, _t: t.getTime(),
  });
}

const histories = [];
const payments = [];
const documents = [];
const shipments = [];
const shipmentEvents = [];
const postSales = [];
const refunds = [];
const redemptions = [];
const notifications = [];
let orderSeq = 1000;

function hist(order, kind, from, to, t, user, note) {
  if (t > NOW) return false;
  histories.push({ id: 0, order_id: order.id, kind, from_status: from, to_status: to, note: note || null, user_id: user ? user.id : null, user_email: user ? user.email : null, created_at: t, _t: t.getTime() });
  return true;
}

function chooseCustomer(t) {
  const pool = customers.filter((c) => c.user.created_at <= t && c.user.id !== CLIENT.id);
  return weighted(pool, (c) => c.loyalty);
}

function chooseVariant(cat, t) {
  const prods = products.filter((p) => p.cat.id === cat.id && p.created <= t);
  if (!prods.length) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = weighted(prods, (x) => x.p * (x.created > addD(t, -45) ? 1.6 : 1));
    const colorWeights = (v) => (v.color.id === p.colors[0] ? 1.35 : 1) * D.SIZE_WEIGHTS[v.size.id];
    const v = weighted(p.variants, colorWeights);
    if (v.physical - v.reserved >= 1) return v;
    const alt = p.variants.filter((x) => x.size.id === v.size.id && x.physical - x.reserved >= 1);
    if (alt.length) return pick(alt);
  }
  return null;
}

function createOrder({ t, customer, lines, method, couponCode, fate, postSalePlan }) {
  processEventsUntil(t);
  for (const l of lines) if (l.v.physical - l.v.reserved < l.qty) return null;
  const address = customer.addresses.find((a) => a.is_default) || customer.addresses[0];
  const zone = zoneByDept[address.department];
  let coupon = null;
  if (couponCode) {
    const c = coupons[couponCode];
    const usedByCustomer = c.byCustomer[customer.user.id] || 0;
    if (c.used < c.usageLimit && usedByCustomer < c.perCustomer) coupon = { code: c.code, promotion: c.promotion };
  }
  const quote = calculateQuote({
    lines: lines.map((l) => ({ variantId: l.v.id, productId: l.v.product.id, categoryId: l.v.product.cat.id, unitPriceCents: l.v.product.priceCents, quantity: l.qty })),
    promotions,
    coupon,
    shippingZone: { id: zone.id, department: zone.department, covered: zone.covered, rate: fromCents(zone.rateCents) },
    now: t,
  });
  const useCoupon = coupon && quote.coupon && quote.coupon.valid;
  const id = nextId('orders');
  const code = `EXC-${String(orderSeq++).padStart(6, '0')}`;
  const expires = method === 'TARJETA' ? addH(t, 0.5) : method === 'TRANSFERENCIA' ? addH(t, 48) : null;
  const order = {
    id, code, customer_id: customer.user.id, idempotency_key: crypto.randomUUID(), status: 'PENDIENTE_PAGO', payment_status: 'PENDIENTE',
    shipping_status: 'PENDIENTE', payment_method: method, subtotal: dec(quote.subtotalCents), discount_total: dec(quote.discountCents),
    shipping_cost: dec(quote.shippingCents), shipping_discount: dec(quote.shippingDiscountCents), total: dec(quote.totalCents),
    amount_paid: dec(0), amount_refunded: dec(0), currency: 'GTQ', coupon_code: useCoupon ? coupon.code : null, shipping_zone_id: zone.id,
    address_snapshot: json({
      recipientName: address.recipient_name, phone: address.phone, department: address.department, municipality: address.municipality,
      line1: address.line1, reference: address.reference, label: address.label,
    }),
    pricing_snapshot: json({ appliedPromotions: quote.appliedPromotions.map((a) => ({ id: a.id, name: a.name, amount: fromCents(a.amountCents), kind: a.kind })), coupon: useCoupon ? { code: coupon.code, amount: fromCents(quote.coupon.amountCents) } : null }),
    terms_version: termsVersionAt(t), customer_note: null, reservation_expires_at: expires, cancel_reason: null, cancelled_at: null, delivered_at: null,
    is_simulation: true, created_at: t, updated_at: t,
    _totalCents: quote.totalCents, _customer: customer, _zone: zone, _items: [],
  };
  orders.push(order);
  quote.lines.forEach((ql, i) => {
    const l = lines[i];
    const item = {
      id: nextId('order_items'), order_id: id, product_id: l.v.product.id, variant_id: l.v.id, category_id: l.v.product.cat.id, sku: l.v.sku,
      product_name: l.v.product.name, size_name: l.v.size.code, color_name: l.v.color.name, image_url: firstImage(l.v.product.id, l.v.color.id),
      unit_price: dec(ql.unitPriceCents), discount_amount: dec(ql.discountCents), quantity: ql.quantity, line_total: dec(ql.lineTotalCents),
      promotion_name: ql.promotionName, _lineTotalCents: ql.lineTotalCents, _v: l.v,
    };
    order._items.push(item);
  });
  if (useCoupon) {
    const c = coupons[coupon.code];
    c.used++; c.byCustomer[customer.user.id] = (c.byCustomer[customer.user.id] || 0) + 1;
    redemptions.push({ id: 0, coupon_id: c.id, order_id: id, customer_id: customer.user.id, amount: dec(quote.coupon.amountCents), reversed_at: null, created_at: t, _c: c });
  }
  reservationsByOrder[id] = order._items.map((it) => {
    it._v.reserved += it.quantity;
    return { id: 0, order_id: id, variant_id: it._v.id, quantity: it.quantity, status: 'ACTIVA', expires_at: expires, release_reason: null, created_at: t, updated_at: t, v: it._v };
  });
  hist(order, 'PEDIDO', null, 'PENDIENTE_PAGO', t, customer.user, 'Pedido creado');
  hist(order, 'PAGO', null, 'PENDIENTE', t, customer.user, `Método: ${method}`);
  hist(order, 'ENVIO', null, 'PENDIENTE', t, customer.user);
  if (t <= NOW) {
    notifications.push({ userId: customer.user.id, type: 'PEDIDO', title: `Recibimos tu pedido ${code}`, body: `Total Q ${fromCents(quote.totalCents)}. Te avisaremos cada cambio de estado.`, link: `/cuenta/pedidos/${code}`, t });
  }
  planLifecycle(order, { method, fate, postSalePlan });
  return order;
}

function setStatus(order, kind, field, to, t, user, note) {
  const from = order[field];
  if (hist(order, kind, from, to, t, user, note)) { order[field] = to; order.updated_at = t; return true; }
  return false;
}

function addPayment(order, t, method, status, { amountCents, last4, brand, message, receipt, reviewed, reviewer, reviewNote }) {
  if (t > NOW) return null;
  const p = {
    id: nextId('payments'), order_id: order.id, method, status, amount: dec(amountCents), reference: '', card_brand: brand || null, card_last4: last4 || null,
    receipt_path: receipt || null, receipt_mime: receipt ? 'image/png' : null, response_message: message || null,
    reviewed_by: reviewed && reviewed <= NOW ? reviewer.id : null, reviewed_at: reviewed && reviewed <= NOW ? reviewed : null, review_note: reviewed && reviewed <= NOW ? reviewNote || null : null,
    idempotency_key: crypto.randomUUID(), is_simulation: true, created_at: t, updated_at: reviewed && reviewed <= NOW ? reviewed : t, _t: t.getTime(),
  };
  payments.push(p);
  return p;
}

function issueDocument(order, t) {
  if (t > NOW) return;
  const c = order._customer.user;
  documents.push({
    id: 0, order_id: order.id, number: '', type: 'COMPROBANTE_SIMULADO', total: order.total, voided: false, issued_at: t, _t: t.getTime(),
    snapshot: json({
      legend: 'SIMULACIÓN — SIN VALIDEZ FISCAL', orderCode: order.code, customer: { name: `${c.first_name} ${c.last_name}`, nit: 'CF', email: c.email },
      items: order._items.map((i) => ({ sku: i.sku, description: `${i.product_name} · ${i.color_name} · ${i.size_name}`, quantity: i.quantity, unitPrice: i.unit_price.v, discount: i.discount_amount.v, total: i.line_total.v })),
      subtotal: order.subtotal.v, discount: order.discount_total.v, shipping: fromCents(toCents(order.shipping_cost.v) - toCents(order.shipping_discount.v)), total: order.total.v,
      paymentMethod: order.payment_method,
    }),
  });
}

function cancelOrder(order, t, user, reason, { refundIfPaid = true } = {}) {
  if (t > NOW) return;
  setStatus(order, 'PEDIDO', 'status', 'CANCELADO', t, user, reason);
  order.cancel_reason = reason; order.cancelled_at = t;
  schedule(t, 'release', { order, reason });
  const red = redemptions.find((r) => r.order_id === order.id);
  if (red) { red.reversed_at = t; red._c.used--; }
  if (refundIfPaid && toCents(order.amount_paid.v) > 0) {
    const pay = payments.filter((p) => p.order_id === order.id && p.status === 'APROBADO').pop();
    const amount = toCents(order.amount_paid.v);
    refunds.push({ id: 0, payment_id: pay.id, order_id: order.id, post_sale_request_id: null, amount: dec(amount), reason: 'Cancelación del pedido', reference: '', idempotency_key: crypto.randomUUID(), is_simulation: true, created_by: STAFF.ventas.id, created_at: addH(t, 1), _t: addH(t, 1).getTime() });
    order.amount_refunded = dec(amount);
    setStatus(order, 'PAGO', 'payment_status', 'REEMBOLSADO', addH(t, 1), STAFF.ventas, 'Reembolso simulado por cancelación');
  }
}

function planLifecycle(order, { method, fate, postSalePlan }) {
  const t0 = new Date(order.created_at.getTime());
  const cust = order._customer.user;
  const total = order._totalCents;
  let confirmedAt = null;

  if (method === 'TARJETA') {
    const outcome = fate && fate !== 'RANDOM' ? 'ok' : weighted(['ok', 'retry', 'fail'], (k) => ({ ok: 0.93, retry: 0.05, fail: 0.02 })[k]);
    const last4 = pick(['4242', '4242', '1881', '5556']);
    if (outcome === 'retry') {
      const t1 = addH(t0, 0.03);
      addPayment(order, t1, 'TARJETA', 'RECHAZADO', { amountCents: total, last4: '0002', brand: 'VISA', message: 'Fondos insuficientes (simulado)' });
      setStatus(order, 'PAGO', 'payment_status', 'RECHAZADO', t1, cust, 'Tarjeta rechazada (simulado)');
    }
    if (outcome === 'fail') {
      const t1 = addH(t0, 0.03);
      addPayment(order, t1, 'TARJETA', 'RECHAZADO', { amountCents: total, last4: '0002', brand: 'VISA', message: 'Fondos insuficientes (simulado)' });
      setStatus(order, 'PAGO', 'payment_status', 'RECHAZADO', t1, cust, 'Tarjeta rechazada (simulado)');
      cancelOrder(order, addH(t0, 0.5), null, 'Reserva vencida: no se completó el pago');
      return;
    }
    confirmedAt = addH(t0, outcome === 'retry' ? 0.08 : 0.02);
    if (confirmedAt > NOW) return;
    addPayment(order, confirmedAt, 'TARJETA', 'APROBADO', { amountCents: total, last4, brand: last4 === '5556' ? 'MASTERCARD' : 'VISA', message: 'Aprobado (simulado)' });
    setStatus(order, 'PAGO', 'payment_status', 'APROBADO', confirmedAt, cust, 'Pago con tarjeta aprobado (simulado)');
    order.amount_paid = dec(total);
  } else if (method === 'TRANSFERENCIA') {
    if (fate === 'PENDIENTE') return;
    const neverPays = fate ? false : chance(0.08);
    if (neverPays) { cancelOrder(order, addH(t0, 48), null, 'Reserva vencida: no se recibió el comprobante de transferencia'); return; }
    const uploaded = addH(t0, 0.5 + rand() * 6);
    if (uploaded > NOW) return;
    const reviewAt = fate === 'EN_REVISION' ? addH(NOW, 5) : businessTime(addH(uploaded, 1 + rand() * 16));
    const rejected = fate ? false : chance(0.03);
    const pay = addPayment(order, uploaded, 'TRANSFERENCIA', reviewAt <= NOW ? (rejected ? 'RECHAZADO' : 'APROBADO') : 'EN_REVISION', {
      amountCents: total, receipt: 'demo-transferencia.png', reviewed: reviewAt, reviewer: STAFF.ventas,
      reviewNote: rejected ? 'El monto del comprobante no coincide con el total del pedido.' : 'Comprobante verificado contra el estado de cuenta (simulado).',
      message: 'Comprobante de transferencia recibido',
    });
    setStatus(order, 'PAGO', 'payment_status', 'EN_REVISION', uploaded, cust, 'Comprobante de transferencia cargado');
    order.reservation_expires_at = null;
    for (const r of reservationsByOrder[order.id]) r.expires_at = null;
    if (reviewAt > NOW) return;
    audit(reviewAt, STAFF.ventas, 'sales-service', rejected ? 'PAYMENT_REJECTED' : 'PAYMENT_APPROVED', 'payment', pay.id, { status: 'EN_REVISION' }, { status: rejected ? 'RECHAZADO' : 'APROBADO', orderCode: order.code });
    if (rejected) {
      setStatus(order, 'PAGO', 'payment_status', 'RECHAZADO', reviewAt, STAFF.ventas, 'Comprobante rechazado');
      cancelOrder(order, addH(reviewAt, 24), null, 'Reserva vencida: el comprobante no fue válido');
      return;
    }
    confirmedAt = reviewAt;
    setStatus(order, 'PAGO', 'payment_status', 'APROBADO', confirmedAt, STAFF.ventas, 'Transferencia verificada');
    order.amount_paid = dec(total);
  } else {
    confirmedAt = addH(t0, 0.01);
  }
  if (confirmedAt > NOW) return;
  setStatus(order, 'PEDIDO', 'status', 'CONFIRMADO', confirmedAt, method === 'CONTRA_ENTREGA' ? cust : null, method === 'CONTRA_ENTREGA' ? 'Pago contra entrega: se cobra al entregar' : 'Pago confirmado');
  order.reservation_expires_at = null;
  schedule(confirmedAt, 'confirmReservation', { order });
  if (method !== 'CONTRA_ENTREGA') issueDocument(order, confirmedAt);
  notifications.push({ userId: cust.id, type: 'PEDIDO', title: `Pedido ${order.code} confirmado`, body: 'Estamos preparando tus prendas.', link: `/cuenta/pedidos/${order.code}`, t: confirmedAt });
  if (fate === 'CONFIRMADO') return;

  if (!fate && chance(0.018)) {
    cancelOrder(order, addH(confirmedAt, 2 + rand() * 10), cust, 'Cancelado por el cliente antes de la preparación');
    return;
  }

  const preparedAt = businessTime(addH(confirmedAt, 2 + rand() * 18));
  if (preparedAt > NOW) return;
  setStatus(order, 'PEDIDO', 'status', 'EN_PREPARACION', preparedAt, STAFF.ventas, 'Pedido en preparación');
  setStatus(order, 'ENVIO', 'shipping_status', 'PREPARANDO', preparedAt, STAFF.ventas);
  const shipment = { id: nextId('shipments'), order_id: order.id, carrier_id: null, tracking_number: null, status: 'PREPARANDO', dispatched_at: null, delivered_at: null, received_by: null, created_at: preparedAt, updated_at: preparedAt };
  shipments.push(shipment);
  shipmentEvents.push({ shipment_id: shipment.id, status: 'PREPARANDO', description: 'Pedido en preparación en bodega', location: 'Bodega central, Retalhuleu', is_incident: false, user_id: STAFF.ventas.id, created_at: preparedAt });
  if (fate === 'EN_PREPARACION') return;

  const dispatchedAt = businessTime(addH(preparedAt, 3 + rand() * 20));
  if (dispatchedAt > NOW) return;
  const dept = order._zone.department;
  const carrier = dept === 'Guatemala' && chance(0.7) ? D.CARRIERS[0] : pick(D.CARRIERS.slice(1));
  shipment.carrier_id = carrier.id;
  shipment.tracking_number = `${carrier.prefix}${String(order.id).padStart(5, '0')}${randint(100, 999)}`;
  shipment.status = 'DESPACHADO'; shipment.dispatched_at = dispatchedAt; shipment.updated_at = dispatchedAt;
  schedule(dispatchedAt, 'dispatch', { order });
  setStatus(order, 'PEDIDO', 'status', 'ENVIADO', dispatchedAt, STAFF.ventas, `Despachado con ${carrier.name}`);
  setStatus(order, 'ENVIO', 'shipping_status', 'DESPACHADO', dispatchedAt, STAFF.ventas, `Guía ${shipment.tracking_number}`);
  shipmentEvents.push({ shipment_id: shipment.id, status: 'DESPACHADO', description: `Entregado a ${carrier.name}. Guía ${shipment.tracking_number} (ficticia)`, location: 'Bodega central, Retalhuleu', is_incident: false, user_id: STAFF.ventas.id, created_at: dispatchedAt });
  if (dispatchedAt > addD(NOW, -30)) audit(dispatchedAt, STAFF.ventas, 'sales-service', 'ORDER_DISPATCHED', 'order', order.id, { status: 'EN_PREPARACION' }, { status: 'ENVIADO', carrier: carrier.name, tracking: shipment.tracking_number });
  notifications.push({ userId: cust.id, type: 'ENVIO', title: `Tu pedido ${order.code} va en camino`, body: `Guía ${shipment.tracking_number} con ${carrier.name}.`, link: `/cuenta/pedidos/${order.code}`, t: dispatchedAt });

  const transitAt = addH(dispatchedAt, 4 + rand() * 10);
  if (transitAt > NOW) return;
  setStatus(order, 'ENVIO', 'shipping_status', 'EN_TRANSITO', transitAt, STAFF.ventas);
  shipment.status = 'EN_TRANSITO'; shipment.updated_at = transitAt;
  shipmentEvents.push({ shipment_id: shipment.id, status: 'EN_TRANSITO', description: 'En ruta hacia el destino', location: `Centro de distribución ${dept}`, is_incident: false, user_id: STAFF.ventas.id, created_at: transitAt });
  if (fate === 'EN_TRANSITO') return;

  let deliveredAt = businessTime(addH(dispatchedAt, 24 * (1 + rand() * (order._zone.daysMax - 0.5))));
  if (!fate && chance(0.025)) {
    const incAt = businessTime(addH(transitAt, 20));
    if (incAt <= NOW) {
      setStatus(order, 'ENVIO', 'shipping_status', 'INCIDENCIA', incAt, STAFF.ventas, 'Dirección incompleta');
      shipmentEvents.push({ shipment_id: shipment.id, status: 'INCIDENCIA', description: 'No se encontró la dirección; se contactó al cliente para confirmar referencias', location: dept, is_incident: true, user_id: STAFF.ventas.id, created_at: incAt });
      const back = addH(incAt, 6);
      if (back <= NOW) {
        setStatus(order, 'ENVIO', 'shipping_status', 'EN_TRANSITO', back, STAFF.ventas, 'Entrega reprogramada');
        shipmentEvents.push({ shipment_id: shipment.id, status: 'EN_TRANSITO', description: 'Entrega reprogramada con referencias actualizadas', location: dept, is_incident: false, user_id: STAFF.ventas.id, created_at: back });
      }
      deliveredAt = businessTime(addH(incAt, 26));
    }
  }
  if (deliveredAt > NOW) return;
  const receiver = `${cust.first_name.split(' ')[0]} ${cust.last_name.split(' ')[0]}`;
  shipment.status = 'ENTREGADO'; shipment.delivered_at = deliveredAt; shipment.received_by = receiver; shipment.updated_at = deliveredAt;
  shipmentEvents.push({ shipment_id: shipment.id, status: 'ENTREGADO', description: `Recibido por ${receiver}`, location: `${order._zone.department}`, is_incident: false, user_id: STAFF.ventas.id, created_at: deliveredAt });
  setStatus(order, 'ENVIO', 'shipping_status', 'ENTREGADO', deliveredAt, STAFF.ventas);
  setStatus(order, 'PEDIDO', 'status', 'ENTREGADO', deliveredAt, STAFF.ventas, 'Entrega confirmada');
  order.delivered_at = deliveredAt;
  if (method === 'CONTRA_ENTREGA') {
    addPayment(order, deliveredAt, 'CONTRA_ENTREGA', 'APROBADO', { amountCents: total, message: 'Cobro contra entrega registrado (simulado)', reviewed: deliveredAt, reviewer: STAFF.ventas, reviewNote: 'Efectivo recibido por el mensajero (simulado)' });
    setStatus(order, 'PAGO', 'payment_status', 'APROBADO', deliveredAt, STAFF.ventas, 'Cobro contra entrega');
    order.amount_paid = dec(total);
    issueDocument(order, deliveredAt);
  }
  notifications.push({ userId: cust.id, type: 'ENVIO', title: `Pedido ${order.code} entregado`, body: '¡Gracias por comprar en Exclusive!', link: `/cuenta/pedidos/${order.code}`, t: deliveredAt });

  let plan = postSalePlan;
  if (!plan && !fate) {
    const r = rand();
    if (r < 0.035) plan = { type: 'DEVOLUCION' };
    else if (r < 0.05) plan = { type: 'CAMBIO' };
    else if (r < 0.06) plan = { type: 'RECLAMO' };
  }
  if (plan) planPostSale(order, deliveredAt, plan);
}

function planPostSale(order, deliveredAt, plan) {
  const cust = order._customer.user;
  const at = plan.at || addH(deliveredAt, 24 * (2 + rand() * 9));
  if (at > NOW) return;
  const item = order._items[plan.itemIdx ?? randint(0, order._items.length - 1)];
  const id = nextId('post_sale_requests');
  const code = `PV-${String(99 + id).padStart(6, '0')}`;
  const REASONS = {
    DEVOLUCION: [['La talla no me quedó', 'La prenda me quedó pequeña. Está sin uso y con etiquetas.'], ['No era lo que esperaba', 'El color se ve distinto al de la fotografía.']],
    CAMBIO: [['Cambio de talla', 'Necesito una talla más grande del mismo color.']],
    RECLAMO: [['Retraso en la entrega', 'El pedido llegó después del tiempo estimado.'], ['Empaque dañado', 'La caja llegó golpeada aunque la prenda está bien.']],
  };
  const [reason, description] = plan.reason ? [plan.reason, plan.description] : pick(REASONS[plan.type]);
  let desired = null;
  if (plan.type === 'CAMBIO') {
    const bigger = item._v.product.variants.find((v) => v.color.id === item._v.color.id && v.size.id === Math.min(5, item._v.size.id + 1) && v.id !== item._v.id);
    desired = bigger || item._v.product.variants.find((v) => v.id !== item._v.id);
  }
  const ps = {
    id, code, order_id: order.id, customer_id: cust.id, type: plan.type, status: 'SOLICITADA', reason, description,
    desired_variant_id: desired ? desired.id : null, resolution: null, assigned_to: null, created_at: at, updated_at: at, closed_at: null, _hist: [], _items: [], _order: order,
  };
  postSales.push(ps);
  const step = (to, t, user, note) => {
    if (t > NOW) return false;
    ps._hist.push({ request_id: id, from_status: ps.status, to_status: to, note: note || null, user_id: user ? user.id : null, user_email: user ? user.email : null, created_at: t });
    ps.status = to; ps.updated_at = t;
    return true;
  };
  ps._hist.push({ request_id: id, from_status: null, to_status: 'SOLICITADA', note: 'Solicitud creada por el cliente', user_id: cust.id, user_email: cust.email, created_at: at });
  const qty = plan.type === 'RECLAMO' ? 0 : 1;
  const psItem = { id: nextId('post_sale_items'), request_id: id, order_item_id: item.id, quantity: Math.max(1, qty), received_qty: 0, condition: null, restocked: false, inspected_at: null, inspected_by: null, notes: null };
  ps._items.push(psItem);
  if (plan.status === 'SOLICITADA') return;

  const reviewAt = businessTime(addH(at, 3 + rand() * 20));
  ps.assigned_to = STAFF.atencion.id;
  if (!step('EN_REVISION', reviewAt, STAFF.atencion, 'Solicitud asignada a atención al cliente')) return;
  const approveAt = businessTime(addH(reviewAt, 2 + rand() * 6));
  if (!step('APROBADA', approveAt, STAFF.atencion, plan.type === 'RECLAMO' ? 'Reclamo procedente' : 'Solicitud aprobada; se coordinó la recepción de la prenda')) return;
  audit(approveAt, STAFF.atencion, 'sales-service', 'POSTSALE_APPROVED', 'post_sale_request', id, { status: 'EN_REVISION' }, { status: 'APROBADA', type: plan.type });

  if (plan.type === 'RECLAMO') {
    const resolvedAt = addH(approveAt, 3);
    const shippingPaid = toCents(order.shipping_cost.v) - toCents(order.shipping_discount.v);
    if (reason === 'Retraso en la entrega' && shippingPaid > 0 && resolvedAt <= NOW) {
      addRefund(order, ps, shippingPaid, 'Reembolso del costo de envío por retraso', resolvedAt);
      ps.resolution = 'Se reembolsó el costo de envío como compensación por el retraso.';
    } else {
      ps.resolution = 'Se ofrecieron disculpas y se registró el incidente con el transportista.';
    }
    step('RESUELTA', resolvedAt, STAFF.atencion, ps.resolution);
    step('CERRADA', addH(resolvedAt, 48), STAFF.atencion, 'Caso cerrado');
    if (ps.status === 'CERRADA') ps.closed_at = ps.updated_at;
    return;
  }
  const receivedAt = businessTime(addH(approveAt, 24 * (1 + rand() * 4)));
  if (receivedAt > NOW) return;
  const good = chance(0.85);
  psItem.received_qty = 1; psItem.condition = good ? 'BUENA' : 'DANADA'; psItem.inspected_at = receivedAt; psItem.inspected_by = STAFF.atencion.id;
  psItem.notes = good ? 'Prenda sin uso, con etiquetas.' : 'Prenda con señales de uso; no se reintegra al inventario de venta.';
  step('PRENDA_RECIBIDA', receivedAt, STAFF.atencion, `Prenda recibida en estado ${good ? 'bueno' : 'dañado'}`);
  if (good) { psItem.restocked = true; schedule(receivedAt, 'restockReturn', { order, ps, item, qty: 1, v: item._v }); }
  const resolveAt = addH(receivedAt, 2 + rand() * 20);
  if (resolveAt > NOW) return;
  if (plan.type === 'DEVOLUCION') {
    const unitShare = allocate(item._lineTotalCents, Array(item.quantity).fill(1))[0];
    addRefund(order, ps, unitShare, `Devolución ${code}`, resolveAt);
    ps.resolution = `Reembolso simulado de Q ${fromCents(unitShare)} al método de pago original.`;
  } else {
    const planState = {};
    schedule(resolveAt, 'exchangeOut', { ps, v: desired, plan: planState });
    ps._exchangeState = planState;
    ps.resolution = `Cambio realizado por ${desired.product.name} talla ${desired.size.code}.`;
  }
  step('RESUELTA', resolveAt, STAFF.atencion, ps.resolution);
  if (step('CERRADA', addH(resolveAt, 72), STAFF.atencion, 'Caso cerrado')) ps.closed_at = ps.updated_at;
}

function addRefund(order, ps, cents, reason, t) {
  if (t > NOW) return;
  const pay = payments.filter((p) => p.order_id === order.id && p.status === 'APROBADO').pop();
  if (!pay) return;
  const already = toCents(order.amount_refunded.v);
  const paid = toCents(order.amount_paid.v);
  const amount = Math.min(cents, paid - already);
  if (amount <= 0) return;
  refunds.push({ id: 0, payment_id: pay.id, order_id: order.id, post_sale_request_id: ps ? ps.id : null, amount: dec(amount), reason, reference: '', idempotency_key: crypto.randomUUID(), is_simulation: true, created_by: STAFF.atencion.id, created_at: t, _t: t.getTime() });
  order.amount_refunded = dec(already + amount);
  setStatus(order, 'PAGO', 'payment_status', already + amount >= paid ? 'REEMBOLSADO' : 'REEMBOLSO_PARCIAL', t, STAFF.atencion, reason);
  audit(t, STAFF.atencion, 'sales-service', 'REFUND_CREATED', 'refund', null, null, { orderCode: order.code, amount: fromCents(amount), reason });
}

let skipped = 0;
for (const a of arrivals) {
  processEventsUntil(a.t);
  if (a.kind === 'scenario') {
    const c = a.customerIdx ? customers[a.customerIdx] : customers[0];
    const lines = a.items.map(([n, col, size, qty]) => ({ v: findVariant(n, col, size), qty }));
    for (const l of lines) if (l.v.physical - l.v.reserved < l.qty) { l.v.physical += 0; }
    const o = createOrder({ t: a.t, customer: c, lines, method: a.method, couponCode: a.coupon, fate: a.fate, postSalePlan: a.postSale });
    if (!o) throw new Error('No se pudo crear el escenario de demostración');
    continue;
  }
  const customer = chooseCustomer(a.t);
  const lineMap = new Map();
  for (const cat of a.cats) {
    const v = chooseVariant(cat, a.t);
    if (!v) { skipped++; continue; }
    const cur = lineMap.get(v.id);
    if (cur) { if (v.physical - v.reserved >= cur.qty + 1) cur.qty++; } else lineMap.set(v.id, { v, qty: 1 });
  }
  if (!lineMap.size) continue;
  const z = zoneByDept[(customer.addresses.find((x) => x.is_default) || customer.addresses[0]).department];
  const method = weighted(['TARJETA', 'TRANSFERENCIA', 'CONTRA_ENTREGA'], (m) => ({ TARJETA: 0.55, TRANSFERENCIA: 0.27, CONTRA_ENTREGA: z.covered ? 0.18 : 0 })[m]);
  const isFirst = !orders.some((o) => o.customer_id === customer.user.id);
  let couponCode = null;
  if (isFirst && chance(0.35)) couponCode = 'BIENVENIDA10';
  else if (chance(0.04)) couponCode = 'EXCLUSIVE50';
  else if (chance(0.015)) couponCode = 'ENVIOGRATIS';
  createOrder({ t: a.t, customer, lines: [...lineMap.values()], method, couponCode });
}
processEventsUntil(NOW);
console.log(`  pedidos: ${orders.length}, unidades no vendidas por falta de existencias: ${skipped}`);

ins('mailbox_messages', { id: 1, to_email: CLIENT.email, subject: 'Te damos la bienvenida a Exclusive', html: '<p>Hola María José, tu cuenta está lista. Usa el cupón <b>BIENVENIDA10</b> en tu primera compra.</p>', text: 'Hola María José, tu cuenta está lista.', category: 'BIENVENIDA', read_at: gt(2025, 10, 5, 19, 20), created_at: gt(2025, 10, 5, 19, 13) });

console.log('› Preparando filas…');
for (const s of Object.values(STAFF)) {
  for (let d = 6; d >= 0; d--) {
    const t = businessTime(addH(addD(NOW, -d), -randint(1, 6)));
    if (t < NOW) ins('security_events', { id: nextId('security_events'), type: 'LOGIN_OK', email: s.email, user_id: s.id, ip: `192.168.1.${randint(10, 60)}`, user_agent: 'Mozilla/5.0 (demo)', details: null, created_at: t });
  }
}
ins('security_events', { id: nextId('security_events'), type: 'LOGIN_FAILED', email: 'admin@exclusive.gt', user_id: STAFF.admin.id, ip: '192.168.1.77', user_agent: 'Mozilla/5.0 (demo)', details: json({ reason: 'Contraseña incorrecta' }), created_at: addH(NOW, -30) });
ins('security_events', { id: nextId('security_events'), type: 'LOGIN_FAILED', email: 'no-existe@correo.com', user_id: null, ip: '192.168.1.77', user_agent: 'Mozilla/5.0 (demo)', details: json({ reason: 'Cuenta inexistente' }), created_at: addH(NOW, -29.9) });

for (const s of Object.values(STAFF)) {
  table('users').find((u) => u.id === s.id).last_login_at = addH(NOW, -randint(1, 30));
}

for (const p of products) {
  audit(p.created, STAFF.inventario, 'catalog-service', 'PRODUCT_CREATED', 'product', p.id, null, { name: p.name, basePrice: String(p.price), category: p.cat.name, variants: p.variants.length });
}
for (const pr of promotions) audit(addD(pr.startsAt < SEED_CREATED ? SEED_CREATED : pr.startsAt, -3), STAFF.admin, 'sales-service', 'PROMOTION_CREATED', 'promotion', pr.id, null, { name: pr.name, type: pr.type, value: pr.value });
audit(gt(2026, 3, 1, 9), STAFF.admin, 'catalog-service', 'POLICY_PUBLISHED', 'policy', 'terminos', { version: 1 }, { version: 2 });
audit(gt(2026, 6, 10, 11, 20), STAFF.admin, 'catalog-service', 'PRICE_CHANGED', 'product', products.find((p) => p.name === 'Jeans Recto Clásico').id, { basePrice: '429.00' }, { basePrice: '389.00' });
audit(gt(2026, 9, 2, 10, 5), STAFF.admin, 'auth-service', 'ROLE_PERMISSIONS_UPDATED', 'role', roleId.GERENCIA, { added: [] }, { added: ['ai.train'] });

for (const v of variants) {
  ins('inventory_stock', { variant_id: v.id, physical: v.physical, reserved: v.reserved, min_stock: v.minStock, updated_at: NOW });
}

purchases.sort((a, b) => a.row.created_at - b.row.created_at);
for (const p of purchases) {
  ins('purchases', p.row);
  for (const it of p.items) { const { v, ...row } = it; ins('purchase_items', row); }
}

for (const o of orders) {
  const { _totalCents, _customer, _zone, _items, ...row } = o;
  ins('orders', row);
}
for (const o of orders) for (const it of o._items) { const { _lineTotalCents, _v, ...row } = it; ins('order_items', row); }
for (const r of redemptions) { const { _c, ...row } = r; row.id = nextId('coupon_redemptions'); ins('coupon_redemptions', row); }
for (const c of Object.values(coupons)) {
  ins('coupons', { id: c.id, code: c.code, promotion_id: c.promotion.id, usage_limit: c.usageLimit, per_customer_limit: c.perCustomer, used_count: c.used, active: true, created_at: SEED_CREATED });
}
histories.sort((a, b) => a._t - b._t).forEach((h) => { const { _t, ...row } = h; row.id = nextId('order_status_history'); ins('order_status_history', row); });

payments.sort((a, b) => a._t - b._t).forEach((p) => {
  const { _t, ...row } = p;
  row.reference = `PAY-SIM-${String(10000 + row.id).padStart(6, '0')}`;
  ins('payments', row);
});
refunds.sort((a, b) => a._t - b._t).forEach((r) => { const { _t, ...row } = r; row.id = nextId('refunds'); row.reference = `REF-SIM-${String(row.id).padStart(6, '0')}`; ins('refunds', row); });
documents.sort((a, b) => a._t - b._t).forEach((d) => {
  const { _t, ...row } = d;
  row.id = nextId('sale_documents');
  row.number = `SIM-${String(row.id).padStart(6, '0')}`;
  row.snapshot.v.number = row.number;
  ins('sale_documents', row);
});
for (const s of shipments) ins('shipments', s);
shipmentEvents.sort((a, b) => a.created_at - b.created_at).forEach((e) => ins('shipment_events', { id: nextId('shipment_events'), ...e }));

for (const ps of postSales) {
  const { _hist, _items, _order, _exchangeState, ...row } = ps;
  if (_exchangeState && _exchangeState.exchangeFailed) row.resolution = 'Sin existencias de la talla solicitada; se acordó una devolución.';
  ins('post_sale_requests', row);
}
for (const ps of postSales) for (const it of ps._items) ins('post_sale_items', it);
for (const ps of postSales) for (const h of ps._hist) ins('post_sale_history', { id: nextId('post_sale_history'), ...h });

for (const o of orders) for (const r of reservationsByOrder[o.id]) { const { v, ...row } = r; row.id = nextId('reservations'); ins('reservations', row); }

movements.sort((a, b) => a._t - b._t).forEach((m) => { const { _t, ...row } = m; row.id = nextId('inventory_movements'); ins('inventory_movements', row); });

ins('carts', { id: 1, customer_id: CLIENT.id, updated_at: addH(NOW, -3) });
const cartVariants = [findVariant('Chaqueta Denim Clásica', 'Denim', 'S'), findVariant('Camiseta Oversize Lago', 'Arena', 'M')];
cartVariants.forEach((v, i) => ins('cart_items', { id: i + 1, cart_id: 1, variant_id: v.id, quantity: 1, added_at: addH(NOW, -3 - i) }));

notifications.filter((n) => n.t <= NOW && (n.userId === CLIENT.id || n.t > addD(NOW, -10))).sort((a, b) => a.t - b.t).forEach((n) => {
  ins('notifications', { id: nextId('notifications'), user_id: n.userId, type: n.type, title: n.title, body: n.body, link: n.link, read_at: n.t < addD(NOW, -2) ? addH(n.t, 5) : null, created_at: n.t });
});
ins('notifications', { id: nextId('notifications'), user_id: STAFF.ventas.id, type: 'PAGO', title: 'Comprobante pendiente de revisión', body: 'Hay transferencias esperando validación.', link: '/admin/pagos', read_at: null, created_at: addH(NOW, -6) });
ins('notifications', { id: nextId('notifications'), user_id: STAFF.atencion.id, type: 'POSVENTA', title: 'Nueva solicitud de devolución', body: 'María José López solicitó una devolución.', link: '/admin/posventa', read_at: null, created_at: gt(2026, 10, 20, 18, 46) });
const lowCount = variants.filter((v) => v.physical - v.reserved <= v.minStock).length;
ins('notifications', { id: nextId('notifications'), user_id: STAFF.inventario.id, type: 'INVENTARIO', title: 'Existencias bajas', body: `${lowCount} variantes están en o por debajo de su mínimo.`, link: '/admin/inventario?filtro=bajas', read_at: null, created_at: addH(NOW, -2) });

auditRows.sort((a, b) => a._t - b._t).forEach((r) => { const { _t, ...row } = r; row.id = nextId('audit_logs'); ins('audit_logs', row); });

for (const v of variants) {
  const ms = movements.filter((m) => m.variant_id === v.id);
  const phys = ms.reduce((a, m) => a + (m.direction === 'ENTRADA' ? m.quantity : -m.quantity), 0);
  if (phys !== v.physical) throw new Error(`Kardex inconsistente para ${v.sku}: ${phys} vs ${v.physical}`);
  const res = (T.reservations || []).filter((r) => r.variant_id === v.id && (r.status === 'ACTIVA' || r.status === 'CONFIRMADA')).reduce((a, r) => a + r.quantity, 0);
  if (res !== v.reserved) throw new Error(`Reservas inconsistentes para ${v.sku}: ${res} vs ${v.reserved}`);
}
console.log('  kardex y reservas verificados ✓');

console.log('› Escribiendo SQL…');
const ddl = execFileSync(process.execPath, [path.join(__dirname, 'ddl.cjs')], { encoding: 'utf8' });
const extras = fs.readFileSync(path.join(__dirname, 'extras.sql'), 'utf8');
const sinComentarios = (sql) => `${sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')}\n`;
const migration = sinComentarios(`${ddl}\n${extras}`);
const migDir = path.join(ROOT, 'packages/db/prisma/migrations/0_init');
fs.mkdirSync(migDir, { recursive: true });
fs.writeFileSync(path.join(migDir, 'migration.sql'), migration);
fs.writeFileSync(path.join(ROOT, 'packages/db/prisma/migrations/migration_lock.toml'), '# Please do not edit this file manually\n# It should be added in your version-control system (e.g., Git)\nprovider = "postgresql"\n');
const checksum = crypto.createHash('sha256').update(migration).digest('hex');

const tableNames = [...ddl.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]);
const enumNames = [...ddl.matchAll(/CREATE TYPE "([^"]+)"/g)].map((m) => m[1]);
const dropSql = [
  'DROP VIEW IF EXISTS "v_stock";',
  ...tableNames.map((t) => `DROP TABLE IF EXISTS "${t}" CASCADE;`),
  'DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;',
  ...enumNames.map((e) => `DROP TYPE IF EXISTS "${e}" CASCADE;`),
  'DROP SEQUENCE IF EXISTS order_code_seq, document_number_seq, postsale_code_seq, purchase_code_seq, payment_ref_seq;',
  'DROP FUNCTION IF EXISTS exclusive_immutable_row() CASCADE;',
].join('\n');

const prismaMigrations = `
CREATE TABLE "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES ('${crypto.randomUUID()}', '${checksum}', now(), '0_init', now(), 1);
`;

const header = () => `SET client_encoding = 'UTF8';
SET client_min_messages = warning;
SET standard_conforming_strings = on;

BEGIN;

${dropSql}

${migration}
${prismaMigrations}
`;

function insertsSql() {
  const out = [];
  for (const name of ORDER) {
    const rows = T[name];
    if (!rows || !rows.length) continue;
    const cols = Object.keys(rows[0]);
    out.push('');
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      out.push(`INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES\n` + chunk.map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n') + ';');
    }
  }
  return out.join('\n');
}

const seqSql = tableNames.map((t) => {
  const hasSerial = new RegExp(`CREATE TABLE "${t}" \\(\\n    "id" (BIG)?SERIAL`).test(ddl);
  return hasSerial ? `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX("id") FROM "${t}"), 0) + 1, false);` : null;
}).filter(Boolean).join('\n');
const customSeq = `
SELECT setval('order_code_seq', ${orderSeq}, false);
SELECT setval('document_number_seq', ${(ids.sale_documents || 0) + 1}, false);
SELECT setval('postsale_code_seq', ${99 + (ids.post_sale_requests || 0) + 1}, false);
SELECT setval('purchase_code_seq', ${99 + (ids.purchases || 0) + 1}, false);
SELECT setval('payment_ref_seq', ${10000 + (ids.payments || 0) + 1}, false);
`;

const FK_ORDER = ['roles', 'permissions', 'role_permissions', 'users', 'user_roles', 'addresses', 'colors', 'sizes', 'size_guides', 'categories', 'products', 'product_images', 'product_variants',
  'store_settings', 'policies', 'shipping_zones', 'carriers', 'suppliers', 'promotions', 'coupons', 'inventory_stock', 'purchases', 'purchase_items', 'orders', 'order_items', 'coupon_redemptions',
  'order_status_history', 'payments', 'refunds', 'sale_documents', 'shipments', 'shipment_events', 'post_sale_requests', 'post_sale_items', 'post_sale_history', 'reservations', 'inventory_movements',
  'carts', 'cart_items', 'notifications', 'mailbox_messages', 'security_events', 'audit_logs'];
const missing = ORDER.filter((n) => !FK_ORDER.includes(n) && T[n] && T[n].length);
if (missing.length) throw new Error('Tablas sin orden definido: ' + missing.join(', '));
ORDER.length = 0;
FK_ORDER.forEach((n) => ORDER.push(n));
ORDER.splice(ORDER.indexOf('refunds'), 1);
ORDER.splice(ORDER.indexOf('post_sale_history') + 1, 0, 'refunds');

const nowLocal = local(NOW);
const refDate = nowLocal.toISOString().slice(0, 10);
const refTime = nowLocal.toISOString().slice(11, 16);
const shiftSql = `
DO $shift$
DECLARE
  local_now timestamp := now() AT TIME ZONE 'America/Guatemala';
  shift_days integer := local_now::date - DATE '${refDate}';
  shift interval;
  t record;
BEGIN
  IF local_now::time < TIME '${refTime}' THEN
    shift_days := shift_days - 1;
  END IF;
  IF shift_days <= 0 THEN
    RETURN;
  END IF;
  shift := make_interval(days => shift_days);
  ALTER TABLE "audit_logs" DISABLE TRIGGER USER;
  ALTER TABLE "inventory_movements" DISABLE TRIGGER USER;
  FOR t IN
    SELECT c.table_name, string_agg(format('%I = %I + %L::interval', c.column_name, c.column_name, shift), ', ') AS cols
    FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = current_schema()
      AND c.data_type IN ('timestamp with time zone', 'timestamp without time zone', 'date')
      AND c.table_name NOT IN ('_prisma_migrations', 'oidc_payloads')
    GROUP BY c.table_name
  LOOP
    EXECUTE format('UPDATE %I SET %s', t.table_name, t.cols);
  END LOOP;
  ALTER TABLE "audit_logs" ENABLE TRIGGER USER;
  ALTER TABLE "inventory_movements" ENABLE TRIGGER USER;
END
$shift$;
`;

const full = `${header()}\n${insertsSql()}\n\n${seqSql}\n${customSeq}\n${shiftSql}\nCOMMIT;\n`;
fs.writeFileSync(path.join(ROOT, 'database/exclusive_db.sql'), sinComentarios(full));
fs.writeFileSync(path.join(ROOT, 'database/schema.sql'), sinComentarios(`${header()}\n${(() => {
  const keep = ['roles', 'permissions', 'role_permissions', 'colors', 'sizes', 'size_guides', 'categories', 'store_settings', 'policies', 'shipping_zones', 'carriers', 'suppliers'];
  const saved = ORDER.slice(); ORDER.length = 0; keep.forEach((k) => ORDER.push(k));
  const s = insertsSql(); ORDER.length = 0; saved.forEach((k) => ORDER.push(k)); return s;
})()}\n\n${seqSql}\nCOMMIT;\n`));
const sizeMb = (fs.statSync(path.join(ROOT, 'database/exclusive_db.sql')).size / 1048576).toFixed(2);
console.log(`  database/exclusive_db.sql (${sizeMb} MB)`);
console.log(`  pedidos ${orders.length} · movimientos ${movements.length} · compras ${purchases.length} · posventa ${postSales.length} · auditoría ${auditRows.length}`);

if (!SKIP_IMAGES) {
  console.log('› Generando imágenes…');
  fs.mkdirSync(UPLOADS, { recursive: true });
  for (const job of imageJobs) {
    const svg = Buffer.from(garmentSVG(job));
    await sharp(svg, { density: 144 }).resize(900, 1125).webp({ quality: 86 }).toFile(path.join(UPLOADS, `${job.file}.webp`));
    await sharp(svg, { density: 72 }).resize(360, 450).webp({ quality: 82 }).toFile(path.join(UPLOADS, `${job.file}-t.webp`));
  }
  for (const c of D.CATEGORIES) {
    const p = products.find((x) => x.cat.id === c.id && x.created === SEED_CREATED);
    const svg = Buffer.from(garmentSVG({ shape: p.shape, color: colorById[p.colors[0]].hex, pattern: p.pattern, accent: p.accent, background: '#EEF1EE' }));
    await sharp(svg, { density: 96 }).resize(600, 750).webp({ quality: 84 }).toFile(path.join(UPLOADS, `cat-${c.slug}.webp`));
  }
  fs.mkdirSync(RECEIPTS, { recursive: true });
  const receipt = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820" viewBox="0 0 600 820">
    <rect width="600" height="820" fill="#ffffff"/><rect x="0" y="0" width="600" height="110" fill="#1F3A5F"/>
    <text x="40" y="62" font-family="Arial" font-size="28" fill="#fff" font-weight="700">Banco de Demostración</text>
    <text x="40" y="92" font-family="Arial" font-size="16" fill="#cfe0f5">Comprobante de transferencia</text>
    <g font-family="Arial" font-size="18" fill="#1B2433">
      <text x="40" y="170">Cuenta destino</text><text x="560" y="170" text-anchor="end" font-weight="700">000-000000-0</text>
      <text x="40" y="215">Titular</text><text x="560" y="215" text-anchor="end" font-weight="700">Exclusive Moda</text>
      <text x="40" y="260">Referencia</text><text x="560" y="260" text-anchor="end" font-weight="700">TRF-${randint(100000, 999999)}</text>
      <text x="40" y="305">Estado</text><text x="560" y="305" text-anchor="end" font-weight="700" fill="#0E6B58">Operación exitosa</text>
    </g>
    <line x1="40" y1="340" x2="560" y2="340" stroke="#E3E6E2" stroke-width="2"/>
    <text x="300" y="470" font-family="Arial" font-size="40" fill="#B4233C" text-anchor="middle" font-weight="700" transform="rotate(-18 300 470)">SIMULACIÓN</text>
    <text x="300" y="520" font-family="Arial" font-size="20" fill="#B4233C" text-anchor="middle" transform="rotate(-18 300 520)">Documento sin validez</text>
  </svg>`;
  await sharp(Buffer.from(receipt)).png().toFile(path.join(RECEIPTS, 'demo-transferencia.png'));
  console.log(`  ${imageJobs.length * 2 + D.CATEGORIES.length} imágenes de producto y categoría`);
}
console.log('✓ Listo');
