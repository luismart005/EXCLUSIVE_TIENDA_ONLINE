import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, ShoppingBag, User, Menu, X, LogOut, Package, LayoutDashboard, MapPin, Bell, Truck, RefreshCcw, ShieldCheck, CreditCard, Mail, ArrowRight,
} from 'lucide-react';
import { useSession } from '../auth/session.jsx';
import { useCart } from '../store/cart.jsx';
import { useApi } from '../lib/useApi.js';
import { Drawer, Img, QtyStepper } from './ui.jsx';
import { money, initials } from '../lib/format.js';

function useStore() {
  return useApi('/catalog/store', null, { auth: false });
}

function AccountButton() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!s?.ready) return <span className="icon-btn" aria-hidden="true"><User size={21} /></span>;
  if (!s.isAuthenticated) {
    return (
      <button className="icon-btn" onClick={() => s.login()} aria-label="Iniciar sesión" title="Iniciar sesión">
        <User size={21} />
      </button>
    );
  }
  const name = s.user ? `${s.user.firstName} ${s.user.lastName}` : s.profile?.name || '';
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Mi cuenta">
        <span className="avatar" style={{ width: 32, height: 32 }}>{initials(name)}</span>
        {s.user?.unreadNotifications > 0 && <span className="badge-dot">{s.user.unreadNotifications}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="account-menu" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <div className="account-menu__head">
              <div className="strong">{name}</div>
              <div className="tiny muted truncate">{s.user?.email}</div>
            </div>
            {s.isStaff && <Link to="/admin" role="menuitem"><LayoutDashboard size={17} /> Panel administrativo</Link>}
            <Link to="/cuenta/pedidos" role="menuitem"><Package size={17} /> Mis pedidos</Link>
            <Link to="/cuenta/notificaciones" role="menuitem"><Bell size={17} /> Notificaciones {s.user?.unreadNotifications > 0 && <span className="chip chip--bad" style={{ marginLeft: 'auto' }}>{s.user.unreadNotifications}</span>}</Link>
            <Link to="/cuenta/direcciones" role="menuitem"><MapPin size={17} /> Direcciones</Link>
            <Link to="/cuenta/perfil" role="menuitem"><User size={17} /> Perfil y seguridad</Link>
            <hr style={{ margin: '6px 0' }} />
            <button onClick={s.logout} role="menuitem"><LogOut size={17} /> Cerrar sesión</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CartButton() {
  const cart = useCart();
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (!cart.pulse) return undefined;
    setBump(true);
    const t = setTimeout(() => setBump(false), 520);
    return () => clearTimeout(t);
  }, [cart.pulse]);
  return (
    <button className={`icon-btn ${bump ? 'bump' : ''}`} onClick={() => cart.setOpen(true)} aria-label={`Abrir carrito, ${cart.count} artículos`}>
      <ShoppingBag size={21} />
      {cart.count > 0 && <span className="badge-dot">{cart.count}</span>}
    </button>
  );
}

