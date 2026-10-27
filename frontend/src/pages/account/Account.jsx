import { useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Package, MapPin, User, Bell, RefreshCcw, Pencil, Trash2, Plus, ShieldCheck, LogOut, Star } from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { Button, Empty, Field, Img, Loader, Status, ErrorState } from '../../components/ui.jsx';
import AddressModal from '../../components/AddressForm.jsx';
import { PasswordInput } from '../store/AuthPages.jsx';
import { money, date, dateTime, relative, initials, plural } from '../../lib/format.js';
import { label } from '../../lib/labels.js';
import { confirm, toast, apiError, success } from '../../lib/alerts.js';

export function AccountLayout() {
  const s = useSession();
  const ctx = useOutletContext();
  const name = s.user ? `${s.user.firstName} ${s.user.lastName}` : '';
  return (
    <div className="container account">
      <nav className="account-nav" aria-label="Mi cuenta">
        <div className="who"><span className="avatar">{initials(name)}</span><div className="grow"><div className="strong truncate">{name}</div><div className="tiny muted truncate">{s.user?.email}</div></div></div>
        <NavLink to="/cuenta/pedidos"><Package size={18} /> Mis pedidos</NavLink>
        <NavLink to="/cuenta/posventa"><RefreshCcw size={18} /> Cambios y devoluciones</NavLink>
        <NavLink to="/cuenta/direcciones"><MapPin size={18} /> Direcciones</NavLink>
        <NavLink to="/cuenta/notificaciones"><Bell size={18} /> Notificaciones {s.user?.unreadNotifications > 0 && <span className="chip chip--bad" style={{ marginLeft: 'auto' }}>{s.user.unreadNotifications}</span>}</NavLink>
        <NavLink to="/cuenta/perfil"><User size={18} /> Perfil y seguridad</NavLink>
      </nav>
      <section><Outlet context={ctx} /></section>
    </div>
  );
}

