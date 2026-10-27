import { percentOf, allocate, toCents } from './money.js';

const inWindow = (p, now) => p.active !== false && new Date(p.startsAt) <= now && new Date(p.endsAt) >= now;

const matchesScope = (p, line) =>
  p.scope === 'TODO' ||
  (p.scope === 'CATEGORIA' && Number(p.categoryId) === Number(line.categoryId)) ||
  (p.scope === 'PRODUCTO' && Number(p.productId) === Number(line.productId));

function lineDiscountFor(p, line, baseCents) {
  if (p.type === 'PORCENTAJE') return Math.min(baseCents, percentOf(baseCents, p.value));
  if (p.type === 'MONTO_FIJO' && p.scope !== 'TODO') return Math.min(baseCents, toCents(p.value) * line.quantity);
  return 0;
}

export function calculateQuote({ lines, promotions = [], coupon = null, shippingZone = null, now = new Date() }) {
  const work = lines.map((l) => ({
    ...l,
    subtotalCents: l.unitPriceCents * l.quantity,
    discountCents: 0,
    promotionName: null,
    promotionId: null,
    autoDiscounted: false,
  }));
  const subtotalCents = work.reduce((a, l) => a + l.subtotalCents, 0);
  const applied = new Map();
  const addApplied = (p, amount, kind) => {
    if (amount <= 0) return;
    const cur = applied.get(p.id) || { id: p.id, name: p.name, amountCents: 0, kind };
    cur.amountCents += amount;
    applied.set(p.id, cur);
  };

  const active = promotions.filter((p) => !p.requiresCoupon && inWindow(p, now));
  const meetsMin = (p) => !p.minSubtotal || subtotalCents >= toCents(p.minSubtotal);

  for (const line of work) {
    let best = null;
    let bestAmount = 0;
    for (const p of active) {
      if (p.type === 'ENVIO_GRATIS' || (p.type === 'MONTO_FIJO' && p.scope === 'TODO')) continue;
      if (!matchesScope(p, line) || !meetsMin(p)) continue;
      let amount = lineDiscountFor(p, line, line.subtotalCents);
      if (p.maxDiscount) amount = Math.min(amount, toCents(p.maxDiscount));
      if (amount > bestAmount || (amount === bestAmount && best && (p.priority || 0) > (best.priority || 0))) {
        best = p;
        bestAmount = amount;
      }
    }
    if (best && bestAmount > 0) {
      line.discountCents = bestAmount;
      line.promotionName = best.name;
      line.promotionId = best.id;
      line.autoDiscounted = true;
      addApplied(best, bestAmount, 'AUTOMATICA');
    }
  }

  for (const p of active.filter((x) => x.type === 'MONTO_FIJO' && x.scope === 'TODO').sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    if (!meetsMin(p)) continue;
    const eligible = work.filter((l) => (p.combinable ? true : !l.autoDiscounted));
    const remaining = eligible.map((l) => l.subtotalCents - l.discountCents);
    const pool = remaining.reduce((a, b) => a + b, 0);
    let amount = Math.min(toCents(p.value), pool);
    if (p.maxDiscount) amount = Math.min(amount, toCents(p.maxDiscount));
    const parts = allocate(amount, remaining);
    eligible.forEach((l, i) => {
      if (parts[i] > 0) {
        l.discountCents += parts[i];
        l.autoDiscounted = true;
        l.promotionName = l.promotionName ? `${l.promotionName} + ${p.name}` : p.name;
      }
    });
    addApplied(p, amount, 'AUTOMATICA');
  }

  let couponResult = null;
  let couponFreeShipping = false;
  if (coupon && coupon.promotion) {
    const p = coupon.promotion;
    const afterAuto = subtotalCents - work.reduce((a, l) => a + l.discountCents, 0);
    if (!inWindow(p, now)) {
      couponResult = { code: coupon.code, valid: false, message: 'El cupón no está vigente.' };
    } else if (p.minSubtotal && afterAuto < toCents(p.minSubtotal)) {
      couponResult = { code: coupon.code, valid: false, message: `El cupón requiere una compra mínima de Q ${Number(p.minSubtotal).toFixed(2)}.` };
    } else if (p.type === 'ENVIO_GRATIS') {
      couponFreeShipping = true;
      couponResult = { code: coupon.code, valid: true, message: 'Envío gratis aplicado.', amountCents: 0, promotionId: p.id };
    } else {
      const eligible = work.filter((l) => matchesScope(p, l) && (p.combinable || !l.autoDiscounted));
      let total = 0;
      if (p.type === 'PORCENTAJE') {
        for (const l of eligible) {
          const base = l.subtotalCents - l.discountCents;
          let d = Math.min(base, percentOf(base, p.value));
          total += d;
          l.couponCents = d;
        }
        if (p.maxDiscount && total > toCents(p.maxDiscount)) {
          const cap = toCents(p.maxDiscount);
          const parts = allocate(cap, eligible.map((l) => l.couponCents));
          eligible.forEach((l, i) => (l.couponCents = parts[i]));
          total = cap;
        }
      } else if (p.type === 'MONTO_FIJO') {
        if (p.scope === 'TODO') {
          const remaining = eligible.map((l) => l.subtotalCents - l.discountCents);
          const pool = remaining.reduce((a, b) => a + b, 0);
          total = Math.min(toCents(p.value), pool);
          if (p.maxDiscount) total = Math.min(total, toCents(p.maxDiscount));
          const parts = allocate(total, remaining);
          eligible.forEach((l, i) => (l.couponCents = parts[i]));
        } else {
          for (const l of eligible) {
            const base = l.subtotalCents - l.discountCents;
            l.couponCents = Math.min(base, toCents(p.value) * l.quantity);
            total += l.couponCents;
          }
        }
      }
      for (const l of eligible) {
        if (l.couponCents > 0) {
          l.discountCents += l.couponCents;
          l.promotionName = l.promotionName ? `${l.promotionName} + Cupón ${coupon.code}` : `Cupón ${coupon.code}`;
        }
        delete l.couponCents;
      }
      if (total <= 0) {
        couponResult = {
          code: coupon.code,
          valid: false,
          message: p.combinable
            ? 'El cupón no aplica a los productos del carrito.'
            : 'El cupón no se combina con otras promociones y no aplica a los productos del carrito.',
        };
      } else {
        couponResult = { code: coupon.code, valid: true, message: 'Cupón aplicado.', amountCents: total, promotionId: p.id };
        addApplied(p, total, 'CUPON');
      }
    }
  }

  const discountCents = work.reduce((a, l) => a + l.discountCents, 0);
  const merchandiseCents = subtotalCents - discountCents;
  let shippingCents = 0;
  let shippingDiscountCents = 0;
  let shippingAvailable = null;
  let freeShippingRemainingCents = null;
  if (shippingZone) {
    shippingAvailable = !!shippingZone.covered;
    shippingCents = shippingAvailable ? toCents(shippingZone.rate) : 0;
  }
  const freeShip = active
    .filter((p) => p.type === 'ENVIO_GRATIS')
    .sort((a, b) => toCents(a.minSubtotal || 0) - toCents(b.minSubtotal || 0))[0];
  if (freeShip) {
    const min = toCents(freeShip.minSubtotal || 0);
    if (merchandiseCents >= min) {
      shippingDiscountCents = shippingCents;
      if (shippingCents > 0) addApplied(freeShip, shippingCents, 'ENVIO');
    } else {
      freeShippingRemainingCents = min - merchandiseCents;
    }
  }
  if (couponFreeShipping) {
    shippingDiscountCents = shippingCents;
    if (couponResult) couponResult.amountCents = shippingCents;
    if (shippingCents > 0) addApplied(coupon.promotion, shippingCents, 'CUPON');
  }

  const totalCents = Math.max(0, merchandiseCents + shippingCents - shippingDiscountCents);

  return {
    lines: work.map((l) => ({
      ...l,
      lineTotalCents: l.subtotalCents - l.discountCents,
    })),
    subtotalCents,
    discountCents,
    merchandiseCents,
    shippingCents,
    shippingDiscountCents,
    totalCents,
    shippingAvailable,
    freeShippingRemainingCents,
    appliedPromotions: [...applied.values()],
    coupon: couponResult,
  };
}
