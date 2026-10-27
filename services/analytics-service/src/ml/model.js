export const LAGS = 4;
export const FEATURES = ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'media_4', 'semana_sin', 'semana_cos', 'tendencia', 'categoria_onehot'];
export const MIN_WEEKS = 12;

function weekOfYear(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / (7 * 86400e3)) + 1;
}

export function featureVector(series, t, catIndex, nCats, totalWeeksRef) {
  const lags = [];
  for (let k = 1; k <= LAGS; k++) lags.push(series[t - k].net);
  const mean = lags.reduce((a, b) => a + b, 0) / LAGS;
  const targetWeek = t < series.length ? series[t].weekStart : nextWeek(series[series.length - 1].weekStart);
  const w = weekOfYear(targetWeek);
  const onehot = Array.from({ length: nCats }, (_, i) => (i === catIndex ? 1 : 0));
  return [...lags, mean, Math.sin((2 * Math.PI * w) / 52), Math.cos((2 * Math.PI * w) / 52), t / totalWeeksRef, ...onehot];
}

export function nextWeek(isoDate) {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + 7 * 86400e3).toISOString().slice(0, 10);
}

export function fitScaler(X) {
  const cols = X[0].length;
  const mean = Array(cols).fill(0);
  const std = Array(cols).fill(0);
  for (const row of X) row.forEach((v, j) => (mean[j] += v / X.length));
  for (const row of X) row.forEach((v, j) => (std[j] += (v - mean[j]) ** 2 / X.length));
  return { mean, std: std.map((s) => Math.sqrt(s) || 1) };
}
export const applyScaler = (X, s) => X.map((row) => row.map((v, j) => (v - s.mean[j]) / s.std[j]));

export const mae = (yTrue, yPred) => yTrue.reduce((a, y, i) => a + Math.abs(y - yPred[i]), 0) / Math.max(1, yTrue.length);
