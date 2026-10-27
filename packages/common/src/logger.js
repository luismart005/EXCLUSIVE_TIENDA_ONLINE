import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|card(number)?|cvv|cvc|hash/i;

export function redact(value, depth = 0) {
  if (value === null || value === undefined || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[oculto]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

const COLORS = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' };

export function createLogger(service) {
  let stream = null;
  try {
    fs.mkdirSync(env.LOG_DIR, { recursive: true });
    stream = fs.createWriteStream(path.join(env.LOG_DIR, `${service}.log`), { flags: 'a' });
  } catch {
    stream = null;
  }
  const write = (level, msg, data) => {
    const entry = { ts: new Date().toISOString(), level, service, msg, ...(data ? redact(data) : {}) };
    if (stream) stream.write(JSON.stringify(entry) + '\n');
    if (env.isTest && level !== 'error') return;
    const extra = data && Object.keys(data).length ? ' ' + JSON.stringify(redact(data)) : '';
    const line = `${COLORS[level] || ''}${level.toUpperCase().padEnd(5)}\x1b[0m ${msg}${extra}`;
    (level === 'error' ? console.error : console.log)(line);
  };
  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
    debug: (m, d) => (process.env.LOG_LEVEL === 'debug' ? write('debug', m, d) : undefined),
  };
}
