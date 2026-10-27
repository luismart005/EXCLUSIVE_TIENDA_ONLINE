import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PackageCheck, CheckCircle2, XCircle, Search as SearchIcon, Lock, Gavel } from 'lucide-react';
import { api, newKey } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, SearchInput, Toolbar, KV } from '../../components/admin.jsx';
import { Button, ErrorState, Field, Img, Loader, Modal, Notice, Pagination, Status, Tabs } from '../../components/ui.jsx';
import { money, dateTime, date, int } from '../../lib/format.js';
import { label } from '../../lib/labels.js';
import { promptText, toast, apiError } from '../../lib/alerts.js';
import { useParamsState } from './Orders.jsx';

export function PostSaleAdminList() {
  const navigate = useNavigate();
  const [f, set] = useParamsState({ open: '1', page: '1' });
  const { data, error, loading, reload } = useApi('/sales/admin/post-sale', { ...f, open: f.open === '1' ? '1' : undefined, pageSize: 20 });
  return (
    <>
      <PageHeader title="Posventa" description="Solicitudes de cambio, devolución y reclamo. Cada paso queda registrado con su responsable y se notifica al cliente." />
      <Tabs id="ps-tabs" value={f.open === '1' ? 'abiertas' : 'todas'} onChange={(v) => set({ open: v === 'abiertas' ? '1' : '0' })} tabs={[{ value: 'abiertas', label: 'Abiertas' }, { value: 'todas', label: 'Todas' }]} />
      <Toolbar>
        <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Código de solicitud o pedido" />
        <select className="select select--sm" value={f.type || ''} onChange={(e) => set({ type: e.target.value })} aria-label="Tipo">
          <option value="">Tipo: todos</option>
          {['CAMBIO', 'DEVOLUCION', 'RECLAMO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        {f.open !== '1' && (
          <select className="select select--sm" value={f.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Estado">
            <option value="">Estado: todos</option>
            {['SOLICITADA', 'EN_REVISION', 'APROBADA', 'PRENDA_RECIBIDA', 'RESUELTA', 'RECHAZADA', 'CERRADA'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </select>
        )}
        {data && <span className="small muted">{int(data.total)} solicitudes</span>}
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          onRowClick={(ps) => navigate(`/admin/posventa/${ps.id}`)}
          empty="No hay solicitudes con estos filtros."
          columns={[
            { key: 'code', label: 'Solicitud', render: (ps) => <><b className="num">{ps.code}</b><div className="tiny muted">{dateTime(ps.createdAt)}</div></> },
            { key: 'type', label: 'Tipo', render: (ps) => <span className="chip chip--outline">{label(ps.type)}</span> },
            { key: 'order', label: 'Pedido', render: (ps) => <span className="num">{ps.order.code}</span> },
            { key: 'customer', label: 'Cliente', render: (ps) => <>{ps.customer.firstName} {ps.customer.lastName}<div className="tiny muted">{ps.customer.email}</div></>, hideSm: true },
            { key: 'reason', label: 'Motivo', render: (ps) => <span className="small">{ps.reason}</span>, hideSm: true },
            { key: 'status', label: 'Estado', render: (ps) => <Status value={ps.status} /> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}

function ReceiveModal({ ps, onClose, onDone }) {
  const [rows, setRows] = useState(() => ps.items.map((i) => ({ itemId: i.id, receivedQty: i.quantity, condition: 'BUENA', notes: '' })));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const upd = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/sales/admin/post-sale/${ps.id}/receive`, { items: rows.map((x) => ({ ...x, receivedQty: Number(x.receivedQty), notes: x.notes || undefined })), note: note || undefined });
      toast.success(r.restocked ? `Prendas revisadas. ${r.restocked} línea(s) reintegradas al inventario.` : 'Prendas revisadas. Ninguna se reintegró al inventario.');
      onDone();
      onClose();
    } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title="Recepción y revisión de prendas" wide
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}><PackageCheck size={16} /> Registrar recepción</Button></>}>
      <div className="stack">
        <Notice tone="info">Las prendas en <b>buen estado</b> se reintegran al inventario con una entrada por devolución (kardex). Las <b>dañadas</b> no vuelven a la venta. El reembolso se registra después, por separado.</Notice>
        {ps.items.map((i, idx) => (
          <div key={i.id} className="receive-row">
            <Img src={i.orderItem.imageUrl} alt="" className="thumb" />
            <div className="grow"><div className="strong">{i.orderItem.productName}</div><div className="tiny muted">{i.orderItem.sku} · {i.orderItem.colorName} · {i.orderItem.sizeName} · solicitadas {i.quantity}</div></div>
            <Field label="Recibidas">{(a) => <select className="select select--sm" value={rows[idx].receivedQty} onChange={(e) => upd(idx, { receivedQty: e.target.value })} {...a}>{Array.from({ length: i.quantity + 1 }, (_, k) => <option key={k} value={k}>{k}</option>)}</select>}</Field>
            <Field label="Estado">{(a) => <select className="select select--sm" value={rows[idx].condition} onChange={(e) => upd(idx, { condition: e.target.value })} {...a}><option value="BUENA">Buen estado (reintegrar)</option><option value="DANADA">Dañada (no reintegrar)</option></select>}</Field>
            <Field label="Observaciones" className="receive-row__notes">{(a) => <input className="input input--sm" value={rows[idx].notes} onChange={(e) => upd(idx, { notes: e.target.value })} placeholder="Etiquetas, manchas, empaque…" {...a} />}</Field>
          </div>
        ))}
        <Field label="Nota general (opcional)">{(a) => <input className="input" value={note} onChange={(e) => setNote(e.target.value)} {...a} />}</Field>
      </div>
    </Modal>
  );
}

function ResolveModal({ ps, onClose, onDone, canRefund }) {
  const refundable = Number(ps.order.amountPaid) - Number(ps.order.amountRefunded);
  const suggested = useMemo(() => {
    if (ps.type !== 'DEVOLUCION') return 0;
    const v = ps.items.reduce((a, i) => a + (Number(i.orderItem.lineTotal) / i.orderItem.quantity) * (i.receivedQty || 0), 0);
    return Math.min(refundable, Math.round(v * 100) / 100);
  }, [ps, refundable]);
  const [resolution, setResolution] = useState(ps.type === 'DEVOLUCION' ? 'Devolución aceptada tras la revisión de la prenda; se registra el reembolso.' : ps.type === 'CAMBIO' ? 'Cambio aprobado; enviamos la nueva prenda.' : '');
  const [refund, setRefund] = useState(suggested ? suggested.toFixed(2) : '0');
  const [exchange, setExchange] = useState(ps.type === 'CAMBIO' && !!ps.desired);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.post(`/sales/admin/post-sale/${ps.id}/resolve`, { resolution, refundAmount: Number(refund) || 0, performExchange: exchange }, { idempotencyKey: newKey() });
      toast.success('Solicitud resuelta y cliente notificado.');
      onDone();
      onClose();
    } catch (e) {
      setErrors(e.fields || {});
      if (!Object.keys(e.fields || {}).length) apiError(e);
    } finally { setSaving(false); }
  };
  const desiredAvail = ps.desired?.stock ? ps.desired.stock.physical - ps.desired.stock.reserved : 0;
  return (
    <Modal open onClose={onClose} title={`Resolver ${ps.code}`} wide
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}><Gavel size={16} /> Resolver solicitud</Button></>}>
      <div className="stack">
        <Field label="Resolución (la verá el cliente)" error={errors.resolution}>
          {(a) => <textarea className="textarea" value={resolution} onChange={(e) => setResolution(e.target.value)} {...a} />}
        </Field>
        {ps.type === 'CAMBIO' && ps.desired && (
          <label className={`choice ${exchange ? 'on' : ''}`}>
            <input type="checkbox" checked={exchange} onChange={(e) => setExchange(e.target.checked)} disabled={desiredAvail <= 0} />
            <div>
              <div className="choice__title">Entregar {ps.desired.product.name} · {ps.desired.color.name} · {ps.desired.size.code}</div>
              <div className="choice__desc">{desiredAvail > 0 ? `Se registrará una salida por cambio en el kardex (${desiredAvail} disponibles).` : 'Sin existencias disponibles para el cambio. Ofrece una devolución.'}</div>
            </div>
          </label>
        )}
        {canRefund ? (
          <div className="form-grid">
            <Field label="Reembolso simulado (Q)" error={errors.refundAmount} hint={`Disponible para reembolsar: ${money(refundable)}${suggested ? ` · sugerido según prendas recibidas: ${money(suggested)}` : ''}`}>
              {(a) => <input className="input num" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} {...a} />}
            </Field>
          </div>
        ) : <Notice tone="warn">Tu rol no puede registrar reembolsos; si corresponde, pídelo a un usuario con ese permiso.</Notice>}
      </div>
    </Modal>
  );
}

export function PostSaleAdminDetail() {
  const { id } = useParams();
  const s = useSession();
  const { data: ps, error, loading, reload } = useApi(`/sales/admin/post-sale/${id}`, null, { keepPrevious: true });
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  if (loading && !ps) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!ps) return null;
  const manage = s.can('postsale.manage');
  const move = async (to) => {
    const needs = to === 'RECHAZADA';
    const note = await promptText({
      title: { EN_REVISION: 'Pasar a revisión', APROBADA: 'Aprobar solicitud', RECHAZADA: 'Rechazar solicitud', CERRADA: 'Cerrar solicitud' }[to],
      text: needs ? 'Explica al cliente por qué no procede.' : 'Puedes dejar una nota para el cliente (opcional).',
      placeholder: needs ? 'Motivo del rechazo' : 'Nota (opcional)', confirmText: 'Confirmar', danger: needs, optional: !needs,
    });
    if (note === null) return;
    setBusy(to);
    try {
      await api.post(`/sales/admin/post-sale/${ps.id}/status`, { to, note: note || undefined });
      toast.success(`Solicitud ${label(to).toLowerCase()}.`);
      reload();
    } catch (e) { apiError(e); } finally { setBusy(null); }
  };
  const st = ps.status;
  return (
    <>
      <PageHeader
        back={{ to: '/admin/posventa', label: 'Posventa' }}
        title={<span className="num">{ps.code} · {label(ps.type)}</span>}
        description={`Pedido ${ps.order.code} · creada el ${dateTime(ps.createdAt)}`}
        actions={manage && (
          <>
            {st === 'SOLICITADA' && <Button className="btn btn--ghost btn--sm" loading={busy === 'EN_REVISION'} onClick={() => move('EN_REVISION')}><SearchIcon size={15} /> En revisión</Button>}
            {['SOLICITADA', 'EN_REVISION'].includes(st) && <Button className="btn btn--primary btn--sm" loading={busy === 'APROBADA'} onClick={() => move('APROBADA')}><CheckCircle2 size={15} /> Aprobar</Button>}
            {['SOLICITADA', 'EN_REVISION'].includes(st) && <Button className="btn btn--ghost btn--sm" style={{ color: 'var(--grana)' }} loading={busy === 'RECHAZADA'} onClick={() => move('RECHAZADA')}><XCircle size={15} /> Rechazar</Button>}
            {st === 'APROBADA' && ps.type !== 'RECLAMO' && <button className="btn btn--primary btn--sm" onClick={() => setModal('receive')}><PackageCheck size={15} /> Registrar recepción</button>}
            {((st === 'APROBADA' && ps.type === 'RECLAMO') || st === 'PRENDA_RECIBIDA') && <button className="btn btn--primary btn--sm" onClick={() => setModal('resolve')}><Gavel size={15} /> Resolver</button>}
            {['RESUELTA', 'RECHAZADA'].includes(st) && <Button className="btn btn--ghost btn--sm" loading={busy === 'CERRADA'} onClick={() => move('CERRADA')}><Lock size={15} /> Cerrar</Button>}
          </>
        )}
      />
      <div className="tracks mb-3">
        <div className="track"><small>Estado</small><Status value={ps.status} /></div>
        <div className="track"><small>Pedido {ps.order.code}</small><Status value={ps.order.paymentStatus} /><span className="tiny muted">Pagado {money(ps.order.amountPaid)} · reembolsado {money(ps.order.amountRefunded)}</span></div>
        <div className="track"><small>Entregado</small><b>{date(ps.order.deliveredAt)}</b></div>
      </div>
      <div className="adm-detail">
        <div className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2>{ps.reason}</h2></div>
            <div className="panel__body stack">
              <p style={{ margin: 0 }}>{ps.description}</p>
              {ps.desired && <Notice tone="info">El cliente quiere recibir: <b>{ps.desired.product.name} · {ps.desired.color.name} · talla {ps.desired.size.code}</b> ({ps.desired.stock ? ps.desired.stock.physical - ps.desired.stock.reserved : 0} disponibles).</Notice>}
              {ps.resolution && <Notice tone="ok"><b>Resolución:</b> {ps.resolution}</Notice>}
              {ps.type === 'RECLAMO' && <p className="tiny muted" style={{ margin: 0 }}>Recordatorio: este formulario interno no sustituye los medios autorizados por la DIACO.</p>}
            </div>
          </section>
          {ps.items.length > 0 && (
            <section className="panel">
              <div className="panel__head"><h2>Prendas</h2></div>
              <div className="table-wrap">
                <table className="table table--stack">
                  <thead><tr><th>Prenda</th><th className="r">Solicitadas</th><th className="r">Recibidas</th><th>Revisión</th><th>Inventario</th></tr></thead>
                  <tbody>
                    {ps.items.map((i) => (
                      <tr key={i.id}>
                        <td data-label="Prenda"><div className="row" style={{ '--gap': '10px' }}><Img src={i.orderItem.imageUrl} alt="" className="thumb" /><div><div className="strong">{i.orderItem.productName}</div><div className="tiny muted">{i.orderItem.sku} · {i.orderItem.colorName} · {i.orderItem.sizeName} · {money(i.orderItem.unitPrice)}</div></div></div></td>
                        <td data-label="Solicitadas" className="r num">{i.quantity}</td>
                        <td data-label="Recibidas" className="r num">{i.inspectedAt ? i.receivedQty : '—'}</td>
                        <td data-label="Revisión">{i.condition ? <Status value={i.condition} /> : <span className="tiny muted">Pendiente</span>}{i.notes && <div className="tiny muted">{i.notes}</div>}</td>
                        <td data-label="Inventario">{i.restocked ? <span className="chip chip--ok">Reintegrada</span> : i.inspectedAt ? <span className="chip chip--neutral">No reintegrada</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel__head"><h2>Historial</h2></div>
            <div className="panel__body">
              <ol className="timeline">
                {ps.history.slice().reverse().map((h) => (
                  <li key={h.id}><span className="timeline__dot k-POSVENTA" /><div><div className="timeline__title">{h.fromStatus ? `${label(h.fromStatus)} → ` : ''}{label(h.toStatus)}</div><div className="timeline__meta">{dateTime(h.createdAt)} · {h.userEmail || 'Sistema'}{h.note ? ` · ${h.note}` : ''}</div></div></li>
                ))}
              </ol>
            </div>
          </section>
        </div>
        <aside className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2>Cliente</h2></div>
            <div className="panel__body"><KV items={[['Nombre', `${ps.customer.firstName} ${ps.customer.lastName}`], ['Correo', ps.customer.email], ['Teléfono', ps.customer.phone], ['Pedido', <Link key="o" to={`/admin/pedidos/${ps.order.id}`}>{ps.order.code}</Link>], ['Método de pago', label(ps.order.paymentMethod)]]} /></div>
          </section>
          <section className="panel">
            <div className="panel__head"><h2>Reembolsos</h2></div>
            <div className="panel__body stack" style={{ '--gap': '8px' }}>
              {ps.refunds.length === 0 ? <span className="small muted">Sin reembolsos registrados.</span> : ps.refunds.map((r) => <div key={r.id} className="row row--between small"><span className="num">{r.reference}</span><b className="num">{money(r.amount)}</b></div>)}
              <span className="tiny muted">Los reembolsos son simulados y nunca superan lo pagado.</span>
            </div>
          </section>
        </aside>
      </div>
      {modal === 'receive' && <ReceiveModal ps={ps} onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'resolve' && <ResolveModal ps={ps} onClose={() => setModal(null)} onDone={reload} canRefund={s.can('refunds.create')} />}
    </>
  );
}
