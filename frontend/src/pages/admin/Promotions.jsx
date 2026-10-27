import { useState } from 'react';
import { Plus, Pencil, Power, Ticket } from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable } from '../../components/admin.jsx';
import { Button, Field, Modal, Notice, Status, Tabs } from '../../components/ui.jsx';
import { money, dateTime } from '../../lib/format.js';
import { confirm, toast, apiError } from '../../lib/alerts.js';

const toLocal = (d) => {
  if (!d) return '';
  const t = new Date(new Date(d).getTime() - 6 * 3600e3);
  return t.toISOString().slice(0, 16);
};
const fromLocal = (v) => (v ? new Date(`${v}:00-06:00`).toISOString() : null);

function describe(p) {
  const v = p.type === 'PORCENTAJE' ? `${Number(p.value)} %` : p.type === 'MONTO_FIJO' ? money(p.value) : 'Envío gratis';
  const scope = p.scope === 'TODO' ? 'toda la tienda' : p.scope === 'CATEGORIA' ? `categoría ${p.category?.name || ''}` : `producto ${p.product?.name || ''}`;
  return `${v} · ${scope}${p.minSubtotal ? ` · desde ${money(p.minSubtotal)}` : ''}${p.maxDiscount ? ` · tope ${money(p.maxDiscount)}` : ''}`;
}

