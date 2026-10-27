import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Check, CreditCard, FileText, Landmark, MapPin, Package, Receipt, RefreshCcw, Truck, Upload, XCircle, Clock3, MessageSquareWarning,
  ShieldCheck, Banknote, ImageUp,
} from 'lucide-react';
import { api, newKey, openProtected } from '../../api/client.js';
import { useApi } from '../../lib/useApi.js';
import { Button, ErrorState, Field, Img, Loader, Modal, Notice, Status } from '../../components/ui.jsx';
import { money, dateTime, date, relative } from '../../lib/format.js';
import { label } from '../../lib/labels.js';
import { promptText, success, failure, toast, apiError } from '../../lib/alerts.js';

const KIND_LABEL = { PEDIDO: 'Pedido', PAGO: 'Pago', ENVIO: 'Envío' };

function Countdown({ until, onExpire }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const v = new Date(until).getTime() - Date.now();
      setLeft(v);
      if (v <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [until, onExpire]);
  if (left <= 0) return <b>vencida</b>;
  const h = Math.floor(left / 3600e3);
  const m = Math.floor((left % 3600e3) / 60e3);
  const s = Math.floor((left % 60e3) / 1000);
  return <b className="num">{h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m}:${String(s).padStart(2, '0')}`}</b>;
}

function ProgressSteps({ order }) {
  const steps = [
    { key: 'creado', label: 'Pedido recibido', done: true },
    { key: 'pago', label: order.paymentMethod === 'CONTRA_ENTREGA' ? 'Confirmado' : 'Pago confirmado', done: ['CONFIRMADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'].includes(order.status) },
    { key: 'envio', label: 'En camino', done: ['ENVIADO', 'ENTREGADO'].includes(order.status) },
    { key: 'entrega', label: 'Entregado', done: order.status === 'ENTREGADO' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="progress-steps" aria-label="Avance del pedido">
      {steps.map((s, i) => (
        <div key={s.key} className={`progress-steps__item ${s.done ? 'done' : ''} ${i === current ? 'current' : ''}`}>
          <span className="progress-steps__dot">{s.done && <Check size={14} />}</span>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

const fmtCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');

function CardPayment({ order, testCards, onDone }) {
  const [form, setForm] = useState({ cardNumber: '', holder: '', exp: '', cvv: '' });
  const [errors, setErrors] = useState({});
  const [paying, setPaying] = useState(false);
  const [flip, setFlip] = useState(false);
  const key = useRef(newKey());
  const set = (k) => (e) => {
    let v = e.target.value;
    if (k === 'cardNumber') v = fmtCard(v);
    if (k === 'exp') v = v.replace(/\D/g, '').slice(0, 4).replace(/^(\d{2})(\d)/, '$1/$2');
    if (k === 'cvv') v = v.replace(/\D/g, '').slice(0, 4);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.cardNumber.replace(/\D/g, '').length < 13) errs.cardNumber = 'Escribe el número completo de la tarjeta.';
    if (form.holder.trim().length < 3) errs.holder = 'Escribe el nombre como aparece en la tarjeta.';
    const [mm, yy] = form.exp.split('/');
    if (!mm || !yy || Number(mm) < 1 || Number(mm) > 12) errs.exp = 'Usa el formato MM/AA.';
    if (!/^\d{3,4}$/.test(form.cvv)) errs.cvv = 'De 3 o 4 dígitos.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPaying(true);
    try {
      const r = await api.post(`/sales/orders/${order.code}/payments/card`, {
        cardNumber: form.cardNumber, holder: form.holder, expMonth: Number(mm), expYear: 2000 + Number(yy), cvv: form.cvv,
      }, { idempotencyKey: key.current });
      key.current = newKey();
      if (r.payment.status === 'APROBADO') await success('Pago aprobado', `Referencia ${r.payment.reference} (simulado). Ya estamos preparando tu pedido.`);
      else if (r.payment.status === 'RECHAZADO') await failure('Pago rechazado', `${r.payment.message}. Puedes intentar con otra tarjeta mientras tu reserva esté vigente.`);
      else await success('Pago en verificación', 'El procesador dejó el pago pendiente. Te avisaremos cuando se confirme; tus prendas siguen reservadas.');
      onDone();
    } catch (err) {
      key.current = newKey();
      const f = err.fields || {};
      setErrors({ cardNumber: f.cardNumber, exp: f.exp || f.expMonth || f.expYear, cvv: f.cvv, holder: f.holder });
      if (!Object.keys(f).length) apiError(err);
    } finally {
      setPaying(false);
    }
  };
  const digits = form.cardNumber.replace(/\D/g, '');
  const brand = /^4/.test(digits) ? 'VISA' : /^5[1-5]/.test(digits) ? 'MASTERCARD' : /^3[47]/.test(digits) ? 'AMEX' : '';
  return (
    <div className="pay-grid">
      <div className="stack" style={{ '--gap': '14px' }}>
        <motion.div className="card-preview" animate={{ rotateY: flip ? 180 : 0 }} transition={{ duration: 0.5 }} style={{ transformStyle: 'preserve-3d' }} aria-hidden="true">
          <div style={{ backfaceVisibility: 'hidden', display: 'grid', alignContent: 'space-between', height: '100%' }}>
            <div className="row row--between"><span className="card-preview__chip" /><b style={{ letterSpacing: '.08em' }}>{brand}</b></div>
            <div className="card-preview__num">{(form.cardNumber || '•••• •••• •••• ••••').padEnd(19, '•')}</div>
            <div className="card-preview__row"><span>{form.holder || 'Nombre del titular'}</span><span>{form.exp || 'MM/AA'}</span></div>
          </div>
        </motion.div>
        <div className="test-cards">
          <span className="tiny muted">Tarjetas de prueba (toca una para usarla):</span>
          {testCards.map((c) => (
            <button key={c.number} type="button" onClick={() => setForm({ cardNumber: c.number, holder: form.holder || 'Cliente Demo', exp: '12/29', cvv: '123' })}>
              <span className="num">{c.number}</span><span className="muted">{c.result}</span>
            </button>
          ))}
        </div>
      </div>
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field label="Número de tarjeta" error={errors.cardNumber} className="span-2">
          {(a) => <input className="input num" inputMode="numeric" autoComplete="off" placeholder="0000 0000 0000 0000" value={form.cardNumber} onChange={set('cardNumber')} {...a} />}
        </Field>
        <Field label="Titular" error={errors.holder} className="span-2">
          {(a) => <input className="input" autoComplete="off" value={form.holder} onChange={set('holder')} {...a} />}
        </Field>
        <Field label="Vence (MM/AA)" error={errors.exp}>
          {(a) => <input className="input num" inputMode="numeric" placeholder="MM/AA" value={form.exp} onChange={set('exp')} {...a} />}
        </Field>
        <Field label="CVV" error={errors.cvv}>
          {(a) => <input className="input num" inputMode="numeric" autoComplete="off" placeholder="123" value={form.cvv} onChange={set('cvv')} onFocus={() => setFlip(false)} {...a} />}
        </Field>
        <Button className="btn btn--primary btn--lg btn--block span-2" loading={paying} type="submit"><ShieldCheck size={18} /> Pagar {money(order.total)}</Button>
        <p className="tiny muted span-2" style={{ margin: 0 }}>Simulación: no se realiza ningún cobro. Solo guardamos la marca y los últimos 4 dígitos; el número completo y el CVV nunca se almacenan.</p>
      </form>
    </div>
  );
}

function TransferPayment({ order, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [reference, setReference] = useState('');
  const [sending, setSending] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const bank = order.bankTransfer || {};
  const pick = (f) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) return toast.error('Sube una imagen (JPG, PNG o WebP) o un PDF.');
    if (f.size > 5 * 1024 * 1024) return toast.error('El archivo supera 5 MB.');
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };
  const send = async () => {
    if (!file) return toast.error('Adjunta la imagen o PDF del comprobante.');
    const fd = new FormData();
    fd.append('receipt', file);
    if (reference) fd.append('bankReference', reference);
    setSending(true);
    try {
      await api.post(`/sales/orders/${order.code}/payments/transfer`, fd);
      await success('Comprobante enviado', 'Lo revisaremos y te avisaremos cuando el pago quede confirmado. Tus prendas siguen reservadas.');
      onDone();
    } catch (e) {
      apiError(e);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="pay-grid">
      <div className="well stack" style={{ '--gap': '10px' }}>
        <span className="strong row"><Landmark size={18} /> Datos para transferir</span>
        {(bank.accounts || []).map((a) => (
          <dl key={a.number} className="kv">
            <dt>Banco</dt><dd>{a.bank}</dd>
            <dt>Cuenta</dt><dd className="num">{a.type} {a.number}</dd>
            <dt>A nombre de</dt><dd>{a.holder}</dd>
            <dt>Monto exacto</dt><dd className="num">{money(order.total)}</dd>
          </dl>
        ))}
        <p className="small muted" style={{ margin: 0 }}>{bank.instructions}</p>
      </div>
      <div className="stack" style={{ '--gap': '12px' }}>
        <div
          className={`dropzone ${drag ? 'is-drag' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          aria-label="Seleccionar comprobante"
        >
          {preview ? <img src={preview} alt="Vista previa del comprobante" /> : file ? <FileText size={34} /> : <ImageUp size={34} />}
          <span className="strong">{file ? file.name : 'Arrastra aquí tu comprobante'}</span>
          <span className="tiny muted">{file ? `${(file.size / 1024).toFixed(0)} KB · toca para cambiarlo` : 'o toca para elegir un archivo · JPG, PNG, WebP o PDF · máx. 5 MB'}</span>
          <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        <Field label="Número de referencia bancaria (opcional)">
          {(a) => <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} {...a} />}
        </Field>
        <Button className="btn btn--primary btn--lg btn--block" loading={sending} onClick={send}><Upload size={18} /> Enviar comprobante</Button>
        <p className="tiny muted" style={{ margin: 0 }}>Un comprobante no confirma el pago por sí solo: nuestro equipo lo revisa antes de aprobarlo.</p>
      </div>
    </div>
  );
}

