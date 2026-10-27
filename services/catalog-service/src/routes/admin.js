import express from 'express';
import { prisma, Prisma } from '@exclusive/db';
import {
  z, authenticate, requirePermission, audit, badRequest, notFound, conflict, pageParams, paged, serviceClient, diff, toCents, fromCents,
} from '@exclusive/common';
import { upload, processImage, deleteImageFiles } from '../images.js';
import { invalidatePromotions } from '../pricing.js';

const SERVICE = 'catalog-service';
const inventory = serviceClient('catalog', 'inventory');

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 120);
const code3 = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

async function uniqueSlug(name, excludeId) {
  const base = slugify(name) || 'producto';
  let slug = base;
  for (let i = 2; await prisma.product.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } }); i++) slug = `${base}-${i}`;
  return slug;
}

async function makeSku(product, sizeId, colorId) {
  const [cat, size, color] = await Promise.all([
    prisma.category.findUnique({ where: { id: product.categoryId } }),
    prisma.size.findUnique({ where: { id: sizeId } }),
    prisma.color.findUnique({ where: { id: colorId } }),
  ]);
  const colorCode = code3(color.name) + (color.name.includes(' ') ? code3(color.name.split(' ')[1])[0] : '');
  let sku = `EXC-${code3(cat.name)}${String(product.id).padStart(3, '0')}-${colorCode}-${size.code}`;
  for (let i = 2; await prisma.productVariant.findUnique({ where: { sku } }); i++) sku = `${sku.replace(/-\d+$/, '')}-${i}`;
  return sku;
}

const productSchema = z.object({
  name: z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(120),
  description: z.string().trim().min(10, 'Describe el producto (mínimo 10 caracteres).').max(4000),
  categoryId: z.coerce.number().int().positive('Selecciona una categoría.'),
  sizeGuideId: z.coerce.number().int().positive().optional().nullable(),
  basePrice: z.coerce.number({ message: 'Ingresa el precio.' }).positive('El precio debe ser mayor que cero.').max(100000),
  compareAtPrice: z.coerce.number().positive().max(100000).optional().nullable(),
  material: z.string().trim().max(200).optional().nullable(),
  care: z.string().trim().max(400).optional().nullable(),
  gender: z.enum(['MUJER', 'HOMBRE', 'UNISEX']).default('UNISEX'),
  featured: z.boolean().optional().default(false),
  status: z.enum(['BORRADOR', 'ACTIVO', 'INACTIVO']).optional(),
});

const adminProductInclude = {
  category: { select: { id: true, name: true } },
  sizeGuide: { select: { id: true, name: true } },
  images: { orderBy: { sortOrder: 'asc' }, include: { color: { select: { name: true } } } },
  variants: { include: { size: true, color: true, stock: true }, orderBy: [{ colorId: 'asc' }, { sizeId: 'asc' }] },
};

function shapeAdminProduct(p) {
  const stock = p.variants.reduce((a, v) => ({ physical: a.physical + (v.stock?.physical || 0), reserved: a.reserved + (v.stock?.reserved || 0) }), { physical: 0, reserved: 0 });
  return {
    ...p,
    variants: p.variants.map((v) => ({
      id: v.id, sku: v.sku, sizeId: v.sizeId, size: v.size.code, colorId: v.colorId, color: v.color.name, hex: v.color.hex, price: v.price, active: v.active,
      physical: v.stock?.physical || 0, reserved: v.stock?.reserved || 0, available: (v.stock?.physical || 0) - (v.stock?.reserved || 0), minStock: v.stock?.minStock ?? null,
    })),
    stock: { ...stock, available: stock.physical - stock.reserved },
    cover: p.images[0]?.thumbUrl || null,
  };
}

