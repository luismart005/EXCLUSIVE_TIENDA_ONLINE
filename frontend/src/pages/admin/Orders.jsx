import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  PackageOpen, Truck, Navigation, CheckCircle2, XCircle, AlertTriangle, Undo2, FileText, Check, X, Eye, MapPin, User, Lock, History, ChevronDown,
} from 'lucide-react';
import { api, fetchBlobUrl, openProtected, newKey } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, SearchInput, ExportButton, Toolbar, KV, AuditDiff } from '../../components/admin.jsx';
import { Button, ErrorState, Field, Img, Loader, Modal, Notice, Pagination, Status, Tabs } from '../../components/ui.jsx';
import { money, dateTime, int, relative } from '../../lib/format.js';
import { label, actionLabel } from '../../lib/labels.js';
import { confirm, promptText, toast, apiError } from '../../lib/alerts.js';

const QUEUES = [
  { value: '', label: 'Todos' },
  { value: 'pago-pendiente', label: 'Pago pendiente' },
  { value: 'por-preparar', label: 'Por preparar' },
  { value: 'por-despachar', label: 'Por despachar' },
  { value: 'en-ruta', label: 'En ruta' },
];

export function useParamsState(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => {
    const o = { ...defaults };
    for (const [k, v] of params.entries()) o[k] = v;
    return o;
  }, [params]);
  const set = (patch, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  return [values, set];
}

