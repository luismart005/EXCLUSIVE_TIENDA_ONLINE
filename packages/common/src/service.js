import crypto from 'node:crypto';
import express from 'express';
import { prisma } from '@exclusive/db';
import { env } from './env.js';
import { createLogger } from './logger.js';
import { errorHandler, notFound } from './errors.js';

if (!BigInt.prototype.toJSON) {
  Object.defineProperty(BigInt.prototype, 'toJSON', { value() { return this.toString(); }, configurable: true, writable: true });
}

export async function createService({ name, port, setup, onStart, jsonLimit = '1mb', mountRaw, skipBody }) {
  const logger = createLogger(name);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.set('etag', false);

  app.use((req, res, next) => {
    req.requestId = (req.get('x-request-id') || crypto.randomUUID()).slice(0, 64);
    res.set('x-request-id', req.requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`, { requestId: req.requestId, userId: req.user?.id });
    });
    next();
  });

  app.get('/health', async (req, res) => {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ service: name, status: 'ok', database: 'ok', dbLatencyMs: Date.now() - started, uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), time: new Date().toISOString() });
    } catch (e) {
      res.status(503).json({ service: name, status: 'degraded', database: 'error', message: 'Sin conexión con PostgreSQL', time: new Date().toISOString() });
    }
  });

  if (mountRaw) mountRaw(app, { logger });
  const json = express.json({ limit: jsonLimit });
  const form = express.urlencoded({ extended: false, limit: jsonLimit });
  app.use((req, res, next) => (skipBody && skipBody(req) ? next() : json(req, res, (e) => (e ? next(e) : form(req, res, next)))));

  await setup(app, { logger });

  app.use((req, res, next) => next(notFound('La ruta solicitada no existe.')));
  app.use(errorHandler(name, logger));

  const server = app.listen(port, env.BIND_HOST, () => {
    logger.info(`${name} escuchando en http://${env.BIND_HOST}:${port}`);
    if (onStart) Promise.resolve(onStart({ logger })).catch((e) => logger.error('Error en tarea de arranque', { message: e.message }));
  });
  server.on('error', (e) => {
    logger.error(`No se pudo iniciar ${name} en el puerto ${port}: ${e.message}`);
    process.exit(1);
  });

  const shutdown = async (signal) => {
    logger.info(`${name} recibió ${signal}, cerrando…`);
    server.close();
    try { await prisma.$disconnect(); } catch { }
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return { app, server, logger };
}