export function CartDrawer() {
  const cart = useCart();
  const navigate = useNavigate();
  const q = cart.quote;
  const lines = q?.lines || [];
  const threshold = 600;
  const merch = Number(q?.subtotal || 0) - Number(q?.discount || 0);
  const pct = Math.min(100, (merch / threshold) * 100);
  const go = (to) => {
    cart.setOpen(false);
    navigate(to);
  };
  return (
    <Drawer open={cart.open} onClose={() => cart.setOpen(false)} label="Carrito de compras">
      <div className="cart-drawer__head">
        <h2>Tu carrito {cart.count > 0 && <span className="muted" style={{ fontWeight: 500 }}>({cart.count})</span>}</h2>
        <button className="btn btn--icon btn--ghost btn--sm" onClick={() => cart.setOpen(false)} aria-label="Cerrar carrito"><X size={18} /></button>
      </div>
      <div className="cart-drawer__body">
        {lines.length === 0 ? (
          <div className="empty">
            <div className="empty__icon"><ShoppingBag size={24} /></div>
            <h3>Tu carrito está vacío</h3>
            <p>Explora la tienda y agrega las prendas que te gusten.</p>
            <button className="btn btn--primary" onClick={() => go('/tienda')}>Ir a la tienda</button>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {lines.map((l) => (
              <motion.div key={l.variantId} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0, paddingBlock: 0 }} transition={{ duration: 0.22 }} className="line-item">
                <div className="line-item__img"><Img src={l.image} alt={l.name} /></div>
                <div>
                  <Link className="line-item__name" to={`/producto/${l.slug}`} onClick={() => cart.setOpen(false)}>{l.name}</Link>
                  <div className="line-item__opts">{l.color} · Talla {l.size}</div>
                  {l.promotion && <div className="line-item__promo">{l.promotion}</div>}
                  {l.requested > l.quantity && <div className="line-item__warn">Solo quedan {l.available}; ajustamos la cantidad.</div>}
                  <div style={{ marginTop: 10 }}>
                    <QtyStepper size="sm" value={l.quantity} max={Math.min(10, l.available)} onChange={(v) => cart.setQty(l.variantId, v)} />
                  </div>
                </div>
                <div className="line-item__right">
                  <span className="num strong">{money(l.total)}</span>
                  {Number(l.discount) > 0 && <s className="tiny faint num">{money(l.subtotal)}</s>}
                  <button className="remove-btn" onClick={() => cart.remove(l.variantId)}>Quitar</button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        {q?.problems?.filter((p) => p.code === 'OUT_OF_STOCK' || p.code === 'UNAVAILABLE').map((p) => (
          <div key={p.variantId} className="notice notice--warn" style={{ marginTop: 12 }}>
            <span>{p.message}</span>
            <button className="btn btn--link btn--sm" onClick={() => cart.remove(p.variantId)}>Quitar</button>
          </div>
        ))}
      </div>
      {lines.length > 0 && (
        <div className="cart-drawer__foot">
          <div className="ship-progress">
            {merch >= threshold ? (
              <span className="strong" style={{ color: 'var(--jade-700)' }}>Tu envío es gratis.</span>
            ) : (
              <span>Te faltan <b className="num">{money(threshold - merch)}</b> para el envío gratis.</span>
            )}
            <div className="ship-progress__bar"><span style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="totals">
            <div><span className="muted">Subtotal</span><span className="num">{money(q.subtotal)}</span></div>
            {Number(q.discount) > 0 && <div className="discount"><span>Descuentos</span><span className="num">− {money(q.discount)}</span></div>}
            <div className="grand"><span>Total productos</span><span className="num">{money(merch)}</span></div>
          </div>
          <span className="tiny muted">El envío se calcula según tu departamento al confirmar la compra.</span>
          <button className="btn btn--primary btn--lg btn--block" onClick={() => go('/checkout')}>Continuar con la compra <ArrowRight size={18} /></button>
          <button className="btn btn--ghost btn--block" onClick={() => go('/carrito')}>Ver carrito completo</button>
        </div>
      )}
    </Drawer>
  );
}

function Header({ categories }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [loc.pathname, loc.search]);
  const submit = (e) => {
    e.preventDefault();
    if (!term.trim()) return;
    navigate(`/tienda?search=${encodeURIComponent(term.trim())}`);
    setTerm('');
  };
  const cats = categories || [];
  return (
    <header className="site-header">
      <div className="container">
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn only-sm" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <Link to="/" className="wordmark" aria-label="Exclusive, inicio">EXCLUSIVE</Link>
        </div>
        <nav className="nav" aria-label="Categorías">
          <NavLink to="/tienda" end>Todo</NavLink>
          {cats.slice(0, 6).map((c) => (
            <NavLink key={c.id} to={`/tienda/${c.slug}`}>{c.name}</NavLink>
          ))}
          <NavLink to="/tienda?onSale=1" className="is-sale">Ofertas</NavLink>
        </nav>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setSearchOpen((o) => !o)} aria-expanded={searchOpen} aria-label="Buscar"><Search size={21} /></button>
          <AccountButton />
          <CartButton />
        </div>
      </div>
      <AnimatePresence>
        {searchOpen && (
          <motion.div className="search-pop" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <div className="container">
              <form onSubmit={submit} role="search">
                <label htmlFor="q" className="sr-only">Buscar productos</label>
                <input id="q" className="input" autoFocus placeholder="Busca camisas, vestidos, lino, denim…" value={term} onChange={(e) => setTerm(e.target.value)} />
                <button className="btn btn--primary btn--lg" type="submit">Buscar</button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="left" label="Menú">
        <div className="cart-drawer__head">
          <span className="wordmark">EXCLUSIVE</span>
          <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
        </div>
        <nav className="mobile-nav">
          <Link to="/tienda">Toda la tienda</Link>
          {cats.map((c) => <Link key={c.id} to={`/tienda/${c.slug}`}>{c.name}</Link>)}
          <Link to="/tienda?onSale=1" style={{ color: 'var(--grana)' }}>Ofertas</Link>
          <hr />
          <Link to="/cuenta/pedidos">Mis pedidos</Link>
          <Link to="/ayuda">Ayuda y contacto</Link>
        </nav>
      </Drawer>
    </header>
  );
}

function Footer({ store }) {
  const info = store?.info || {};
  return (
    <>
      <div className="huipil" aria-hidden="true" />
      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="wordmark" style={{ display: 'inline-block', marginBottom: 14 }}>EXCLUSIVE</div>
              <p className="small muted" style={{ maxWidth: '36ch', margin: '0 0 14px' }}>Ropa para el día a día con envíos a toda Guatemala. {info.address}</p>
              <p className="small" style={{ margin: 0 }}>{info.phone} · <a href={`mailto:${info.email}`}>{info.email}</a></p>
              <p className="small muted" style={{ margin: '4px 0 0' }}>{info.hours}</p>
            </div>
            <div>
              <h3>Tienda</h3>
              <ul>
                <li><Link to="/tienda">Toda la tienda</Link></li>
                <li><Link to="/tienda?sort=nuevos">Novedades</Link></li>
                <li><Link to="/tienda?onSale=1">Ofertas</Link></li>
                <li><Link to="/carrito">Carrito</Link></li>
              </ul>
            </div>
            <div>
              <h3>Ayuda</h3>
              <ul>
                <li><Link to="/ayuda">Contacto y preguntas</Link></li>
                <li><Link to="/politicas/envios">Envíos</Link></li>
                <li><Link to="/politicas/cambios-y-devoluciones">Cambios y devoluciones</Link></li>
                <li><Link to="/politicas/reclamos">Reclamos</Link></li>
                <li><Link to="/buzon"><Mail size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Buzón de pruebas</Link></li>
              </ul>
            </div>
            <div>
              <h3>Legal</h3>
              <ul>
                <li><Link to="/politicas/terminos">Términos y condiciones</Link></li>
                <li><Link to="/politicas/privacidad">Privacidad</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} {info.legalName || 'Exclusive'}</span>
            <span>Proyecto académico · Universidad Mariano Gálvez de Guatemala · Pagos, facturación y envíos simulados</span>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function StoreLayout() {
  const { data: store } = useStore();
  const { data: categories } = useApi('/catalog/categories', null, { auth: false });
  const loc = useLocation();
  const outlet = useOutlet({ store, categories });
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [loc.pathname]);
  return (
    <>
      <a href="#main" className="sr-only">Saltar al contenido</a>
      <div className="topbar">
        <div className="container">
          <span className="topbar__sim"><ShieldCheck size={14} /> <span className="hide-sm"><b>Entorno académico:</b> pagos, facturación y envíos simulados.</span><span className="only-sm">Entorno académico (simulado)</span></span>
          <span className="hide-sm"><Truck size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Envío gratis desde Q 600 · <RefreshCcw size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> 30 días para cambios · <CreditCard size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tarjeta, transferencia o contra entrega</span>
        </div>
      </div>
      <Header categories={categories} />
      <main id="main">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer store={store} />
      <CartDrawer />
    </>
  );
}