export function adminRoutes() {
  const r = express.Router();
  r.use(authenticate());

  r.get('/products', requirePermission('catalog.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 20 });
    const where = {
      ...(req.query.status ? { status: String(req.query.status) } : {}),
      ...(req.query.categoryId ? { categoryId: Number(req.query.categoryId) } : {}),
      ...(req.query.search ? { OR: [{ name: { contains: String(req.query.search), mode: 'insensitive' } }, { variants: { some: { sku: { contains: String(req.query.search), mode: 'insensitive' } } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, include: adminProductInclude, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.product.count({ where }),
    ]);
    const sold = await prisma.orderItem.groupBy({ by: ['productId'], where: { productId: { in: items.map((x) => x.id) }, order: { status: { not: 'CANCELADO' } } }, _sum: { quantity: true } });
    const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity]));
    res.json(paged(items.map((x) => ({ ...shapeAdminProduct(x), sold: soldMap.get(x.id) || 0 })), total, p));
  });

  r.get('/products/:id', requirePermission('catalog.read'), async (req, res) => {
    const p = await prisma.product.findUnique({ where: { id: Number(req.params.id) }, include: adminProductInclude });
    if (!p) throw notFound('El producto no existe.');
    const [sold, history] = await Promise.all([
      prisma.orderItem.aggregate({ where: { productId: p.id, order: { status: { not: 'CANCELADO' } } }, _sum: { quantity: true, lineTotal: true }, _count: true }),
      prisma.auditLog.findMany({ where: { entity: 'product', entityId: String(p.id) }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    res.json({ ...shapeAdminProduct(p), sales: { units: sold._sum.quantity || 0, revenue: sold._sum.lineTotal || 0, lines: sold._count }, history });
  });

  r.post('/products', requirePermission('catalog.manage'), async (req, res) => {
    const data = productSchema
      .extend({
        sizeIds: z.array(z.coerce.number().int()).min(1, 'Selecciona al menos una talla.'),
        colorIds: z.array(z.coerce.number().int()).min(1, 'Selecciona al menos un color.'),
        initialStock: z.array(z.object({ sizeId: z.number().int(), colorId: z.number().int(), quantity: z.coerce.number().int().min(0).max(10000) })).optional(),
        unitCost: z.coerce.number().nonnegative().optional().nullable(),
      })
      .parse(req.body);
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw badRequest('La categoría no existe.', [{ field: 'categoryId', message: 'Selecciona una categoría válida.' }]);
    if (data.compareAtPrice && data.compareAtPrice <= data.basePrice) throw badRequest('El precio anterior debe ser mayor que el precio actual.', [{ field: 'compareAtPrice', message: 'Debe ser mayor que el precio.' }]);
    const slug = await uniqueSlug(data.name);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name, slug, description: data.description, categoryId: data.categoryId, sizeGuideId: data.sizeGuideId || null,
          basePrice: fromCents(toCents(data.basePrice)), compareAtPrice: data.compareAtPrice ? fromCents(toCents(data.compareAtPrice)) : null,
          material: data.material || null, care: data.care || null, gender: data.gender, featured: data.featured, status: data.status || 'ACTIVO', createdBy: req.user.id,
        },
      });
      await audit(req, { service: SERVICE, action: 'PRODUCT_CREATED', entity: 'product', entityId: created.id, after: { name: created.name, basePrice: data.basePrice, category: category.name } }, tx);
      return created;
    });
    const variants = [];
    for (const colorId of data.colorIds) {
      for (const sizeId of data.sizeIds) {
        const sku = await makeSku(product, sizeId, colorId);
        variants.push(await prisma.productVariant.create({ data: { productId: product.id, sizeId, colorId, sku } }));
      }
    }
    const initial = (data.initialStock || []).filter((i) => i.quantity > 0).map((i) => ({ variantId: variants.find((v) => v.sizeId === i.sizeId && v.colorId === i.colorId)?.id, quantity: i.quantity })).filter((i) => i.variantId);
    let stockWarning = null;
    if (initial.length) {
      try {
        await inventory.post('/internal/initial-stock', { items: initial, unitCost: data.unitCost ?? null, reference: `Alta del producto ${product.name}` }, { req });
      } catch (e) {
        stockWarning = `El producto se creó, pero no se registró la existencia inicial: ${e.message}`;
      }
    }
    const full = await prisma.product.findUnique({ where: { id: product.id }, include: adminProductInclude });
    res.status(201).json({ ...shapeAdminProduct(full), stockWarning });
  });

  r.put('/products/:id', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const data = productSchema.parse(req.body);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw notFound('El producto no existe.');
    if (data.compareAtPrice && data.compareAtPrice <= data.basePrice) throw badRequest('El precio anterior debe ser mayor que el precio actual.', [{ field: 'compareAtPrice', message: 'Debe ser mayor que el precio.' }]);
    const next = {
      name: data.name, description: data.description, categoryId: data.categoryId, sizeGuideId: data.sizeGuideId || null,
      basePrice: fromCents(toCents(data.basePrice)), compareAtPrice: data.compareAtPrice ? fromCents(toCents(data.compareAtPrice)) : null,
      material: data.material || null, care: data.care || null, gender: data.gender, featured: data.featured, ...(data.status ? { status: data.status } : {}),
    };
    if (data.name !== before.name) next.slug = await uniqueSlug(data.name, id);
    const changes = diff(
      { ...before, basePrice: before.basePrice.toFixed(2), compareAtPrice: before.compareAtPrice?.toFixed(2) ?? null },
      next,
    );
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.product.update({ where: { id }, data: next, include: adminProductInclude });
      if (changes.changed) {
        const priceChanged = 'basePrice' in changes.after;
        await audit(req, { service: SERVICE, action: priceChanged ? 'PRICE_CHANGED' : 'PRODUCT_UPDATED', entity: 'product', entityId: id, before: changes.before, after: changes.after }, tx);
      }
      return u;
    });
    res.json(shapeAdminProduct(updated));
  });

  r.post('/products/:id/status', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { status } = z.object({ status: z.enum(['BORRADOR', 'ACTIVO', 'INACTIVO']) }).parse(req.body);
    const before = await prisma.product.findUnique({ where: { id } });
    if (!before) throw notFound('El producto no existe.');
    await prisma.product.update({ where: { id }, data: { status } });
    await audit(req, { service: SERVICE, action: status === 'ACTIVO' ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED', entity: 'product', entityId: id, before: { status: before.status }, after: { status } });
    res.json({ id, status });
  });

  r.delete('/products/:id', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const p = await prisma.product.findUnique({ where: { id }, include: { images: true, variants: { select: { id: true } } } });
    if (!p) throw notFound('El producto no existe.');
    const vids = p.variants.map((v) => v.id);
    const [orders, movements] = await Promise.all([
      prisma.orderItem.count({ where: { variantId: { in: vids } } }),
      prisma.inventoryMovement.count({ where: { variantId: { in: vids } } }),
    ]);
    if (orders || movements) throw conflict('El producto tiene historial de ventas o inventario. Desactívalo en lugar de eliminarlo para conservar la trazabilidad.');
    await prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { variantId: { in: vids } } });
      await tx.inventoryStock.deleteMany({ where: { variantId: { in: vids } } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await audit(req, { service: SERVICE, action: 'PRODUCT_DELETED', entity: 'product', entityId: id, before: { name: p.name } }, tx);
    });
    await deleteImageFiles(p.images.flatMap((i) => [i.url, i.thumbUrl]));
    res.status(204).end();
  });

  r.post('/products/:id/variants', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { sizeIds, colorIds } = z.object({ sizeIds: z.array(z.number().int()).min(1), colorIds: z.array(z.number().int()).min(1) }).parse(req.body);
    const product = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
    if (!product) throw notFound('El producto no existe.');
    const created = [];
    for (const colorId of colorIds) {
      for (const sizeId of sizeIds) {
        if (product.variants.some((v) => v.sizeId === sizeId && v.colorId === colorId)) continue;
        const sku = await makeSku(product, sizeId, colorId);
        created.push(await prisma.productVariant.create({ data: { productId: id, sizeId, colorId, sku } }));
      }
    }
    if (created.length) await audit(req, { service: SERVICE, action: 'VARIANTS_CREATED', entity: 'product', entityId: id, after: { skus: created.map((v) => v.sku) } });
    res.status(201).json({ created: created.length, skus: created.map((v) => v.sku) });
  });

  r.put('/variants/:id', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const data = z.object({ price: z.coerce.number().positive().max(100000).nullable().optional(), active: z.boolean().optional() }).parse(req.body);
    const before = await prisma.productVariant.findUnique({ where: { id } });
    if (!before) throw notFound('La variante no existe.');
    const v = await prisma.productVariant.update({ where: { id }, data: { ...(data.price !== undefined ? { price: data.price === null ? null : fromCents(toCents(data.price)) } : {}), ...(data.active !== undefined ? { active: data.active } : {}) } });
    await audit(req, { service: SERVICE, action: data.price !== undefined ? 'VARIANT_PRICE_CHANGED' : 'VARIANT_UPDATED', entity: 'variant', entityId: id, before: { price: before.price, active: before.active }, after: { price: v.price, active: v.active, sku: v.sku } });
    res.json(v);
  });

  r.post('/products/:id/images', requirePermission('catalog.manage'), upload.array('images', 8), async (req, res) => {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id }, include: { images: true } });
    if (!product) throw notFound('El producto no existe.');
    if (!req.files?.length) throw badRequest('Selecciona al menos una imagen.');
    if (product.images.length + req.files.length > 12) throw badRequest('Un producto puede tener como máximo 12 imágenes.');
    const colorId = req.body.colorId ? Number(req.body.colorId) : null;
    const created = [];
    let order = product.images.length;
    for (const f of req.files) {
      const out = await processImage(f.buffer, `p${id}`);
      created.push(await prisma.productImage.create({ data: { productId: id, colorId, url: out.url, thumbUrl: out.thumbUrl, alt: product.name, sortOrder: order++ } }));
    }
    await audit(req, { service: SERVICE, action: 'PRODUCT_IMAGES_UPLOADED', entity: 'product', entityId: id, after: { images: created.map((i) => i.url), colorId } });
    res.status(201).json(created);
  });

  r.put('/products/:id/images/order', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { order } = z.object({ order: z.array(z.number().int()) }).parse(req.body);
    await prisma.$transaction(order.map((imageId, i) => prisma.productImage.updateMany({ where: { id: imageId, productId: id }, data: { sortOrder: i } })));
    res.json({ ok: true });
  });

  r.put('/images/:id', requirePermission('catalog.manage'), async (req, res) => {
    const data = z.object({ alt: z.string().trim().max(160).optional(), colorId: z.number().int().nullable().optional() }).parse(req.body);
    const img = await prisma.productImage.update({ where: { id: Number(req.params.id) }, data });
    res.json(img);
  });

  r.delete('/images/:id', requirePermission('catalog.manage'), async (req, res) => {
    const img = await prisma.productImage.findUnique({ where: { id: Number(req.params.id) } });
    if (!img) throw notFound('La imagen no existe.');
    await prisma.productImage.delete({ where: { id: img.id } });
    const stillUsed = await prisma.productImage.count({ where: { url: img.url } });
    if (!stillUsed) await deleteImageFiles([img.url, img.thumbUrl]);
    await audit(req, { service: SERVICE, action: 'PRODUCT_IMAGE_DELETED', entity: 'product', entityId: img.productId, before: { url: img.url } });
    res.status(204).end();
  });

  const categorySchema = z.object({
    name: z.string().trim().min(2, 'Escribe el nombre de la categoría.').max(80),
    description: z.string().trim().max(400).optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
    active: z.boolean().optional().default(true),
  });

  r.get('/categories', requirePermission('catalog.read'), async (req, res) => {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } });
    res.json(cats.map((c) => ({ ...c, products: c._count.products })));
  });

  r.post('/categories', requirePermission('catalog.manage'), async (req, res) => {
    const data = categorySchema.parse(req.body);
    let slug = slugify(data.name);
    if (await prisma.category.findUnique({ where: { slug } })) throw conflict('Ya existe una categoría con ese nombre.');
    const c = await prisma.category.create({ data: { ...data, slug } });
    await audit(req, { service: SERVICE, action: 'CATEGORY_CREATED', entity: 'category', entityId: c.id, after: data });
    res.status(201).json(c);
  });

  r.put('/categories/:id', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const data = categorySchema.parse(req.body);
    const before = await prisma.category.findUnique({ where: { id } });
    if (!before) throw notFound('La categoría no existe.');
    const c = await prisma.category.update({ where: { id }, data });
    await audit(req, { service: SERVICE, action: 'CATEGORY_UPDATED', entity: 'category', entityId: id, before, after: data });
    res.json(c);
  });

  r.post('/categories/:id/image', requirePermission('catalog.manage'), upload.single('image'), async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) throw badRequest('Selecciona una imagen.');
    const out = await processImage(req.file.buffer, `cat${id}`);
    const c = await prisma.category.update({ where: { id }, data: { imageUrl: out.thumbUrl } });
    await audit(req, { service: SERVICE, action: 'CATEGORY_IMAGE_UPDATED', entity: 'category', entityId: id, after: { imageUrl: out.thumbUrl } });
    res.json(c);
  });

  r.post('/colors', requirePermission('catalog.manage'), async (req, res) => {
    const data = z.object({ name: z.string().trim().min(2).max(40), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Usa un color en formato #RRGGBB.') }).parse(req.body);
    const max = await prisma.color.aggregate({ _max: { sortOrder: true } });
    const c = await prisma.color.create({ data: { ...data, hex: data.hex.toUpperCase(), sortOrder: (max._max.sortOrder || 0) + 1 } });
    await audit(req, { service: SERVICE, action: 'COLOR_CREATED', entity: 'color', entityId: c.id, after: data });
    res.status(201).json(c);
  });

  r.get('/size-guides', requirePermission('catalog.read'), async (req, res) => res.json(await prisma.sizeGuide.findMany({ orderBy: { id: 'asc' } })));

  r.put('/size-guides/:id', requirePermission('catalog.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const data = z.object({
      name: z.string().trim().min(2).max(80),
      columns: z.array(z.string().trim().min(1).max(30)).min(2).max(8),
      rows: z.array(z.array(z.string().trim().max(30))).min(1).max(12),
      notes: z.string().trim().max(400).optional().nullable(),
    }).parse(req.body);
    if (data.rows.some((row) => row.length !== data.columns.length)) throw badRequest('Cada fila debe tener tantos valores como columnas.');
    const before = await prisma.sizeGuide.findUnique({ where: { id } });
    if (!before) throw notFound('La guía no existe.');
    const g = await prisma.sizeGuide.update({ where: { id }, data });
    await audit(req, { service: SERVICE, action: 'SIZE_GUIDE_UPDATED', entity: 'size_guide', entityId: id, before, after: data });
    res.json(g);
  });

  r.get('/settings', requirePermission('settings.manage'), async (req, res) => {
    const rows = await prisma.storeSetting.findMany({ orderBy: { key: 'asc' } });
    res.json(Object.fromEntries(rows.map((x) => [x.key, x.value])));
  });

  const SETTING_SCHEMAS = {
    store_info: z.object({
      name: z.string().trim().min(2).max(60), legalName: z.string().trim().max(160), nit: z.string().trim().max(40), address: z.string().trim().max(200),
      phone: z.string().trim().max(30), email: z.string().trim().email(), whatsapp: z.string().trim().max(30).optional(), hours: z.string().trim().max(120), sellerInfo: z.string().trim().max(400).optional(),
    }),
    commerce: z.object({
      currency: z.literal('GTQ'), reservationMinutesCard: z.coerce.number().int().min(5).max(240), reservationHoursTransfer: z.coerce.number().int().min(1).max(168),
      maxQtyPerItem: z.coerce.number().int().min(1).max(20), returnDays: z.coerce.number().int().min(0).max(120), lowStockDefault: z.coerce.number().int().min(0).max(100), rounding: z.string().max(120),
    }),
    bank_transfer: z.object({ accounts: z.array(z.object({ bank: z.string().max(80), type: z.string().max(40), number: z.string().max(40), holder: z.string().max(120) })).max(5), instructions: z.string().max(500) }),
    simulation: z.object({ banner: z.string().max(300), testCards: z.array(z.object({ number: z.string(), result: z.string() })) }),
  };

  r.put('/settings/:key', requirePermission('settings.manage'), async (req, res) => {
    const key = String(req.params.key);
    const schema = SETTING_SCHEMAS[key];
    if (!schema) throw badRequest('Parámetro desconocido.');
    const value = schema.parse(req.body);
    const before = await prisma.storeSetting.findUnique({ where: { key } });
    const s = await prisma.storeSetting.upsert({ where: { key }, create: { key, value, updatedBy: req.user.id }, update: { value, updatedBy: req.user.id } });
    await audit(req, { service: SERVICE, action: 'SETTINGS_UPDATED', entity: 'store_setting', entityId: key, before: before?.value, after: value });
    invalidatePromotions();
    res.json(s);
  });

  r.get('/policies', requirePermission('settings.manage'), async (req, res) => {
    res.json(await prisma.policy.findMany({ orderBy: [{ slug: 'asc' }, { version: 'desc' }] }));
  });

  r.post('/policies/:slug', requirePermission('settings.manage'), async (req, res) => {
    const slug = String(req.params.slug);
    const data = z.object({ title: z.string().trim().min(3).max(120), content: z.string().trim().min(20, 'El contenido es demasiado corto.').max(20000) }).parse(req.body);
    const current = await prisma.policy.findFirst({ where: { slug, isCurrent: true } });
    const policy = await prisma.$transaction(async (tx) => {
      await tx.policy.updateMany({ where: { slug }, data: { isCurrent: false } });
      const p = await tx.policy.create({ data: { slug, title: data.title, content: data.content, version: (current?.version || 0) + 1, isCurrent: true, createdBy: req.user.id } });
      await audit(req, { service: SERVICE, action: 'POLICY_PUBLISHED', entity: 'policy', entityId: slug, before: current ? { version: current.version } : null, after: { version: p.version, title: p.title } }, tx);
      return p;
    });
    res.status(201).json(policy);
  });

  return r;
}
