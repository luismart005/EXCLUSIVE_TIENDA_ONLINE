import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, ShoppingCart, CreditCard, Truck, RefreshCcw, Shirt, Tags, Percent, Boxes, ScrollText, PackagePlus, Factory, BarChart3, BrainCircuit,
  Users, ShieldCheck, FileClock, Settings, Activity, Mail, Menu, X, Bell, LogOut, Store, Search, UserRound,
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { Forbidden } from '../../auth/guards.jsx';
import { useApi } from '../../lib/useApi.js';
import { initials, relative } from '../../lib/format.js';
import { label } from '../../lib/labels.js';
import Dashboard from './Dashboard.jsx';
import { OrdersList, OrderAdminDetail } from './Orders.jsx';
import { PaymentsQueue, ShipmentsList } from './Payments.jsx';
import { PostSaleAdminList, PostSaleAdminDetail } from './PostSale.jsx';
import { ProductsList } from './Products.jsx';
import ProductEdit from './ProductEdit.jsx';
import CatalogSettings from './Catalog.jsx';
import { StockList, Kardex } from './Inventory.jsx';
import { PurchasesList, PurchaseNew, PurchaseDetail, Suppliers } from './Purchases.jsx';
import Promotions from './Promotions.jsx';
import Reports from './Reports.jsx';
import AiForecast from './AI.jsx';
import Audit from './Audit.jsx';
import { UsersList, UserDetail, Roles } from './Users.jsx';
import SettingsPage from './Settings.jsx';
import SystemHealth from './System.jsx';
import Mailbox from '../store/Mailbox.jsx';

const NAV = [
  {
    group: 'Operación',
    items: [
      { to: '/admin', label: 'Resumen', icon: LayoutDashboard, perms: ['dashboard.view'], end: true },
      { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingCart, perms: ['orders.read'], badge: (s) => (s?.toPrepare || 0) + (s?.toDispatch || 0) },
      { to: '/admin/pagos', label: 'Pagos por revisar', icon: CreditCard, perms: ['payments.review'], badge: (s) => s?.toReview },
      { to: '/admin/envios', label: 'Envíos', icon: Truck, perms: ['shipping.manage'], badge: (s) => s?.incidents, badgeTone: 'bad' },
      { to: '/admin/posventa', label: 'Posventa', icon: RefreshCcw, perms: ['postsale.read'], badge: (s) => s?.postsaleOpen },
    ],
  },
  {
    group: 'Catálogo',
    items: [
      { to: '/admin/productos', label: 'Productos', icon: Shirt, perms: ['catalog.read'] },
      { to: '/admin/categorias', label: 'Categorías y tallas', icon: Tags, perms: ['catalog.read'] },
      { to: '/admin/promociones', label: 'Promociones y cupones', icon: Percent, perms: ['promotions.manage'] },
    ],
  },
  {
    group: 'Inventario',
    items: [
      { to: '/admin/inventario', label: 'Existencias', icon: Boxes, perms: ['inventory.read'], badge: (s, inv) => inv?.low, badgeTone: 'warn' },
      { to: '/admin/kardex', label: 'Kardex', icon: ScrollText, perms: ['inventory.read'] },
      { to: '/admin/compras', label: 'Compras', icon: PackagePlus, perms: ['inventory.read', 'suppliers.manage'] },
      { to: '/admin/proveedores', label: 'Proveedores', icon: Factory, perms: ['suppliers.manage', 'inventory.read'] },
    ],
  },
  {
    group: 'Análisis',
    items: [
      { to: '/admin/reportes', label: 'Reportes', icon: BarChart3, perms: ['reports.read'] },
      { to: '/admin/ia', label: 'Predicción de ventas', icon: BrainCircuit, perms: ['ai.read'] },
    ],
  },
  {
    group: 'Administración',
    items: [
      { to: '/admin/usuarios', label: 'Usuarios', icon: Users, perms: ['users.read', 'users.manage'] },
      { to: '/admin/roles', label: 'Roles y permisos', icon: ShieldCheck, perms: ['roles.manage', 'users.read'] },
      { to: '/admin/auditoria', label: 'Auditoría', icon: FileClock, perms: ['audit.read'] },
      { to: '/admin/configuracion', label: 'Configuración', icon: Settings, perms: ['settings.manage', 'shipping.config'] },
      { to: '/admin/sistema', label: 'Estado del sistema', icon: Activity, perms: ['system.health'] },
      { to: '/admin/buzon', label: 'Buzón de pruebas', icon: Mail, perms: ['mailbox.read'] },
    ],
  },
];