const PS_REASONS = {
  CAMBIO: ['La talla no me quedó', 'Quiero otro color', 'Otro motivo'],
  DEVOLUCION: ['La talla no me quedó', 'No es lo que esperaba', 'Llegó con un defecto', 'Recibí un producto equivocado', 'Otro motivo'],
  RECLAMO: ['Demora en la entrega', 'Producto dañado o incompleto', 'Cobro incorrecto', 'Atención recibida', 'Otro motivo'],
};

function PostSaleModal({ open, onClose, order, initialType, onCreated }) {
  const [type, setType] = useState(initialType || 'CAMBIO');
  const [reason, setReason] = useState(PS_REASONS[initialType || 'CAMBIO'][0]);
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState({});
  const [variants, setVariants] = useState([]);
  const [desired, setDesired] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const selected = order.items.filter((i) => qty[i.id] > 0);
  const exchangeProduct = type === 'CAMBIO' && selected.length ? selected[0].productId : null;

  useEffect(() => { setReason(PS_REASONS[type][0]); setErrors({}); }, [type]);
  useEffect(() => {
    if (!exchangeProduct) { setVariants([]); setDesired(''); return; }
    api.get('/catalog/variants', { query: { productId: exchangeProduct }, auth: false }).then(setVariants).catch(() => setVariants([]));
  }, [exchangeProduct]);

  const submit = async () => {
    const errs = {};
    if (type !== 'RECLAMO' && !selected.length) errs.items = 'Selecciona al menos una prenda.';
    if (type === 'CAMBIO' && new Set(selected.map((i) => i.productId)).size > 1) errs.items = 'Para un cambio selecciona prendas de un mismo producto.';
    if (type === 'CAMBIO' && !desired) errs.desired = 'Elige la talla o color que quieres recibir.';
    if (description.trim().length < 10) errs.description = 'Cuéntanos qué pasó (mínimo 10 caracteres).';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const ps = await api.post(`/sales/orders/${order.code}/post-sale`, {
        type, reason, description, items: selected.map((i) => ({ orderItemId: i.id, quantity: qty[i.id] })), desiredVariantId: type === 'CAMBIO' ? Number(desired) : null,
      });
      await success(`Solicitud ${ps.code} registrada`, 'Te avisaremos cada avance por notificación y correo.');
      onCreated();
      onClose();
    } catch (e) {
      setErrors({ ...e.fields, general: Object.keys(e.fields || {}).length ? null : e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Solicitud de posventa" wide
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Enviar solicitud</Button></>}>
      <div className="stack" style={{ '--gap': '18px' }}>
        <div className="seg" role="radiogroup" aria-label="Tipo de solicitud">
          {[['CAMBIO', 'Cambio'], ['DEVOLUCION', 'Devolución'], ['RECLAMO', 'Reclamo']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={type === v} className={type === v ? 'on' : ''} onClick={() => setType(v)} disabled={v !== 'RECLAMO' && order.status !== 'ENTREGADO'}>{l}</button>
          ))}
        </div>
        {errors.general && <Notice tone="bad">{errors.general}</Notice>}
        <div>
          <div className="label mb-1">{type === 'RECLAMO' ? 'Prendas relacionadas (opcional)' : 'Prendas'}</div>
          <div className="stack" style={{ '--gap': '8px' }}>
            {order.items.map((i) => (
              <label key={i.id} className={`choice ${qty[i.id] > 0 ? 'on' : ''}`} style={{ gridTemplateColumns: 'auto 44px minmax(0,1fr) auto', alignItems: 'center' }}>
                <input type="checkbox" checked={qty[i.id] > 0} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.checked ? 1 : 0 }))} />
                <Img src={i.imageUrl} alt="" style={{ width: 44, height: 55, objectFit: 'cover', borderRadius: 6 }} />
                <div><div className="strong truncate">{i.productName}</div><div className="tiny muted">{i.colorName} · {i.sizeName} · compraste {i.quantity}</div></div>
                {qty[i.id] > 0 && i.quantity > 1 && (
                  <select className="select select--sm" style={{ width: 'auto' }} value={qty[i.id]} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))} onClick={(e) => e.preventDefault()}>
                    {Array.from({ length: i.quantity }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </label>
            ))}
          </div>
          {errors.items && <p className="field-error mt-1" role="alert">{errors.items}</p>}
        </div>
        {type === 'CAMBIO' && (
          <Field label="Quiero recibir" error={errors.desired} hint="Solo se muestran tallas y colores con existencias.">
            {(a) => (
              <select className="select" value={desired} onChange={(e) => setDesired(e.target.value)} disabled={!variants.length} {...a}>
                <option value="">{exchangeProduct ? 'Selecciona talla y color' : 'Primero elige la prenda'}</option>
                {variants.filter((v) => v.available > 0).map((v) => <option key={v.id} value={v.id}>{v.color} · Talla {v.size}</option>)}
              </select>
            )}
          </Field>
        )}
        <div className="form-grid">
          <Field label="Motivo">{(a) => <select className="select" value={reason} onChange={(e) => setReason(e.target.value)} {...a}>{PS_REASONS[type].map((r) => <option key={r}>{r}</option>)}</select>}</Field>
          <Field label="Pedido">{(a) => <input className="input" value={order.code} disabled {...a} />}</Field>
          <Field label="Describe la situación" error={errors.description} className="span-2">
            {(a) => <textarea className="textarea" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="Cuéntanos qué pasó con tu pedido o prenda…" {...a} />}
          </Field>
        </div>
        {type === 'RECLAMO' ? (
          <Notice tone="info">Este formulario interno no sustituye los medios autorizados por la DIACO. Si lo prefieres, también puedes presentar tu queja directamente ante la Dirección de Atención y Asistencia al Consumidor.</Notice>
        ) : (
          <p className="tiny muted" style={{ margin: 0 }}>Plazo: hasta el {date(order.returnDeadline)}. Revisaremos la prenda al recibirla; el reembolso se registra por separado después de la revisión.</p>
        )}
      </div>
    </Modal>
  );
}

