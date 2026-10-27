import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

export function useApi(path, query, { enabled = true, auth = true, keepPrevious = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const key = JSON.stringify([path, query]);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !path) return;
    const my = ++seq.current;
    setLoading(true);
    if (!keepPrevious) setData(null);
    try {
      const d = await api.get(path, { query, auth });
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [key, enabled, auth]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