export function OrdersList() {
  const s = useSession();
  const navigate = useNavigate();
  const [f, set] = useParamsState({ page: '1' });
  const query = { ...f, pageSize: 20 };
  const { data, error, loading, reload } = useApi('/sales/admin/orders', query);
  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Cada pedido tiene estados separados de pedido, pago y envío. Haz clic en un pedido para ver su trazabilidad completa."
        actions={s.can('reports.export') && <ExportButton path="/sales/admin/orders/export" query={f} filename="pedidos.csv" />}
      />
      <Tabs id="order-queue" tabs={QUEUES} value={f.queue || ''} onChange={(v) => set({ queue: v })} />
      <Toolbar>
        <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Código, cliente, correo o guía" />
        <select className="select select--sm" value={f.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Estado del pedido">
          <option value="">Pedido: todos</option>
          {['PENDIENTE_PAGO', 'CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <select className="select select--sm" value={f.paymentStatus || ''} onChange={(e) => set({ paymentStatus: e.target.value })} aria-label="Estado del pago">
          <option value="">Pago: todos</option>
          {['PENDIENTE', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'REEMBOLSO_PARCIAL', 'REEMBOLSADO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <select className="select select--sm" value={f.shippingStatus || ''} onChange={(e) => set({ shippingStatus: e.target.value })} aria-label="Estado del envío">
          <option value="">Envío: todos</option>
          {['PENDIENTE', 'PREPARANDO', 'DESPACHADO', 'EN_TRANSITO', 'INCIDENCIA', 'ENTREGADO', 'DEVUELTO'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <select className="select select--sm" value={f.method || ''} onChange={(e) => set({ method: e.target.value })} aria-label="Método de pago">
          <option value="">Método: todos</option>
          {['TARJETA', 'TRANSFERENCIA', 'CONTRA_ENTREGA'].map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </select>
        <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.from || ''} onChange={(e) => set({ from: e.target.value })} aria-label="Desde" />
        <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.to || ''} onChange={(e) => set({ to: e.target.value })} aria-label="Hasta" />
      </Toolbar>
      <section className="panel">
        <div className="panel__head">
          <span className="small muted">{data ? `${int(data.total)} pedidos · suma ${money(data.sumTotal)}` : 'Buscando…'}</span>
        </div>
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          onRowClick={(o) => navigate(`/admin/pedidos/${o.id}`)}
          columns={[
            { key: 'code', label: 'Pedido', render: (o) => <><b className="num nowrap">{o.code}</b><div className="tiny muted nowrap">{dateTime(o.createdAt)}</div></> },
            { key: 'customer', label: 'Cliente', render: (o) => <><span>{o.customer.firstName} {o.customer.lastName}</span><div className="tiny muted">{o.department}</div></> },
            { key: 'units', label: 'Unid.', className: 'r', render: (o) => <span className="num">{o.units}</span>, hideSm: true },
            { key: 'method', label: 'Método', render: (o) => label(o.paymentMethod), hideSm: true },
            { key: 'status', label: 'Pedido', render: (o) => <Status value={o.status} /> },
            { key: 'paymentStatus', label: 'Pago', render: (o) => <Status value={o.paymentStatus} /> },
            { key: 'shippingStatus', label: 'Envío', render: (o) => <Status value={o.shippingStatus} /> },
            { key: 'total', label: 'Total', className: 'r', render: (o) => <span className="num strong">{money(o.total)}</span> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}

function DispatchModal({ open, onClose, order, onDone }) {
  const carriers = useApi('/sales/admin/carriers', null, { enabled: open });
  const [carrierId, setCarrierId] = useState('');
  const [tracking, setTracking] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async () => {
    if (!carrierId) return setErr('Selecciona el transportista.');
    setSaving(true);
    try {
      const r = await api.post(`/sales/admin/orders/${order.id}/dispatch`, { carrierId: Number(carrierId), trackingNumber: tracking || undefined });
      toast.success(`Pedido despachado. Guía ${r.trackingNumber}. Se registró la salida de inventario.`);
      onDone();
      onClose();
    } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Despachar ${order.code}`}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}><Truck size={16} /> Registrar despacho</Button></>}>
      <div className="stack">
        <Notice tone="info">Al despachar se descuenta la existencia física y se consume la reserva del pedido una sola vez (regla 3). La guía es ficticia.</Notice>
        <Field label="Transportista" error={err}>
          {(a) => <select className="select" value={carrierId} onChange={(e) => { setCarrierId(e.target.value); setErr(null); }} {...a}><option value="">Selecciona…</option>{(carriers.data || []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        </Field>
        <Field label="Número de guía (opcional)" hint="Si lo dejas vacío se genera una guía de demostración.">
          {(a) => <input className="input" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={40} {...a} />}
        </Field>
      </div>
    </Modal>
  );
}

function RefundModal({ open, onClose, order, max, onDone }) {
  const [amount, setAmount] = useState(max);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [key] = useState(newKey);
  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const r = await api.post(`/sales/admin/orders/${order.id}/refunds`, { amount, reason }, { idempotencyKey: key });
      toast.success(`Reembolso ${r.reference} registrado (simulado).`);
      onDone();
      onClose();
    } catch (e) {
      setErrors(e.fields || {});
      if (!Object.keys(e.fields || {}).length) apiError(e);
    } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Reembolso del pedido ${order.code}`}
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--danger" loading={saving} onClick={submit}><Undo2 size={16} /> Registrar reembolso</Button></>}>
      <div className="form-grid">
        <Field label="Monto (Q)" error={errors.amount} hint={`Máximo reembolsable: ${money(max)} (lo pagado menos lo ya reembolsado).`}>
          {(a) => <input className="input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} {...a} />}
        </Field>
        <div />
        <Field label="Motivo" error={errors.reason} className="span-2">
          {(a) => <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: cobro duplicado, compensación por demora…" {...a} />}
        </Field>
        <p className="tiny muted span-2" style={{ margin: 0 }}>Simulación: no se mueve dinero real. El total reembolsado nunca puede superar lo pagado (regla 13).</p>
      </div>
    </Modal>
  );
}

export function ReceiptModal({ payment, onClose }) {
  const [file, setFile] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!payment) return undefined;
    let url = null;
    fetchBlobUrl(`/sales/payments/${payment.id}/receipt`).then((f) => { url = f.url; setFile(f); }).catch(setErr);
    return () => { if (url) URL.revokeObjectURL(url); setFile(null); setErr(null); };
  }, [payment]);
  return (
    <Modal open={!!payment} onClose={onClose} title={`Comprobante ${payment?.reference || ''}`} wide>
      {err ? <Notice tone="bad">{err.message}</Notice> : !file ? <Loader inline /> : file.type === 'application/pdf'
        ? <iframe title="Comprobante PDF" src={file.url} style={{ width: '100%', height: '70vh', border: 0 }} />
        : <img src={file.url} alt="Comprobante de transferencia" style={{ maxHeight: '70vh', margin: '0 auto', borderRadius: 8 }} />}
      <p className="tiny muted mt-2" style={{ marginBottom: 0 }}><Lock size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Archivo privado: solo el cliente y el personal autorizado pueden verlo.</p>
    </Modal>
  );
}

export function PaymentReview({ payment, order, onDone, compact = false }) {
  const [busy, setBusy] = useState(false);
  const review = async (decision) => {
    let note;
    if (decision === 'RECHAZAR') {
      note = await promptText({ title: 'Rechazar el pago', text: 'El cliente verá este motivo y tendrá 48 horas para enviar un comprobante válido.', placeholder: 'Ej.: el monto no coincide con el total del pedido', confirmText: 'Rechazar pago', danger: true });
      if (note === null) return;
    } else {
      if (!(await confirm({ title: `¿Aprobar el pago de ${money(payment.amount)}?`, text: `Pedido ${order.code}. Se confirmará el pedido, se emitirá el comprobante simulado y la reserva dejará de vencer.`, confirmText: 'Aprobar pago' }))) return;
    }
    setBusy(true);
    try {
      await api.post(`/sales/admin/payments/${payment.id}/review`, { decision, note });
      toast.success(decision === 'APROBAR' ? 'Pago aprobado y pedido confirmado.' : 'Pago rechazado; se notificó al cliente.');
      onDone();
    } catch (e) { apiError(e); } finally { setBusy(false); }
  };
  return (
    <div className="row" style={{ '--gap': '6px' }}>
      <Button className={`btn btn--primary ${compact ? 'btn--sm' : 'btn--sm'}`} loading={busy} onClick={() => review('APROBAR')}><Check size={15} /> Aprobar</Button>
      <Button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => review('RECHAZAR')}><X size={15} /> Rechazar</Button>
    </div>
  );
}

function AuditTrail({ audits }) {
  const [open, setOpen] = useState(null);
  if (!audits?.length) return <p className="small muted">Sin eventos de auditoría.</p>;
  return (
    <div className="audit-list">
      {audits.map((a) => (
        <div key={a.id} className="audit-item">
          <button className="audit-item__row" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
            <span className="grow"><b>{actionLabel(a.action)}</b><span className="tiny muted"> · {a.service}</span><span className="tiny muted" style={{ display: 'block' }}>{dateTime(a.createdAt)} · {a.userEmail || 'Sistema'}{a.ip ? ` · IP ${a.ip}` : ''}</span></span>
            <ChevronDown size={16} style={{ transform: open === a.id ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {open === a.id && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="audit-item__body"><AuditDiff before={a.before} after={a.after} />{a.requestId && <span className="tiny faint">Solicitud {a.requestId}</span>}</motion.div>}
        </div>
      ))}
    </div>
  );
}

export function OrderAdminDetail() {
  const { id } = useParams();
  const s = useSession();
  const { data: o, error, loading, reload } = useApi(`/sales/admin/orders/${id}`, null, { keepPrevious: true });
  const [dispatch, setDispatch] = useState(false);
  const [refund, setRefund] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState('historial');

  if (loading && !o) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!o) return null;
  const a = o.actions;

  const run = async (key, fn, msg) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast.success(msg);
      reload();
    } catch (e) { apiError(e); } finally { setBusy(null); }
  };
  const prepare = () => run('prepare', () => api.post(`/sales/admin/orders/${o.id}/prepare`, {}), 'Pedido en preparación.');
  const transit = async () => {
    const loc = await promptText({ title: 'Registrar avance del envío', text: 'Ubicación o descripción del avance (seguimiento manual).', placeholder: 'Ej.: En centro de distribución de Quetzaltenango', confirmText: 'Registrar', min: 3 });
    if (loc === null) return;
    run('transit', () => api.post(`/sales/admin/orders/${o.id}/transit`, { location: loc.slice(0, 120), description: 'En ruta hacia el destino' }), 'Avance registrado.');
  };
  const incident = async () => {
    const d = await promptText({ title: 'Registrar incidencia de entrega', text: 'Se notificará al cliente.', placeholder: 'Ej.: Nadie recibió en la dirección; se reprograma la visita', confirmText: 'Registrar incidencia', danger: true });
    if (d === null) return;
    run('incident', () => api.post(`/sales/admin/orders/${o.id}/incident`, { description: d }), 'Incidencia registrada.');
  };
  const deliver = async () => {
    const who = await promptText({ title: 'Confirmar entrega', text: o.paymentMethod === 'CONTRA_ENTREGA' && o.paymentStatus === 'PENDIENTE' ? `Se registrará también el cobro contra entrega de ${money(o.total)} (simulado).` : 'Indica quién recibió el pedido.', placeholder: 'Nombre de quien recibió', confirmText: 'Confirmar entrega', min: 3 });
    if (who === null) return;
    run('deliver', () => api.post(`/sales/admin/orders/${o.id}/deliver`, { receivedBy: who }), 'Entrega registrada.');
  };
  const cancel = async () => {
    const reason = await promptText({ title: `¿Cancelar el pedido ${o.code}?`, text: 'Se liberarán las existencias reservadas, se revertirá el cupón y, si hubo pago, se registrará el reembolso simulado.', placeholder: 'Motivo de la cancelación', confirmText: 'Cancelar pedido', danger: true });
    if (reason === null) return;
    run('cancel', () => api.post(`/sales/admin/orders/${o.id}/cancel`, { reason }), 'Pedido cancelado y existencias liberadas.');
  };

  const shippingNet = Number(o.shippingCost) - Number(o.shippingDiscount);
  const reviewable = (p) => ['EN_REVISION', 'PENDIENTE'].includes(p.status) && p.method !== 'CONTRA_ENTREGA' && o.status === 'PENDIENTE_PAGO' && s.can('payments.review');

  return (
    <>
      <PageHeader
        back={{ to: '/admin/pedidos', label: 'Pedidos' }}
        title={<span className="num">Pedido {o.code}</span>}
        description={`Creado el ${dateTime(o.createdAt)} · ${label(o.paymentMethod)} · ${o.customerStats.previousOrders} pedidos anteriores del cliente`}
        actions={(
          <>
            {o.documents?.filter((d) => !d.voided).map((d) => <button key={d.id} className="btn btn--ghost btn--sm" onClick={() => openProtected(`/sales/documents/${d.number}/pdf`).catch(apiError)}><FileText size={15} /> {d.number}</button>)}
            {a.canPrepare && s.can('orders.manage', 'shipping.manage') && <Button className="btn btn--primary btn--sm" loading={busy === 'prepare'} onClick={prepare}><PackageOpen size={15} /> Pasar a preparación</Button>}
            {a.canDispatch && s.can('shipping.manage') && <button className="btn btn--primary btn--sm" onClick={() => setDispatch(true)}><Truck size={15} /> Despachar</button>}
            {a.canTransit && s.can('shipping.manage') && <Button className="btn btn--ghost btn--sm" loading={busy === 'transit'} onClick={transit}><Navigation size={15} /> Registrar avance</Button>}
            {a.canDeliver && s.can('shipping.manage') && <Button className="btn btn--primary btn--sm" loading={busy === 'deliver'} onClick={deliver}><CheckCircle2 size={15} /> Confirmar entrega</Button>}
            {a.canIncident && s.can('shipping.manage') && <Button className="btn btn--ghost btn--sm" loading={busy === 'incident'} onClick={incident}><AlertTriangle size={15} /> Incidencia</Button>}
            {Number(a.refundable) > 0 && s.can('refunds.create') && <button className="btn btn--ghost btn--sm" onClick={() => setRefund(true)}><Undo2 size={15} /> Reembolso</button>}
            {a.canCancel && s.can('orders.manage') && <Button className="btn btn--ghost btn--sm" style={{ color: 'var(--grana)' }} loading={busy === 'cancel'} onClick={cancel}><XCircle size={15} /> Cancelar</Button>}
          </>
        )}
      />

      {a.dispatchBlock && <div className="mb-2"><Notice tone="warn">{a.dispatchBlock}</Notice></div>}
      {o.status === 'CANCELADO' && <div className="mb-2"><Notice tone="bad"><b>Cancelado</b> el {dateTime(o.cancelledAt)}: {o.cancelReason}</Notice></div>}

      <div className="tracks mb-3">
        <div className="track"><small>Pedido</small><Status value={o.status} /></div>
        <div className="track"><small>Pago · {label(o.paymentMethod)}</small><Status value={o.paymentStatus} /><span className="tiny muted">Pagado {money(o.amountPaid)} · reembolsado {money(o.amountRefunded)}</span></div>
        <div className="track"><small>Envío</small><Status value={o.shippingStatus} /><span className="tiny muted">{o.shipment?.trackingNumber ? `${o.shipment.carrier?.name} · ${o.shipment.trackingNumber}` : o.reservationExpiresAt ? `Reserva vence ${relative(o.reservationExpiresAt)}` : 'Sin despacho'}</span></div>
      </div>

      <div className="adm-detail">
        <div className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2>Productos ({o.items.reduce((x, i) => x + i.quantity, 0)} u.)</h2><span className="tiny muted">Copia de precios y descuentos al comprar (RF-12)</span></div>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead><tr><th>Producto</th><th>SKU</th><th className="r">Cant.</th><th className="r">Precio</th><th className="r">Desc.</th><th className="r">Total</th></tr></thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Producto"><div className="row" style={{ '--gap': '10px' }}><Img src={i.imageUrl} alt="" className="thumb" /><div><Link to={`/admin/productos/${i.productId}`} className="strong">{i.productName}</Link><div className="tiny muted">{i.colorName} · {i.sizeName}{i.promotionName ? ` · ${i.promotionName}` : ''}</div></div></div></td>
                      <td data-label="SKU" className="tiny nowrap">{i.sku}</td>
                      <td data-label="Cant." className="r num">{i.quantity}</td>
                      <td data-label="Precio" className="r num">{money(i.unitPrice)}</td>
                      <td data-label="Desc." className="r num">{Number(i.discountAmount) > 0 ? `− ${money(i.discountAmount)}` : '—'}</td>
                      <td data-label="Total" className="r num strong">{money(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel__foot" style={{ display: 'block' }}>
              <div className="totals" style={{ maxWidth: 360, marginLeft: 'auto' }}>
                <div><span className="muted">Subtotal</span><span className="num">{money(o.subtotal)}</span></div>
                {Number(o.discountTotal) > 0 && <div className="discount"><span>Descuentos{o.couponCode ? ` · cupón ${o.couponCode}` : ''}</span><span className="num">− {money(o.discountTotal)}</span></div>}
                <div><span className="muted">Envío ({o.shippingZone?.department})</span><span className="num">{shippingNet > 0 ? money(shippingNet) : `Gratis${Number(o.shippingCost) > 0 ? ` (tarifa ${money(o.shippingCost)})` : ''}`}</span></div>
                <div className="grand"><span>Total</span><span className="num">{money(o.total)}</span></div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head"><h2>Pagos</h2><span className="tiny muted">Un comprobante no confirma el pago por sí solo (regla 5)</span></div>
            <div className="panel__body stack" style={{ '--gap': '12px' }}>
              {o.payments.length === 0 && <p className="small muted" style={{ margin: 0 }}>{o.paymentMethod === 'CONTRA_ENTREGA' ? 'El cobro se registra al confirmar la entrega.' : 'El cliente aún no ha intentado pagar.'}</p>}
              {o.payments.map((p) => (
                <div key={p.id} className="pay-row">
                  <div className="grow">
                    <div className="row row--wrap" style={{ '--gap': '8px' }}><b className="num">{p.reference}</b><Status value={p.status} /><span className="tiny muted">{label(p.method)}{p.cardLast4 ? ` · ${p.cardBrand} •••• ${p.cardLast4}` : ''}</span></div>
                    <div className="tiny muted">{money(p.amount)} · {dateTime(p.createdAt)}{p.responseMessage ? ` · ${p.responseMessage}` : ''}</div>
                    {p.reviewNote && <div className="tiny">Revisión: {p.reviewNote}{p.reviewedAt ? ` (${dateTime(p.reviewedAt)})` : ''}</div>}
                  </div>
                  {p.hasReceipt && <button className="btn btn--ghost btn--sm" onClick={() => setReceipt(p)}><Eye size={15} /> Comprobante</button>}
                  {reviewable(p) && <PaymentReview payment={p} order={o} onDone={reload} />}
                </div>
              ))}
              {o.refunds.map((r) => <Notice key={r.id} tone="ok">Reembolso {r.reference}: <b className="num">{money(r.amount)}</b> · {r.reason} · {dateTime(r.createdAt)}</Notice>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head"><h2 className="row"><History size={18} /> Trazabilidad</h2></div>
            <div style={{ padding: '0 20px' }}>
              <Tabs id="order-trace" value={tab} onChange={setTab} tabs={[
                { value: 'historial', label: 'Estados', count: o.history.length },
                { value: 'envio', label: 'Entrega', count: o.shipment?.events?.length || 0 },
                { value: 'reservas', label: 'Reservas', count: o.reservations.length },
                { value: 'auditoria', label: 'Auditoría', count: o.audits.length },
              ]} />
            </div>
            <div className="panel__body">
              {tab === 'historial' && (
                <ol className="timeline">
                  {o.history.slice().reverse().map((h) => (
                    <li key={h.id}><span className={`timeline__dot k-${h.kind}`} /><div><div className="timeline__title">{({ PEDIDO: 'Pedido', PAGO: 'Pago', ENVIO: 'Envío' })[h.kind]}: {h.fromStatus ? `${label(h.fromStatus)} → ` : ''}{label(h.toStatus)}</div><div className="timeline__meta">{dateTime(h.createdAt)} · {h.userEmail || 'Sistema'}{h.note ? ` · ${h.note}` : ''}</div></div></li>
                  ))}
                </ol>
              )}
              {tab === 'envio' && (o.shipment?.events?.length ? (
                <ol className="timeline">
                  {o.shipment.events.slice().reverse().map((e) => <li key={e.id}><span className={`timeline__dot ${e.isIncident ? 'k-INC' : 'k-ENVIO'}`} /><div><div className="timeline__title">{label(e.status)}: {e.description}</div><div className="timeline__meta">{dateTime(e.createdAt)}{e.location ? ` · ${e.location}` : ''}</div></div></li>)}
                </ol>
              ) : <p className="small muted">Aún no hay eventos de entrega.</p>)}
              {tab === 'reservas' && (o.reservations.length ? (
                <table className="table">
                  <thead><tr><th>Variante</th><th className="r">Cant.</th><th>Estado</th><th>Vence</th><th>Motivo de liberación</th></tr></thead>
                  <tbody>{o.reservations.map((r) => <tr key={r.id}><td><Link to={`/admin/kardex?variantId=${r.variantId}`}>{o.items.find((i) => i.variantId === r.variantId)?.sku || `#${r.variantId}`}</Link></td><td className="r num">{r.quantity}</td><td><Status value={r.status} tone={r.status === 'CONSUMIDA' ? 'ok' : r.status === 'LIBERADA' ? 'neutral' : 'info'} text={({ ACTIVA: 'Activa', CONFIRMADA: 'Confirmada', LIBERADA: 'Liberada', CONSUMIDA: 'Despachada' })[r.status]} /></td><td className="small">{r.expiresAt ? dateTime(r.expiresAt) : '—'}</td><td className="small muted">{r.releaseReason || '—'}</td></tr>)}</tbody>
                </table>
              ) : <p className="small muted">El pedido no tiene reservas registradas.</p>)}
              {tab === 'auditoria' && <AuditTrail audits={o.audits.slice().reverse()} />}
            </div>
          </section>
        </div>

        <aside className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2 className="row"><User size={17} /> Cliente</h2></div>
            <div className="panel__body">
              <KV items={[
                ['Nombre', `${o.customer.firstName} ${o.customer.lastName}`],
                ['Correo', o.customer.email],
                ['Teléfono', o.customer.phone],
                s.can('users.read') && ['Ficha', <Link key="u" to={`/admin/usuarios/${o.customer.id}`}>Ver cliente</Link>],
              ]} />
            </div>
          </section>
          <section className="panel">
            <div className="panel__head"><h2 className="row"><MapPin size={17} /> Entrega</h2></div>
            <div className="panel__body stack" style={{ '--gap': '4px' }}>
              <span className="strong">{o.addressSnapshot.recipientName} · {o.addressSnapshot.phone}</span>
              <span className="small muted">{o.addressSnapshot.line1}, {o.addressSnapshot.municipality}, {o.addressSnapshot.department}</span>
              {o.addressSnapshot.reference && <span className="small muted">{o.addressSnapshot.reference}</span>}
              {o.customerNote && <Notice tone="info">Nota del cliente: {o.customerNote}</Notice>}
              <span className="tiny muted mt-1">Tiempo estimado: {o.shippingZone?.estimatedDays}</span>
              {o.shipment?.receivedBy && <span className="small">Recibió: <b>{o.shipment.receivedBy}</b> · {dateTime(o.shipment.deliveredAt)}</span>}
            </div>
          </section>
          <section className="panel">
            <div className="panel__head"><h2>Condiciones de la compra</h2></div>
            <div className="panel__body">
              <KV items={[
                ['Términos aceptados', `Versión ${o.termsVersion}`],
                ['Cupón', o.redemption ? `${o.redemption.coupon.code} (${money(o.redemption.amount)})${o.redemption.reversedAt ? ' · revertido' : ''}` : '—'],
                ['Promociones', (o.pricingSnapshot?.appliedPromotions || []).map((x) => x.name).join(', ') || '—'],
                ['Simulación', o.isSimulation ? 'Sí — sin cobro real' : 'No'],
                ['Clave de idempotencia', <span key="k" className="tiny truncate" style={{ display: 'block', maxWidth: 180 }}>{o.idempotencyKey}</span>],
              ]} />
            </div>
          </section>
          {o.postSales.length > 0 && (
            <section className="panel">
              <div className="panel__head"><h2>Posventa</h2></div>
              <div className="panel__body stack" style={{ '--gap': '8px' }}>
                {o.postSales.map((ps) => <Link key={ps.id} to={`/admin/posventa/${ps.id}`} className="row row--between small"><span><b className="num">{ps.code}</b> · {label(ps.type)}</span><Status value={ps.status} /></Link>)}
              </div>
            </section>
          )}
        </aside>
      </div>

      {dispatch && <DispatchModal open={dispatch} onClose={() => setDispatch(false)} order={o} onDone={reload} />}
      {refund && <RefundModal open={refund} onClose={() => setRefund(false)} order={o} max={a.refundable} onDone={reload} />}
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

export { AuditTrail };
