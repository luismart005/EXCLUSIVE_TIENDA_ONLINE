import express from 'express';
import { prisma, Prisma } from '@exclusive/db';
import { z, authenticate, requirePermission, badRequest, sendCSV, audit } from '@exclusive/common';

const TZ = 'America/Guatemala';
const SERVICE = 'analytics-service';

export function parseRange(q) {
  const today = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : today;
  const defFrom = new Date(new Date(`${to}T00:00:00Z`).getTime() - 89 * 86400e3).toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : defFrom;
  if (from > to) throw badRequest('La fecha inicial debe ser anterior a la final.');
  return { from, to, fromTs: new Date(`${from}T00:00:00-06:00`), toTs: new Date(`${to}T23:59:59.999-06:00`) };
}

const GROUPS = { day: 'day', week: 'week', month: 'month' };
const n = (v) => Number(v || 0);

export async function salesSeries({ fromTs, toTs }, groupBy = 'week') {
  const g = GROUPS[groupBy] || 'week';
  const unit = Prisma.raw(`'${g}'`);
  const step = Prisma.raw(`'1 ${g}'`);
  const rows = await prisma.$queryRaw`
    WITH periods AS (
      SELECT generate_series(date_trunc(${unit}, ${fromTs}::timestamptz AT TIME ZONE ${TZ}), date_trunc(${unit}, ${toTs}::timestamptz AT TIME ZONE ${TZ}), ${step}::interval) AS p
    ),
    o AS (
      SELECT date_trunc(${unit}, created_at AT TIME ZONE ${TZ}) AS p,
             count(*) FILTER (WHERE status <> 'CANCELADO') AS orders,
             COALESCE(sum(total) FILTER (WHERE status <> 'CANCELADO'), 0) AS sales,
             COALESCE(sum(subtotal) FILTER (WHERE status <> 'CANCELADO'), 0) AS gross,
             COALESCE(sum(discount_total) FILTER (WHERE status <> 'CANCELADO'), 0) AS discounts,
             COALESCE(sum(shipping_cost - shipping_discount) FILTER (WHERE status <> 'CANCELADO'), 0) AS shipping,
             count(*) FILTER (WHERE status = 'CANCELADO') AS cancelled,
             COALESCE(sum(total) FILTER (WHERE status = 'CANCELADO'), 0) AS cancelled_amount
      FROM orders WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1
    ),
    u AS (
      SELECT date_trunc(${unit}, o.created_at AT TIME ZONE ${TZ}) AS p, sum(oi.quantity) AS units
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO' GROUP BY 1
    ),
    pay AS (
      SELECT date_trunc(${unit}, updated_at AT TIME ZONE ${TZ}) AS p, sum(amount) AS collected
      FROM payments WHERE status = 'APROBADO' AND updated_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1
    ),
    rf AS (
      SELECT date_trunc(${unit}, created_at AT TIME ZONE ${TZ}) AS p, sum(amount) AS refunded, count(*) AS refunds
      FROM refunds WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1
    )
    SELECT to_char(periods.p, 'YYYY-MM-DD') AS period,
           COALESCE(o.orders, 0)::int AS orders, COALESCE(u.units, 0)::int AS units,
           COALESCE(o.sales, 0)::text AS sales, COALESCE(o.gross, 0)::text AS gross, COALESCE(o.discounts, 0)::text AS discounts,
           COALESCE(o.shipping, 0)::text AS shipping, COALESCE(pay.collected, 0)::text AS collected,
           COALESCE(o.cancelled, 0)::int AS cancelled, COALESCE(o.cancelled_amount, 0)::text AS "cancelledAmount",
           COALESCE(rf.refunded, 0)::text AS refunded, COALESCE(rf.refunds, 0)::int AS refunds
    FROM periods LEFT JOIN o ON o.p = periods.p LEFT JOIN u ON u.p = periods.p LEFT JOIN pay ON pay.p = periods.p LEFT JOIN rf ON rf.p = periods.p
    ORDER BY periods.p`;
  return rows;
}

