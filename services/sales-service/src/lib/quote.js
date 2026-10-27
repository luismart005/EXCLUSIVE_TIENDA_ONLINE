import { prisma } from '@exclusive/db';
import { calculateQuote, fromCents, toCents, badRequest, conflict } from '@exclusive/common';

export async function getSetting(key) {
  const s = await prisma.storeSetting.findUnique({ where: { key } });
  return s?.value || {};
}

export async function activePromotions(now = new Date()) {
  const rows = await prisma.promotion.findMany({ where: { active: true, requiresCoupon: false, startsAt: { lte: now }, endsAt: { gte: now } } });
  return rows.map(toEngine);
}

export function toEngine(p) {
  return {
    id: p.id, name: p.name, type: p.type, value: p.value.toString(), scope: p.scope, categoryId: p.categoryId, productId: p.productId,
    minSubtotal: p.minSubtotal ? p.minSubtotal.toString() : null, maxDiscount: p.maxDiscount ? p.maxDiscount.toString() : null,
    requiresCoupon: p.requiresCoupon, combinable: p.combinable, priority: p.priority, startsAt: p.startsAt, endsAt: p.endsAt, active: p.active,
  };
}

export async function validateCoupon(code, customerId, tx = prisma) {
  if (!code) return { coupon: null };
  const c = await tx.coupon.findUnique({ where: { code: String(code).trim().toUpperCase() }, include: { promotion: true } });
  if (!c || !c.active || !c.promotion.active) return { error: 'El cupón no existe o no está activo.' };
  const now = new Date();
  if (c.promotion.startsAt > now || c.promotion.endsAt < now) return { error: 'El cupón no está vigente.' };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { error: 'El cupón alcanzó su límite de usos.' };
  if (customerId) {
    const used = await tx.couponRedemption.count({ where: { couponId: c.id, customerId, reversedAt: null } });
    if (used >= c.perCustomerLimit) return { error: 'Ya usaste este cupón el máximo de veces permitido.' };
  }
  return { coupon: { id: c.id, code: c.code, promotion: toEngine(c.promotion), raw: c } };
}

