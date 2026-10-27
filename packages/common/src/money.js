export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'bigint') return Number(value) * 100;
  const str = typeof value === 'object' && typeof value.toFixed === 'function' ? value.toFixed(4) : String(value).trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(str);
  if (!m) throw new Error(`Monto inválido: ${value}`);
  const sign = m[1] === '-' ? -1 : 1;
  const intPart = parseInt(m[2] || '0', 10);
  const frac = (m[3] || '').padEnd(3, '0');
  let cents = intPart * 100 + parseInt(frac.slice(0, 2), 10);
  if (parseInt(frac[2], 10) >= 5) cents += 1;
  return sign * cents;
}

export function fromCents(cents) {
  const c = Math.round(cents);
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function percentOf(cents, percent) {
  const bp = toCents(percent);
  const raw = cents * bp;
  const q = Math.floor(raw / 10000);
  const r = raw - q * 10000;
  return r * 2 >= 10000 ? q + 1 : q;
}

export function allocate(totalCents, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalCents <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sum);
  const base = raw.map((x) => Math.floor(x));
  let rest = totalCents - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) base[order[k].i] += 1;
  return base;
}

export function formatGTQ(cents) {
  const n = Math.round(cents) / 100;
  return `Q ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const money = { toCents, fromCents, percentOf, allocate, formatGTQ };