export async function kpis({ fromTs, toTs }) {
  const [[o], [p], [r], [c], [ret]] = await Promise.all([
    prisma.$queryRaw`
      SELECT count(*) FILTER (WHERE status <> 'CANCELADO')::int AS orders,
             COALESCE(sum(total) FILTER (WHERE status <> 'CANCELADO'), 0)::text AS sales,
             COALESCE(sum(discount_total) FILTER (WHERE status <> 'CANCELADO'), 0)::text AS discounts,
             count(*) FILTER (WHERE status = 'CANCELADO')::int AS cancelled,
             count(DISTINCT customer_id) FILTER (WHERE status <> 'CANCELADO')::int AS buyers
      FROM orders WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
    prisma.$queryRaw`SELECT COALESCE(sum(amount), 0)::text AS collected FROM payments WHERE status = 'APROBADO' AND updated_at BETWEEN ${fromTs} AND ${toTs}`,
    prisma.$queryRaw`SELECT COALESCE(sum(amount), 0)::text AS refunded, count(*)::int AS refunds FROM refunds WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
    prisma.$queryRaw`
      SELECT COALESCE(sum(oi.quantity), 0)::int AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO'`,
    prisma.$queryRaw`
      SELECT count(*) FILTER (WHERE type = 'DEVOLUCION')::int AS returns, count(*) FILTER (WHERE type = 'CAMBIO')::int AS exchanges, count(*) FILTER (WHERE type = 'RECLAMO')::int AS claims
      FROM post_sale_requests WHERE created_at BETWEEN ${fromTs} AND ${toTs}`,
  ]);
  const newCustomers = await prisma.user.count({ where: { createdAt: { gte: fromTs, lte: toTs }, roles: { some: { role: { code: 'CLIENTE' } } } } });
  return {
    ...o, ...p, ...r, ...c, ...ret, newCustomers,
    avgTicket: o.orders ? (n(o.sales) / o.orders).toFixed(2) : '0.00',
    cancelRate: o.orders + o.cancelled ? ((o.cancelled / (o.orders + o.cancelled)) * 100).toFixed(1) : '0.0',
  };
}

export async function topProducts({ fromTs, toTs }, limit = 10) {
  return prisma.$queryRaw`
    SELECT oi.product_id AS "productId", p.name, c.name AS category, sum(oi.quantity)::int AS units, sum(oi.line_total)::text AS revenue,
           count(DISTINCT oi.order_id)::int AS orders,
           (SELECT thumb_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id
    WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO'
    GROUP BY oi.product_id, p.id, p.name, c.name ORDER BY units DESC, revenue DESC LIMIT ${limit}`;
}

export async function lowRotation({ fromTs, toTs }, limit = 10) {
  return prisma.$queryRaw`
    WITH st AS (
      SELECT v.product_id, sum(s.physical)::int AS stock FROM inventory_stock s JOIN product_variants v ON v.id = s.variant_id GROUP BY 1
    ), sold AS (
      SELECT oi.product_id, sum(oi.quantity)::int AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO' GROUP BY 1
    )
    SELECT p.id AS "productId", p.name, c.name AS category, COALESCE(st.stock, 0) AS stock, COALESCE(sold.units, 0) AS units,
           CASE WHEN COALESCE(st.stock, 0) = 0 THEN 0 ELSE round(COALESCE(sold.units, 0)::numeric / st.stock, 2) END::text AS rotation,
           p.created_at AS "createdAt"
    FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN st ON st.product_id = p.id LEFT JOIN sold ON sold.product_id = p.id
    WHERE p.status = 'ACTIVO' AND COALESCE(st.stock, 0) > 0 AND p.created_at < ${fromTs}
    ORDER BY COALESCE(sold.units, 0)::numeric / NULLIF(st.stock, 0) ASC NULLS FIRST, st.stock DESC LIMIT ${limit}`;
}

export async function byDimension({ fromTs, toTs }, dim) {
  const col = { category: Prisma.raw('c.name'), size: Prisma.raw('oi.size_name'), color: Prisma.raw('oi.color_name') }[dim];
  const order = dim === 'size' ? Prisma.raw('min(sz.sort_order)') : Prisma.raw('units DESC');
  return prisma.$queryRaw`
    SELECT ${col} AS label, sum(oi.quantity)::int AS units, sum(oi.line_total)::text AS revenue, count(DISTINCT oi.order_id)::int AS orders,
           ${dim === 'color' ? Prisma.sql`min(co.hex)` : Prisma.sql`NULL`} AS hex
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN categories c ON c.id = oi.category_id
    LEFT JOIN sizes sz ON sz.code = oi.size_name LEFT JOIN colors co ON co.name = oi.color_name
    WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO'
    GROUP BY 1 ORDER BY ${order}`;
}

export async function paymentMethods({ fromTs, toTs }) {
  return prisma.$queryRaw`
    SELECT payment_method AS method, count(*)::int AS orders, sum(total)::text AS sales
    FROM orders WHERE created_at BETWEEN ${fromTs} AND ${toTs} AND status <> 'CANCELADO' GROUP BY 1 ORDER BY orders DESC`;
}

