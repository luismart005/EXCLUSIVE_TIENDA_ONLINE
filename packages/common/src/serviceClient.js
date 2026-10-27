import { env, serviceUrl } from './env.js';
import { AppError } from './errors.js';

const tokens = new Map();

async function getServiceToken(clientId) {
  const cached = tokens.get(clientId);
  if (cached && Date.now() < cached.exp - 30_000) return cached.token;
  const secret = env.SERVICE_SECRETS[clientId];
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString('base64');
  const res = await fetch(`${serviceUrl('auth')}/oidc/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'internal', resource: env.INTERNAL_AUDIENCE }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new AppError(503, 'SERVICE_AUTH', 'No fue posible autenticar la comunicación entre servicios.', { status: res.status, body: t.slice(0, 200) });
  }
  const json = await res.json();
  tokens.set(clientId, { token: json.access_token, exp: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export function serviceClient(from, to) {
  const clientId = `svc-${from}`;
  async function call(method, path, { body, req, user, idempotencyKey } = {}) {
    const token = await getServiceToken(clientId);
    const acting = user || req?.user || req?.actingUser;
    const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (req?.requestId) headers['x-request-id'] = req.requestId;
    if (acting) {
      headers['x-acting-user-id'] = String(acting.id);
      if (acting.email) headers['x-acting-user-email'] = acting.email;
    }
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    let res;
    try {
      res = await fetch(`${serviceUrl(to)}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', `El servicio de ${to} no está disponible en este momento. Intenta de nuevo en unos segundos.`);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      if (res.status === 401) tokens.delete(clientId);
      throw new AppError(res.status, data?.error?.code || 'SERVICE_ERROR', data?.error?.message || `Error al comunicarse con ${to}.`, data?.error?.details);
    }
    return data;
  }
  return {
    get: (path, opts) => call('GET', path, opts),
    post: (path, body, opts = {}) => call('POST', path, { ...opts, body }),
    put: (path, body, opts = {}) => call('PUT', path, { ...opts, body }),
  };
}
