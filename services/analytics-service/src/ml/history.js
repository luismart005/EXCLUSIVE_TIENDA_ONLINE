import { prisma } from '@exclusive/db';

const DAY = 86400e3;
const localDate = (d) => new Date(d.getTime() - 6 * 3600e3);
export function mondayOf(date) {
  const l = localDate(date);
  const dow = (l.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - dow));
}
const iso = (d) => d.toISOString().slice(0, 10);

export async function prepareWeeklyHistory() {
  const bounds = await prisma.order.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });
  if (!bounds._min.createdAt) return { weeks: 0, categories: 0, rows: 0 };
  const cutoff = new Date(Math.min(Date.now(), bounds._max.createdAt.getTime() + 1000));
  const first = mondayOf(bounds._min.createdAt);
  const last = new Date(mondayOf(cutoff).getTime() - 7 * DAY);
  if (last < first) return { weeks: 0, categories: 0, rows: 0 };

  const rows = await prisma.$queryRaw`
    WITH weeks AS (SELECT generate_series(${iso(first)}::date, ${iso(last)}::date, interval '7 days')::date AS week_start),
    sold AS (
      SELECT oi.category_id, date_trunc('week', o.created_at AT TIME ZONE 'America/Guatemala')::date AS week_start,
             sum(oi.quantity) FILTER (WHERE o.status <> 'CANCELADO') AS sold,
             sum(oi.quantity) FILTER (WHERE o.status = 'CANCELADO') AS cancelled,
             sum(oi.line_total) FILTER (WHERE o.status <> 'CANCELADO') AS revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id GROUP BY 1, 2
    ),
    returned AS (
      SELECT oi.category_id, date_trunc('week', o.created_at AT TIME ZONE 'America/Guatemala')::date AS week_start, sum(psi.received_qty) AS returned
      FROM post_sale_items psi JOIN post_sale_requests ps ON ps.id = psi.request_id
      JOIN order_items oi ON oi.id = psi.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE ps.type = 'DEVOLUCION' AND ps.status <> 'RECHAZADA' GROUP BY 1, 2
    ),
    stockouts AS (
      SELECT p.category_id, date_trunc('week', m.created_at AT TIME ZONE 'America/Guatemala')::date AS week_start, count(DISTINCT m.variant_id) AS n
      FROM inventory_movements m JOIN product_variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
      WHERE m.physical_after - m.reserved_after <= 0 GROUP BY 1, 2
    )
    SELECT c.id AS category_id, w.week_start,
           COALESCE(s.sold, 0)::int AS sold, COALESCE(s.cancelled, 0)::int AS cancelled, COALESCE(r.returned, 0)::int AS returned,
           COALESCE(s.revenue, 0)::text AS revenue, COALESCE(st.n, 0)::int AS stockouts
    FROM weeks w CROSS JOIN categories c
    LEFT JOIN sold s ON s.category_id = c.id AND s.week_start = w.week_start
    LEFT JOIN returned r ON r.category_id = c.id AND r.week_start = w.week_start
    LEFT JOIN stockouts st ON st.category_id = c.id AND st.week_start = w.week_start
    ORDER BY c.id, w.week_start`;

  await prisma.$transaction(async (tx) => {
    await tx.salesWeeklyHistory.deleteMany({});
    for (let i = 0; i < rows.length; i += 500) {
      await tx.salesWeeklyHistory.createMany({
        data: rows.slice(i, i + 500).map((r) => ({
          categoryId: r.category_id, weekStart: new Date(r.week_start), unitsSold: r.sold, unitsCancelled: r.cancelled, unitsReturned: r.returned,
          netUnits: Math.max(0, r.sold - r.returned), revenue: r.revenue, stockoutVariants: r.stockouts,
        })),
      });
    }
  });
  const categories = new Set(rows.map((r) => r.category_id)).size;
  return { weeks: rows.length / Math.max(1, categories), categories, rows: rows.length, from: iso(first), to: iso(last) };
}

export async function loadHistory() {
  const rows = await prisma.salesWeeklyHistory.findMany({ orderBy: [{ categoryId: 'asc' }, { weekStart: 'asc' }], include: { category: { select: { name: true } } } });
  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.categoryId)) byCat.set(r.categoryId, { categoryId: r.categoryId, name: r.category.name, weeks: [] });
    byCat.get(r.categoryId).weeks.push({ weekStart: iso(r.weekStart), net: r.netUnits, sold: r.unitsSold, returned: r.unitsReturned, cancelled: r.unitsCancelled, stockouts: r.stockoutVariants, revenue: r.revenue.toString() });
  }
  return [...byCat.values()];
}
