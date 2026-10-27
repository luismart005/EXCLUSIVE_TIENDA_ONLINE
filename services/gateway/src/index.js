import '@exclusive/common/env';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { env, serviceUrl, createLogger, ROOT_DIR } from '@exclusive/common';

const PROD = process.argv.includes('--prod') || process.env.WEB_MODE === 'dist';
const logger = createLogger('gateway');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false);

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  req.headers['x-request-id'] = req.requestId;
  res.set('x-request-id', req.requestId);
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: PROD
      ? {
          useDefaults: false,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'blob:'],
            'font-src': ["'self'", 'data:'],
            'connect-src': ["'self'"],
            'frame-src': ["'self'"],
            'frame-ancestors': ["'self'"],
            'form-action': ["'self'"],
            'base-uri': ["'self'"],
            'object-src': ["'none'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    hsts: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

app.use(
  '/api',
  rateLimit({
    windowMs: 5 * 60_000,
    limit: env.API_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Recibimos demasiadas solicitudes desde tu equipo. Espera un momento.' } },
  }),
);

const SERVICES = ['auth', 'catalog', 'inventory', 'sales', 'analytics'];
app.get('/api/health', async (req, res) => {
  const results = await Promise.all(
    SERVICES.map(async (name) => {
      const started = Date.now();
      try {
        const r = await fetch(`${serviceUrl(name)}/health`, { signal: AbortSignal.timeout(2500) });
        const body = await r.json();
        return { name, ok: r.ok, latencyMs: Date.now() - started, ...body };
      } catch {
        return { name, ok: false, status: 'down', latencyMs: Date.now() - started, message: 'El servicio no responde' };
      }
    }),
  );
  const ok = results.every((r) => r.ok);
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    gateway: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), mode: PROD ? 'producción (build)' : 'desarrollo (Vite)' },
    services: results,
    time: new Date().toISOString(),
  });
});

const openapiPath = path.join(ROOT_DIR, 'docs/openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const spec = YAML.parse(fs.readFileSync(openapiPath, 'utf8'));
  app.get('/api/docs/openapi.json', (req, res) => res.json(spec));
  app.use('/api/docs', (req, res, next) => { res.removeHeader('Content-Security-Policy'); next(); }, swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Exclusive · API', customCss: '.swagger-ui .topbar{display:none}' }));
}

function proxyTo(name, pathFilter) {
  return createProxyMiddleware({
    target: serviceUrl(name),
    pathFilter,
    changeOrigin: false,
    xfwd: true,
    proxyTimeout: 60_000,
    on: {
      proxyReq: (proxyReq, req) => proxyReq.setHeader('x-request-id', req.requestId),
      error: (err, req, res) => {
        logger.error(`Proxy hacia ${name} falló`, { message: err.message, path: req.originalUrl });
        if (res.headersSent || typeof res.writeHead !== 'function') return;
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: `El servicio de ${name} no está disponible. Verifica que esté en ejecución.` }, requestId: req.requestId }));
      },
    },
  });
}

app.use(proxyTo('auth', ['/oidc', '/api/auth']));
app.use(proxyTo('catalog', ['/api/catalog', '/uploads']));
app.use(proxyTo('inventory', ['/api/inventory']));
app.use(proxyTo('sales', ['/api/sales']));
app.use(proxyTo('analytics', ['/api/analytics']));

app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'La ruta de API no existe.' }, requestId: req.requestId }));

const DIST = path.join(ROOT_DIR, 'frontend/dist');
let viteProxy = null;
if (PROD) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    logger.warn('No existe frontend/dist. Ejecuta "npm run build" antes de "npm start".');
  }
  app.use(express.static(DIST, { index: false, maxAge: '7d', setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get('/{*splat}', (req, res) => {
    const index = path.join(DIST, 'index.html');
    if (!fs.existsSync(index)) return res.status(503).type('text').send('La aplicación web no está compilada. Ejecuta "npm run build".');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
} else {
  viteProxy = createProxyMiddleware({
    target: `http://127.0.0.1:${env.PORTS.web}`,
    changeOrigin: true,
    ws: true,
    on: {
      error: (err, req, res) => {
        if (res && typeof res.writeHead === 'function' && !res.headersSent) {
          res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' });
          res.end('<p style="font-family:sans-serif">El servidor de Vite aún está iniciando. Recarga la página en unos segundos.</p>');
        }
      },
    },
  });
  app.use(viteProxy);
}

const server = app.listen(env.PORTS.gateway, env.GATEWAY_HOST, () => {
  logger.info(`Gateway listo en ${env.PUBLIC_URL} (escuchando en ${env.GATEWAY_HOST}:${env.PORTS.gateway}, modo ${PROD ? 'producción' : 'desarrollo'})`);
});
if (viteProxy) server.on('upgrade', viteProxy.upgrade);
server.on('error', (e) => {
  logger.error(`No se pudo iniciar el gateway: ${e.message}`);
  process.exit(1);
});
