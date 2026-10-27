let tokenGetter = () => null;
let onUnauthorized = () => {};

export function configureApi({ getToken, unauthorized }) {
  tokenGetter = getToken;
  onUnauthorized = unauthorized;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || (status === 0 ? 'No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.' : 'Ocurrió un error inesperado.'));
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
    this.requestId = body?.requestId;
  }
  get fields() {
    const out = {};
    if (Array.isArray(this.details)) for (const d of this.details) if (d.field && !out[d.field]) out[d.field] = d.message;
    return out;
  }
}

function buildUrl(path, query) {
  const url = new URL(path.startsWith('/api') ? path : `/api${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '' || v === false) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
      else url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function api(path, { method = 'GET', body, query, headers = {}, idempotencyKey, signal, auth = true } = {}) {
  const h = { accept: 'application/json', ...headers };
  const token = auth ? await tokenGetter() : null;
  if (token) h.authorization = `Bearer ${token}`;
  if (idempotencyKey) h['idempotency-key'] = idempotencyKey;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(buildUrl(path, query), { method, headers: h, body: payload, signal, credentials: 'same-origin' });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && token && ['SESSION_REVOKED', 'TOKEN_EXPIRED', 'INVALID_TOKEN', 'ACCOUNT_DISABLED', 'ACCOUNT_GONE'].includes(err.code)) onUnauthorized(err);
    throw err;
  }
  return data;
}

api.get = (path, opts) => api(path, { ...opts, method: 'GET' });
api.post = (path, body, opts) => api(path, { ...opts, method: 'POST', body });
api.put = (path, body, opts) => api(path, { ...opts, method: 'PUT', body });
api.del = (path, opts) => api(path, { ...opts, method: 'DELETE' });

export async function openProtected(path, { download = null, query } = {}) {
  const token = await tokenGetter();
  const win = download ? null : window.open('', '_blank');
  try {
    const res = await fetch(buildUrl(path, query), { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { }
      throw new ApiError(res.status, body);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = url;
      a.download = download;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (win) {
      win.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    if (win) win.close();
    throw e;
  }
}

export async function fetchBlobUrl(path, { query } = {}) {
  const token = await tokenGetter();
  const res = await fetch(buildUrl(path, query), { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { }
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