export async function discountsReport({ fromTs, toTs }) {
  const [byPromotion, byCoupon] = await Promise.all([
    prisma.$queryRaw`
      SELECT COALESCE(oi.promotion_name, 'Sin promoción') AS name, count(DISTINCT oi.order_id)::int AS orders, sum(oi.quantity)::int AS units, sum(oi.discount_amount)::text AS amount
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO' AND oi.discount_amount > 0
      GROUP BY 1 ORDER BY sum(oi.discount_amount) DESC`,
    prisma.$queryRaw`
      SELECT c.code, count(*)::int AS uses, sum(cr.amount)::text AS amount, count(*) FILTER (WHERE cr.reversed_at IS NOT NULL)::int AS reversed
      FROM coupon_redemptions cr JOIN coupons c ON c.id = cr.coupon_id
      WHERE cr.created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY c.code ORDER BY uses DESC`,
  ]);
  const [shipping] = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE shipping_discount > 0)::int AS orders, COALESCE(sum(shipping_discount), 0)::text AS amount
    FROM orders WHERE created_at BETWEEN ${fromTs} AND ${toTs} AND status <> 'CANCELADO'`;
  return { byPromotion, byCoupon, freeShipping: shipping };
}

export async function returnsReport({ fromTs, toTs }) {
  const [byType, byCategory, refunds] = await Promise.all([
    prisma.$queryRaw`
      SELECT type, status, count(*)::int AS requests FROM post_sale_requests WHERE created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1, 2 ORDER BY 1, 2`,
    prisma.$queryRaw`
      WITH sold AS (
        SELECT oi.category_id, sum(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at BETWEEN ${fromTs} AND ${toTs} AND o.status <> 'CANCELADO' GROUP BY 1
      ), ret AS (
        SELECT oi.category_id, sum(psi.quantity) AS units, sum(psi.received_qty) FILTER (WHERE psi.condition = 'BUENA') AS restocked
        FROM post_sale_items psi JOIN post_sale_requests ps ON ps.id = psi.request_id JOIN order_items oi ON oi.id = psi.order_item_id
        WHERE ps.type IN ('DEVOLUCION', 'CAMBIO') AND ps.status <> 'RECHAZADA' AND ps.created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1
      )
      SELECT c.name AS category, COALESCE(sold.units, 0)::int AS sold, COALESCE(ret.units, 0)::int AS returned, COALESCE(ret.restocked, 0)::int AS restocked,
             CASE WHEN COALESCE(sold.units, 0) = 0 THEN '0.0' ELSE round(COALESCE(ret.units, 0) * 100.0 / sold.units, 1)::text END AS rate
      FROM categories c LEFT JOIN sold ON sold.category_id = c.id LEFT JOIN ret ON ret.category_id = c.id ORDER BY c.sort_order`,
    prisma.$queryRaw`
      SELECT r.reason, count(*)::int AS refunds, sum(r.amount)::text AS amount FROM refunds r
      WHERE r.created_at BETWEEN ${fromTs} AND ${toTs} GROUP BY 1 ORDER BY sum(r.amount) DESC LIMIT 20`,
  ]);
  return { byType, byCategory, refunds };
}

const CSV_COLUMNS = {
  sales: [
    { key: 'period', label: 'Período' }, { key: 'orders', label: 'Pedidos' }, { key: 'units', label: 'Unidades' }, { key: 'gross', label: 'Subtotal (Q)' },
    { key: 'discounts', label: 'Descuentos (Q)' }, { key: 'shipping', label: 'Envío cobrado (Q)' }, { key: 'sales', label: 'Ventas (Q)' }, { key: 'collected', label: 'Cobrado (Q)' },
    { key: 'cancelled', label: 'Pedidos cancelados' }, { key: 'cancelledAmount', label: 'Monto cancelado (Q)' }, { key: 'refunds', label: 'Reembolsos' }, { key: 'refunded', label: 'Reembolsado (Q)' },
  ],
  products: [{ key: 'name', label: 'Producto' }, { key: 'category', label: 'Categoría' }, { key: 'units', label: 'Unidades' }, { key: 'orders', label: 'Pedidos' }, { key: 'revenue', label: 'Ventas (Q)' }],
  lowRotation: [{ key: 'name', label: 'Producto' }, { key: 'category', label: 'Categoría' }, { key: 'stock', label: 'Existencia física' }, { key: 'units', label: 'Unidades vendidas' }, { key: 'rotation', label: 'Rotación' }],
  dimension: [{ key: 'label', label: 'Valor' }, { key: 'units', label: 'Unidades' }, { key: 'orders', label: 'Pedidos' }, { key: 'revenue', label: 'Ventas (Q)' }],
};

export function reportRoutes() {
  const r = express.Router();
  r.use(authenticate());

  r.get('/dashboard', requirePermission('dashboard.view'), async (req, res) => {
    const range = parseRange(req.query);
    const days = (range.toTs - range.fromTs) / 86400e3;
    const span = days;
    const prevRange = { fromTs: new Date(range.fromTs.getTime() - span * 86400e3), toTs: new Date(range.fromTs.getTime() - 1) };
    const canSales = req.user.permissions.has('reports.read') || req.user.permissions.has('orders.read');
    if (!canSales) {
      return res.json({ range: { from: range.from, to: range.to }, limited: true });
    }
    const [current, previous, series, categories, top, methods, statuses] = await Promise.all([
      kpis(range), kpis(prevRange), salesSeries(range, days > 120 ? 'week' : days > 31 ? 'week' : 'day'), byDimension(range, 'category'), topProducts(range, 5), paymentMethods(range),
      prisma.$queryRaw`SELECT status, count(*)::int AS orders FROM orders WHERE created_at BETWEEN ${range.fromTs} AND ${range.toTs} GROUP BY 1`,
    ]);
    res.json({ range: { from: range.from, to: range.to }, kpis: current, previous, series, categories, top, methods, statuses });
  });

  r.get('/reports/sales', requirePermission('reports.read'), async (req, res) => {
    const range = parseRange(req.query);
    const groupBy = z.enum(['day', 'week', 'month']).catch('week').parse(req.query.groupBy);
    const rows = await salesSeries(range, groupBy);
    if (req.query.format === 'csv') {
      if (!req.user.permissions.has('reports.export')) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para exportar reportes.' } });
      await audit(req, { service: SERVICE, action: 'REPORT_EXPORTED', entity: 'report', entityId: 'ventas', after: { ...range, groupBy } });
      return sendCSV(res, `ventas-${range.from}-a-${range.to}.csv`, rows, CSV_COLUMNS.sales);
    }
    res.json({ range: { from: range.from, to: range.to }, groupBy, rows, kpis: await kpis(range) });
  });

  r.get('/reports/products', requirePermission('reports.read'), async (req, res) => {
    const range = parseRange(req.query);
    const [top, low] = await Promise.all([topProducts(range, 15), lowRotation(range, 15)]);
    if (req.query.format === 'csv') {
      if (!req.user.permissions.has('reports.export')) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para exportar reportes.' } });
      await audit(req, { service: SERVICE, action: 'REPORT_EXPORTED', entity: 'report', entityId: req.query.kind === 'low' ? 'baja-rotacion' : 'mas-vendidos', after: range });
      return req.query.kind === 'low'
        ? sendCSV(res, `baja-rotacion-${range.from}-a-${range.to}.csv`, low, CSV_COLUMNS.lowRotation)
        : sendCSV(res, `mas-vendidos-${range.from}-a-${range.to}.csv`, top, CSV_COLUMNS.products);
    }
    res.json({ range: { from: range.from, to: range.to }, top, low });
  });

  r.get('/reports/dimensions', requirePermission('reports.read'), async (req, res) => {
    const range = parseRange(req.query);
    const [category, size, color, methods] = await Promise.all([byDimension(range, 'category'), byDimension(range, 'size'), byDimension(range, 'color'), paymentMethods(range)]);
    if (req.query.format === 'csv') {
      if (!req.user.permissions.has('reports.export')) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para exportar reportes.' } });
      const dim = ['category', 'size', 'color'].includes(req.query.dim) ? req.query.dim : 'category';
      await audit(req, { service: SERVICE, action: 'REPORT_EXPORTED', entity: 'report', entityId: `por-${dim}`, after: range });
      return sendCSV(res, `ventas-por-${dim}-${range.from}-a-${range.to}.csv`, { category, size, color }[dim], CSV_COLUMNS.dimension);
    }
    res.json({ range: { from: range.from, to: range.to }, category, size, color, methods });
  });

  r.get('/reports/discounts', requirePermission('reports.read'), async (req, res) => {
    const range = parseRange(req.query);
    res.json({ range: { from: range.from, to: range.to }, ...(await discountsReport(range)) });
  });

  r.get('/reports/returns', requirePermission('reports.read'), async (req, res) => {
    const range = parseRange(req.query);
    res.json({ range: { from: range.from, to: range.to }, ...(await returnsReport(range)) });
  });

  r.get('/reports/inventory', requirePermission('reports.read', 'inventory.read'), async (req, res) => {
    const range = parseRange(req.query);
    const [byType, byCategory] = await Promise.all([
      prisma.$queryRaw`
        SELECT type, direction, count(*)::int AS movements, sum(quantity)::int AS units FROM inventory_movements
        WHERE created_at BETWEEN ${range.fromTs} AND ${range.toTs} GROUP BY 1, 2 ORDER BY units DESC`,
      prisma.$queryRaw`
        SELECT c.name AS category, sum(s.physical)::int AS physical, sum(s.reserved)::int AS reserved, sum(s.physical - s.reserved)::int AS available,
               count(*) FILTER (WHERE s.physical - s.reserved <= s.min_stock)::int AS low
        FROM inventory_stock s JOIN product_variants v ON v.id = s.variant_id JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
        GROUP BY c.name, c.sort_order ORDER BY c.sort_order`,
    ]);
    res.json({ range: { from: range.from, to: range.to }, byType, byCategory });
  });

  return r;
}
