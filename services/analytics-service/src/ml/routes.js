import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { prisma } from '@exclusive/db';
import { authenticate, requirePermission, audit, conflict, notFound, createLogger } from '@exclusive/common';
import { prepareWeeklyHistory, loadHistory } from './history.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger('analytics-service');
let training = null;

export async function startTraining({ userId = null } = {}) {
  if (training) throw conflict('Ya hay un entrenamiento en curso. Espera a que termine.');
  const summary = await prepareWeeklyHistory();
  const count = await prisma.mlModel.count();
  const now = new Date();
  const version = `v${count + 1}-${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
  const model = await prisma.mlModel.create({
    data: { version, algorithm: 'Regresión con red neuronal densa (TensorFlow.js)', status: 'ENTRENANDO', features: {}, trainedBy: userId, params: { history: summary } },
  });
  training = fork(path.join(__dirname, 'train-worker.js'), [String(model.id)], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  training.stdout.on('data', (d) => logger.info(String(d).trim()));
  training.stderr.on('data', (d) => logger.warn(String(d).trim()));
  training.on('exit', (code) => {
    logger.info(`Proceso de entrenamiento ${model.id} terminó con código ${code}`);
    training = null;
  });
  return { id: model.id, version, status: 'ENTRENANDO', history: summary };
}

export async function ensureInitialModel() {
  await prisma.mlModel.updateMany({ where: { status: 'ENTRENANDO' }, data: { status: 'FALLIDO', error: 'Interrumpido por un reinicio del servicio', completedAt: new Date() } });
  const ready = await prisma.mlModel.count({ where: { status: 'LISTO' } });
  const orders = await prisma.order.count();
  if (ready || orders === 0) return null;
  logger.info('No hay un modelo de predicción listo: se entrenará la primera versión en segundo plano.');
  return startTraining({ userId: null });
}

export function mlRoutes() {
  const r = express.Router();
  r.use(authenticate());

  r.post('/history/refresh', requirePermission('ai.train'), async (req, res) => {
    const summary = await prepareWeeklyHistory();
    await audit(req, { service: 'analytics-service', action: 'AI_HISTORY_PREPARED', entity: 'sales_weekly_history', after: summary });
    res.json(summary);
  });

  r.get('/history', requirePermission('ai.read'), async (req, res) => {
    res.json(await loadHistory());
  });

  r.post('/train', requirePermission('ai.train'), async (req, res) => {
    const out = await startTraining({ userId: req.user.id });
    await audit(req, { service: 'analytics-service', action: 'AI_TRAINING_STARTED', entity: 'ml_model', entityId: out.id, after: { version: out.version, history: out.history } });
    res.status(202).json(out);
  });

  r.get('/models', requirePermission('ai.read'), async (req, res) => {
    const models = await prisma.mlModel.findMany({ orderBy: { id: 'desc' }, select: { id: true, version: true, algorithm: true, status: true, features: true, trainFrom: true, trainTo: true, testFrom: true, testTo: true, metrics: true, params: true, dataNote: true, error: true, createdAt: true, completedAt: true, trainedBy: true } });
    res.json(models.map((m) => ({ ...m, metrics: m.metrics ? { ...m.metrics, testPredictions: undefined } : null })));
  });

  r.get('/models/:id', requirePermission('ai.read'), async (req, res) => {
    const m = await prisma.mlModel.findUnique({ where: { id: Number(req.params.id) }, include: { forecasts: { include: { category: { select: { name: true } } } } } });
    if (!m) throw notFound('El modelo no existe.');
    const { artifacts, ...rest } = m;
    res.json({ ...rest, hasArtifacts: !!artifacts });
  });

  r.get('/forecast', requirePermission('ai.read'), async (req, res) => {
    const model = await prisma.mlModel.findFirst({ where: { status: 'LISTO' }, orderBy: { id: 'desc' }, include: { forecasts: { include: { category: { select: { id: true, name: true } } } } } });
    const running = await prisma.mlModel.findFirst({ where: { status: 'ENTRENANDO' }, orderBy: { id: 'desc' }, select: { id: true, version: true, createdAt: true } });
    const history = await loadHistory();
    if (!model) return res.json({ model: null, running, history: history.map((c) => ({ ...c, weeks: c.weeks.slice(-26) })) });
    const { artifacts, forecasts, ...info } = model;
    res.json({
      model: info,
      running,
      forecasts: forecasts.map((f) => ({ categoryId: f.categoryId, category: f.category.name, weekStart: f.weekStart, predicted: f.predictedUnits, baseline: f.baselineUnits, sufficient: f.sufficient })),
      history: history.map((c) => ({ ...c, weeks: c.weeks.slice(-26) })),
    });
  });

  return r;
}
