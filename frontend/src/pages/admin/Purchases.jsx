import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2, Ban, Save, Pencil } from 'lucide-react';
import { api, newKey } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, SearchInput, Toolbar, KV } from '../../components/admin.jsx';
import { Button, ErrorState, Field, Img, Loader, Modal, Notice, Pagination, Status } from '../../components/ui.jsx';
import { money, dateTime, dateOnly, int, isoToday } from '../../lib/format.js';
import { promptText, toast, apiError, success } from '../../lib/alerts.js';
import { useParamsState } from './Orders.jsx';
import { VariantPicker } from './Inventory.jsx';

export function PurchasesList() {
  const s = useSession();
  const navigate = useNavigate();
  const [f, set] = useParamsState({ page: '1' });
  const suppliers = useApi('/inventory/suppliers');
  const { data, error, loading, reload } = useApi('/inventory/purchases', { ...f, pageSize: 20 });
  return (
    <>
      <PageHeader
        title="Compras a proveedores"
        description="Historial de compras: cada línea genera una entrada en el kardex con el proveedor y el número de documento."
        actions={s.can('suppliers.manage') && s.can('inventory.move', 'suppliers.manage') && <button className="btn btn--primary btn--sm" onClick={() => navigate('/admin/compras/nueva')}><Plus size={16} /> Registrar compra</button>}
      />
      <Toolbar>
        <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Código o número de documento" />
        <select className="select select--sm" value={f.supplierId || ''} onChange={(e) => set({ supplierId: e.target.value })} aria-label="Proveedor">
          <option value="">Proveedor: todos</option>
          {(suppliers.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {data && <span className="small muted">{int(data.total)} compras</span>}
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          onRowClick={(p) => navigate(`/admin/compras/${p.id}`)}
          columns={[
            { key: 'code', label: 'Compra', render: (p) => <><b className="num">{p.code}</b><div className="tiny muted">{dateOnly(p.purchaseDate)}</div></> },
            { key: 'supplier', label: 'Proveedor', render: (p) => <>{p.supplier.name}<div className="tiny muted">Doc. {p.documentNumber}</div></> },
            { key: 'lines', label: 'Líneas', className: 'r', render: (p) => <span className="num">{p._count.items}</span>, hideSm: true },
            { key: 'units', label: 'Unidades', className: 'r', render: (p) => <span className="num">{int(p.units)}</span> },
            { key: 'total', label: 'Total', className: 'r', render: (p) => <b className="num">{money(p.total)}</b> },
            { key: 'status', label: 'Estado', render: (p) => <Status value={p.status} /> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}

export function PurchaseNew() {
  const navigate = useNavigate();
  const suppliers = useApi('/inventory/suppliers');
  const [form, setForm] = useState({ supplierId: '', documentNumber: '', purchaseDate: isoToday(), notes: '' });
  const [lines, setLines] = useState([]);
  const [picker, setPicker] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [key] = useState(newKey);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const addLine = (v) => {
    if (!v) return;
    if (lines.some((l) => l.variant.variantId === v.variantId)) return toast.warning('Esa variante ya está en la compra; ajusta su cantidad.');
    setLines((ls) => [...ls, { variant: v, quantity: '1', unitCost: '' }]);
    setPicker(null);
  };
  const upd = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const units = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);
  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const p = await api.post('/inventory/purchases', {
        supplierId: Number(form.supplierId) || 0, documentNumber: form.documentNumber, purchaseDate: form.purchaseDate, notes: form.notes || null,
        items: lines.map((l) => ({ variantId: l.variant.variantId, quantity: l.quantity, unitCost: l.unitCost || 0 })),
      }, { idempotencyKey: key });
      await success(`Compra ${p.code} registrada`, `Se registraron ${lines.length} entradas en el kardex (${int(units)} unidades).`);
      navigate(`/admin/compras/${p.id}`, { replace: true });
    } catch (e) {
      setErrors(e.fields || {});
      if (!Object.keys(e.fields || {}).length) apiError(e);
      else toast.error('Revisa los campos marcados.');
    } finally { setSaving(false); }
  };
  return (
    <>
      <PageHeader back={{ to: '/admin/compras', label: 'Compras' }} title="Registrar compra" description="Agrega las variantes recibidas del proveedor con su cantidad y costo unitario." />
      <div className="adm-detail">
        <section className="panel">
          <div className="panel__head"><h2>Productos recibidos</h2><span className="small muted">{lines.length} líneas · {int(units)} unidades</span></div>
          <div className="panel__body stack">
            <AnimatePresence initial={false}>
              {lines.map((l, i) => (
                <motion.div key={l.variant.variantId} className="purchase-line" layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <Img src={l.variant.image} alt="" className="thumb" />
                  <div className="grow"><div className="strong">{l.variant.productName}</div><div className="tiny muted num">{l.variant.sku} · {l.variant.color} · {l.variant.size} · físico actual {l.variant.physical}</div></div>
                  <Field label="Cantidad" error={errors[`items.${i}.quantity`]}>{(a) => <input className="input input--sm num" style={{ width: 80 }} inputMode="numeric" value={l.quantity} onChange={(e) => upd(i, { quantity: e.target.value.replace(/\D/g, '').slice(0, 5) })} {...a} />}</Field>
                  <Field label="Costo u. (Q)" error={errors[`items.${i}.unitCost`]}>{(a) => <input className="input input--sm num" style={{ width: 96 }} inputMode="decimal" value={l.unitCost} onChange={(e) => upd(i, { unitCost: e.target.value })} {...a} />}</Field>
                  <span className="num strong" style={{ minWidth: 90, textAlign: 'right' }}>{money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</span>
                  <button className="btn btn--icon btn--ghost btn--sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar línea"><Trash2 size={15} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
            {errors.items && <p className="field-error">{errors.items}</p>}
            <div className="well"><div className="label mb-1">Agregar variante</div><VariantPicker value={picker} onChange={addLine} /></div>
          </div>
        </section>
        <aside className="stack" style={{ '--gap': '20px' }}>
          <section className="panel">
            <div className="panel__head"><h2>Documento</h2></div>
            <div className="panel__body stack">
              <Field label="Proveedor" error={errors.supplierId}>{(a) => <select className="select" value={form.supplierId} onChange={set('supplierId')} {...a}><option value="">Selecciona…</option>{(suppliers.data || []).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
              <Field label="No. de factura o documento" error={errors.documentNumber}>{(a) => <input className="input" value={form.documentNumber} onChange={set('documentNumber')} placeholder="Serie A-12345" {...a} />}</Field>
              <Field label="Fecha de la compra" error={errors.purchaseDate}>{(a) => <input type="date" className="input" value={form.purchaseDate} max={isoToday()} onChange={set('purchaseDate')} {...a} />}</Field>
              <Field label="Notas (opcional)">{(a) => <textarea className="textarea" style={{ minHeight: 70 }} value={form.notes} onChange={set('notes')} {...a} />}</Field>
              <div className="totals"><div className="grand"><span>Total</span><span className="num">{money(total)}</span></div></div>
              <Button className="btn btn--primary btn--block" loading={saving} disabled={!lines.length} onClick={submit}><Save size={16} /> Registrar compra</Button>
              <span className="tiny muted">Repetir el envío no duplica la compra (llave de idempotencia).</span>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

export function PurchaseDetail() {
  const { id } = useParams();
  const s = useSession();
  const { data: p, error, loading, reload } = useApi(`/inventory/purchases/${id}`, null, { keepPrevious: true });
  if (loading && !p) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!p) return null;
  const voidIt = async () => {
    const reason = await promptText({ title: `¿Anular la compra ${p.code}?`, text: 'Se registrarán salidas de ajuste por cada línea (movimientos compensatorios). La compra queda en el historial como anulada.', placeholder: 'Motivo de la anulación', confirmText: 'Anular compra', danger: true });
    if (reason === null) return;
    try { await api.post(`/inventory/purchases/${p.id}/void`, { reason }); toast.success('Compra anulada con movimientos compensatorios.'); reload(); } catch (e) { apiError(e); }
  };
  return (
    <>
      <PageHeader
        back={{ to: '/admin/compras', label: 'Compras' }}
        title={<span className="num">Compra {p.code}</span>}
        description={`${p.supplier.name} · documento ${p.documentNumber} · ${dateOnly(p.purchaseDate)}`}
        actions={p.status === 'REGISTRADA' && s.can('suppliers.manage') && <button className="btn btn--ghost btn--sm" style={{ color: 'var(--grana)' }} onClick={voidIt}><Ban size={15} /> Anular compra</button>}
      />
      {p.status === 'ANULADA' && <div className="mb-2"><Notice tone="bad">Compra anulada. {p.notes}</Notice></div>}
      <div className="adm-detail">
        <section className="panel">
          <div className="panel__head"><h2>Líneas</h2><Status value={p.status} /></div>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr><th>Producto</th><th className="r">Cantidad</th><th className="r">Costo u.</th><th className="r">Subtotal</th></tr></thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Producto"><div className="row" style={{ '--gap': '10px' }}><Img src={i.variant.product.images[0]?.thumbUrl} alt="" className="thumb" /><div><Link to={`/admin/productos/${i.variant.product.id}`} className="strong">{i.variant.product.name}</Link><div className="tiny muted num">{i.variant.sku} · {i.variant.color.name} · {i.variant.size.code}</div></div></div></td>
                    <td data-label="Cantidad" className="r num">{i.quantity}</td>
                    <td data-label="Costo u." className="r num">{money(i.unitCost)}</td>
                    <td data-label="Subtotal" className="r num strong">{money(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3} className="r">Total</td><td className="r num">{money(p.total)}</td></tr></tfoot>
            </table>
          </div>
        </section>
        <aside className="panel">
          <div className="panel__head"><h2>Datos</h2></div>
          <div className="panel__body">
            <KV items={[
              ['Proveedor', p.supplier.name], ['NIT', p.supplier.nit], ['Documento', p.documentNumber], ['Fecha', dateOnly(p.purchaseDate)],
              ['Registró', p.creator ? `${p.creator.firstName} ${p.creator.lastName}` : '—'], ['Registrada', dateTime(p.createdAt)], ['Notas', p.notes],
            ]} />
          </div>
        </aside>
      </div>
      <section className="panel mt-3">
        <div className="panel__head"><h2>Movimientos de inventario generados</h2><span className="tiny muted">Entradas y, si se anuló, sus salidas compensatorias</span></div>
        <DataTable
          rows={p.movements}
          columns={[
            { key: 'date', label: 'Fecha', render: (m) => dateTime(m.createdAt) },
            { key: 'sku', label: 'SKU', render: (m) => <span className="num">{m.sku}</span> },
            { key: 'type', label: 'Tipo', render: (m) => m.typeLabel },
            { key: 'qty', label: 'Cant.', className: 'r', render: (m) => <b className="num">{m.direction === 'ENTRADA' ? '+' : '−'}{m.quantity}</b> },
            { key: 'bal', label: 'Física', className: 'r', render: (m) => <span className="num">{m.physicalBefore} → {m.physicalAfter}</span> },
            { key: 'user', label: 'Responsable', render: (m) => <span className="small">{m.userEmail}</span> },
          ]}
        />
      </section>
    </>
  );
}

function SupplierModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial?.id ? { name: initial.name, nit: initial.nit || '', contact: initial.contact || '', phone: initial.phone || '', email: initial.email || '', address: initial.address || '', active: initial.active } : { name: '', nit: '', contact: '', phone: '', email: '', address: '', active: true });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async () => {
    setSaving(true);
    try {
      if (initial?.id) await api.put(`/inventory/suppliers/${initial.id}`, form);
      else await api.post('/inventory/suppliers', form);
      toast.success('Proveedor guardado.');
      onSaved();
      onClose();
    } catch (e) { setErrors(e.fields || {}); if (!Object.keys(e.fields || {}).length) apiError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={initial?.id ? 'Editar proveedor' : 'Nuevo proveedor'} footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Guardar</Button></>}>
      <div className="form-grid">
        <Field label="Nombre" error={errors.name} className="span-2">{(a) => <input className="input" value={form.name} onChange={set('name')} {...a} />}</Field>
        <Field label="NIT" error={errors.nit}>{(a) => <input className="input" value={form.nit} onChange={set('nit')} {...a} />}</Field>
        <Field label="Contacto" error={errors.contact}>{(a) => <input className="input" value={form.contact} onChange={set('contact')} {...a} />}</Field>
        <Field label="Teléfono" error={errors.phone}>{(a) => <input className="input" value={form.phone} onChange={set('phone')} {...a} />}</Field>
        <Field label="Correo" error={errors.email}>{(a) => <input className="input" value={form.email} onChange={set('email')} {...a} />}</Field>
        <Field label="Dirección" error={errors.address} className="span-2">{(a) => <input className="input" value={form.address} onChange={set('address')} {...a} />}</Field>
        <label className="check span-2"><input type="checkbox" checked={form.active} onChange={set('active')} /> Proveedor activo</label>
      </div>
    </Modal>
  );
}

export function Suppliers() {
  const s = useSession();
  const { data, error, loading, reload } = useApi('/inventory/suppliers');
  const [edit, setEdit] = useState(null);
  return (
    <>
      <PageHeader title="Proveedores" description="Proveedores de mercadería con su historial de compras." actions={s.can('suppliers.manage') && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}><Plus size={16} /> Nuevo proveedor</button>} />
      <section className="panel">
        <DataTable
          rows={data}
          loading={loading}
          error={error}
          onRetry={reload}
          columns={[
            { key: 'name', label: 'Proveedor', render: (x) => <><b>{x.name}</b><div className="tiny muted">NIT {x.nit || '—'}</div></> },
            { key: 'contact', label: 'Contacto', render: (x) => <>{x.contact || '—'}<div className="tiny muted">{x.phone} {x.email ? `· ${x.email}` : ''}</div></>, hideSm: true },
            { key: 'purchases', label: 'Compras', className: 'r', render: (x) => <span className="num">{x.purchases}</span> },
            { key: 'total', label: 'Total comprado', className: 'r', render: (x) => <b className="num">{money(x.totalPurchased)}</b> },
            { key: 'last', label: 'Última compra', render: (x) => (x.lastPurchase ? dateOnly(x.lastPurchase) : '—') },
            { key: 'status', label: 'Estado', render: (x) => <Status value={x.active ? 'ACTIVO' : 'INACTIVO'} /> },
            s.can('suppliers.manage') && { key: 'act', label: '', render: (x) => <span className="row" style={{ '--gap': '4px' }}><button className="btn btn--ghost btn--sm" onClick={() => setEdit(x)}><Pencil size={14} /> Editar</button><Link className="btn btn--link btn--sm" to={`/admin/compras?supplierId=${x.id}`}>Compras</Link></span> },
          ].filter(Boolean)}
        />
      </section>
      {edit && <SupplierModal initial={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </>
  );
}

