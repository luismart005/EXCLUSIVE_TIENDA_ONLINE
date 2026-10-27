import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UserPlus, Pencil, Power, LogOut, Unlock, Save, Plus } from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, SearchInput, Toolbar, KV, Kpi } from '../../components/admin.jsx';
import { Button, ErrorState, Field, Loader, Modal, Notice, Pagination, Status, Tabs } from '../../components/ui.jsx';
import { money, dateTime, relative, int, initials } from '../../lib/format.js';
import { confirm, promptText, toast, apiError, info } from '../../lib/alerts.js';
import { useParamsState } from './Orders.jsx';

function UserModal({ initial, roles, onClose, onSaved }) {
  const isNew = !initial?.id;
  const [form, setForm] = useState({ firstName: initial?.firstName || '', lastName: initial?.lastName || '', email: initial?.email || '', phone: initial?.phone || '', roleCodes: initial?.roles?.map((r) => r.code) || ['VENTAS'] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleRole = (code) => setForm((f) => ({ ...f, roleCodes: f.roleCodes.includes(code) ? f.roleCodes.filter((c) => c !== code) : [...f.roleCodes, code] }));
  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (isNew) {
        const u = await api.post('/auth/admin/users', form);
        await info('Usuario creado', `Contraseña temporal de <b>${u.email}</b>: <code style="font-size:16px">${u.tempPassword}</code><br><small>También se envió al buzón de pruebas. Pídele cambiarla al ingresar.</small>`);
      } else {
        await api.put(`/auth/admin/users/${initial.id}`, { firstName: form.firstName, lastName: form.lastName, phone: form.phone, roleCodes: form.roleCodes });
        toast.success('Usuario actualizado.');
      }
      onSaved();
      onClose();
    } catch (e) { setErrors(e.fields || {}); if (!Object.keys(e.fields || {}).length) apiError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={isNew ? 'Nuevo usuario del personal' : `Editar ${initial.firstName} ${initial.lastName}`} footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Guardar</Button></>}>
      <div className="form-grid">
        <Field label="Nombre" error={errors.firstName}>{(a) => <input className="input" value={form.firstName} onChange={set('firstName')} {...a} />}</Field>
        <Field label="Apellido" error={errors.lastName}>{(a) => <input className="input" value={form.lastName} onChange={set('lastName')} {...a} />}</Field>
        <Field label="Correo" error={errors.email} hint={isNew ? 'Recibirá una contraseña temporal en el buzón de pruebas.' : 'El correo no se puede cambiar.'}>{(a) => <input className="input" type="email" value={form.email} onChange={set('email')} disabled={!isNew} {...a} />}</Field>
        <Field label="Teléfono" error={errors.phone}>{(a) => <input className="input" value={form.phone || ''} onChange={set('phone')} {...a} />}</Field>
        <div className="span-2">
          <div className="label mb-1">Roles</div>
          <div className="stack" style={{ '--gap': '8px' }}>
            {roles.map((r) => (
              <label key={r.code} className={`choice ${form.roleCodes.includes(r.code) ? 'on' : ''}`}>
                <input type="checkbox" checked={form.roleCodes.includes(r.code)} onChange={() => toggleRole(r.code)} />
                <div><div className="choice__title">{r.name}</div><div className="choice__desc">{r.description} · {r.permissions.length} permisos</div></div>
              </label>
            ))}
          </div>
          {errors.roleCodes && <p className="field-error mt-1">{errors.roleCodes}</p>}
        </div>
      </div>
    </Modal>
  );
}

