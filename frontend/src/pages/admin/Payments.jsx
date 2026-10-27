import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, Toolbar } from '../../components/admin.jsx';
import { Pagination, Status, Tabs, Notice } from '../../components/ui.jsx';
import { money, dateTime, relative, int } from '../../lib/format.js';
import { label } from '../../lib/labels.js';
import { useParamsState, PaymentReview, ReceiptModal } from './Orders.jsx';

export function PaymentsQueue() {
  const s = useSession();
  const [f, set] = useParamsState({ queue: 'revision', page: '1' });
  const { data, error, loading, reload } = useApi('/sales/admin/payments', { ...f, queue: f.queue === 'todos' ? undefined : f.queue, pageSize: 20 });
  const [receipt, setReceipt] = useState(null);
  const reviewable = (p) => ['EN_REVISION', 'PENDIENTE'].includes(p.status) && p.method !== 'CONTRA_ENTREGA' && p.order.status === 'PENDIENTE_PAGO' && s.can('payments.review');
  return (
    <>
      <PageHeader title="Pagos" description="Revisa los comprobantes de transferencia y los pagos con tarjeta que quedaron pendientes. Aprobar un pago confirma el pedido y emite el comprobante simulado." />
      <Tabs id="pay-tabs" value={f.queue} onChange={(v) => set({ queue: v })} tabs={[{ value: 'revision', label: 'Por revisar' }, { value: 'todos', label: 'Todos los pagos' }]} />
      {f.queue === 'todos' && (
        <Toolbar>
          <select className="select select--sm" value={f.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Estado">
            <option value="">Estado: todos</option>
            {['PENDIENTE', 'EN_REVISION', 'APROBADO', 'RECHAZADO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </select>
          <select className="select select--sm" value={f.method || ''} onChange={(e) => set({ method: e.target.value })} aria-label="Método">
            <option value="">Método: todos</option>
            {['TARJETA', 'TRANSFERENCIA', 'CONTRA_ENTREGA'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </select>
          <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.from || ''} onChange={(e) => set({ from: e.target.value })} aria-label="Desde" />
          <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.to || ''} onChange={(e) => set({ to: e.target.value })} aria-label="Hasta" />
        </Toolbar>
      )}
      {f.queue === 'revision' && data?.total === 0 && <div className="mt-2"><Notice tone="ok">No hay pagos pendientes de revisión. ¡Todo al día!</Notice></div>}
      <section className="panel mt-2">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          empty={f.queue === 'revision' ? 'No hay pagos por revisar.' : 'No hay pagos con estos filtros.'}
          columns={[
            { key: 'reference', label: 'Referencia', render: (p) => <><b className="num">{p.reference}</b><div className="tiny muted">{dateTime(p.createdAt)}</div></> },
            { key: 'order', label: 'Pedido', render: (p) => <><Link to={`/admin/pedidos/${p.order.id}`} className="num strong">{p.order.code}</Link><div className="tiny muted">{p.order.customer.firstName} {p.order.customer.lastName}</div></> },
            { key: 'method', label: 'Método', render: (p) => <>{label(p.method)}{p.cardLast4 && <div className="tiny muted">{p.cardBrand} •••• {p.cardLast4}</div>}</> },
            { key: 'amount', label: 'Monto', className: 'r', render: (p) => <span className="num strong">{money(p.amount)}</span> },
            { key: 'status', label: 'Estado', render: (p) => <><Status value={p.status} />{p.responseMessage && <div className="tiny muted" style={{ maxWidth: 220 }}>{p.responseMessage}</div>}</> },
            {
              key: 'actions', label: 'Acciones', render: (p) => (
                <div className="row row--wrap" style={{ '--gap': '6px' }}>
                  {p.hasReceipt && <button className="btn btn--ghost btn--sm" onClick={() => setReceipt(p)}><Eye size={15} /> Ver</button>}
                  {reviewable(p) && <PaymentReview payment={p} order={p.order} onDone={reload} compact />}
                  {!reviewable(p) && p.reviewedAt && <span className="tiny muted">Revisado {relative(p.reviewedAt)}</span>}
                </div>
              ),
            },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

export function ShipmentsList() {
  const navigate = useNavigate();
  const [f, set] = useParamsState({ page: '1' });
  const carriers = useApi('/sales/admin/carriers');
  const { data, error, loading, reload } = useApi('/sales/admin/shipments', { ...f, pageSize: 20 });
  return (
    <>
      <PageHeader title="Envíos" description="Seguimiento manual de las entregas: transportista, guía ficticia, eventos e incidencias. Abre el pedido para registrar avances." />
      <Toolbar>
        <select className="select select--sm" value={f.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Estado del envío">
          <option value="">Estado: todos</option>
          {['PREPARANDO', 'DESPACHADO', 'EN_TRANSITO', 'INCIDENCIA', 'ENTREGADO', 'DEVUELTO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <select className="select select--sm" value={f.carrierId || ''} onChange={(e) => set({ carrierId: e.target.value })} aria-label="Transportista">
          <option value="">Transportista: todos</option>
          {(carriers.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {data && <span className="small muted">{int(data.total)} envíos</span>}
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          onRowClick={(sh) => navigate(`/admin/pedidos/${sh.order.id}`)}
          columns={[
            { key: 'order', label: 'Pedido', render: (sh) => <><b className="num">{sh.order.code}</b><div className="tiny muted">{sh.order.customer.firstName} {sh.order.customer.lastName}</div></> },
            { key: 'dest', label: 'Destino', render: (sh) => <>{sh.order.addressSnapshot?.municipality}<div className="tiny muted">{sh.order.addressSnapshot?.department}</div></> },
            { key: 'carrier', label: 'Transportista', render: (sh) => <>{sh.carrier?.name || '—'}<div className="tiny muted num">{sh.trackingNumber || 'sin guía'}</div></> },
            { key: 'status', label: 'Estado', render: (sh) => <Status value={sh.status} /> },
            { key: 'last', label: 'Último evento', render: (sh) => <span className="small">{sh.events[0]?.description || '—'}<div className="tiny muted">{relative(sh.updatedAt)}</div></span>, hideSm: true },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}
