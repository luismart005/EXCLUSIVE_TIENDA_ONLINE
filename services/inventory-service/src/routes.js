import express from 'express';
import { prisma, Prisma } from '@exclusive/db';
import {
  z, authenticate, requirePermission, requireService, audit, badRequest, notFound, conflict, pageParams, paged, sendCSV, toCents, fromCents,
} from '@exclusive/common';
import {
  SERVICE, MOVEMENT_TYPES, MANUAL_TYPES, applyMovement, notifyLowStock, reserveForOrder, confirmReservation, releaseReservation, dispatchOrder,
} from './stock.js';

const variantInclude = {
  product: { select: { id: true, name: true, slug: true, status: true, category: { select: { id: true, name: true } }, images: { select: { thumbUrl: true, colorId: true }, orderBy: { sortOrder: 'asc' } } } },
  size: { select: { code: true, sortOrder: true } },
  color: { select: { id: true, name: true, hex: true } },
};

const shapeStock = (s) => ({
  variantId: s.variantId,
  sku: s.variant.sku,
  productId: s.variant.product.id,
  productName: s.variant.product.name,
  productStatus: s.variant.product.status,
  category: s.variant.product.category.name,
  size: s.variant.size.code,
  color: s.variant.color.name,
  colorHex: s.variant.color.hex,
  image: (s.variant.product.images.find((i) => i.colorId === s.variant.color.id) || s.variant.product.images[0])?.thumbUrl || null,
  physical: s.physical,
  reserved: s.reserved,
  available: s.physical - s.reserved,
  minStock: s.minStock,
  low: s.physical - s.reserved <= s.minStock,
  active: s.variant.active,
  updatedAt: s.updatedAt,
});

function movementWhere(q) {
  const where = { AND: [] };
  if (q.variantId) where.AND.push({ variantId: Number(q.variantId) });
  if (q.productId) where.AND.push({ variant: { productId: Number(q.productId) } });
  if (q.type) where.AND.push({ type: String(q.type) });
  if (q.direction) where.AND.push({ direction: String(q.direction) });
  if (q.userId) where.AND.push({ userId: Number(q.userId) });
  if (q.reference) where.AND.push({ OR: [{ referenceCode: { contains: String(q.reference), mode: 'insensitive' } }, { documentRef: { contains: String(q.reference), mode: 'insensitive' } }] });
  if (q.search) where.AND.push({ OR: [{ variant: { sku: { contains: String(q.search), mode: 'insensitive' } } }, { variant: { product: { name: { contains: String(q.search), mode: 'insensitive' } } } }] });
  if (q.from) where.AND.push({ createdAt: { gte: new Date(`${q.from}T00:00:00-06:00`) } });
  if (q.to) where.AND.push({ createdAt: { lte: new Date(`${q.to}T23:59:59.999-06:00`) } });
  return where;
}

const shapeMovement = (m) => ({
  id: m.id, createdAt: m.createdAt, type: m.type, typeLabel: MOVEMENT_TYPES[m.type]?.label, direction: m.direction, quantity: m.quantity,
  physicalBefore: m.physicalBefore, physicalAfter: m.physicalAfter, reservedBefore: m.reservedBefore, reservedAfter: m.reservedAfter,
  availableBefore: m.physicalBefore - m.reservedBefore, availableAfter: m.physicalAfter - m.reservedAfter,
  unitCost: m.unitCost, reason: m.reason, referenceType: m.referenceType, referenceId: m.referenceId, referenceCode: m.referenceCode,
  documentRef: m.documentRef, supplier: m.supplier?.name || null, correctsId: m.correctsId, corrected: (m.corrections?.length || 0) > 0,
  userEmail: m.userEmail, variantId: m.variantId, sku: m.variant?.sku, productId: m.variant?.product?.id, productName: m.variant?.product?.name,
  size: m.variant?.size?.code, color: m.variant?.color?.name,
});