export function UsersList() {
  const s = useSession();
  const navigate = useNavigate();
  const [f, set] = useParamsState({ page: '1', type: 'staff' });
  const roles = useApi('/auth/admin/roles');
  const { data, error, loading, reload } = useApi('/auth/admin/users', { ...f, type: f.type === 'todos' ? undefined : f.type, pageSize: 20 });
  const [edit, setEdit] = useState(null);
  return (
    <>
      <PageHeader title="Usuarios" description="Personal de la tienda y clientes registrados. Cada cliente solo puede ver su propia información." actions={s.can('users.manage') && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}><UserPlus size={16} /> Nuevo usuario</button>} />
      <Tabs id="usr-tabs" value={f.type} onChange={(v) => set({ type: v })} tabs={[{ value: 'staff', label: 'Personal' }, { value: 'clientes', label: 'Clientes' }, { value: 'todos', label: 'Todos' }]} />
      <Toolbar>
        <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Nombre o correo" />
        <select className="select select--sm" value={f.role || ''} onChange={(e) => set({ role: e.target.value })} aria-label="Rol">
          <option value="">Rol: todos</option>
          {(roles.data || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
        <select className="select select--sm" value={f.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Estado">
          <option value="">Estado: todos</option>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Inactivos</option>
        </select>
        {data && <span className="small muted">{int(data.total)} usuarios</span>}
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          onRowClick={(u) => navigate(`/admin/usuarios/${u.id}`)}
          columns={[
            { key: 'name', label: 'Usuario', render: (u) => <div className="row" style={{ '--gap': '10px' }}><span className="avatar">{initials(`${u.firstName} ${u.lastName}`)}</span><div><b>{u.firstName} {u.lastName}</b><div className="tiny muted">{u.email}</div></div></div> },
            { key: 'roles', label: 'Roles', render: (u) => <span className="row row--wrap" style={{ '--gap': '4px' }}>{u.roles.map((r) => <span key={r.code} className={`chip ${r.isStaff ? 'chip--info' : 'chip--neutral'}`}>{r.name}</span>)}</span> },
            { key: 'last', label: 'Último acceso', render: (u) => <span className="small">{u.lastLoginAt ? relative(u.lastLoginAt) : 'Nunca'}</span>, hideSm: true },
            { key: 'status', label: 'Estado', render: (u) => <>{<Status value={u.status} />}{u.locked && <div><Status tone="bad" text="Bloqueado temporalmente" /></div>}{u.isDemo && <div className="tiny faint">Dato de demostración</div>}</> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
      {edit && roles.data && <UserModal initial={edit} roles={roles.data.filter((r) => r.isStaff)} onClose={() => setEdit(null)} onSaved={reload} />}
    </>
  );
}

const SEC_LABEL = { LOGIN_OK: 'Inicio de sesión', LOGIN_FAILED: 'Inicio fallido', ACCOUNT_LOCKED: 'Cuenta bloqueada', RATE_LIMIT: 'Límite de intentos', RESET_REQUESTED: 'Recuperación solicitada', RESET_COMPLETED: 'Contraseña restablecida', PASSWORD_CHANGED: 'Contraseña cambiada', SESSIONS_REVOKED: 'Sesiones cerradas', PERMISSION_DENIED: 'Acceso denegado', RESET_INVALID: 'Enlace inválido' };

export function UserDetail() {
  const { id } = useParams();
  const s = useSession();
  const navigate = useNavigate();
  const { data: u, error, loading, reload } = useApi(`/auth/admin/users/${id}`, null, { keepPrevious: true });
  const roles = useApi('/auth/admin/roles');
  const orders = useApi('/sales/admin/orders', { customerId: id, pageSize: 8 }, { enabled: s.can('orders.read') });
  const [edit, setEdit] = useState(false);
  if (loading && !u) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!u) return null;
  const manage = s.can('users.manage');
  const isStaff = u.roles.some((r) => r.isStaff);
  const toggle = async () => {
    const deactivate = u.status === 'ACTIVO';
    let reason = '';
    if (deactivate) {
      reason = await promptText({ title: `¿Desactivar a ${u.firstName}?`, text: 'Se cerrarán todas sus sesiones de inmediato y no podrá iniciar sesión.', placeholder: 'Motivo (opcional)', confirmText: 'Desactivar', danger: true, optional: true });
      if (reason === null) return;
    } else if (!(await confirm({ title: `¿Activar a ${u.firstName}?`, confirmText: 'Activar' }))) return;
    try { const r = await api.post(`/auth/admin/users/${u.id}/status`, { status: deactivate ? 'INACTIVO' : 'ACTIVO', reason: reason || undefined }); toast.success(r.message); reload(); } catch (e) { apiError(e); }
  };
  const revoke = async () => {
    if (!(await confirm({ title: '¿Cerrar todas sus sesiones?', text: 'Sus tokens dejarán de funcionar y tendrá que iniciar sesión de nuevo.', confirmText: 'Cerrar sesiones', icon: 'warning' }))) return;
    try { const r = await api.post(`/auth/admin/users/${u.id}/revoke-sessions`, {}); toast.success(r.message); } catch (e) { apiError(e); }
  };
  const unlock = async () => {
    try { const r = await api.post(`/auth/admin/users/${u.id}/unlock`, {}); toast.success(r.message); reload(); } catch (e) { apiError(e); }
  };
  return (
    <>
      <PageHeader
        back={{ to: '/admin/usuarios', label: 'Usuarios' }}
        title={`${u.firstName} ${u.lastName}`}
        description={`${u.email} · registrado el ${dateTime(u.createdAt)}`}
        actions={manage && (
          <>
            {isStaff && <button className="btn btn--ghost btn--sm" onClick={() => setEdit(true)}><Pencil size={15} /> Editar</button>}
            {u.locked && <button className="btn btn--ghost btn--sm" onClick={unlock}><Unlock size={15} /> Desbloquear</button>}
            <button className="btn btn--ghost btn--sm" onClick={revoke}><LogOut size={15} /> Cerrar sesiones</button>
            {u.id !== s.user?.id && <button className="btn btn--ghost btn--sm" style={{ color: u.status === 'ACTIVO' ? 'var(--grana)' : undefined }} onClick={toggle}><Power size={15} /> {u.status === 'ACTIVO' ? 'Desactivar' : 'Activar'}</button>}
          </>
        )}
      />
      <div className="kpis kpis--compact mb-3">
        <Kpi label="Estado" value={u.status === 'ACTIVO' ? 'Activo' : 'Inactivo'} hint={u.locked ? 'bloqueado por intentos fallidos' : 'sin bloqueos'} />
        <Kpi label="Pedidos" value={int(u.stats.orders)} hint="no cancelados" />
        <Kpi label="Total comprado" value={money(u.stats.spent)} />
        <Kpi label="Último acceso" value={u.lastLoginAt ? relative(u.lastLoginAt) : 'Nunca'} />
      </div>
      <div className="adm-detail">
        <div className="stack" style={{ '--gap': '20px' }}>
          {s.can('orders.read') && (
            <section className="panel">
              <div className="panel__head"><h2>Pedidos recientes</h2><Link className="small" to={`/admin/pedidos?customerId=${u.id}`}>Ver todos</Link></div>
              <DataTable rows={orders.data?.items} loading={orders.loading} empty="Sin pedidos." onRowClick={(o) => navigate(`/admin/pedidos/${o.id}`)}
                columns={[
                  { key: 'code', label: 'Pedido', render: (o) => <b className="num">{o.code}</b> },
                  { key: 'date', label: 'Fecha', render: (o) => dateTime(o.createdAt) },
                  { key: 'status', label: 'Estado', render: (o) => <Status value={o.status} /> },
                  { key: 'total', label: 'Total', className: 'r', render: (o) => <span className="num strong">{money(o.total)}</span> },
                ]} />
            </section>
          )}
          <section className="panel">
            <div className="panel__head"><h2>Eventos de seguridad recientes</h2></div>
            <DataTable rows={u.securityEvents} empty="Sin eventos registrados."
              columns={[
                { key: 'date', label: 'Fecha', render: (e) => <span className="small">{dateTime(e.createdAt)}</span> },
                { key: 'type', label: 'Evento', render: (e) => SEC_LABEL[e.type] || e.type },
                { key: 'ip', label: 'IP', render: (e) => <span className="small num">{e.ip}</span> },
              ]} />
          </section>
        </div>
        <aside className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2>Datos</h2></div>
            <div className="panel__body"><KV items={[['Correo', u.email], ['Teléfono', u.phone], ['Roles', u.roles.map((r) => r.name).join(', ')], ['Demostración', u.isDemo ? 'Sí' : 'No']]} /></div>
          </section>
          {u.addresses?.length > 0 && (
            <section className="panel">
              <div className="panel__head"><h2>Direcciones</h2></div>
              <div className="panel__body stack" style={{ '--gap': '10px' }}>
                {u.addresses.map((a) => <div key={a.id} className="small"><b>{a.label}</b>{a.isDefault ? ' · predeterminada' : ''}<div className="muted">{a.line1}, {a.municipality}, {a.department}</div></div>)}
              </div>
            </section>
          )}
        </aside>
      </div>
      {edit && roles.data && <UserModal initial={u} roles={roles.data.filter((r) => r.isStaff)} onClose={() => setEdit(false)} onSaved={reload} />}
    </>
  );
}

function NewRoleModal({ perms, onClose, onSaved, base }) {
  const [form, setForm] = useState({ code: '', name: '', description: '', permissions: base || [] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try { await api.post('/auth/admin/roles', form); toast.success('Rol creado.'); onSaved(); onClose(); } catch (e) { setErrors(e.fields || {}); if (!Object.keys(e.fields || {}).length) apiError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Nuevo rol" footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Crear rol</Button></>}>
      <div className="form-grid">
        <Field label="Código" error={errors.code} hint="Mayúsculas y guion bajo, ej. BODEGA">{(a) => <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} {...a} />}</Field>
        <Field label="Nombre" error={errors.name}>{(a) => <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} {...a} />}</Field>
        <Field label="Descripción" className="span-2">{(a) => <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} {...a} />}</Field>
        <p className="tiny muted span-2" style={{ margin: 0 }}>{form.permissions.length} permisos seleccionados{base ? ' (copiados del rol elegido)' : ''}. Podrás ajustarlos en la matriz después de crearlo.</p>
      </div>
    </Modal>
  );
}

export function Roles() {
  const s = useSession();
  const roles = useApi('/auth/admin/roles');
  const perms = useApi('/auth/admin/permissions');
  const [roleId, setRoleId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState(null);
  const canEdit = s.can('roles.manage');
  useEffect(() => { if (!roleId && roles.data?.length) setRoleId(roles.data.find((r) => r.code === 'VENTAS')?.id || roles.data[0].id); }, [roles.data, roleId]);
  const role = roles.data?.find((r) => r.id === roleId);
  useEffect(() => { if (role) setDraft(new Set(role.permissions)); }, [role]);
  const modules = useMemo(() => {
    const m = new Map();
    for (const p of perms.data || []) { if (!m.has(p.module)) m.set(p.module, []); m.get(p.module).push(p); }
    return [...m.entries()];
  }, [perms.data]);
  if (!roles.data || !perms.data || !draft) return <Loader />;
  const locked = !canEdit || role.code === 'ADMIN' || role.code === 'CLIENTE';
  const dirty = role && (draft.size !== role.permissions.length || role.permissions.some((p) => !draft.has(p)));
  const toggle = (code) => setDraft((d) => { const n = new Set(d); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const save = async () => {
    if (!(await confirm({ title: `¿Guardar los permisos de ${role.name}?`, text: `Afecta a ${role.users} usuario(s). Los cambios se aplican en segundos y quedan en la bitácora.`, confirmText: 'Guardar permisos' }))) return;
    setSaving(true);
    try { await api.put(`/auth/admin/roles/${role.id}/permissions`, { permissions: [...draft] }); toast.success('Permisos actualizados.'); roles.reload(); } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <>
      <PageHeader title="Roles y permisos" description="Define qué puede hacer cada rol. El backend verifica los permisos en cada solicitud; ocultar un botón no es la única protección." actions={canEdit && <button className="btn btn--ghost btn--sm" onClick={() => setNewRole({ base: [...draft] })}><Plus size={15} /> Nuevo rol</button>} />
      <div className="roles-layout">
        <nav className="roles-list" aria-label="Roles">
          {roles.data.map((r) => (
            <button key={r.id} className={r.id === roleId ? 'on' : ''} onClick={() => setRoleId(r.id)}>
              <span className="grow"><b>{r.name}</b><span className="tiny muted" style={{ display: 'block' }}>{r.users} usuarios · {r.permissions.length} permisos</span></span>
            </button>
          ))}
        </nav>
        <section className="panel">
          <div className="panel__head">
            <div><h2>{role.name}</h2><p className="tiny muted" style={{ margin: '2px 0 0' }}>{role.description}</p></div>
            {!locked && <Button className="btn btn--primary btn--sm" loading={saving} disabled={!dirty} onClick={save}><Save size={15} /> Guardar cambios</Button>}
          </div>
          <div className="panel__body stack" style={{ '--gap': '18px' }}>
            {role.code === 'ADMIN' && <Notice tone="info">El rol Administrador conserva todos los permisos para garantizar que siempre exista acceso completo.</Notice>}
            {role.code === 'CLIENTE' && <Notice tone="info">El rol Cliente no tiene permisos administrativos: solo accede a su propia información.</Notice>}
            {modules.map(([mod, list]) => (
              <div key={mod} className="perm-group">
                <div className="perm-group__title">{mod}</div>
                {list.map((p) => (
                  <label key={p.code} className={`perm ${draft.has(p.code) ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                    <input type="checkbox" checked={draft.has(p.code)} disabled={locked} onChange={() => toggle(p.code)} />
                    <span className="grow">{p.name}</span>
                    <code className="tiny muted">{p.code}</code>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
      {newRole && <NewRoleModal perms={perms.data} base={newRole.base} onClose={() => setNewRole(null)} onSaved={roles.reload} />}
    </>
  );
}

