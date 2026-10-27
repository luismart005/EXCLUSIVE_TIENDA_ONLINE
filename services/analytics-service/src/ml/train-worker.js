import '@exclusive/common/env';
import * as tf from '@tensorflow/tfjs';
import { prisma } from '@exclusive/db';
import { loadHistory } from './history.js';
import { FEATURES, LAGS, MIN_WEEKS, featureVector, fitScaler, applyScaler, mae, nextWeek } from './model.js';

const modelId = Number(process.argv[2]);
const TEST_WEEKS = 8;
const PARAMS = { hiddenLayers: [8], activation: 'relu', l2: 0.05, ensemble: 5, epochs: 300, earlyStoppingPatience: 25, validationSplit: 0.15, batchSize: 32, learningRate: 0.005, loss: 'meanSquaredError', optimizer: 'adam', testWeeks: TEST_WEEKS };

function buildModel(inputs, seed) {
  const m = tf.sequential();
  const reg = () => tf.regularizers.l2({ l2: PARAMS.l2 });
  m.add(tf.layers.dense({ units: PARAMS.hiddenLayers[0], activation: 'relu', inputShape: [inputs], kernelRegularizer: reg(), kernelInitializer: tf.initializers.glorotUniform({ seed }) }));
  m.add(tf.layers.dense({ units: 1, kernelRegularizer: reg(), kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 1 }) }));
  m.compile({ optimizer: tf.train.adam(PARAMS.learningRate), loss: PARAMS.loss });
  return m;
}

async function train(X, y, seed) {
  const scaler = fitScaler(X);
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const yStd = Math.sqrt(y.reduce((a, b) => a + (b - yMean) ** 2, 0) / y.length) || 1;
  const model = buildModel(X[0].length, seed);
  const xs = tf.tensor2d(applyScaler(X, scaler));
  const ys = tf.tensor2d(y.map((v) => [(v - yMean) / yStd]));
  const h = await model.fit(xs, ys, {
    epochs: PARAMS.epochs, batchSize: PARAMS.batchSize, shuffle: true, verbose: 0, validationSplit: PARAMS.validationSplit,
    callbacks: [tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: PARAMS.earlyStoppingPatience })],
  });
  xs.dispose();
  ys.dispose();
  const predict = (rows) => {
    const t = tf.tensor2d(applyScaler(rows, scaler));
    const out = model.predict(t);
    const vals = Array.from(out.dataSync()).map((v) => Math.max(0, v * yStd + yMean));
    t.dispose();
    out.dispose();
    return vals;
  };
  return { model, scaler, yMean, yStd, predict, finalLoss: h.history.loss[h.history.loss.length - 1], epochsRun: h.history.loss.length };
}

async function trainEnsemble(X, y, baseSeed) {
  const runs = [];
  for (let k = 0; k < PARAMS.ensemble; k++) runs.push(await train(X, y, baseSeed + k * 13));
  return {
    runs,
    predict: (rows) => {
      const all = runs.map((r) => r.predict(rows));
      return rows.map((_, i) => all.reduce((a, p) => a + p[i], 0) / all.length);
    },
    finalLoss: runs.reduce((a, r) => a + r.finalLoss, 0) / runs.length,
    epochsRun: Math.round(runs.reduce((a, r) => a + r.epochsRun, 0) / runs.length),
    dispose: () => runs.forEach((r) => r.model.dispose()),
  };
}