export function inventoryRoutes() {
  const r = express.Router();
  r.use(authenticate());

  r.get('/meta', requirePermission('inventory.read'), (req, res) => {
    res.json({ types: Object.entries(MOVEMENT_TYPES).map(([code, v]) => ({ code, ...v, manual: MANUAL_TYPES.includes(code) })) });
  });

  r.get('/stock', requirePermission('inventory.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 25 });
    const { search, categoryId, productId, filtro } = req.query;
    const conds = [Prisma.sql`TRUE`];
    if (search) conds.push(Prisma.sql`(v.sku ILIKE ${'%' + search + '%'} OR p.name ILIKE ${'%' + search + '%'})`);
    if (categoryId) conds.push(Prisma.sql`p.category_id = ${Number(categoryId)}`);
    if (productId) conds.push(Prisma.sql`p.id = ${Number(productId)}`);
    if (filtro === 'bajas') conds.push(Prisma.sql`(s.physical - s.reserved) <= s.min_stock`);
    if (filtro === 'agotadas') conds.push(Prisma.sql`(s.physical - s.reserved) <= 0`);
    if (filtro === 'reservadas') conds.push(Prisma.sql`s.reserved > 0`);
    const where = Prisma.join(conds, ' AND ');
    const order = filtro === 'bajas' || filtro === 'agotadas' ? Prisma.sql`(s.physical - s.reserved) - s.min_stock ASC, p.name` : Prisma.sql`p.name, co.name, sz.sort_order`;
    const ids = await prisma.$queryRaw`
      SELECT s.variant_id AS id FROM inventory_stock s
      JOIN product_variants v ON v.id = s.variant_id JOIN products p ON p.id = v.product_id
      JOIN colors co ON co.id = v.color_id JOIN sizes sz ON sz.id = v.size_id
      WHERE ${where} ORDER BY ${order} LIMIT ${p.take} OFFSET ${p.skip}`;
    const [{ total }] = await prisma.$queryRaw`
      SELECT count(*)::int AS total FROM inventory_stock s JOIN product_variants v ON v.id = s.variant_id JOIN products p ON p.id = v.product_id WHERE ${where}`;
    const rows = await prisma.inventoryStock.findMany({ where: { variantId: { in: ids.map((x) => x.id) } }, include: { variant: { include: variantInclude } } });
    const byId = new Map(rows.map((x) => [x.variantId, x]));
    res.json(paged(ids.map((x) => shapeStock(byId.get(x.id))), total, p));
  });

  r.get('/stock/summary', requirePermission('inventory.read', 'dashboard.view'), async (req, res) => {
    const [row] = await prisma.$queryRaw`
      SELECT count(*)::int AS variants,
             COALESCE(sum(physical),0)::int AS physical,
             COALESCE(sum(reserved),0)::int AS reserved,
             COALESCE(sum(physical - reserved),0)::int AS available,
             count(*) FILTER (WHERE physical - reserved <= min_stock)::int AS low,
             count(*) FILTER (WHERE physical - reserved <= 0)::int AS out
      FROM inventory_stock`;
    const [value] = await prisma.$queryRaw`
      SELECT COALESCE(sum(s.physical * COALESCE(lc.unit_cost, 0)), 0)::text AS cost
      FROM inventory_stock s
      LEFT JOIN LATERAL (SELECT unit_cost FROM inventory_movements m WHERE m.variant_id = s.variant_id AND m.unit_cost IS NOT NULL AND m.direction = 'ENTRADA' ORDER BY m.created_at DESC LIMIT 1) lc ON TRUE`;
    res.json({ ...row, inventoryCost: value.cost });
  });

  r.put('/stock/:variantId/min', requirePermission('inventory.move'), async (req, res) => {
    const variantId = Number(req.params.variantId);
    const { minStock } = z.object({ minStock: z.coerce.number().int('Usa un número entero.').min(0).max(1000) }).parse(req.body);
    const before = await prisma.inventoryStock.findUnique({ where: { variantId } });
    if (!before) throw notFound('La variante no tiene registro de existencias.');
    const s = await prisma.inventoryStock.update({ where: { variantId }, data: { minStock } });
    await audit(req, { service: SERVICE, action: 'MIN_STOCK_UPDATED', entity: 'variant', entityId: variantId, before: { minStock: before.minStock }, after: { minStock } });
    res.json(s);
  });

  r.get('/alerts', requirePermission('inventory.read', 'dashboard.view'), async (req, res) => {
    const rows = await prisma.$queryRaw`SELECT variant_id FROM inventory_stock WHERE physical - reserved <= min_stock ORDER BY (physical - reserved) - min_stock ASC LIMIT 50`;
    const items = await prisma.inventoryStock.findMany({ where: { variantId: { in: rows.map((x) => x.variant_id) } }, include: { variant: { include: variantInclude } } });
    const order = new Map(rows.map((x, i) => [x.variant_id, i]));
    res.json(items.map(shapeStock).sort((a, b) => order.get(a.variantId) - order.get(b.variantId)));
  });

  const movementInclude = { supplier: { select: { name: true } }, corrections: { select: { id: true } }, variant: { select: { sku: true, product: { select: { id: true, name: true } }, size: { select: { code: true } }, color: { select: { name: true } } } } };

  r.get('/movements', requirePermission('inventory.read'), async (req, res) => {
    const p = pageParams(req.query, { defaultSize: 30 });
    const where = movementWhere(req.query);
    const [items, total] = await Promise.all([
      prisma.inventoryMovement.findMany({ where, include: movementInclude, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.inventoryMovement.count({ where }),
    ]);
    res.json(paged(items.map(shapeMovement), total, p));
  });

  r.get('/movements/export', requirePermission('reports.export'), async (req, res) => {
    const items = await prisma.inventoryMovement.findMany({ where: movementWhere(req.query), include: movementInclude, orderBy: { id: 'asc' }, take: 20000 });
    await audit(req, { service: SERVICE, action: 'MOVEMENTS_EXPORTED', entity: 'inventory_movement', after: { filters: req.query, rows: items.length } });
    sendCSV(res, `kardex-${new Date().toISOString().slice(0, 10)}.csv`, items.map(shapeMovement), [
      { key: 'id', label: 'Movimiento' }, { key: 'createdAt', label: 'Fecha (UTC)' }, { key: 'sku', label: 'SKU' }, { key: 'productName', label: 'Producto' },
      { key: 'size', label: 'Talla' }, { key: 'color', label: 'Color' }, { key: 'typeLabel', label: 'Tipo' }, { key: 'direction', label: 'Dirección' },
      { key: 'quantity', label: 'Cantidad' }, { key: 'physicalBefore', label: 'Física antes' }, { key: 'physicalAfter', label: 'Física después' },
      { key: 'reservedBefore', label: 'Reservada antes' }, { key: 'reservedAfter', label: 'Reservada después' }, { key: 'unitCost', label: 'Costo unitario' },
      { key: 'reason', label: 'Motivo' }, { key: 'referenceCode', label: 'Referencia' }, { key: 'documentRef', label: 'Documento' }, { key: 'supplier', label: 'Proveedor' },
      { key: 'userEmail', label: 'Responsable' },
    ]);
  });

  r.get('/kardex/:variantId', requirePermission('inventory.read'), async (req, res) => {
    const variantId = Number(req.params.variantId);
    const stock = await prisma.inventoryStock.findUnique({ where: { variantId }, include: { variant: { include: variantInclude } } });
    if (!stock) throw notFound('La variante no existe.');
    const p = pageParams(req.query, { defaultSize: 50, maxSize: 500 });
    const where = { ...movementWhere(req.query), variantId };
    const [items, total, reservations] = await Promise.all([
      prisma.inventoryMovement.findMany({ where, include: movementInclude, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.inventoryMovement.count({ where }),
      prisma.reservation.findMany({ where: { variantId, status: { in: ['ACTIVA', 'CONFIRMADA'] } }, include: { order: { select: { code: true, status: true } } } }),
    ]);
    res.json({ stock: shapeStock(stock), reservations, ...paged(items.map(shapeMovement), total, p) });
  });

  r.post('/movements', requirePermission('inventory.move'), async (req, res) => {
    const data = z
      .object({
        variantId: z.coerce.number().int().positive('Selecciona una variante.'),
        type: z.enum(MANUAL_TYPES, { message: 'Selecciona un tipo de movimiento válido.' }),
        quantity: z.coerce.number().int('Usa un número entero.').positive('La cantidad debe ser mayor que cero.').max(10000),
        reason: z.string().trim().min(5, 'Explica el motivo (mínimo 5 caracteres).').max(255),
        documentRef: z.string().trim().max(80).optional().nullable(),
        supplierId: z.coerce.number().int().positive().optional().nullable(),
        unitCost: z.coerce.number().nonnegative().optional().nullable(),
      })
      .parse(req.body);
    if (data.type === 'INVENTARIO_INICIAL') {
      const has = await prisma.inventoryMovement.count({ where: { variantId: data.variantId } });
      if (has) throw badRequest('La variante ya tiene movimientos: usa un ajuste de entrada en lugar de inventario inicial.');
    }
    if (data.type === 'SALIDA_DEVOLUCION_PROVEEDOR' && !data.supplierId) throw badRequest('Indica el proveedor al que se devuelve la mercadería.', [{ field: 'supplierId', message: 'Selecciona el proveedor.' }]);
    const key = req.get('idempotency-key') ? `MANUAL:${req.get('idempotency-key')}` : null;
    const result = await prisma.$transaction(async (tx) => {
      const out = await applyMovement(tx, req, {
        ...data, unitCost: data.unitCost != null ? fromCents(toCents(data.unitCost)) : null, referenceType: 'AJUSTE', idempotencyKey: key,
      });
      if (!out.duplicated) {
        await audit(req, { service: SERVICE, action: 'INVENTORY_MOVEMENT_CREATED', entity: 'inventory_movement', entityId: out.movement.id, after: { ...data, physicalBefore: out.movement.physicalBefore, physicalAfter: out.movement.physicalAfter } }, tx);
      }
      return out;
    });
    await notifyLowStock([result]);
    res.status(result.duplicated ? 200 : 201).json({ movement: result.movement, duplicated: result.duplicated });
  });

  r.post('/movements/:id/correct', requirePermission('inventory.move'), async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().min(5, 'Explica por qué se corrige (mínimo 5 caracteres).').max(255) }).parse(req.body);
    const original = await prisma.inventoryMovement.findUnique({ where: { id }, include: { corrections: true } });
    if (!original) throw notFound('El movimiento no existe.');
    if (original.corrections.length) throw conflict('Este movimiento ya fue corregido.');
    if (original.correctsId) throw badRequest('No se puede corregir un movimiento que ya es una corrección.');
    if (['SALIDA_VENTA', 'SALIDA_CAMBIO', 'ENTRADA_DEVOLUCION'].includes(original.type)) throw badRequest('Los movimientos generados por pedidos y posventa se corrigen desde su proceso de origen.');
    const type = original.direction === 'ENTRADA' ? 'SALIDA_AJUSTE' : 'ENTRADA_AJUSTE';
    const result = await prisma.$transaction(async (tx) => {
      const out = await applyMovement(tx, req, {
        variantId: original.variantId, type, quantity: original.quantity, reason: `Corrección del movimiento #${id}: ${reason}`,
        referenceType: 'CORRECCION', referenceId: id, referenceCode: original.referenceCode, correctsId: id, idempotencyKey: `CORRECCION:${id}`,
      });
      await audit(req, { service: SERVICE, action: 'INVENTORY_MOVEMENT_CORRECTED', entity: 'inventory_movement', entityId: id, before: { type: original.type, quantity: original.quantity }, after: { correctionId: out.movement.id, type, reason } }, tx);
      return out;
    });
    await notifyLowStock([result]);
    res.status(201).json({ movement: result.movement });
  });

  const supplierSchema = z.object({
    name: z.string().trim().min(2, 'Escribe el nombre del proveedor.').max(120),
    nit: z.string().trim().max(20).optional().nullable(),
    contact: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    email: z.string().trim().email('Correo inválido.').max(160).optional().nullable().or(z.literal('')).transform((v) => v || null),
    address: z.string().trim().max(200).optional().nullable(),
    active: z.boolean().optional(),
  });

  r.get('/suppliers', requirePermission('inventory.read', 'suppliers.manage'), async (req, res) => {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { purchases: true } } } });
    const totals = await prisma.purchase.groupBy({ by: ['supplierId'], where: { status: 'REGISTRADA' }, _sum: { total: true }, _max: { purchaseDate: true } });
    const t = new Map(totals.map((x) => [x.supplierId, x]));
    res.json(suppliers.map((s) => ({ ...s, purchases: s._count.purchases, totalPurchased: t.get(s.id)?._sum.total || 0, lastPurchase: t.get(s.id)?._max.purchaseDate || null })));
  });

  r.post('/suppliers', requirePermission('suppliers.manage'), async (req, res) => {
    const data = supplierSchema.parse(req.body);
    const s = await prisma.supplier.create({ data });
    await audit(req, { service: SERVICE, action: 'SUPPLIER_CREATED', entity: 'supplier', entityId: s.id, after: data });
    res.status(201).json(s);
  });

  r.put('/suppliers/:id', requirePermission('suppliers.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const data = supplierSchema.parse(req.body);
    const before = await prisma.supplier.findUnique({ where: { id } });
    if (!before) throw notFound('El proveedor no existe.');
    const s = await prisma.supplier.update({ where: { id }, data });
    await audit(req, { service: SERVICE, action: 'SUPPLIER_UPDATED', entity: 'supplier', entityId: id, before, after: data });
    res.json(s);
  });

  r.get('/purchases', requirePermission('inventory.read', 'suppliers.manage'), async (req, res) => {
    const p = pageParams(req.query);
    const where = {
      ...(req.query.supplierId ? { supplierId: Number(req.query.supplierId) } : {}),
      ...(req.query.search ? { OR: [{ code: { contains: String(req.query.search), mode: 'insensitive' } }, { documentNumber: { contains: String(req.query.search), mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.purchase.findMany({ where, include: { supplier: { select: { name: true } }, _count: { select: { items: true } }, items: { select: { quantity: true } } }, orderBy: { id: 'desc' }, skip: p.skip, take: p.take }),
      prisma.purchase.count({ where }),
    ]);
    res.json(paged(items.map(({ items: its, ...x }) => ({ ...x, units: its.reduce((a, i) => a + i.quantity, 0) })), total, p));
  });

  r.get('/purchases/:id', requirePermission('inventory.read', 'suppliers.manage'), async (req, res) => {
    const pur = await prisma.purchase.findUnique({
      where: { id: Number(req.params.id) },
      include: { supplier: true, items: { include: { variant: { include: variantInclude } } } },
    });
    if (!pur) throw notFound('La compra no existe.');
    const movements = await prisma.inventoryMovement.findMany({ where: { referenceType: 'COMPRA', referenceId: pur.id }, include: movementInclude, orderBy: { id: 'asc' } });
    const creator = pur.createdBy ? await prisma.user.findUnique({ where: { id: pur.createdBy }, select: { email: true, firstName: true, lastName: true } }) : null;
    res.json({ ...pur, creator, movements: movements.map(shapeMovement) });
  });

  r.post('/purchases', requirePermission('suppliers.manage', 'inventory.move'), async (req, res) => {
    const data = z
      .object({
        supplierId: z.coerce.number().int().positive('Selecciona un proveedor.'),
        documentNumber: z.string().trim().min(2, 'Escribe el número de factura o documento del proveedor.').max(60),
        purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
        notes: z.string().trim().max(400).optional().nullable(),
        items: z
          .array(z.object({
            variantId: z.coerce.number().int().positive(),
            quantity: z.coerce.number().int('Usa enteros.').positive('Cantidad mayor que cero.').max(10000),
            unitCost: z.coerce.number().nonnegative('El costo no puede ser negativo.').max(100000),
          }))
          .min(1, 'Agrega al menos un producto.'),
      })
      .parse(req.body);
    const ids = data.items.map((i) => i.variantId);
    if (new Set(ids).size !== ids.length) throw badRequest('Hay variantes repetidas en la compra: combina las cantidades en una sola línea.');
    const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
    if (!supplier || !supplier.active) throw badRequest('El proveedor no existe o está inactivo.');
    const idem = req.get('idempotency-key') || null;
    if (idem) {
      const dup = await prisma.purchase.findUnique({ where: { idempotencyKey: idem } });
      if (dup) return res.json({ ...dup, duplicated: true });
    }
    const results = [];
    const purchase = await prisma.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw`SELECT nextval('purchase_code_seq')::int AS n`;
      const code = `COM-${String(n).padStart(6, '0')}`;
      let total = 0;
      const items = data.items.map((i) => {
        const unit = toCents(i.unitCost);
        total += unit * i.quantity;
        return { variantId: i.variantId, quantity: i.quantity, unitCost: fromCents(unit), subtotal: fromCents(unit * i.quantity) };
      });
      const pur = await tx.purchase.create({
        data: {
          code, supplierId: data.supplierId, documentNumber: data.documentNumber, purchaseDate: new Date(`${data.purchaseDate}T00:00:00Z`), notes: data.notes || null,
          total: fromCents(total), idempotencyKey: idem, createdBy: req.user.id, items: { create: items },
        },
      });
      for (const it of items) {
        results.push(await applyMovement(tx, req, {
          variantId: it.variantId, type: 'ENTRADA_COMPRA', quantity: it.quantity, unitCost: it.unitCost, reason: `Compra a proveedor ${code}`,
          referenceType: 'COMPRA', referenceId: pur.id, referenceCode: code, documentRef: data.documentNumber, supplierId: data.supplierId, idempotencyKey: `COMPRA:${pur.id}:${it.variantId}`,
        }));
      }
      await audit(req, { service: SERVICE, action: 'PURCHASE_CREATED', entity: 'purchase', entityId: pur.id, after: { code, supplier: supplier.name, documentNumber: data.documentNumber, total: fromCents(total), items: items.length } }, tx);
      return pur;
    });
    res.status(201).json(purchase);
  });

  r.post('/purchases/:id/void', requirePermission('suppliers.manage'), async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().min(5, 'Explica el motivo de la anulación.').max(255) }).parse(req.body);
    const pur = await prisma.purchase.findUnique({ where: { id }, include: { items: true } });
    if (!pur) throw notFound('La compra no existe.');
    if (pur.status === 'ANULADA') throw conflict('La compra ya está anulada.');
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const it of pur.items) {
        out.push(await applyMovement(tx, req, {
          variantId: it.variantId, type: 'SALIDA_AJUSTE', quantity: it.quantity, reason: `Anulación de compra ${pur.code}: ${reason}`,
          referenceType: 'COMPRA', referenceId: pur.id, referenceCode: pur.code, documentRef: pur.documentNumber, supplierId: pur.supplierId, idempotencyKey: `ANULA_COMPRA:${pur.id}:${it.variantId}`,
        }));
      }
      await tx.purchase.update({ where: { id }, data: { status: 'ANULADA', notes: `${pur.notes ? pur.notes + ' · ' : ''}Anulada: ${reason}`.slice(0, 400) } });
      await audit(req, { service: SERVICE, action: 'PURCHASE_VOIDED', entity: 'purchase', entityId: id, before: { status: 'REGISTRADA' }, after: { status: 'ANULADA', reason } }, tx);
      return out;
    });
    await notifyLowStock(results);
    res.json({ message: 'Compra anulada con movimientos compensatorios.' });
  });

  r.get('/products/:productId/purchases', requirePermission('inventory.read', 'catalog.read'), async (req, res) => {
    const productId = Number(req.params.productId);
    const items = await prisma.purchaseItem.findMany({
      where: { variant: { productId } },
      include: { purchase: { include: { supplier: { select: { name: true } } } }, variant: { include: { size: true, color: true } } },
      orderBy: { purchase: { purchaseDate: 'desc' } },
      take: 500,
    });
    res.json(items.map((i) => ({
      purchaseId: i.purchaseId, code: i.purchase.code, date: i.purchase.purchaseDate, status: i.purchase.status, supplier: i.purchase.supplier.name,
      documentNumber: i.purchase.documentNumber, sku: i.variant.sku, size: i.variant.size.code, color: i.variant.color.name,
      quantity: i.quantity, unitCost: i.unitCost, subtotal: i.subtotal,
    })));
  });

  r.get('/products/:productId/stock', requirePermission('inventory.read', 'catalog.read'), async (req, res) => {
    const items = await prisma.inventoryStock.findMany({ where: { variant: { productId: Number(req.params.productId) } }, include: { variant: { include: variantInclude } } });
    res.json(items.map(shapeStock).sort((a, b) => a.color.localeCompare(b.color) || a.variantId - b.variantId));
  });

  return r;
}

