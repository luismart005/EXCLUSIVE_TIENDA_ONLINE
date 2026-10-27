import express from 'express';
import { prisma, Prisma } from '@exclusive/db';
import { notFound } from '@exclusive/common';
import { activePromotions, displayPrice } from '../pricing.js';

const NEW_DAYS = 60;
let popularity = { at: 0, map: new Map() };

async function popularityMap() {
  if (Date.now() - popularity.at < 5 * 60_000) return popularity.map;
  const rows = await prisma.$queryRaw`
    SELECT oi.product_id AS id, sum(oi.quantity)::int AS units
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status <> 'CANCELADO' AND o.created_at > now() - interval '90 days'
    GROUP BY oi.product_id`;
  popularity = { at: Date.now(), map: new Map(rows.map((r) => [r.id, r.units])) };
  return popularity.map;
}

function cardImages(images, variants) {
  const out = [];
  const seen = new Set();
  for (const img of images) {
    if (seen.has(img.colorId)) continue;
    seen.add(img.colorId);
    out.push({ url: img.url, thumbUrl: img.thumbUrl, colorId: img.colorId, alt: img.alt });
    if (out.length === 2) break;
  }
  if (!out.length && images[0]) out.push(images[0]);
  return out;
}

export function shapeCard(p, promos, popular) {
  const available = p.variants.filter((v) => v.active && v.stock && v.stock.physical - v.stock.reserved > 0);
  const colors = [];
  const seen = new Set();
  for (const v of p.variants) {
    if (!v.active || seen.has(v.colorId)) continue;
    seen.add(v.colorId);
    colors.push({ id: v.color.id, name: v.color.name, hex: v.color.hex, available: available.some((a) => a.colorId === v.colorId) });
  }
  const sizes = [...new Map(p.variants.filter((v) => v.active).sort((a, b) => a.size.sortOrder - b.size.sortOrder).map((v) => [v.size.code, { code: v.size.code, available: available.some((a) => a.sizeId === v.sizeId) }])).values()];
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    gender: p.gender,
    featured: p.featured,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
    ...displayPrice(p, promos),
    images: cardImages(p.images, p.variants),
    colors,
    sizes,
    inStock: available.length > 0,
    isNew: Date.now() - p.createdAt.getTime() < NEW_DAYS * 86400e3,
    sold90: popular?.get(p.id) || 0,
  };
}

export const cardInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' } },
  variants: { include: { size: true, color: true, stock: true } },
};

