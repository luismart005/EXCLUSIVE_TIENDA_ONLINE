import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../../..');

const files = process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'];
for (const f of files) {
  const p = path.join(ROOT_DIR, f);
  if (fs.existsSync(p)) dotenv.config({ path: p, quiet: true });
}

const str = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => Number(str(k, d));
const list = (k) => (str(k, '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const PUBLIC_URL = str('PUBLIC_URL', 'http://localhost:4000').replace(/\/$/, '');

export const env = {
  NODE_ENV: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  isTest: str('NODE_ENV', 'development') === 'test',
  PUBLIC_URL,
  EXTRA_ORIGINS: list('EXTRA_ORIGINS'),
  OIDC_ISSUER: `${PUBLIC_URL}/oidc`,
  API_AUDIENCE: 'urn:exclusive:api',
  INTERNAL_AUDIENCE: 'urn:exclusive:internal',
  WEB_CLIENT_ID: 'exclusive-web',

  DATABASE_URL: str('DATABASE_URL', ''),
  COOKIE_SECRET: str('COOKIE_SECRET', 'cambia-esta-clave-de-cookies-en-el-archivo-env'),

  BIND_HOST: str('BIND_HOST', '127.0.0.1'),
  GATEWAY_HOST: str('GATEWAY_HOST', '0.0.0.0'),
  PORTS: {
    gateway: num('GATEWAY_PORT', 4000),
    auth: num('AUTH_PORT', 4001),
    catalog: num('CATALOG_PORT', 4002),
    inventory: num('INVENTORY_PORT', 4003),
    sales: num('SALES_PORT', 4004),
    analytics: num('ANALYTICS_PORT', 4005),
    web: num('WEB_DEV_PORT', 5173),
  },
  SERVICE_SECRETS: {
    'svc-auth': str('SVC_SECRET_AUTH', 'dev-secret-auth-cambiar'),
    'svc-catalog': str('SVC_SECRET_CATALOG', 'dev-secret-catalog-cambiar'),
    'svc-inventory': str('SVC_SECRET_INVENTORY', 'dev-secret-inventory-cambiar'),
    'svc-sales': str('SVC_SECRET_SALES', 'dev-secret-sales-cambiar'),
    'svc-analytics': str('SVC_SECRET_ANALYTICS', 'dev-secret-analytics-cambiar'),
  },

  ACCESS_TOKEN_TTL: num('ACCESS_TOKEN_TTL', 900),
  REFRESH_TOKEN_TTL: num('REFRESH_TOKEN_TTL', 8 * 3600),
  SESSION_TTL: num('SESSION_TTL', 8 * 3600),
  MAX_FAILED_LOGINS: num('MAX_FAILED_LOGINS', 5),
  LOCK_MINUTES: num('LOCK_MINUTES', 15),
  LOGIN_RATE_LIMIT: num('LOGIN_RATE_LIMIT', 20),
  RESET_RATE_LIMIT: num('RESET_RATE_LIMIT', 5),
  RESET_TOKEN_MINUTES: num('RESET_TOKEN_MINUTES', 30),
  API_RATE_LIMIT: num('API_RATE_LIMIT', 3000),

  MAILBOX_PUBLIC: str('MAILBOX_PUBLIC', 'true') === 'true',
  DEMO_HINTS: str('DEMO_HINTS', 'true') === 'true',
  LOG_DIR: path.resolve(ROOT_DIR, str('LOG_DIR', 'logs')),
};

export const serviceUrl = (name) => `http://127.0.0.1:${env.PORTS[name]}`;

export function allowedOrigins() {
  const set = new Set([PUBLIC_URL, `http://localhost:${env.PORTS.gateway}`, `http://127.0.0.1:${env.PORTS.gateway}`, ...env.EXTRA_ORIGINS]);
  return [...set];
}