export function internalRoutes() {
  const r = express.Router();
  r.use(requireService());

  r.post('/reservations', async (req, res) => {
    const data = z
      .object({
        orderId: z.number().int().positive(),
        orderCode: z.string(),
        expiresAt: z.string().datetime().nullable(),
        items: z.array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().positive() })).min(1),
      })
      .parse(req.body);
    const out = await reserveForOrder(req, data);
    res.status(out.duplicated ? 200 : 201).json(out);
  });
  r.post('/reservations/:orderId/confirm', async (req, res) => res.json(await confirmReservation(req, Number(req.params.orderId))));
  r.post('/reservations/:orderId/release', async (req, res) => res.json(await releaseReservation(req, Number(req.params.orderId), req.body?.reason)));
  r.post('/reservations/:orderId/dispatch', async (req, res) => res.json(await dispatchOrder(req, Number(req.params.orderId), String(req.body?.orderCode || req.params.orderId))));

  r.post('/returns', async (req, res) => {
    const data = z.object({
      postSaleId: z.number().int(), postSaleCode: z.string(),
      items: z.array(z.object({ variantId: z.number().int(), quantity: z.number().int().positive(), itemId: z.number().int() })).min(1),
    }).parse(req.body);
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const it of data.items) {
        out.push(await applyMovement(tx, req, {
          variantId: it.variantId, type: 'ENTRADA_DEVOLUCION', quantity: it.quantity, reason: `Devolución ${data.postSaleCode} reintegrada tras revisión`,
          referenceType: 'POSVENTA', referenceId: data.postSaleId, referenceCode: data.postSaleCode, idempotencyKey: `DEVOLUCION:${data.postSaleId}:${it.itemId}`,
        }));
      }
      return out;
    });
    res.json({ movements: results.map((x) => x.movement.id) });
  });

  r.post('/exchange-out', async (req, res) => {
    const data = z.object({ postSaleId: z.number().int(), postSaleCode: z.string(), variantId: z.number().int(), quantity: z.number().int().positive() }).parse(req.body);
    const result = await prisma.$transaction((tx) => applyMovement(tx, req, {
      variantId: data.variantId, type: 'SALIDA_CAMBIO', quantity: data.quantity, reason: `Entrega por cambio ${data.postSaleCode}`,
      referenceType: 'POSVENTA', referenceId: data.postSaleId, referenceCode: data.postSaleCode, idempotencyKey: `CAMBIO:${data.postSaleId}:${data.variantId}`,
    }));
    await notifyLowStock([result]);
    res.json({ movement: result.movement.id });
  });

  r.post('/initial-stock', async (req, res) => {
    const data = z.object({
      items: z.array(z.object({ variantId: z.number().int(), quantity: z.number().int().positive().max(10000) })).min(1),
      unitCost: z.number().nonnegative().nullable().optional(),
      reference: z.string().max(200),
    }).parse(req.body);
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const it of data.items) {
        const has = await tx.inventoryMovement.count({ where: { variantId: it.variantId } });
        if (has) continue;
        out.push(await applyMovement(tx, req, {
          variantId: it.variantId, type: 'INVENTARIO_INICIAL', quantity: it.quantity, reason: data.reference,
          unitCost: data.unitCost != null ? fromCents(toCents(data.unitCost)) : null, referenceType: 'INICIAL', idempotencyKey: `INICIAL:${it.variantId}`,
        }));
      }
      if (out.length) await audit(req, { service: SERVICE, action: 'INITIAL_STOCK_REGISTERED', entity: 'inventory_movement', after: { items: data.items, reference: data.reference } }, tx);
      return out;
    });
    res.status(201).json({ movements: results.map((x) => x.movement.id) });
  });

  r.post('/availability', async (req, res) => {
    const { variantIds } = z.object({ variantIds: z.array(z.number().int()).max(500) }).parse(req.body);
    const rows = await prisma.inventoryStock.findMany({ where: { variantId: { in: variantIds } } });
    res.json(Object.fromEntries(rows.map((s) => [s.variantId, { physical: s.physical, reserved: s.reserved, available: s.physical - s.reserved }])));
  });

  return r;
}