function Sidebar({ summary, inv, onNavigate }) {
  const s = useSession();
  return (
    <div className="adm-side__inner">
      <Link to="/admin" className="adm-brand" onClick={onNavigate}>
        <span className="wordmark">EXCLUSIVE</span>
        <span className="adm-brand__tag">Panel</span>
      </Link>
      <nav className="adm-nav" aria-label="Panel administrativo">
        {NAV.map((g) => {
          const items = g.items.filter((i) => s.can(...i.perms));
          if (!items.length) return null;
          return (
            <div key={g.group} className="adm-nav__group">
              <span className="adm-nav__label">{g.group}</span>
              {items.map((i) => {
                const n = i.badge ? i.badge(summary, inv) : 0;
                return (
                  <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate}>
                    <i.icon size={18} aria-hidden="true" />
                    <span className="grow">{i.label}</span>
                    {n > 0 && <span className={`adm-nav__badge ${i.badgeTone ? `is-${i.badgeTone}` : ''}`}>{n > 99 ? '99+' : n}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="adm-side__foot">
        <Link to="/" className="btn btn--ghost btn--sm btn--block"><Store size={16} /> Ver la tienda</Link>
      </div>
    </div>
  );
}

function NotificationsMenu() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();
  const load = () => api.get('/auth/me/notifications').then((d) => { setData(d); s.setUnread(d.unread); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const openItem = async (n) => {
    setOpen(false);
    if (!n.readAt) await api.post(`/auth/me/notifications/${n.id}/read`, {}).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => { await api.post('/auth/me/notifications/read-all', {}); load(); };
  const unread = data?.unread || 0;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label={`Notificaciones, ${unread} sin leer`} aria-expanded={open}>
        <Bell size={20} />
        {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="notif-pop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <div className="notif-pop__head"><b>Notificaciones</b>{unread > 0 && <button className="btn btn--link btn--sm" onClick={readAll}>Marcar todas como leídas</button>}</div>
            <div className="notif-pop__list">
              {!data?.items?.length && <p className="small muted" style={{ padding: 16, margin: 0 }}>No tienes notificaciones.</p>}
              {data?.items?.map((n) => (
                <button key={n.id} className={`notif ${n.readAt ? '' : 'is-unread'}`} onClick={() => openItem(n)}>
                  <span className="notif__dot" />
                  <span className="grow"><span className="notif__title">{n.title}</span><span className="notif__body">{n.body}</span></span>
                  <span className="tiny muted nowrap">{relative(n.createdAt)}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const s = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const name = s.user ? `${s.user.firstName} ${s.user.lastName}` : '';
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="adm-user" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar">{initials(name)}</span>
        <span className="adm-user__text hide-sm"><b>{name}</b><small>{(s.user?.roles || []).map(label).map((r) => ({ ADMIN: 'Administrador', VENTAS: 'Ventas', INVENTARIO: 'Inventario', ATENCION: 'Atención al cliente', GERENCIA: 'Gerencia', CLIENTE: 'Cliente' }[r] || r)).join(' · ')}</small></span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="account-menu" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <div className="account-menu__head"><div className="strong">{name}</div><div className="tiny muted truncate">{s.user?.email}</div></div>
            <Link to="/cuenta/perfil" role="menuitem" onClick={() => setOpen(false)}><UserRound size={17} /> Mi perfil y contraseña</Link>
            <Link to="/" role="menuitem"><Store size={17} /> Ver la tienda</Link>
            <hr style={{ margin: '6px 0' }} />
            <button onClick={s.logout} role="menuitem"><LogOut size={17} /> Cerrar sesión</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickSearch() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const s = useSession();
  const submit = (e) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^EXC-?\d+/i.test(v) && s.can('orders.read')) navigate(`/admin/pedidos?search=${encodeURIComponent(v)}`);
    else if (s.can('catalog.read')) navigate(`/admin/productos?search=${encodeURIComponent(v)}`);
    else navigate(`/admin/pedidos?search=${encodeURIComponent(v)}`);
    setQ('');
  };
  return (
    <form className="adm-search hide-sm" onSubmit={submit} role="search">
      <Search size={16} aria-hidden="true" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido (EXC-…), producto o SKU" aria-label="Búsqueda rápida" />
    </form>
  );
}

function Shell() {
  const s = useSession();
  const loc = useLocation();
  const outlet = useOutlet();
  const [menu, setMenu] = useState(false);
  const canSummary = s.can('dashboard.view') && (s.can('orders.read') || s.can('payments.review') || s.can('postsale.read'));
  const summary = useApi('/sales/admin/summary', { t: Math.floor(Date.now() / 60000) }, { enabled: canSummary });
  const inv = useApi('/inventory/stock/summary', null, { enabled: s.can('inventory.read') });
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => {
    if (!canSummary) return undefined;
    const t = setInterval(() => summary.reload(), 60000);
    return () => clearInterval(t);
  }, [canSummary]);
  useEffect(() => { document.title = 'Panel · Exclusive'; }, []);

  return (
    <div className="adm">
      <aside className="adm-side"><Sidebar summary={summary.data} inv={inv.data} /></aside>
      <AnimatePresence>
        {menu && (
          <>
            <motion.div className="overlay" style={{ zIndex: 85 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
            <motion.aside className="adm-side adm-side--mobile" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'tween', duration: 0.26 }}>
              <button className="btn btn--icon btn--ghost btn--sm adm-side__close" onClick={() => setMenu(false)} aria-label="Cerrar menú"><X size={18} /></button>
              <Sidebar summary={summary.data} inv={inv.data} onNavigate={() => setMenu(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="adm-main">
        <header className="adm-top">
          <button className="icon-btn adm-menu-btn" onClick={() => setMenu(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <QuickSearch />
          <div className="grow" />
          <span className="adm-sim hide-sm">Entorno académico · datos ficticios</span>
          <NotificationsMenu />
          <UserMenu />
        </header>
        <main className="adm-content" id="main">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function Guard({ perms, children }) {
  const s = useSession();
  if (perms && !s.can(...perms)) return <Forbidden />;
  return children;
}

export default function AdminApp() {
  const s = useSession();
  if (!s.isStaff) {
    return (
      <div className="container"><Forbidden /></div>
    );
  }
  const g = (perms, el) => <Guard perms={perms}>{el}</Guard>;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={g(['dashboard.view'], <Dashboard />)} />
        <Route path="pedidos" element={g(['orders.read'], <OrdersList />)} />
        <Route path="pedidos/:id" element={g(['orders.read'], <OrderAdminDetail />)} />
        <Route path="pagos" element={g(['payments.review', 'orders.read'], <PaymentsQueue />)} />
        <Route path="envios" element={g(['shipping.manage', 'orders.read'], <ShipmentsList />)} />
        <Route path="posventa" element={g(['postsale.read'], <PostSaleAdminList />)} />
        <Route path="posventa/:id" element={g(['postsale.read'], <PostSaleAdminDetail />)} />
        <Route path="productos" element={g(['catalog.read'], <ProductsList />)} />
        <Route path="productos/nuevo" element={g(['catalog.manage'], <ProductEdit />)} />
        <Route path="productos/:id" element={g(['catalog.read'], <ProductEdit />)} />
        <Route path="categorias" element={g(['catalog.read'], <CatalogSettings />)} />
        <Route path="promociones" element={g(['promotions.manage', 'reports.read'], <Promotions />)} />
        <Route path="inventario" element={g(['inventory.read'], <StockList />)} />
        <Route path="kardex" element={g(['inventory.read'], <Kardex />)} />
        <Route path="compras" element={g(['inventory.read', 'suppliers.manage'], <PurchasesList />)} />
        <Route path="compras/nueva" element={g(['suppliers.manage', 'inventory.move'], <PurchaseNew />)} />
        <Route path="compras/:id" element={g(['inventory.read', 'suppliers.manage'], <PurchaseDetail />)} />
        <Route path="proveedores" element={g(['suppliers.manage', 'inventory.read'], <Suppliers />)} />
        <Route path="reportes" element={g(['reports.read'], <Reports />)} />
        <Route path="ia" element={g(['ai.read'], <AiForecast />)} />
        <Route path="usuarios" element={g(['users.read', 'users.manage'], <UsersList />)} />
        <Route path="usuarios/:id" element={g(['users.read', 'users.manage'], <UserDetail />)} />
        <Route path="roles" element={g(['roles.manage', 'users.read'], <Roles />)} />
        <Route path="auditoria" element={g(['audit.read'], <Audit />)} />
        <Route path="configuracion" element={g(['settings.manage', 'shipping.config'], <SettingsPage />)} />
        <Route path="sistema" element={g(['system.health'], <SystemHealth />)} />
        <Route path="buzon" element={g(['mailbox.read'], <Mailbox />)} />
        <Route path="*" element={<div className="empty"><h3>Sección no encontrada</h3><Link to="/admin" className="btn btn--ghost">Volver al resumen</Link></div>} />
      </Route>
    </Routes>
  );
}