export function publicRoutes() {
  const r = express.Router();

  r.get('/categories', async (req, res) => {
    const cats = await prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: { where: { status: 'ACTIVO' } } } } } });
    res.json(cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, imageUrl: c.imageUrl, products: c._count.products })));
  });

  r.get('/filters', async (req, res) => {
    const [colors, sizes, range] = await Promise.all([
      prisma.color.findMany({ where: { active: true, variants: { some: { active: true, product: { status: 'ACTIVO' } } } }, orderBy: { sortOrder: 'asc' } }),
      prisma.size.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.product.aggregate({ where: { status: 'ACTIVO' }, _min: { basePrice: true }, _max: { basePrice: true } }),
    ]);
    res.json({ colors, sizes, minPrice: range._min.basePrice || 0, maxPrice: range._max.basePrice || 0, genders: ['MUJER', 'HOMBRE', 'UNISEX'] });
  });

  r.get('/products', async (req, res) => {
    const q = req.query;
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const pageSize = Math.min(48, Math.max(1, parseInt(q.pageSize, 10) || 12));
    const promos = await activePromotions();
    const where = { status: 'ACTIVO', category: { active: true } };
    const and = [];
    if (q.category) and.push({ category: { slug: String(q.category) } });
    if (q.search) {
      const s = String(q.search).trim().slice(0, 80);
      and.push({ OR: [{ name: { contains: s, mode: 'insensitive' } }, { description: { contains: s, mode: 'insensitive' } }, { category: { name: { contains: s, mode: 'insensitive' } } }, { material: { contains: s, mode: 'insensitive' } }] });
    }
    if (q.gender && ['MUJER', 'HOMBRE'].includes(q.gender)) and.push({ gender: { in: [q.gender, 'UNISEX'] } });
    if (q.minPrice) and.push({ basePrice: { gte: new Prisma.Decimal(Number(q.minPrice) || 0) } });
    if (q.maxPrice) and.push({ basePrice: { lte: new Prisma.Decimal(Number(q.maxPrice) || 0) } });
    if (q.featured === '1') and.push({ featured: true });
    if (q.onSale === '1') {
      const cats = promos.filter((p) => p.scope === 'CATEGORIA' && p.type !== 'ENVIO_GRATIS').map((p) => p.categoryId);
      const prods = promos.filter((p) => p.scope === 'PRODUCTO' && p.type !== 'ENVIO_GRATIS').map((p) => p.productId);
      const all = promos.some((p) => p.scope === 'TODO' && p.type === 'PORCENTAJE' && !p.minSubtotal);
      if (!all) and.push({ OR: [{ compareAtPrice: { not: null } }, { categoryId: { in: cats } }, { id: { in: prods } }] });
    }
    const sizes = [].concat(q.size || []).map(String).filter(Boolean);
    const colors = [].concat(q.color || []).map(Number).filter(Boolean);
    if (sizes.length || colors.length || q.inStock === '1') {
      const conds = [Prisma.sql`v.active AND (s.physical - s.reserved) > 0`];
      if (sizes.length) conds.push(Prisma.sql`sz.code IN (${Prisma.join(sizes)})`);
      if (colors.length) conds.push(Prisma.sql`v.color_id IN (${Prisma.join(colors)})`);
      const ids = await prisma.$queryRaw`
        SELECT DISTINCT v.product_id AS id FROM product_variants v
        JOIN inventory_stock s ON s.variant_id = v.id JOIN sizes sz ON sz.id = v.size_id
        WHERE ${Prisma.join(conds, ' AND ')}`;
      and.push({ id: { in: ids.map((x) => x.id) } });
    }
    if (and.length) where.AND = and;

    const base = await prisma.product.findMany({ where, select: { id: true, basePrice: true, createdAt: true, featured: true, name: true } });
    const popular = await popularityMap();
    const sort = String(q.sort || 'relevancia');
    const sorted = base.sort((a, b) => {
      if (sort === 'precio-asc') return Number(a.basePrice) - Number(b.basePrice) || a.id - b.id;
      if (sort === 'precio-desc') return Number(b.basePrice) - Number(a.basePrice) || a.id - b.id;
      if (sort === 'nuevos') return b.createdAt - a.createdAt || a.id - b.id;
      if (sort === 'nombre') return a.name.localeCompare(b.name, 'es');
      const score = (x) => (popular.get(x.id) || 0) + (x.featured ? 6 : 0) + (Date.now() - x.createdAt.getTime() < NEW_DAYS * 86400e3 ? 8 : 0);
      return score(b) - score(a) || a.id - b.id;
    });
    const total = sorted.length;
    const pageIds = sorted.slice((page - 1) * pageSize, page * pageSize).map((x) => x.id);
    const products = await prisma.product.findMany({ where: { id: { in: pageIds } }, include: cardInclude });
    const byId = new Map(products.map((p) => [p.id, p]));
    res.json({
      items: pageIds.map((id) => shapeCard(byId.get(id), promos, popular)),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  });

  r.get('/products/:slug', async (req, res) => {
    const p = await prisma.product.findUnique({
      where: { slug: String(req.params.slug) },
      include: { ...cardInclude, sizeGuide: true },
    });
    if (!p || p.status !== 'ACTIVO') throw notFound('El producto no existe o ya no está disponible.');
    const promos = await activePromotions();
    const popular = await popularityMap();
    const card = shapeCard(p, promos, popular);
    const variants = p.variants
      .filter((v) => v.active)
      .sort((a, b) => a.color.sortOrder - b.color.sortOrder || a.size.sortOrder - b.size.sortOrder)
      .map((v) => {
        const available = v.stock ? Math.max(0, v.stock.physical - v.stock.reserved) : 0;
        return {
          id: v.id, sku: v.sku, size: v.size.code, sizeName: v.size.name, colorId: v.colorId, color: v.color.name, hex: v.color.hex,
          available, lowStock: available > 0 && available <= 3, ...displayPrice(p, promos, v.price),
        };
      });
    const related = await prisma.product.findMany({ where: { status: 'ACTIVO', categoryId: p.categoryId, id: { not: p.id } }, include: cardInclude, take: 8 });
    res.json({
      ...card,
      description: p.description,
      material: p.material,
      care: p.care,
      images: p.images.map((i) => ({ id: i.id, url: i.url, thumbUrl: i.thumbUrl, colorId: i.colorId, alt: i.alt || p.name })),
      sizeGuide: p.sizeGuide ? { name: p.sizeGuide.name, unit: p.sizeGuide.unit, columns: p.sizeGuide.columns, rows: p.sizeGuide.rows, notes: p.sizeGuide.notes } : null,
      variants,
      related: related.map((x) => shapeCard(x, promos, popular)).sort((a, b) => b.sold90 - a.sold90).slice(0, 4),
    });
  });

  r.get('/promotions/active', async (req, res) => {
    const promos = await activePromotions();
    res.json(promos.map(({ id, name, description, type, value, scope, minSubtotal, endsAt, categoryId, productId }) => ({ id, name, description, type, value, scope, minSubtotal, endsAt, categoryId, productId })));
  });

  r.get('/store', async (req, res) => {
    const [settings, policies] = await Promise.all([
      prisma.storeSetting.findMany({ where: { key: { in: ['store_info', 'commerce', 'simulation', 'bank_transfer'] } } }),
      prisma.policy.findMany({ where: { isCurrent: true }, select: { slug: true, title: true, version: true, publishedAt: true }, orderBy: { id: 'asc' } }),
    ]);
    const s = Object.fromEntries(settings.map((x) => [x.key, x.value]));
    res.json({ info: s.store_info, commerce: s.commerce, simulation: s.simulation, bankTransfer: s.bank_transfer, policies });
  });

  r.get('/policies/:slug', async (req, res) => {
    const p = await prisma.policy.findFirst({ where: { slug: String(req.params.slug), isCurrent: true } });
    if (!p) throw notFound('La política no existe.');
    res.json(p);
  });

  r.get('/variants', async (req, res) => {
    const productId = Number(req.query.productId);
    if (!Number.isInteger(productId) || productId <= 0) return res.json([]);
    const variants = await prisma.productVariant.findMany({
      where: { productId, active: true, product: { status: 'ACTIVO' } },
      include: { size: true, color: true, stock: true },
      orderBy: [{ colorId: 'asc' }, { sizeId: 'asc' }],
    });
    res.json(variants.map((v) => ({
      id: v.id, sku: v.sku, size: v.size.code, sizeOrder: v.size.sortOrder, color: v.color.name, hex: v.color.hex,
      available: v.stock ? Math.max(0, v.stock.physical - v.stock.reserved) : 0,
    })).sort((a, b) => a.color.localeCompare(b.color, 'es') || a.sizeOrder - b.sizeOrder));
  });

  r.get('/colors', async (req, res) => res.json(await prisma.color.findMany({ orderBy: { sortOrder: 'asc' } })));
  r.get('/sizes', async (req, res) => res.json(await prisma.size.findMany({ orderBy: { sortOrder: 'asc' } })));

  return r;
}
