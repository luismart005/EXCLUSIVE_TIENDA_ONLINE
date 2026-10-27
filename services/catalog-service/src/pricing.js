import { prisma } from '@exclusive/db';
import { calculateQuote, toCents, fromCents } from '@exclusive/common';

let cache = { at: 0, promos: [] };

export async function activePromotions() {
  if (Date.now() - cache.at < 30_000) return cache.promos;
  const now = new Date();
  const rows = await prisma.promotion.findMany({ where: { active: true, requiresCoupon: false, startsAt: { lte: now }, endsAt: { gte: now } } });
  cache = {
    at: Date.now(),
    promos: rows.map((p) => ({
      id: p.id, name: p.name, description: p.description, type: p.type, value: p.value.toString(), scope: p.scope, categoryId: p.categoryId, productId: p.productId,
      minSubtotal: p.minSubtotal ? p.minSubtotal.toString() : null, maxDiscount: p.maxDiscount ? p.maxDiscount.toString() : null,
      requiresCoupon: false, combinable: p.combinable, priority: p.priority, startsAt: p.startsAt, endsAt: p.endsAt, active: true,
    })),
  };
  return cache.promos;
}

export function invalidatePromotions() {
  cache.at = 0;
}

export function displayPrice(product, promos, variantPrice = null) {
  const unit = toCents(variantPrice ?? product.basePrice);
  const eligible = promos.filter((p) => p.type !== 'ENVIO_GRATIS' && !p.minSubtotal && !(p.type === 'MONTO_FIJO' && p.scope === 'TODO'));
  const q = calculateQuote({ lines: [{ variantId: 0, productId: product.id, categoryId: product.categoryId, unitPriceCents: unit, quantity: 1 }], promotions: eligible });
  const line = q.lines[0];
  const compare = product.compareAtPrice ? toCents(product.compareAtPrice) : null;
  return {
    price: fromCents(unit),
    finalPrice: fromCents(line.lineTotalCents),
    compareAtPrice: line.discountCents > 0 ? fromCents(unit) : compare && compare > unit ? fromCents(compare) : null,
    promotion: line.promotionName,
    discountPercent: line.discountCents > 0 ? Math.round((line.discountCents / unit) * 100) : compare && compare > unit ? Math.round(((compare - unit) / compare) * 100) : 0,
  };
}
