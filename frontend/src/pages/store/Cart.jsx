import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, ArrowRight, AlertTriangle } from 'lucide-react';
import { useCart } from '../../store/cart.jsx';
import { Empty, Img, Loader, QtyStepper } from '../../components/ui.jsx';
import { money } from '../../lib/format.js';

export function Totals({ q, showShipping = false }) {
  if (!q) return null;
  return (
    <div className="totals">
      <div><span className="muted">Subtotal</span><span className="num">{money(q.subtotal)}</span></div>
      {Number(q.discount) > 0 && <div className="discount"><span>Descuentos</span><span className="num">− {money(q.discount)}</span></div>}
      {showShipping && (
        <div>
          <span className="muted">Envío{q.shippingZone ? ` a ${q.shippingZone.department}` : ''}</span>
          <span className="num">{q.shipping === null ? 'Elige una dirección' : Number(q.shippingDiscount) > 0 ? <><s className="faint">{money(q.shipping)}</s> <b style={{ color: 'var(--jade-700)' }}>Gratis</b></> : money(q.shipping)}</span>
        </div>
      )}
      <div className="grand"><span>Total</span><span className="num">{money(showShipping ? q.total : Number(q.subtotal) - Number(q.discount))}</span></div>
      {q.appliedPromotions?.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {q.appliedPromotions.map((a) => <span key={`${a.id}-${a.kind}`} className="tiny" style={{ color: 'var(--grana-700)' }}>✓ {a.name}: − {money(a.amount)}</span>)}
        </div>
      )}
    </div>
  );
}

export default function Cart() {
  const cart = useCart();
  const navigate = useNavigate();
  const q = cart.quote;
  if (!q) return <Loader />;
  const lines = q.lines || [];
  return (
    <div className="container">
      <div className="page-head"><h1>Carrito</h1></div>
      {lines.length === 0 ? (
        <Empty icon={ShoppingBag} title="Tu carrito está vacío" action={<Link to="/tienda" className="btn btn--primary">Explorar la tienda</Link>}>
          Cuando agregues prendas, aparecerán aquí con el precio actualizado y su disponibilidad.
        </Empty>
      ) : (
        <div className="two-col">
          <div>
            {q.problems?.length > 0 && (
              <div className="stack mb-2" style={{ '--gap': '8px' }}>
                {q.problems.map((p) => (
                  <div key={`${p.variantId}-${p.code}`} className="notice notice--warn">
                    <AlertTriangle size={18} />
                    <div className="grow">{p.message}</div>
                    {(p.code === 'OUT_OF_STOCK' || p.code === 'UNAVAILABLE') && <button className="btn btn--link btn--sm" onClick={() => cart.remove(p.variantId)}>Quitar</button>}
                  </div>
                ))}
              </div>
            )}
            <div className="panel" style={{ padding: '4px 20px' }}>
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.div key={l.variantId} layout exit={{ opacity: 0, height: 0 }} className="line-item" style={{ gridTemplateColumns: '96px minmax(0,1fr) auto' }}>
                    <div className="line-item__img" style={{ width: 96 }}><Img src={l.image} alt={l.name} /></div>
                    <div>
                      <Link className="line-item__name" to={`/producto/${l.slug}`}>{l.name}</Link>
                      <div className="line-item__opts">{l.color} · Talla {l.size} · <span className="num">{money(l.unitPrice)}</span> c/u</div>
                      <div className="tiny faint">SKU {l.sku}</div>
                      {l.promotion && <div className="line-item__promo">{l.promotion}</div>}
                      <div className="row" style={{ marginTop: 12 }}>
                        <QtyStepper size="sm" value={l.quantity} max={Math.min(10, l.available)} onChange={(v) => cart.setQty(l.variantId, v)} />
                        <button className="remove-btn" onClick={() => cart.remove(l.variantId)}>Quitar</button>
                      </div>
                    </div>
                    <div className="line-item__right">
                      <span className="num strong">{money(l.total)}</span>
                      {Number(l.discount) > 0 && <s className="tiny faint num">{money(l.subtotal)}</s>}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <Link to="/tienda" className="btn btn--link mt-2">← Seguir comprando</Link>
          </div>
          <aside className="sticky-side panel">
            <div className="panel__body stack">
              <h2 className="h3">Resumen</h2>
              <Totals q={q} />
              <p className="tiny muted" style={{ margin: 0 }}>El costo de envío y los cupones se aplican en el siguiente paso. Los precios se recalculan en el servidor al confirmar.</p>
              <button className="btn btn--primary btn--lg btn--block" onClick={() => navigate('/checkout')}>Continuar con la compra <ArrowRight size={18} /></button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
