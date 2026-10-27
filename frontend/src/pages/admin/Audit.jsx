import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Lock, ShieldAlert, Bug, FileClock } from 'lucide-react';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, SearchInput, Toolbar, ExportButton, AuditDiff, DataTable } from '../../components/admin.jsx';
import { ErrorState, Loader, Notice, Pagination, Status, Tabs, Empty } from '../../components/ui.jsx';
import { dateTime, int } from '../../lib/format.js';
import { actionLabel } from '../../lib/labels.js';
import { useParamsState } from './Orders.jsx';

const ENTITY_LABELS = {
  user: 'Usuario', role: 'Rol', product: 'Producto', variant: 'Variante', category: 'Categoría', color: 'Color', size_guide: 'Guía de tallas', store_setting: 'Configuración', policy: 'Política',
  order: 'Pedido', payment: 'Pago', refund: 'Reembolso', promotion: 'Promoción', carrier: 'Transportista', shipping_zone: 'Cobertura', post_sale_request: 'Posventa', purchase: 'Compra',
  supplier: 'Proveedor', inventory_movement: 'Movimiento', report: 'Reporte', audit_log: 'Auditoría', ml_model: 'Modelo de IA', sales_weekly_history: 'Historial semanal',
};

function AuditLog() {
  const s = useSession();
  const [f, set] = useParamsState({ page: '1' });
  const meta = useApi('/analytics/audit/meta');
  const { data, error, loading, reload } = useApi('/analytics/audit', { ...f, tab: undefined, pageSize: 30 });
  const [open, setOpen] = useState(null);
  return (
    <>
      <Toolbar>
        <SearchInput value={f.user} onChange={(v) => set({ user: v })} placeholder="Correo del usuario" width={230} />
        <select className="select select--sm" value={f.service || ''} onChange={(e) => set({ service: e.target.value })} aria-label="Servicio">
          <option value="">Servicio: todos</option>
          {(meta.data?.services || []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className="select select--sm" value={f.action || ''} onChange={(e) => set({ action: e.target.value })} aria-label="Acción" style={{ maxWidth: 220 }}>
          <option value="">Acción: todas</option>
          {(meta.data?.actions || []).map((x) => <option key={x} value={x}>{actionLabel(x)}</option>)}
        </select>
        <select className="select select--sm" value={f.entity || ''} onChange={(e) => set({ entity: e.target.value })} aria-label="Registro afectado">
          <option value="">Registro: todos</option>
          {(meta.data?.entities || []).map((x) => <option key={x} value={x}>{ENTITY_LABELS[x] || x}</option>)}
        </select>
        <input className="input input--sm" style={{ width: 110 }} placeholder="ID registro" value={f.entityId || ''} onChange={(e) => set({ entityId: e.target.value })} aria-label="Identificador del registro" />
        <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.from || ''} onChange={(e) => set({ from: e.target.value })} aria-label="Desde" />
        <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.to || ''} onChange={(e) => set({ to: e.target.value })} aria-label="Hasta" />
        {s.can('reports.export') && <ExportButton path="/analytics/audit/export" query={{ ...f, tab: undefined }} filename="auditoria.csv" />}
      </Toolbar>
      <section className="panel">
        <div className="panel__head"><span className="small muted">{data ? `${int(data.total)} eventos` : 'Buscando…'}</span><span className="tiny muted row"><Lock size={12} /> Solo lectura: un trigger de la base impide editar o borrar eventos</span></div>
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loader inline /> : data.items.length === 0 ? <Empty title="Sin eventos">No hay eventos con estos filtros.</Empty> : (
          <div className="audit-list" style={{ opacity: loading ? 0.6 : 1 }}>
            {data.items.map((a) => (
              <div key={a.id} className="audit-item">
                <button className="audit-item__row" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                  <span className="audit-item__when"><span className="small">{dateTime(a.createdAt)}</span><span className="tiny faint">#{a.id}</span></span>
                  <span className="grow">
                    <b>{actionLabel(a.action)}</b>
                    <span className="tiny muted" style={{ display: 'block' }}>{ENTITY_LABELS[a.entity] || a.entity}{a.entityId ? ` ${a.entityId}` : ''} · {a.service}</span>
                  </span>
                  <span className="audit-item__who"><span className="small">{a.userEmail || 'Sistema'}</span>{a.ip && <span className="tiny faint">IP {a.ip}</span>}</span>
                  <ChevronDown size={16} style={{ transform: open === a.id ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </button>
                {open === a.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="audit-item__body">
                    <AuditDiff before={a.before} after={a.after} />
                    {a.requestId && <span className="tiny faint">Identificador de solicitud: {a.requestId}</span>}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        )}
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}

const SEC_TYPES = {
  LOGIN_OK: ['Inicio de sesión', 'ok'], LOGIN_FAILED: ['Inicio fallido', 'warn'], ACCOUNT_LOCKED: ['Cuenta bloqueada', 'bad'], RATE_LIMIT: ['Límite de intentos', 'bad'],
  RESET_REQUESTED: ['Recuperación solicitada', 'info'], RESET_INVALID: ['Enlace inválido', 'warn'], RESET_COMPLETED: ['Contraseña restablecida', 'ok'], PASSWORD_CHANGED: ['Contraseña cambiada', 'info'],
  SESSIONS_REVOKED: ['Sesiones cerradas', 'info'], PERMISSION_DENIED: ['Acceso denegado', 'serious'],
};

function SecurityEvents() {
  const [f, set] = useParamsState({ page: '1' });
  const { data, error, loading, reload } = useApi('/auth/admin/security-events', { type: f.type, email: f.email, page: f.page, pageSize: 30 });
  return (
    <>
      <Toolbar>
        <SearchInput value={f.email} onChange={(v) => set({ email: v })} placeholder="Correo" width={230} />
        <select className="select select--sm" value={f.type || ''} onChange={(e) => set({ type: e.target.value })} aria-label="Tipo de evento">
          <option value="">Evento: todos</option>
          {Object.entries(SEC_TYPES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          columns={[
            { key: 'date', label: 'Fecha', render: (e) => <span className="small">{dateTime(e.createdAt)}</span> },
            { key: 'type', label: 'Evento', render: (e) => <Status tone={SEC_TYPES[e.type]?.[1] || 'neutral'} text={SEC_TYPES[e.type]?.[0] || e.type} /> },
            { key: 'email', label: 'Cuenta', render: (e) => <span className="small">{e.email || '—'}</span> },
            { key: 'ip', label: 'IP', render: (e) => <span className="small num">{e.ip}</span>, hideSm: true },
            { key: 'details', label: 'Detalle', render: (e) => <span className="tiny muted">{e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ') : '—'}</span> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
      <p className="tiny muted mt-2">Las respuestas de inicio de sesión y recuperación no revelan si una cuenta existe; el detalle técnico solo queda aquí. Nunca se registran contraseñas ni tokens.</p>
    </>
  );
}

function ErrorLogs() {
  const [f, set] = useParamsState({ page: '1' });
  const { data, error, loading, reload } = useApi('/analytics/errors', { errorId: f.errorId, page: f.page, pageSize: 30 });
  const [open, setOpen] = useState(null);
  return (
    <>
      <Toolbar>
        <SearchInput value={f.errorId} onChange={(v) => set({ errorId: v })} placeholder="Código de error (ej. 3FA2B91C)" width={260} />
      </Toolbar>
      <Notice tone="info">Cuando ocurre un error inesperado, el usuario ve un código de referencia; búscalo aquí para ver el servicio, la ruta y la traza interna (que nunca se muestra al usuario).</Notice>
      <section className="panel mt-2">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          empty="No hay errores registrados. ¡Todo en orden!"
          onRowClick={(e) => setOpen(open === e.id ? null : e.id)}
          columns={[
            { key: 'id', label: 'Código', render: (e) => <b className="num">{e.errorId}</b> },
            { key: 'date', label: 'Fecha', render: (e) => <span className="small">{dateTime(e.createdAt)}</span> },
            { key: 'svc', label: 'Servicio', render: (e) => e.service },
            { key: 'path', label: 'Ruta', render: (e) => <span className="small num">{e.method} {e.path}</span> },
            { key: 'msg', label: 'Mensaje', render: (e) => <>{e.message}{open === e.id && e.stack && <pre className="stack-trace">{e.stack}</pre>}</> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}

export default function Audit() {
  const s = useSession();
  const [f, set] = useParamsState({ tab: 'bitacora' });
  return (
    <>
      <PageHeader title="Auditoría y seguridad" description="Registro inmutable de cambios sensibles en usuarios, permisos, precios, promociones, inventario, pagos y pedidos, con su responsable, fecha y valores antes y después." />
      <Tabs id="aud-tabs" value={f.tab} onChange={(v) => set({ tab: v, page: undefined, user: undefined, type: undefined, email: undefined, errorId: undefined, service: undefined, action: undefined, entity: undefined, entityId: undefined })} tabs={[
        { value: 'bitacora', label: <span className="row" style={{ '--gap': '6px' }}><FileClock size={15} /> Bitácora</span> },
        { value: 'seguridad', label: <span className="row" style={{ '--gap': '6px' }}><ShieldAlert size={15} /> Eventos de seguridad</span> },
        s.can('system.health', 'audit.read') && { value: 'errores', label: <span className="row" style={{ '--gap': '6px' }}><Bug size={15} /> Errores técnicos</span> },
      ].filter(Boolean)} />
      <div className="mt-2">
        {f.tab === 'bitacora' && <AuditLog />}
        {f.tab === 'seguridad' && <SecurityEvents />}
        {f.tab === 'errores' && <ErrorLogs />}
      </div>
    </>
  );
}