export default function OrderDetail() {
  const { code } = useParams();
  const [params, setParams] = useSearchParams();
  const isNew = params.get('nuevo') === '1';
  const { data: o, error, loading, reload } = useApi(`/sales/orders/${code}`, null, { keepPrevious: true });
  const { data: store } = useApi('/catalog/store', null, { auth: false });
  const [psOpen, setPsOpen] = useState(null);

  useEffect(() => {
    if (!o || o.status !== 'PENDIENTE_PAGO' || o.paymentStatus !== 'EN_REVISION') return undefined;
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [o, reload]);

  const history = useMemo(() => (o?.history || []).slice().reverse(), [o]);

  if (loading && !o) return <Loader label="Cargando pedido…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!o) return null;

  const cancel = async () => {
    const reason = await promptText({ title: `¿Cancelar el pedido ${o.code}?`, text: 'Liberaremos las prendas reservadas. Si ya pagaste, registraremos el reembolso simulado.', placeholder: 'Motivo (opcional)', confirmText: 'Cancelar pedido', danger: true, optional: true });
    if (reason === null) return;
    try {
      await api.post(`/sales/orders/${o.code}/cancel`, { reason: reason || undefined });
      toast.success('Pedido cancelado.');
      reload();
    } catch (e) { apiError(e); }
  };

  const shippingNet = Number(o.shippingCost) - Number(o.shippingDiscount);
  const canPostSale = o.status === 'ENTREGADO' && o.returnDeadline && new Date(o.returnDeadline) > new Date();
  const waitingReview = o.status === 'PENDIENTE_PAGO' && o.paymentStatus === 'EN_REVISION';
  const testCards = store?.simulation?.testCards || [];

  return (
    <div className="stack" style={{ '--gap': '20px' }}>
      <Link to="/cuenta/pedidos" className="btn btn--link" style={{ justifySelf: 'start', paddingLeft: 0 }}><ArrowLeft size={16} /> Mis pedidos</Link>

      <AnimatePresence>
        {isNew && (
          <motion.div className="order-hero" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <svg viewBox="0 0 52 52" className="order-hero__check" aria-hidden="true">
              <motion.circle cx="26" cy="26" r="24" fill="none" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
              <motion.path d="M15 27l7 7 15-16" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.5 }} />
            </svg>
            <div className="grow">
              <h2>¡Recibimos tu pedido {o.code}!</h2>
              <p>
                {o.paymentMethod === 'TARJETA' && o.canPay && 'Completa el pago con tarjeta para confirmarlo. Tus prendas quedaron reservadas.'}
                {o.paymentMethod === 'TRANSFERENCIA' && o.canPay && 'Realiza la transferencia y sube tu comprobante aquí abajo. Tus prendas quedaron reservadas.'}
                {o.paymentMethod === 'CONTRA_ENTREGA' && 'Pagarás al recibirlo. Te avisaremos cuando lo despachemos.'}
                {!o.canPay && o.paymentMethod !== 'CONTRA_ENTREGA' && 'Te enviamos la confirmación a tu correo (buzón de pruebas).'}
              </p>
            </div>
            <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setParams({}, { replace: true })} aria-label="Cerrar aviso"><XCircle size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="row row--between row--wrap">
        <div>
          <h1 className="h1 num">Pedido {o.code}</h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Realizado el {dateTime(o.createdAt)} · {label(o.paymentMethod)}</p>
        </div>
        <div className="row row--wrap">
          {o.documents?.filter((d) => !d.voided).map((d) => (
            <button key={d.id} className="btn btn--ghost btn--sm" onClick={() => openProtected(`/sales/documents/${d.number}/pdf`).catch(apiError)}><FileText size={16} /> Comprobante {d.number}</button>
          ))}
          {o.canCancel && <button className="btn btn--ghost btn--sm" style={{ color: 'var(--grana)' }} onClick={cancel}><XCircle size={16} /> Cancelar pedido</button>}
        </div>
      </div>

      {o.status === 'CANCELADO' ? (
        <Notice tone="bad"><b>Pedido cancelado.</b> {o.cancelReason}{Number(o.amountRefunded) > 0 ? ` Reembolso simulado registrado: ${money(o.amountRefunded)}.` : ''}</Notice>
      ) : <div className="panel"><div className="panel__body"><ProgressSteps order={o} /></div></div>}

      <div className="tracks">
        <div className="track"><small>Estado del pedido</small><Status value={o.status} /><span className="tiny muted">Actualizado {relative(o.updatedAt)}</span></div>
        <div className="track"><small>Pago</small><Status value={o.paymentStatus} /><span className="tiny muted">{label(o.paymentMethod)} · pagado {money(o.amountPaid)}</span></div>
        <div className="track"><small>Envío</small><Status value={o.shippingStatus} /><span className="tiny muted">{o.shipment?.trackingNumber ? `Guía ${o.shipment.trackingNumber}` : o.shippingZone?.estimatedDays ? `Entrega estimada: ${o.shippingZone.estimatedDays}` : 'Pendiente de despacho'}</span></div>
      </div>

      {o.canPay && (
        <motion.section className="panel pay-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel__head">
            <h2 className="row">{o.paymentMethod === 'TARJETA' ? <CreditCard size={19} /> : <Landmark size={19} />} {o.paymentStatus === 'RECHAZADO' ? 'Intenta pagar de nuevo' : 'Completa tu pago'}</h2>
            {o.reservationExpiresAt && <span className="chip chip--warn"><Clock3 /> Reserva vence en <Countdown until={o.reservationExpiresAt} onExpire={reload} /></span>}
          </div>
          <div className="panel__body">
            {o.paymentStatus === 'RECHAZADO' && <div className="mb-2"><Notice tone="bad">El último intento fue rechazado: {o.payments?.at(-1)?.reviewNote || o.payments?.at(-1)?.responseMessage}</Notice></div>}
            {o.paymentMethod === 'TARJETA' ? <CardPayment order={o} testCards={testCards} onDone={reload} /> : <TransferPayment order={o} onDone={reload} />}
          </div>
        </motion.section>
      )}
      {waitingReview && <Notice tone="info"><b>Estamos revisando tu pago.</b> Tus prendas siguen reservadas; te avisaremos en cuanto el pago quede confirmado.</Notice>}
      {o.paymentMethod === 'CONTRA_ENTREGA' && o.paymentStatus === 'PENDIENTE' && o.status !== 'CANCELADO' && <Notice tone="info"><Banknote size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Pagarás {money(o.total)} al recibir tu pedido.</Notice>}

      <div className="two-col two-col--order">
        <div className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2 className="row"><Package size={18} /> Productos</h2><span className="tiny muted">Precios al momento de la compra</span></div>
            <div className="panel__body" style={{ paddingBlock: 4 }}>
              {o.items.map((i) => (
                <div key={i.id} className="line-item">
                  <div className="line-item__img"><Img src={i.imageUrl} alt={i.productName} /></div>
                  <div>
                    <div className="line-item__name">{i.productName}</div>
                    <div className="line-item__opts">{i.colorName} · Talla {i.sizeName} · {i.quantity} × <span className="num">{money(i.unitPrice)}</span></div>
                    <div className="tiny faint">SKU {i.sku}</div>
                    {i.promotionName && <div className="line-item__promo">{i.promotionName}</div>}
                  </div>
                  <div className="line-item__right">
                    <span className="num strong">{money(i.lineTotal)}</span>
                    {Number(i.discountAmount) > 0 && <span className="tiny num" style={{ color: 'var(--grana-700)' }}>− {money(i.discountAmount)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="panel__foot" style={{ display: 'block' }}>
              <div className="totals">
                <div><span className="muted">Subtotal</span><span className="num">{money(o.subtotal)}</span></div>
                {Number(o.discountTotal) > 0 && <div className="discount"><span>Descuentos{o.couponCode ? ` (incluye cupón ${o.couponCode})` : ''}</span><span className="num">− {money(o.discountTotal)}</span></div>}
                <div><span className="muted">Envío</span><span className="num">{shippingNet > 0 ? money(shippingNet) : 'Gratis'}</span></div>
                <div className="grand"><span>Total</span><span className="num">{money(o.total)}</span></div>
                {Number(o.amountRefunded) > 0 && <div className="discount"><span>Reembolsado (simulado)</span><span className="num">− {money(o.amountRefunded)}</span></div>}
              </div>
            </div>
          </section>

          {(o.shipment?.events?.length > 0) && (
            <section className="panel">
              <div className="panel__head"><h2 className="row"><Truck size={18} /> Seguimiento de la entrega</h2>{o.shipment.carrier && <span className="small muted">{o.shipment.carrier.name} · guía ficticia {o.shipment.trackingNumber}</span>}</div>
              <div className="panel__body">
                <ol className="timeline">
                  {o.shipment.events.slice().reverse().map((e) => (
                    <li key={e.id}><span className={`timeline__dot ${e.isIncident ? 'k-INC' : 'k-ENVIO'}`} /><div><div className="timeline__title">{label(e.status)}: {e.description}</div><div className="timeline__meta">{dateTime(e.createdAt)}{e.location ? ` · ${e.location}` : ''}</div></div></li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel__head"><h2 className="row"><RefreshCcw size={18} /> Historial de estados</h2><span className="tiny muted">Pedido, pago y envío se registran por separado</span></div>
            <div className="panel__body">
              <ol className="timeline">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className={`timeline__dot k-${h.kind}`} />
                    <div>
                      <div className="timeline__title">{KIND_LABEL[h.kind]}: {h.fromStatus ? `${label(h.fromStatus)} → ` : ''}{label(h.toStatus)}</div>
                      <div className="timeline__meta">{dateTime(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>

        <aside className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2 className="row"><MapPin size={18} /> Entrega</h2></div>
            <div className="panel__body stack" style={{ '--gap': '4px' }}>
              <span className="strong">{o.addressSnapshot.recipientName}</span>
              <span className="small">{o.addressSnapshot.phone}</span>
              <span className="small muted">{o.addressSnapshot.line1}, {o.addressSnapshot.municipality}, {o.addressSnapshot.department}</span>
              {o.addressSnapshot.reference && <span className="small muted">{o.addressSnapshot.reference}</span>}
              {o.customerNote && <span className="small mt-1"><b>Nota:</b> {o.customerNote}</span>}
              {o.shipment?.receivedBy && <span className="small mt-1"><b>Recibió:</b> {o.shipment.receivedBy}</span>}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head"><h2 className="row"><Receipt size={18} /> Pagos</h2></div>
            <div className="panel__body stack" style={{ '--gap': '12px' }}>
              {o.payments.length === 0 && <span className="small muted">Aún no hay pagos registrados.</span>}
              {o.payments.map((p) => (
                <div key={p.id} className="stack" style={{ '--gap': '4px' }}>
                  <div className="row row--between"><span className="small strong num">{p.reference}</span><Status value={p.status} /></div>
                  <span className="tiny muted">{label(p.method)}{p.cardLast4 ? ` · ${p.cardBrand} •••• ${p.cardLast4}` : ''} · {money(p.amount)} · {dateTime(p.createdAt)}</span>
                  {(p.reviewNote || p.responseMessage) && <span className="tiny">{p.reviewNote || p.responseMessage}</span>}
                  {p.hasReceipt && <button className="btn btn--link btn--sm" style={{ justifySelf: 'start', paddingLeft: 0 }} onClick={() => openProtected(`/sales/payments/${p.id}/receipt`).catch(apiError)}>Ver comprobante enviado</button>}
                </div>
              ))}
              {o.refunds?.map((r) => (
                <div key={r.id} className="notice notice--ok small"><span>Reembolso {r.reference}: <b className="num">{money(r.amount)}</b> (simulado) · {date(r.createdAt)}</span></div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head"><h2 className="row"><MessageSquareWarning size={18} /> ¿Algo no salió bien?</h2></div>
            <div className="panel__body stack" style={{ '--gap': '10px' }}>
              {o.postSales?.map((ps) => (
                <Link key={ps.id} to="/cuenta/posventa" className="row row--between small" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span><b className="num">{ps.code}</b> · {label(ps.type)}</span><Status value={ps.status} />
                </Link>
              ))}
              {canPostSale && <button className="btn btn--ghost btn--block" onClick={() => setPsOpen('CAMBIO')}><RefreshCcw size={16} /> Solicitar cambio o devolución</button>}
              {o.status !== 'CANCELADO' && <button className="btn btn--link btn--sm" style={{ justifySelf: 'start', paddingLeft: 0 }} onClick={() => setPsOpen('RECLAMO')}>Presentar un reclamo</button>}
              {o.status === 'ENTREGADO' && o.returnDeadline && <span className="tiny muted">Cambios y devoluciones hasta el {date(o.returnDeadline)}.</span>}
              {o.status !== 'ENTREGADO' && o.status !== 'CANCELADO' && <span className="tiny muted">Podrás solicitar cambios o devoluciones cuando recibas tu pedido.</span>}
            </div>
          </section>
        </aside>
      </div>
      {psOpen && <PostSaleModal open={!!psOpen} onClose={() => setPsOpen(null)} order={o} initialType={psOpen} onCreated={reload} />}
    </div>
  );
}