function PromoModal({ initial, onClose, onSaved }) {
  const cats = useApi('/catalog/admin/categories');
  const prods = useApi('/catalog/admin/products', { pageSize: 100, status: 'ACTIVO' });
  const c0 = initial?.coupons?.[0];
  const now = new Date();
  const [f, setF] = useState(initial?.id ? {
    name: initial.name, description: initial.description || '', type: initial.type, value: String(Number(initial.value)), scope: initial.scope,
    categoryId: initial.categoryId ? String(initial.categoryId) : '', productId: initial.productId ? String(initial.productId) : '', minSubtotal: initial.minSubtotal ? String(Number(initial.minSubtotal)) : '',
    maxDiscount: initial.maxDiscount ? String(Number(initial.maxDiscount)) : '', requiresCoupon: initial.requiresCoupon, combinable: initial.combinable, priority: String(initial.priority),
    startsAt: toLocal(initial.startsAt), endsAt: toLocal(initial.endsAt), active: initial.active,
    couponCode: c0?.code || '', usageLimit: c0?.usageLimit ? String(c0.usageLimit) : '', perCustomerLimit: c0 ? String(c0.perCustomerLimit) : '1',
  } : {
    name: '', description: '', type: 'PORCENTAJE', value: '10', scope: 'TODO', categoryId: '', productId: '', minSubtotal: '', maxDiscount: '', requiresCoupon: false, combinable: false, priority: '0',
    startsAt: toLocal(now), endsAt: toLocal(new Date(now.getTime() + 30 * 86400e3)), active: true, couponCode: '', usageLimit: '', perCustomerLimit: '1',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async () => {
    setSaving(true);
    setErrors({});
    const body = {
      name: f.name, description: f.description || null, type: f.type, value: f.type === 'ENVIO_GRATIS' ? 0 : f.value, scope: f.scope,
      categoryId: f.scope === 'CATEGORIA' ? Number(f.categoryId) || null : null, productId: f.scope === 'PRODUCTO' ? Number(f.productId) || null : null,
      minSubtotal: f.minSubtotal || null, maxDiscount: f.maxDiscount || null, requiresCoupon: f.requiresCoupon, combinable: f.combinable, priority: Number(f.priority) || 0,
      startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), active: f.active,
      coupon: f.requiresCoupon ? { code: f.couponCode, usageLimit: f.usageLimit ? Number(f.usageLimit) : null, perCustomerLimit: Number(f.perCustomerLimit) || 1 } : null,
    };
    try {
      if (initial?.id) await api.put(`/sales/admin/promotions/${initial.id}`, body);
      else await api.post('/sales/admin/promotions', body);
      toast.success('Promoción guardada.');
      onSaved();
      onClose();
    } catch (e) {
      const fl = e.fields || {};
      setErrors({ ...fl, couponCode: fl['coupon.code'] });
      if (!Object.keys(fl).length) apiError(e);
    } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={initial?.id ? 'Editar promoción' : 'Nueva promoción'} footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Guardar promoción</Button></>}>
      <div className="form-grid">
        <Field label="Nombre" error={errors.name} className="span-2">{(a) => <input className="input" value={f.name} onChange={set('name')} placeholder="Temporada de lluvia" {...a} />}</Field>
        <Field label="Descripción (se muestra en la tienda)" error={errors.description} className="span-2">{(a) => <input className="input" value={f.description} onChange={set('description')} {...a} />}</Field>
        <Field label="Tipo de descuento" error={errors.type}>{(a) => <select className="select" value={f.type} onChange={set('type')} {...a}><option value="PORCENTAJE">Porcentaje</option><option value="MONTO_FIJO">Monto fijo (Q)</option><option value="ENVIO_GRATIS">Envío gratis</option></select>}</Field>
        {f.type !== 'ENVIO_GRATIS' ? <Field label={f.type === 'PORCENTAJE' ? 'Porcentaje (%)' : 'Monto (Q)'} error={errors.value} hint={f.type === 'MONTO_FIJO' && f.scope !== 'TODO' ? 'Por unidad del producto o categoría.' : f.type === 'MONTO_FIJO' ? 'Al pedido, repartido entre las líneas.' : 'Entre 1 y 90.'}>{(a) => <input className="input num" inputMode="decimal" value={f.value} onChange={set('value')} {...a} />}</Field> : <div />}
        <Field label="Alcance" error={errors.scope}>{(a) => <select className="select" value={f.scope} onChange={set('scope')} {...a}><option value="TODO">Toda la tienda</option><option value="CATEGORIA">Una categoría</option><option value="PRODUCTO">Un producto</option></select>}</Field>
        {f.scope === 'CATEGORIA' && <Field label="Categoría" error={errors.categoryId}>{(a) => <select className="select" value={f.categoryId} onChange={set('categoryId')} {...a}><option value="">Selecciona…</option>{(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>}
        {f.scope === 'PRODUCTO' && <Field label="Producto" error={errors.productId}>{(a) => <select className="select" value={f.productId} onChange={set('productId')} {...a}><option value="">Selecciona…</option>{(prods.data?.items || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</Field>}
        {f.scope === 'TODO' && <div />}
        <Field label="Compra mínima (Q, opcional)" error={errors.minSubtotal}>{(a) => <input className="input num" inputMode="decimal" value={f.minSubtotal} onChange={set('minSubtotal')} {...a} />}</Field>
        <Field label="Descuento máximo (Q, opcional)" error={errors.maxDiscount}>{(a) => <input className="input num" inputMode="decimal" value={f.maxDiscount} onChange={set('maxDiscount')} {...a} />}</Field>
        <Field label="Inicia" error={errors.startsAt}>{(a) => <input type="datetime-local" className="input" value={f.startsAt} onChange={set('startsAt')} {...a} />}</Field>
        <Field label="Termina" error={errors.endsAt}>{(a) => <input type="datetime-local" className="input" value={f.endsAt} onChange={set('endsAt')} {...a} />}</Field>
        <Field label="Prioridad (desempate)" error={errors.priority} hint="Si dos promociones dan el mismo descuento gana la de mayor prioridad.">{(a) => <input className="input num" inputMode="numeric" value={f.priority} onChange={set('priority')} {...a} />}</Field>
        <div className="stack" style={{ '--gap': '10px', alignSelf: 'center' }}>
          <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Activa</label>
          <label className="check"><input type="checkbox" checked={f.combinable} onChange={set('combinable')} /> {f.requiresCoupon ? 'El cupón se combina con promociones automáticas' : 'Se combina con otras promociones de pedido'}</label>
        </div>
        <div className="span-2 well">
          <label className="check"><input type="checkbox" checked={f.requiresCoupon} onChange={set('requiresCoupon')} /> <span><b>Requiere cupón</b> — el cliente debe escribir el código en el checkout</span></label>
          {f.requiresCoupon && (
            <div className="form-grid mt-2">
              <Field label="Código del cupón" error={errors.couponCode}>{(a) => <input className="input" style={{ textTransform: 'uppercase' }} value={f.couponCode} onChange={set('couponCode')} placeholder="LLUVIA15" {...a} />}</Field>
              <Field label="Usos totales (vacío = sin límite)" error={errors['coupon.usageLimit']}>{(a) => <input className="input num" inputMode="numeric" value={f.usageLimit} onChange={set('usageLimit')} {...a} />}</Field>
              <Field label="Usos por cliente" error={errors['coupon.perCustomerLimit']}>{(a) => <input className="input num" inputMode="numeric" value={f.perCustomerLimit} onChange={set('perCustomerLimit')} {...a} />}</Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Promotions() {
  const s = useSession();
  const { data, error, loading, reload } = useApi('/sales/admin/promotions');
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState('VIGENTE');
  const canManage = s.can('promotions.manage');
  const rows = (data || []).filter((p) => (tab === 'todas' ? true : tab === 'cupones' ? p.requiresCoupon : p.state === tab));
  const count = (st) => (data || []).filter((p) => p.state === st).length;
  const toggle = async (p) => {
    if (!(await confirm({ title: p.active ? '¿Desactivar la promoción?' : '¿Activar la promoción?', text: p.active ? 'Dejará de aplicarse a nuevas compras. Los pedidos existentes conservan su descuento.' : 'Se aplicará durante su vigencia.', confirmText: p.active ? 'Desactivar' : 'Activar', danger: p.active }))) return;
    try { await api.post(`/sales/admin/promotions/${p.id}/active`, { active: !p.active }); toast.success('Promoción actualizada.'); reload(); } catch (e) { apiError(e); }
  };
  return (
    <>
      <PageHeader title="Promociones y cupones" description="Descuentos automáticos por producto, categoría o toda la tienda, cupones con límites de uso y envío gratis condicionado." actions={canManage && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}><Plus size={16} /> Nueva promoción</button>} />
      <Notice tone="info">Reglas de combinación: cada línea recibe solo la mejor promoción automática; un cupón no combinable se aplica únicamente a líneas sin promoción; los descuentos nunca superan el precio (no hay totales negativos) y los pedidos conservan el descuento con el que se compraron.</Notice>
      <div className="mt-3"><Tabs id="promo-tabs" value={tab} onChange={setTab} tabs={[{ value: 'VIGENTE', label: 'Vigentes', count: count('VIGENTE') }, { value: 'PROGRAMADA', label: 'Programadas', count: count('PROGRAMADA') }, { value: 'cupones', label: 'Cupones' }, { value: 'VENCIDA', label: 'Vencidas', count: count('VENCIDA') }, { value: 'todas', label: 'Todas' }]} /></div>
      <section className="panel mt-2">
        <DataTable
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          empty="No hay promociones en esta vista."
          columns={[
            { key: 'name', label: 'Promoción', render: (p) => <><b>{p.name}</b><div className="tiny muted">{describe(p)}</div></> },
            { key: 'coupon', label: 'Cupón', render: (p) => (p.coupons.length ? p.coupons.map((c) => <div key={c.id}><span className="chip chip--outline"><Ticket /> {c.code}</span><div className="tiny muted">{c.usedCount} usos{c.usageLimit ? ` de ${c.usageLimit}` : ''} · {c.perCustomerLimit} por cliente</div></div>) : <span className="muted small">Automática</span>) },
            { key: 'dates', label: 'Vigencia', render: (p) => <span className="small">{dateTime(p.startsAt)}<br />{dateTime(p.endsAt)}</span>, hideSm: true },
            { key: 'comb', label: 'Combinable', render: (p) => (p.combinable ? 'Sí' : 'No'), hideSm: true },
            { key: 'state', label: 'Estado', render: (p) => <Status value={p.state} /> },
            canManage && { key: 'act', label: '', render: (p) => <span className="row" style={{ '--gap': '4px' }}><button className="btn btn--ghost btn--sm" onClick={() => setEdit(p)}><Pencil size={14} /> Editar</button><button className="btn btn--link btn--sm" onClick={() => toggle(p)}><Power size={14} /> {p.active ? 'Desactivar' : 'Activar'}</button></span> },
          ].filter(Boolean)}
        />
      </section>
      {edit && <PromoModal initial={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </>
  );
}