async function run() {
  const started = Date.now();
  const history = await loadHistory();
  if (!history.length) throw new Error('No hay historial semanal: prepara el historial antes de entrenar.');
  const nCats = history.length;
  const totalWeeks = Math.max(...history.map((c) => c.weeks.length));
  const allWeeks = [...new Set(history.flatMap((c) => c.weeks.map((w) => w.weekStart)))].sort();
  if (allWeeks.length < LAGS + TEST_WEEKS + 6) throw new Error(`Historial insuficiente: se necesitan al menos ${LAGS + TEST_WEEKS + 6} semanas y hay ${allWeeks.length}.`);
  const testFrom = allWeeks[allWeeks.length - TEST_WEEKS];

  const samples = [];
  history.forEach((c, ci) => {
    for (let t = LAGS; t < c.weeks.length; t++) {
      samples.push({ x: featureVector(c.weeks, t, ci, nCats, totalWeeks), y: c.weeks[t].net, week: c.weeks[t].weekStart, categoryId: c.categoryId, censored: c.weeks[t].stockouts > 0, baseline: c.weeks.slice(t - LAGS, t).reduce((a, w) => a + w.net, 0) / LAGS });
    }
  });
  samples.sort((a, b) => a.week.localeCompare(b.week) || a.categoryId - b.categoryId);
  const trainSet = samples.filter((s) => s.week < testFrom && !s.censored);
  const testSet = samples.filter((s) => s.week >= testFrom && !s.censored);
  if (trainSet.length < 20 || !testSet.length) throw new Error('No hay suficientes semanas válidas para entrenar y evaluar.');

  const evalRun = await trainEnsemble(trainSet.map((s) => s.x), trainSet.map((s) => s.y), 42);
  const testPred = evalRun.predict(testSet.map((s) => s.x));
  const modelMae = mae(testSet.map((s) => s.y), testPred);
  const baselineMae = mae(testSet.map((s) => s.y), testSet.map((s) => s.baseline));
  const perCategory = history.map((c) => {
    const idx = testSet.map((s, i) => (s.categoryId === c.categoryId ? i : -1)).filter((i) => i >= 0);
    return {
      categoryId: c.categoryId, name: c.name, testWeeks: idx.length,
      mae: Number(mae(idx.map((i) => testSet[i].y), idx.map((i) => testPred[i])).toFixed(2)),
      baselineMae: Number(mae(idx.map((i) => testSet[i].y), idx.map((i) => testSet[i].baseline)).toFixed(2)),
    };
  });
  evalRun.dispose();

  const all = samples.filter((s) => !s.censored);
  const finalRun = await trainEnsemble(all.map((s) => s.x), all.map((s) => s.y), 7);
  const forecastWeek = nextWeek(allWeeks[allWeeks.length - 1]);
  const forecasts = history.map((c, ci) => {
    const firstSale = c.weeks.findIndex((w) => w.sold > 0);
    const weeksWithHistory = firstSale < 0 ? 0 : c.weeks.length - firstSale;
    const sufficient = weeksWithHistory >= MIN_WEEKS;
    const baseline = c.weeks.slice(-LAGS).reduce((a, w) => a + w.net, 0) / LAGS;
    const predicted = sufficient ? finalRun.predict([featureVector(c.weeks, c.weeks.length, ci, nCats, totalWeeks)])[0] : baseline;
    return { categoryId: c.categoryId, predicted: Number(predicted.toFixed(2)), baseline: Number(baseline.toFixed(2)), sufficient };
  });

  const artifacts = { format: 'tfjs-layers-ensemble', members: [] };
  for (const r of finalRun.runs) {
    await r.model.save(tf.io.withSaveHandler(async (a) => {
      artifacts.members.push({ modelTopology: a.modelTopology, weightSpecs: a.weightSpecs, weightData: Buffer.from(a.weightData).toString('base64'), scaler: r.scaler, yMean: r.yMean, yStd: r.yStd });
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }));
  }
  finalRun.dispose();

  const trainWeeks = trainSet.map((s) => s.week).sort();
  await prisma.$transaction(async (tx) => {
    await tx.mlModel.update({
      where: { id: modelId },
      data: {
        status: 'LISTO',
        algorithm: 'Regresión con red neuronal densa (TensorFlow.js): ensamble de 5 redes de 8 neuronas ReLU, L2 y parada temprana',
        features: { list: FEATURES, lags: LAGS, categories: history.map((c) => c.name), target: 'Unidades netas semanales (vendidas − devueltas)' },
        trainFrom: new Date(`${trainWeeks[0]}T00:00:00Z`),
        trainTo: new Date(`${trainWeeks[trainWeeks.length - 1]}T00:00:00Z`),
        testFrom: new Date(`${testFrom}T00:00:00Z`),
        testTo: new Date(`${allWeeks[allWeeks.length - 1]}T00:00:00Z`),
        metrics: {
          mae: Number(modelMae.toFixed(3)),
          baselineMae: Number(baselineMae.toFixed(3)),
          improvementPct: baselineMae > 0 ? Number((((baselineMae - modelMae) / baselineMae) * 100).toFixed(1)) : 0,
          perCategory,
          samples: { train: trainSet.length, test: testSet.length, excludedCensored: samples.filter((s) => s.censored).length },
          finalLoss: Number(finalRun.finalLoss.toFixed(4)),
          epochsRun: finalRun.epochsRun,
          forecastWeek,
          testPredictions: testSet.map((s, i) => ({ categoryId: s.categoryId, weekStart: s.week, actual: s.y, predicted: Number(testPred[i].toFixed(2)), baseline: Number(s.baseline.toFixed(2)) })),
          seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        },
        params: PARAMS,
        artifacts,
        dataNote: 'Entrenado con datos ficticios de demostración. Las métricas muestran el método, no la precisión comercial del negocio.',
        completedAt: new Date(),
      },
    });
    await tx.mlForecast.createMany({
      data: forecasts.map((f) => ({ modelId, categoryId: f.categoryId, weekStart: new Date(`${forecastWeek}T00:00:00Z`), predictedUnits: f.predicted.toFixed(2), baselineUnits: f.baseline.toFixed(2), sufficient: f.sufficient })),
    });
  });
  return { modelMae, baselineMae };
}

run()
  .then(async (r) => {
    console.log(`Modelo ${modelId} entrenado: MAE ${r.modelMae.toFixed(2)} vs. base ${r.baselineMae.toFixed(2)}`);
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(`Entrenamiento ${modelId} fallido: ${e.message}`);
    await prisma.mlModel.update({ where: { id: modelId }, data: { status: 'FALLIDO', error: String(e.message).slice(0, 400), completedAt: new Date() } }).catch(() => {});
    await prisma.$disconnect();
    process.exit(1);
  });