export async function claimCoupon(tx, couponId, customerId) {
  const ok = await tx.$executeRaw`UPDATE coupons SET used_count = used_count + 1 WHERE id = ${couponId} AND active AND (usage_limit IS NULL OR used_count < usage_limit)`;
  if (ok !== 1) throw conflict('El cupón alcanzó su límite de usos.');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${couponId}::int, ${customerId}::int)::text`;
  const c = await tx.coupon.findUnique({ where: { id: couponId } });
  const used = await tx.couponRedemption.count({ where: { couponId, customerId, reversedAt: null } });
  if (used >= c.perCustomerLimit) throw conflict('Ya usaste este cupón el máximo de veces permitido.');
}

const variantInclude = {
  product: { select: { id: true, name: true, slug: true, status: true, categoryId: true, basePrice: true, images: { select: { thumbUrl: true, colorId: true }, orderBy: { sortOrder: 'asc' } } } },
  size: { select: { code: true } },
  color: { select: { id: true, name: true, hex: true } },
  stock: true,
};

export async function buildQuote({ items, couponCode, department, customerId }) {
  const commerce = await getSetting('commerce');
  const maxQty = commerce.maxQtyPerItem || 10;
  const merged = new Map();
  for (const it of items || []) {
    const id = Number(it.variantId);
    const q = Math.max(0, Math.floor(Number(it.quantity) || 0));
    if (!id || !q) continue;
    merged.set(id, (merged.get(id) || 0) + q);
  }
  const variantIds = [...merged.keys()];
  const variants = await prisma.productVariant.findMany({ where: { id: { in: variantIds } }, include: variantInclude });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const problems = [];
  const lines = [];
  for (const [variantId, requested] of merged) {
    const v = byId.get(variantId);
    if (!v || !v.active || v.product.status !== 'ACTIVO') {
      problems.push({ variantId, code: 'UNAVAILABLE', message: 'Este producto ya no está disponible.' });
      continue;
    }
    const available = v.stock ? Math.max(0, v.stock.physical - v.stock.reserved) : 0;
    let quantity = Math.min(requested, maxQty);
    if (requested > maxQty) problems.push({ variantId, code: 'MAX_QTY', message: `Puedes comprar hasta ${maxQty} unidades por producto.` });
    if (available <= 0) {
      problems.push({ variantId, code: 'OUT_OF_STOCK', message: `${v.product.name} (${v.color.name}, ${v.size.code}) está agotado.`, available: 0 });
      continue;
    }
    if (quantity > available) {
      problems.push({ variantId, code: 'INSUFFICIENT', message: `Solo quedan ${available} unidad(es) de ${v.product.name} (${v.color.name}, ${v.size.code}).`, available });
      quantity = available;
    }
    lines.push({
      variantId, productId: v.product.id, categoryId: v.product.categoryId, unitPriceCents: toCents(v.price ?? v.product.basePrice), quantity, requested,
      sku: v.sku, name: v.product.name, slug: v.product.slug, size: v.size.code, color: v.color.name, hex: v.color.hex, available,
      image: (v.product.images.find((i) => i.colorId === v.color.id) || v.product.images[0])?.thumbUrl || null,
    });
  }

  let zone = null;
  if (department) {
    zone = await prisma.shippingZone.findUnique({ where: { department } });
    if (!zone) throw badRequest('El departamento de entrega no es válido.');
  }
  const promotions = await activePromotions();
  let couponInfo = null;
  let coupon = null;
  if (couponCode) {
    const v = await validateCoupon(couponCode, customerId);
    if (v.error) couponInfo = { code: String(couponCode).toUpperCase(), valid: false, message: v.error };
    else coupon = v.coupon;
  }
  const q = calculateQuote({
    lines,
    promotions,
    coupon: coupon ? { code: coupon.code, promotion: coupon.promotion } : null,
    shippingZone: zone ? { id: zone.id, department: zone.department, covered: zone.covered, rate: zone.rate.toString() } : null,
  });
  if (q.coupon) couponInfo = q.coupon;

  return {
    lines: q.lines.map((l) => ({
      variantId: l.variantId, productId: l.productId, categoryId: l.categoryId, sku: l.sku, name: l.name, slug: l.slug, size: l.size, color: l.color, hex: l.hex,
      image: l.image, quantity: l.quantity, requested: l.requested, available: l.available,
      unitPrice: fromCents(l.unitPriceCents), subtotal: fromCents(l.subtotalCents), discount: fromCents(l.discountCents), total: fromCents(l.lineTotalCents),
      promotion: l.promotionName, _unitPriceCents: l.unitPriceCents, _discountCents: l.discountCents, _lineTotalCents: l.lineTotalCents,
    })),
    subtotal: fromCents(q.subtotalCents),
    discount: fromCents(q.discountCents),
    shipping: zone ? fromCents(q.shippingCents) : null,
    shippingDiscount: fromCents(q.shippingDiscountCents),
    total: fromCents(q.totalCents),
    totalCents: q.totalCents,
    freeShippingRemaining: q.freeShippingRemainingCents != null ? fromCents(q.freeShippingRemainingCents) : null,
    shippingZone: zone ? { id: zone.id, department: zone.department, covered: zone.covered, rate: zone.rate, estimatedDays: zone.estimatedDays } : null,
    shippingAvailable: zone ? zone.covered : null,
    appliedPromotions: q.appliedPromotions.map((a) => ({ id: a.id, name: a.name, kind: a.kind, amount: fromCents(a.amountCents) })),
    coupon: couponInfo,
    couponId: coupon && q.coupon?.valid ? coupon.id : null,
    couponAmountCents: q.coupon?.valid ? q.coupon.amountCents : 0,
    problems,
    itemCount: q.lines.reduce((a, l) => a + l.quantity, 0),
  };
}

export function publicQuote(q) {
  const { couponId, couponAmountCents, totalCents, ...rest } = q;
  return { ...rest, lines: rest.lines.map(({ _unitPriceCents, _discountCents, _lineTotalCents, ...l }) => l) };
}
