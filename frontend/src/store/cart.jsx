import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useSession } from '../auth/session.jsx';
import { toast, apiError } from '../lib/alerts.js';

const KEY = 'exc_cart_v1';
const CartContext = createContext(null);

const readLocal = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((i) => i && Number(i.variantId) && Number(i.quantity) > 0) : [];
  } catch {
    return [];
  }
};
const writeLocal = (items) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch { }
};

export function CartProvider({ children }) {
  const session = useSession();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState(readLocal);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(0);
  const merged = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (session?.isAuthenticated) {
        const q = await api.get('/sales/cart');
        setQuote(q);
        setItems(q.items);
      } else {
        const local = readLocal();
        setItems(local);
        setQuote(local.length ? await api.post('/sales/cart/preview', { items: local }, { auth: false }) : { lines: [], subtotal: '0.00', discount: '0.00', total: '0.00', problems: [], appliedPromotions: [], itemCount: 0 });
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [session?.isAuthenticated]);

  useEffect(() => {
    if (!session?.ready) return;
    const uid = session.user?.id;
    if (session.isAuthenticated && uid && merged.current !== uid) {
      merged.current = uid;
      const local = readLocal();
      if (local.length) {
        api.post('/sales/cart/merge', { items: local })
          .then((q) => {
            writeLocal([]);
            setQuote(q);
            setItems(q.items);
            toast.success('Unimos los productos que agregaste antes de iniciar sesión.');
          })
          .catch(() => refresh());
        return;
      }
    }
    if (!session.isAuthenticated) merged.current = null;
    refresh();
  }, [session?.ready, session?.isAuthenticated, session?.user?.id]);

  const add = useCallback(async (variantId, quantity = 1) => {
    try {
      if (session?.isAuthenticated) {
        const q = await api.post('/sales/cart/items', { variantId, quantity });
        setQuote(q);
        setItems(q.items);
        if (q.limited) toast.warning(q.limited);
      } else {
        const local = readLocal();
        const found = local.find((i) => i.variantId === variantId);
        if (found) found.quantity = Math.min(20, found.quantity + quantity);
        else local.push({ variantId, quantity });
        writeLocal(local);
        setItems(local);
        const q = await api.post('/sales/cart/preview', { items: local }, { auth: false });
        setQuote(q);
        const line = q.lines.find((l) => l.variantId === variantId);
        if (line && line.requested > line.quantity) {
          toast.warning(`Solo hay ${line.available} disponibles de esta talla y color.`);
          found ? (found.quantity = line.quantity) : null;
          writeLocal(local.map((i) => (i.variantId === variantId ? { ...i, quantity: line.quantity } : i)));
        }
      }
      setPulse((p) => p + 1);
      return true;
    } catch (e) {
      apiError(e, 'No pudimos agregar el producto.');
      return false;
    }
  }, [session?.isAuthenticated]);

  const setQty = useCallback(async (variantId, quantity) => {
    try {
      if (session?.isAuthenticated) {
        const q = await api.put(`/sales/cart/items/${variantId}`, { quantity });
        setQuote(q);
        setItems(q.items);
      } else {
        const local = readLocal().map((i) => (i.variantId === variantId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0);
        writeLocal(local);
        setItems(local);
        setQuote(local.length ? await api.post('/sales/cart/preview', { items: local }, { auth: false }) : { lines: [], subtotal: '0.00', discount: '0.00', total: '0.00', problems: [], appliedPromotions: [], itemCount: 0 });
      }
    } catch (e) {
      apiError(e);
    }
  }, [session?.isAuthenticated]);

  const remove = useCallback((variantId) => setQty(variantId, 0), [setQty]);

  const value = useMemo(() => ({
    quote,
    items,
    count: items.reduce((a, i) => a + i.quantity, 0),
    loading,
    open,
    setOpen,
    pulse,
    add,
    setQty,
    remove,
    refresh,
  }), [quote, items, loading, open, pulse, add, setQty, remove, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