export function Orders() {
  const { data, error, loading, reload } = useApi('/sales/orders');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <>
      <h1 className="h1 mb-3">Mis pedidos</h1>
      {data.length === 0 ? (
        <Empty icon={Package} title="Aún no tienes pedidos" action={<Link to="/tienda" className="btn btn--primary">Explorar la tienda</Link>}>Cuando compres, aquí podrás seguir cada pedido, descargar tu comprobante y solicitar cambios.</Empty>
      ) : (
        <div className="stack" style={{ '--gap': '12px' }}>
          {data.map((o, i) => (
            <motion.div key={o.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
              <Link to={`/cuenta/pedidos/${o.code}`} className="order-card">
                <div>
                  <div className="row row--wrap" style={{ '--gap': '10px' }}>
                    <span className="strong num">{o.code}</span>
                    <Status value={o.status} />
                    {o.status === 'PENDIENTE_PAGO' && <Status value={o.paymentStatus} text={`Pago ${label(o.paymentStatus).toLowerCase()}`} />}
                  </div>
                  <div className="small muted mt-1">{date(o.createdAt)} · {plural(o.itemCount, 'artículo', 'artículos')} · {label(o.paymentMethod)}{o.tracking ? ` · Guía ${o.tracking}` : ''}</div>
                  <div className="order-card__thumbs">{o.items.map((it, j) => <Img key={j} src={it.imageUrl} alt={it.productName} />)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="strong num" style={{ fontSize: 18 }}>{money(o.total)}</div>
                  <span className="small" style={{ color: 'var(--jade)' }}>Ver detalle →</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}

export function Addresses() {
  const s = useSession();
  const { data, loading, reload } = useApi('/auth/me/addresses');
  const [editing, setEditing] = useState(null);
  const remove = async (a) => {
    if (!(await confirm({ title: '¿Eliminar dirección?', text: `${a.label}: ${a.line1}`, confirmText: 'Eliminar', danger: true, icon: 'warning' }))) return;
    try {
      await api.del(`/auth/me/addresses/${a.id}`);
      toast.success('Dirección eliminada.');
      reload();
    } catch (e) { apiError(e); }
  };
  const makeDefault = async (a) => {
    try {
      await api.put(`/auth/me/addresses/${a.id}`, { ...a, isDefault: true });
      toast.success('Dirección predeterminada actualizada.');
      reload();
    } catch (e) { apiError(e); }
  };
  if (loading && !data) return <Loader />;
  return (
    <>
      <div className="row row--between row--wrap mb-3"><h1 className="h1">Direcciones</h1><button className="btn btn--primary" onClick={() => setEditing({})}><Plus size={17} /> Nueva dirección</button></div>
      {data?.length === 0 ? <Empty icon={MapPin} title="No tienes direcciones guardadas">Agrega una para comprar más rápido.</Empty> : (
        <div className="grid-2">
          <AnimatePresence>
            {data?.map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="panel">
                <div className="panel__body stack" style={{ '--gap': '6px' }}>
                  <div className="row row--between"><span className="strong">{a.label}</span>{a.isDefault && <span className="chip chip--ok"><Star /> Predeterminada</span>}</div>
                  <span>{a.recipientName} · {a.phone}</span>
                  <span className="muted small">{a.line1}, {a.municipality}, {a.department}</span>
                  {a.reference && <span className="muted small">{a.reference}</span>}
                </div>
                <div className="panel__foot" style={{ justifyContent: 'flex-start' }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditing(a)}><Pencil size={15} /> Editar</button>
                  {!a.isDefault && <button className="btn btn--link btn--sm" onClick={() => makeDefault(a)}>Hacer predeterminada</button>}
                  <button className="btn btn--link btn--sm" style={{ color: 'var(--grana)', marginLeft: 'auto' }} onClick={() => remove(a)}><Trash2 size={15} /> Eliminar</button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <AddressModal key={editing?.id || (editing ? 'new' : 'none')} open={!!editing} initial={editing?.id ? editing : null} onClose={() => setEditing(null)} onSaved={reload}
        defaultName={s.user ? `${s.user.firstName} ${s.user.lastName}` : ''} defaultPhone={s.user?.phone || ''} />
    </>
  );
}

export function Profile() {
  const s = useSession();
  const [form, setForm] = useState({ firstName: s.user?.firstName || '', lastName: s.user?.lastName || '', phone: s.user?.phone || '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwSaving, setPwSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api.put('/auth/me', form);
      await s.refreshMe();
      toast.success('Datos actualizados.');
    } catch (err) { setErrors(err.fields); if (!Object.keys(err.fields).length) apiError(err); } finally { setSaving(false); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    setPwSaving(true);
    setPwErrors({});
    try {
      const r = await api.post('/auth/me/password', pw);
      await success('Contraseña actualizada', r.message);
      s.logout();
    } catch (err) { setPwErrors(err.fields); if (!Object.keys(err.fields).length) apiError(err); } finally { setPwSaving(false); }
  };
  const logoutAll = async () => {
    if (!(await confirm({ title: '¿Cerrar sesión en todos tus dispositivos?', text: 'Tendrás que volver a iniciar sesión en cada uno, incluido este.', confirmText: 'Cerrar todas', icon: 'warning' }))) return;
    try {
      await api.post('/auth/me/logout-all', {});
      s.logout();
    } catch (e) { apiError(e); }
  };
  return (
    <>
      <h1 className="h1 mb-3">Perfil y seguridad</h1>
      <div className="stack" style={{ '--gap': '20px' }}>
        <form className="panel" onSubmit={save} noValidate>
          <div className="panel__head"><h2>Datos personales</h2></div>
          <div className="panel__body form-grid">
            <Field label="Nombre" error={errors.firstName}>{(a) => <input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} {...a} />}</Field>
            <Field label="Apellido" error={errors.lastName}>{(a) => <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} {...a} />}</Field>
            <Field label="Correo electrónico" hint="El correo identifica tu cuenta y no se puede cambiar.">{(a) => <input className="input" value={s.user?.email || ''} disabled {...a} />}</Field>
            <Field label="Teléfono" error={errors.phone}>{(a) => <input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} {...a} />}</Field>
          </div>
          <div className="panel__foot"><Button className="btn btn--primary" loading={saving} type="submit">Guardar cambios</Button></div>
        </form>
        <form className="panel" onSubmit={changePw} noValidate>
          <div className="panel__head"><h2>Cambiar contraseña</h2><ShieldCheck size={18} color="var(--jade)" /></div>
          <div className="panel__body form-grid">
            <Field label="Contraseña actual" error={pwErrors.currentPassword}>{(a) => <PasswordInput value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" showRules={false} {...a} />}</Field>
            <Field label="Nueva contraseña" error={pwErrors.newPassword}>{(a) => <PasswordInput value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} {...a} />}</Field>
          </div>
          <div className="panel__foot"><span className="small muted grow">Al cambiarla cerraremos tus sesiones abiertas.</span><Button className="btn btn--primary" loading={pwSaving} type="submit">Actualizar contraseña</Button></div>
        </form>
        <div className="panel">
          <div className="panel__body row row--between row--wrap">
            <div><div className="strong">Sesiones activas</div><div className="small muted">Último acceso: {dateTime(s.user?.lastLoginAt)}</div></div>
            <button className="btn btn--ghost" onClick={logoutAll}><LogOut size={16} /> Cerrar sesión en todos los dispositivos</button>
          </div>
        </div>
      </div>
    </>
  );
}

export function Notifications() {
  const s = useSession();
  const { data, reload, loading } = useApi('/auth/me/notifications');
  const readAll = async () => {
    await api.post('/auth/me/notifications/read-all', {});
    s.setUnread(0);
    reload();
  };
  const open = async (n) => {
    if (!n.readAt) {
      await api.post(`/auth/me/notifications/${n.id}/read`, {}).catch(() => {});
      s.setUnread(Math.max(0, (s.user?.unreadNotifications || 1) - 1));
    }
  };
  if (loading && !data) return <Loader />;
  return (
    <>
      <div className="row row--between row--wrap mb-3"><h1 className="h1">Notificaciones</h1>{data?.unread > 0 && <button className="btn btn--ghost btn--sm" onClick={readAll}>Marcar todas como leídas</button>}</div>
      {data?.items.length === 0 ? <Empty icon={Bell} title="Sin notificaciones">Te avisaremos aquí cada cambio en tus pedidos.</Empty> : (
        <div className="panel">
          {data?.items.map((n) => {
            const inner = (
              <div className="row row--top" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-2)', background: n.readAt ? '#fff' : 'var(--jade-50)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, marginTop: 8, background: n.readAt ? 'transparent' : 'var(--jade)', flex: 'none' }} />
                <div className="grow"><div className="strong">{n.title}</div><div className="small muted">{n.body}</div></div>
                <span className="tiny muted nowrap">{relative(n.createdAt)}</span>
              </div>
            );
            return n.link ? <Link key={n.id} to={n.link.replace(/^\/admin/, '/admin')} onClick={() => open(n)} style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}>{inner}</Link> : <div key={n.id}>{inner}</div>;
          })}
        </div>
      )}
    </>
  );
}

export function PostSaleList() {
  const { data, loading } = useApi('/sales/post-sale');
  if (loading && !data) return <Loader />;
  return (
    <>
      <h1 className="h1 mb-1">Cambios, devoluciones y reclamos</h1>
      <p className="muted mb-3">Para iniciar una solicitud, abre un pedido entregado desde <Link to="/cuenta/pedidos">Mis pedidos</Link>.</p>
      {data?.length === 0 ? <Empty icon={RefreshCcw} title="No tienes solicitudes">Si algo no te quedó, tienes 30 días desde la entrega para solicitar un cambio.</Empty> : (
        <div className="stack" style={{ '--gap': '12px' }}>
          {data?.map((ps) => (
            <div key={ps.id} className="panel">
              <div className="panel__head">
                <div className="row row--wrap"><span className="strong num">{ps.code}</span><span className="chip chip--outline">{label(ps.type)}</span><Status value={ps.status} /></div>
                <Link to={`/cuenta/pedidos/${ps.order.code}`} className="small">Pedido {ps.order.code}</Link>
              </div>
              <div className="panel__body grid-2">
                <div className="stack" style={{ '--gap': '8px' }}>
                  <div><span className="strong">{ps.reason}</span><p className="small muted" style={{ margin: '4px 0 0' }}>{ps.description}</p></div>
                  {ps.items.map((it) => <div key={it.id} className="row small"><Img src={it.orderItem.imageUrl} alt="" style={{ width: 36, height: 45, objectFit: 'cover', borderRadius: 4 }} /> {it.orderItem.productName} · {it.orderItem.colorName} · {it.orderItem.sizeName} × {it.quantity}</div>)}
                  {ps.resolution && <div className="notice notice--ok small"><span><b>Resolución:</b> {ps.resolution}</span></div>}
                  {ps.refunds.map((r) => <span key={r.reference} className="small">Reembolso {r.reference}: <b className="num">{money(r.amount)}</b> (simulado)</span>)}
                </div>
                <ol className="timeline">
                  {ps.history.map((h, i) => (
                    <li key={i}><span className="timeline__dot k-POSVENTA" /><div><div className="timeline__title">{label(h.toStatus)}</div><div className="timeline__meta">{dateTime(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</div></div></li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
