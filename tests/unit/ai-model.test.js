import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featureVector, fitScaler, applyScaler, mae, nextWeek, LAGS } from '../../services/analytics-service/src/ml/model.js';

const series = Array.from({ length: 20 }, (_, i) => ({ weekStart: new Date(Date.UTC(2026, 0, 5 + i * 7)).toISOString().slice(0, 10), net: 10 + (i % 5) }));

test('las variables de la semana t solo usan semanas anteriores', () => {
  const t = 10;
  const before = featureVector(series, t, 0, 3, series.length);
  const altered = series.map((w, i) => (i >= t ? { ...w, net: 999 } : w));
  const after = featureVector(altered, t, 0, 3, series.length);
  assert.deepEqual(after, before);
  assert.deepEqual(before.slice(0, LAGS), [series[9].net, series[8].net, series[7].net, series[6].net]);
});

test('la estandarización se ajusta con el conjunto de entrenamiento', () => {
  const X = [[1, 10], [3, 10], [5, 10]];
  const s = fitScaler(X);
  assert.deepEqual(s.mean, [3, 10]);
  assert.equal(s.std[1], 1);
  const Z = applyScaler([[3, 10]], s);
  assert.deepEqual(Z, [[0, 0]]);
});

test('el error absoluto medio se calcula correctamente', () => {
  assert.equal(mae([10, 12, 8], [11, 12, 5]), 4 / 3);
  assert.equal(mae([], []), 0);
});

test('la semana siguiente se calcula en fechas ISO', () => {
  assert.equal(nextWeek('2026-12-28'), '2027-01-04');
});
