const TZ = 'America/Guatemala';
const moneyFmt = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (v) => `Q\u00A0${moneyFmt.format(Number(v || 0))}`;
export const moneyShort = (v) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `Q\u00A0${(n / 1_000_000).toFixed(1)}\u00A0M`;
  if (Math.abs(n) >= 10_000) return `Q\u00A0${(n / 1000).toFixed(1)}\u00A0mil`;
  return money(n);
};
export const int = (v) => new Intl.NumberFormat('es-GT').format(Number(v || 0));
export const pct = (v, d = 1) => `${Number(v || 0).toFixed(d)} %`;

export const date = (d, opts = { dateStyle: 'medium' }) => (d ? new Intl.DateTimeFormat('es-GT', { timeZone: TZ, ...opts }).format(new Date(d)) : '—');
export const dateTime = (d) => date(d, { dateStyle: 'medium', timeStyle: 'short' });
export const dateLong = (d) => date(d, { dateStyle: 'long' });
export const time = (d) => date(d, { timeStyle: 'short' });
export const dateOnly = (d) => (d ? new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(d)) : '—');
export const shortDay = (iso) => new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
export const monthLabel = (iso) => new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', month: 'short', year: '2-digit' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

export function relative(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return 'hace un momento';
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return date(d);
}

export function isoToday(offsetDays = 0) {
  const t = new Date(Date.now() - 6 * 3600e3 + offsetDays * 86400e3);
  return t.toISOString().slice(0, 10);
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
export const plural = (n, one, many) => `${int(n)} ${Number(n) === 1 ? one : many}`;
