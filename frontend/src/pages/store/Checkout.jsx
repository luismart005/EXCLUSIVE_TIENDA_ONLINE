import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Plus, CreditCard, Landmark, Banknote, Tag, Lock, AlertTriangle, Check } from 'lucide-react';
import { api, newKey } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useCart } from '../../store/cart.jsx';
import { Button, Empty, Img, Loader, Modal, Notice } from '../../components/ui.jsx';
import AddressModal from '../../components/AddressForm.jsx';
import { Totals } from './Cart.jsx';
import { money } from '../../lib/format.js';
import { toast, apiError, failure } from '../../lib/alerts.js';
import { Markdown } from './Policy.jsx';

const METHODS = [
  { value: 'TARJETA', icon: CreditCard, title: 'Tarjeta de crédito o débito', desc: 'Pago inmediato (simulado). Tu pedido se confirma al aprobarse.' },
  { value: 'TRANSFERENCIA', icon: Landmark, title: 'Transferencia bancaria', desc: 'Transfiere y sube tu comprobante. Reservamos tus prendas por 48 horas.' },
  { value: 'CONTRA_ENTREGA', icon: Banknote, title: 'Pago contra entrega', desc: 'Pagas al recibir. Disponible para compras de hasta Q 3,000.' },
];

export default function Checkout() {
  const session = useSession();
  const cart = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState(null);
  const [addressId, setAddressId] = useState(null);
  const [method, setMethod] = useState('TARJETA');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [accept, setAccept] = useState(false);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [addrModal, setAddrModal] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [terms, setTerms] = useState(null);
  const [errors, setErrors] = useState({});
  const key = useRef(newKey());

  const loadAddresses = useCallback(async (selectId) => {
    const list = await api.get('/auth/me/addresses');
    setAddresses(list);
    setAddressId((cur) => selectId || cur || list.find((a) => a.isDefault)?.id || list[0]?.id || null);
  }, []);

  useEffect(() => { loadAddresses().catch(apiError); }, [loadAddresses]);

  const requote = useCallback(async () => {
    setQuoting(true);
    try {
      const q = await api.post('/sales/checkout/quote', { addressId: addressId || undefined, couponCode: coupon || undefined });
      setQuote(q);
    } catch (e) {
      apiError(e);
    } finally {
      setQuoting(false);
    }
  }, [addressId, coupon]);

  useEffect(() => { if (addresses) requote(); }, [addresses, addressId, coupon, cart.count]);

  const openTerms = async () => {
    setTermsOpen(true);
    if (!terms) setTerms(await api.get('/catalog/policies/terminos', { auth: false }).catch(() => null));
  };

  if (!addresses || !quote) return <Loader label="Preparando tu compra…" />;
  if (!quote.lines.length) {
    return <div className="container"><Empty title="Tu carrito está vacío" action={<Link to="/tienda" className="btn btn--primary">Ir a la tienda</Link>}>Agrega prendas para continuar con la compra.</Empty></div>;
  }

  const address = addresses.find((a) => a.id === addressId);
  const noCoverage = quote.shippingAvailable === false;
  const blocking = quote.problems.filter((p) => ['OUT_OF_STOCK', 'UNAVAILABLE', 'INSUFFICIENT'].includes(p.code));
  const codDisabled = Number(quote.total) > 3000;
  const couponMsg = quote.coupon;

  const place = async () => {
    const errs = {};
    if (!addressId) errs.address = 'Agrega o selecciona una dirección de entrega.';
    if (!accept) errs.terms = 'Debes aceptar los términos y condiciones para continuar.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (method === 'CONTRA_ENTREGA' && codDisabled) return toast.error('El pago contra entrega está disponible para compras de hasta Q 3,000.');
    setPlacing(true);
    try {
      const res = await api.post('/sales/checkout/confirm', {
        addressId, paymentMethod: method, couponCode: coupon || undefined, acceptTerms: true, termsVersion: quote.terms?.version || 1, note: note || undefined,
      }, { idempotencyKey: key.current });
      await cart.refresh();
      navigate(`/cuenta/pedidos/${res.order.code}?nuevo=1`, { replace: true });
    } catch (e) {
      if (e.status === 409 && Array.isArray(e.details)) {
        await failure('Cambió la disponibilidad', e.message);
        await cart.refresh();
        await requote();
      } else if (e.status === 409 && e.details?.termsVersion) {
        setAccept(false);
        await requote();
        toast.warning(e.message);
      } else {
        setErrors(e.fields || {});
        apiError(e);
      }
      key.current = newKey();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <h1>Finalizar compra</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}><Lock size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Los precios, descuentos y envío se calculan en el servidor al confirmar.</p>
      </div>
      <div className="two-col">
        <div>
          <section className="step" aria-labelledby="s1">
            <div className="step__title"><span className={`step__num ${address ? 'done' : ''}`}>{address ? <Check size={15} /> : 1}</span><h2 id="s1">Dirección de entrega</h2></div>
            {addresses.length === 0 ? (
              <Notice tone="info">Aún no tienes direcciones guardadas. Agrega una para calcular el envío.</Notice>
            ) : (
              <div className="choice-list" role="radiogroup" aria-label="Dirección de entrega">
                {addresses.map((a) => (
                  <label key={a.id} className={`choice ${a.id === addressId ? 'on' : ''}`}>
                    <input type="radio" name="address" checked={a.id === addressId} onChange={() => setAddressId(a.id)} />
                    <div>
                      <div className="choice__title">{a.label} {a.isDefault && <span className="chip chip--neutral" style={{ marginLeft: 6 }}>Predeterminada</span>}</div>
                      <div className="choice__desc">{a.recipientName} · {a.phone}<br />{a.line1}, {a.municipality}, {a.department}{a.reference ? ` · ${a.reference}` : ''}</div>
                    </div>
                    <MapPin size={18} color="var(--muted)" />
                  </label>
                ))}
              </div>
            )}
            {errors.address && <p className="field-error mt-1" role="alert"><AlertTriangle size={14} /> {errors.address}</p>}
            {noCoverage && <div className="mt-2"><Notice tone="bad">Por ahora no entregamos en {quote.shippingZone?.department}. Elige o agrega otra dirección.</Notice></div>}
            {quote.shippingZone?.covered && <p className="small muted mt-2" style={{ marginBottom: 0 }}>Entrega estimada: <b>{quote.shippingZone.estimatedDays}</b> · Tarifa a {quote.shippingZone.department}: {money(quote.shippingZone.rate)}</p>}
            <button className="btn btn--ghost btn--sm mt-2" onClick={() => setAddrModal(true)}><Plus size={16} /> Agregar dirección</button>
          </section>

          <section className="step" aria-labelledby="s2">
            <div className="step__title"><span className="step__num done"><Check size={15} /></span><h2 id="s2">Método de pago</h2></div>
            <div className="choice-list" role="radiogroup" aria-label="Método de pago">
              {METHODS.map((m) => {
                const disabled = m.value === 'CONTRA_ENTREGA' && codDisabled;
                return (
                  <label key={m.value} className={`choice ${method === m.value ? 'on' : ''} ${disabled ? 'disabled' : ''}`}>
                    <input type="radio" name="method" checked={method === m.value} disabled={disabled} onChange={() => setMethod(m.value)} />
                    <div>
                      <div className="choice__title">{m.title}</div>
                      <div className="choice__desc">{disabled ? 'No disponible: el total supera Q 3,000.' : m.desc}</div>
                    </div>
                    <m.icon size={20} color="var(--muted)" />
                  </label>
                );
              })}
            </div>
            <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>Entorno académico: ningún pago se procesa realmente. No ingreses datos de tarjetas reales.</p>
          </section>

          <section className="step" aria-labelledby="s3">
            <div className="step__title"><span className="step__num">3</span><h2 id="s3">Cupón y confirmación</h2></div>
            <form className="input-group" onSubmit={(e) => { e.preventDefault(); setCoupon(couponInput.trim().toUpperCase()); }}>
              <label htmlFor="coupon" className="sr-only">Cupón de descuento</label>
              <input id="coupon" className="input" placeholder="Código de cupón, por ejemplo BIENVENIDA10" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} style={{ textTransform: 'uppercase' }} />
              {coupon ? <button type="button" className="btn btn--ghost" onClick={() => { setCoupon(''); setCouponInput(''); }}>Quitar</button> : <Button className="btn btn--ghost" loading={quoting && !!couponInput} type="submit"><Tag size={16} /> Aplicar</Button>}
            </form>
            {couponMsg && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={`small mt-1 ${couponMsg.valid ? '' : ''}`} style={{ color: couponMsg.valid ? 'var(--jade-700)' : 'var(--grana)', marginBottom: 0 }} role="status">
                {couponMsg.valid ? `✓ ${couponMsg.message}` : couponMsg.message}
              </motion.p>
            )}
            <div className="field mt-3">
              <label htmlFor="note">Nota para la entrega (opcional)</label>
              <textarea id="note" className="textarea" style={{ minHeight: 70 }} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Horario preferido, referencias adicionales…" />
            </div>
            <label className="check mt-3">
              <input type="checkbox" checked={accept} onChange={(e) => { setAccept(e.target.checked); setErrors((x) => ({ ...x, terms: undefined })); }} aria-invalid={errors.terms ? 'true' : undefined} />
              <span>Acepto los <button type="button" className="btn btn--link" style={{ padding: 0, minHeight: 0, display: 'inline' }} onClick={openTerms}>términos y condiciones</button> (versión {quote.terms?.version}) y la <Link to="/politicas/privacidad" target="_blank">política de privacidad</Link>.</span>
            </label>
            {errors.terms && <p className="field-error mt-1" role="alert"><AlertTriangle size={14} /> {errors.terms}</p>}
          </section>
        </div>

        <aside className="sticky-side panel">
          <div className="panel__body">
            <h2 className="h3 mb-2">Tu pedido</h2>
            <div className="summary-lines">
              {quote.lines.map((l) => (
                <div key={l.variantId} className="summary-line">
                  <div className="summary-line__img"><Img src={l.image} alt="" /><b>{l.quantity}</b></div>
                  <div><div className="strong truncate">{l.name}</div><div className="tiny muted">{l.color} · {l.size}{l.promotion ? ` · ${l.promotion}` : ''}</div></div>
                  <span className="num">{money(l.total)}</span>
                </div>
              ))}
            </div>
            {blocking.length > 0 && <div className="mb-2"><Notice tone="warn">{blocking[0].message} <Link to="/carrito">Revisar carrito</Link></Notice></div>}
            <div style={{ opacity: quoting ? 0.55 : 1, transition: 'opacity .2s' }}><Totals q={quote} showShipping /></div>
            {quote.freeShippingRemaining && Number(quote.freeShippingRemaining) > 0 && <p className="tiny muted" style={{ margin: '10px 0 0' }}>Agrega {money(quote.freeShippingRemaining)} más en productos para envío gratis.</p>}
            <Button className="btn btn--primary btn--lg btn--block mt-3" loading={placing} disabled={noCoverage || blocking.length > 0 || quoting} onClick={place}>
              {method === 'TARJETA' ? 'Confirmar y pagar' : 'Confirmar pedido'} · {money(quote.total)}
            </Button>
            <p className="tiny muted" style={{ margin: '10px 0 0', textAlign: 'center' }}>Al confirmar reservamos tus prendas{method === 'TARJETA' ? ' por 30 minutos mientras completas el pago' : method === 'TRANSFERENCIA' ? ' por 48 horas mientras validamos tu transferencia' : ''}.</p>
          </div>
        </aside>
      </div>

      <AddressModal key={addrModal ? 'open' : 'closed'} open={addrModal} onClose={() => setAddrModal(false)} defaultName={session.user ? `${session.user.firstName} ${session.user.lastName}` : ''} defaultPhone={session.user?.phone || ''} onSaved={(a) => loadAddresses(a.id)} />
      <Modal open={termsOpen} onClose={() => setTermsOpen(false)} title={terms?.title || 'Términos y condiciones'} wide footer={<button className="btn btn--primary" onClick={() => { setAccept(true); setTermsOpen(false); }}>Acepto los términos</button>}>
        {terms ? <><p className="tiny muted">Versión {terms.version}</p><Markdown text={terms.content} /></> : <Loader inline />}
      </Modal>
    </div>
  );
}
