import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bar } from 'react-chartjs-2';
import {
  Save, ImagePlus, Trash2, ArrowLeft, ArrowRight, Star, ExternalLink, Power, Plus, UploadCloud, PackagePlus,
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, ChartCard, AuditDiff } from '../../components/admin.jsx';
import { Button, ErrorState, Field, Img, Loader, Notice, Status, Tabs, Empty } from '../../components/ui.jsx';
import { money, dateTime, dateOnly, int, monthLabel } from '../../lib/format.js';
import { actionLabel } from '../../lib/labels.js';
import { confirm, toast, apiError, success } from '../../lib/alerts.js';
import { vbarOptions, barDataset } from '../../lib/charts.js';
import { MovementsTable } from './Inventory.jsx';

const EMPTY = {
  name: '', description: '', categoryId: '', sizeGuideId: '', basePrice: '', compareAtPrice: '', material: '', care: '', gender: 'UNISEX', featured: false, status: 'ACTIVO',
};

function GeneralForm({ value, onChange, errors, cats, guides, disabled }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="form-grid">
      <Field label="Nombre del producto" error={errors.name} className="span-2">{(a) => <input className="input" value={value.name} onChange={set('name')} disabled={disabled} {...a} />}</Field>
      <Field label="Categoría" error={errors.categoryId}>{(a) => <select className="select" value={value.categoryId} onChange={set('categoryId')} disabled={disabled} {...a}><option value="">Selecciona…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
      <Field label="Para">{(a) => <select className="select" value={value.gender} onChange={set('gender')} disabled={disabled} {...a}><option value="UNISEX">Unisex</option><option value="MUJER">Mujer</option><option value="HOMBRE">Hombre</option></select>}</Field>
      <Field label="Precio (Q)" error={errors.basePrice} hint="El precio se valida en el servidor y queda en la bitácora si cambia.">{(a) => <input className="input num" inputMode="decimal" value={value.basePrice} onChange={set('basePrice')} disabled={disabled} {...a} />}</Field>
      <Field label="Precio anterior (opcional)" error={errors.compareAtPrice} hint="Se muestra tachado; debe ser mayor que el precio.">{(a) => <input className="input num" inputMode="decimal" value={value.compareAtPrice ?? ''} onChange={set('compareAtPrice')} disabled={disabled} {...a} />}</Field>
      <Field label="Descripción" error={errors.description} className="span-2">{(a) => <textarea className="textarea" value={value.description} onChange={set('description')} disabled={disabled} {...a} />}</Field>
      <Field label="Material" error={errors.material}>{(a) => <input className="input" value={value.material || ''} onChange={set('material')} placeholder="100 % algodón pima" disabled={disabled} {...a} />}</Field>
      <Field label="Guía de tallas">{(a) => <select className="select" value={value.sizeGuideId || ''} onChange={set('sizeGuideId')} disabled={disabled} {...a}><option value="">Sin guía</option>{guides.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}</Field>
      <Field label="Cuidados" error={errors.care} className="span-2">{(a) => <input className="input" value={value.care || ''} onChange={set('care')} placeholder="Lavar a máquina en frío, no usar secadora…" disabled={disabled} {...a} />}</Field>
      <Field label="Estado">{(a) => <select className="select" value={value.status} onChange={set('status')} disabled={disabled} {...a}><option value="ACTIVO">Activo (visible en la tienda)</option><option value="BORRADOR">Borrador (oculto)</option><option value="INACTIVO">Inactivo (oculto, conserva historial)</option></select>}</Field>
      <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={!!value.featured} onChange={set('featured')} disabled={disabled} /> Destacar en la portada</label>
    </div>
  );
}

function VariantMatrix({ sizes, colors, sel, setSel, stock, setStock, unitCost, setUnitCost, errors }) {
  const toggle = (k, id) => setSel((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((v) => v !== id) : [...x[k], id] }));
  const selSizes = sizes.filter((z) => sel.sizes.includes(z.id));
  const selColors = colors.filter((c) => sel.colors.includes(c.id));
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div>
        <div className="label mb-1">Tallas</div>
        <div className="size-chips">{sizes.map((z) => <button type="button" key={z.id} className={`size-chip ${sel.sizes.includes(z.id) ? 'on' : ''}`} aria-pressed={sel.sizes.includes(z.id)} onClick={() => toggle('sizes', z.id)}>{z.code}</button>)}</div>
        {errors.sizeIds && <p className="field-error mt-1">{errors.sizeIds}</p>}
      </div>
      <div>
        <div className="label mb-1">Colores</div>
        <div className="color-pick">{colors.map((c) => (
          <button type="button" key={c.id} className={`color-pick__item ${sel.colors.includes(c.id) ? 'on' : ''}`} aria-pressed={sel.colors.includes(c.id)} onClick={() => toggle('colors', c.id)}>
            <span style={{ background: c.hex }} />{c.name}
          </button>
        ))}</div>
        {errors.colorIds && <p className="field-error mt-1">{errors.colorIds}</p>}
      </div>
      {selSizes.length > 0 && selColors.length > 0 && (
        <div>
          <div className="label mb-1">Existencia inicial por variante (opcional) · se registra en el kardex como inventario inicial</div>
          <div className="table-wrap">
            <table className="table matrix">
              <thead><tr><th>Color \ Talla</th>{selSizes.map((z) => <th key={z.id} className="c">{z.code}</th>)}</tr></thead>
              <tbody>
                {selColors.map((c) => (
                  <tr key={c.id}>
                    <td><span className="swatch-dot" style={{ background: c.hex, display: 'inline-block', verticalAlign: '-2px', marginRight: 8 }} />{c.name}</td>
                    {selSizes.map((z) => (
                      <td key={z.id} className="c"><input className="input input--sm num" style={{ width: 70, textAlign: 'center' }} inputMode="numeric" value={stock[`${z.id}-${c.id}`] || ''} onChange={(e) => setStock((s) => ({ ...s, [`${z.id}-${c.id}`]: e.target.value.replace(/\D/g, '').slice(0, 5) }))} aria-label={`Existencia ${c.name} ${z.code}`} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-grid mt-2"><Field label="Costo unitario (Q, opcional)">{(a) => <input className="input num" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} {...a} />}</Field></div>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>Se crearán {selSizes.length * selColors.length} variantes con SKU único.</p>
        </div>
      )}
    </div>
  );
}

function VariantsTab({ p, reload, canManage, sizes, colors }) {
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState({ sizes: [], colors: [] });
  const [saving, setSaving] = useState(false);
  const [prices, setPrices] = useState({});
  const toggleActive = async (v) => {
    try {
      await api.put(`/catalog/admin/variants/${v.id}`, { active: !v.active });
      toast.success(v.active ? `Variante ${v.sku} desactivada.` : `Variante ${v.sku} activada.`);
      reload();
    } catch (e) { apiError(e); }
  };
  const savePrice = async (v) => {
    const raw = prices[v.id];
    if (raw === undefined) return;
    try {
      await api.put(`/catalog/admin/variants/${v.id}`, { price: raw === '' ? null : Number(raw) });
      toast.success(raw === '' ? 'La variante usa el precio del producto.' : `Precio de ${v.sku} actualizado.`);
      setPrices((x) => { const n = { ...x }; delete n[v.id]; return n; });
      reload();
    } catch (e) { apiError(e); }
  };
  const add = async () => {
    if (!sel.sizes.length || !sel.colors.length) return toast.error('Selecciona al menos una talla y un color.');
    setSaving(true);
    try {
      const r = await api.post(`/catalog/admin/products/${p.id}/variants`, { sizeIds: sel.sizes, colorIds: sel.colors });
      toast.success(r.created ? `Se crearon ${r.created} variantes.` : 'Esas combinaciones ya existían.');
      setAdding(false);
      setSel({ sizes: [], colors: [] });
      reload();
    } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <div className="stack">
      <div className="row row--between row--wrap">
        <span className="small muted">Cada combinación de talla y color tiene un SKU único y su propia existencia física, reservada y disponible.</span>
        {canManage && <button className="btn btn--ghost btn--sm" onClick={() => setAdding((a) => !a)}><Plus size={15} /> Agregar combinaciones</button>}
      </div>
      <AnimatePresence>
        {adding && (
          <motion.div className="well" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <VariantMatrix sizes={sizes} colors={colors} sel={sel} setSel={setSel} stock={{}} setStock={() => {}} unitCost="" setUnitCost={() => {}} errors={{}} />
            <div className="row row--end mt-2"><Button className="btn btn--primary btn--sm" loading={saving} onClick={add}>Crear variantes</Button></div>
            <p className="tiny muted" style={{ margin: 0 }}>Para cargar existencias de las nuevas variantes usa Inventario → movimiento “Inventario inicial” o registra una compra.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <DataTable
        rows={p.variants}
        columns={[
          { key: 'sku', label: 'SKU', render: (v) => <span className="num small strong">{v.sku}</span> },
          { key: 'opt', label: 'Variante', render: (v) => <span className="row" style={{ '--gap': '8px' }}><span className="swatch-dot" style={{ background: v.hex }} />{v.color} · {v.size}</span> },
          {
            key: 'price', label: 'Precio propio', render: (v) => canManage ? (
              <span className="row" style={{ '--gap': '6px' }}>
                <input className="input input--sm num" style={{ width: 96 }} placeholder={Number(p.basePrice).toFixed(2)} value={prices[v.id] ?? (v.price ? Number(v.price).toFixed(2) : '')} onChange={(e) => setPrices((x) => ({ ...x, [v.id]: e.target.value }))} aria-label={`Precio de ${v.sku}`} />
                {prices[v.id] !== undefined && <button className="btn btn--soft btn--sm" onClick={() => savePrice(v)}>Guardar</button>}
              </span>
            ) : (v.price ? money(v.price) : <span className="muted">Del producto</span>),
          },
          { key: 'physical', label: 'Física', className: 'r', render: (v) => <span className="num">{v.physical}</span> },
          { key: 'reserved', label: 'Reservada', className: 'r', render: (v) => <span className="num">{v.reserved}</span> },
          { key: 'available', label: 'Disponible', className: 'r', render: (v) => <span className={`num strong ${v.available <= (v.minStock ?? 0) ? 'text-warn' : ''}`}>{v.available}</span> },
          { key: 'kardex', label: '', render: (v) => <Link to={`/admin/kardex?variantId=${v.id}`} className="small" onClick={(e) => e.stopPropagation()}>Kardex</Link> },
          { key: 'active', label: 'Activa', render: (v) => canManage ? <button className={`switch ${v.active ? 'on' : ''}`} role="switch" aria-checked={v.active} onClick={() => toggleActive(v)} aria-label={`Activar ${v.sku}`}><span /></button> : <Status value={v.active ? 'ACTIVO' : 'INACTIVO'} /> },
        ]}
      />
    </div>
  );
}

function ImagesTab({ p, reload, canManage, colors }) {
  const [order, setOrder] = useState(p.images.map((i) => i.id));
  const [colorId, setColorId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => setOrder(p.images.map((i) => i.id)), [p.images]);
  const byId = new Map(p.images.map((i) => [i.id, i]));
  const productColors = colors.filter((c) => p.variants.some((v) => v.colorId === c.id));
  const upload = async (files) => {
    const list = [...(files || [])].filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
    if (!list.length) return toast.error('Selecciona imágenes JPG, PNG o WebP.');
    if (list.some((f) => f.size > 5 * 1024 * 1024)) return toast.error('Cada imagen debe pesar menos de 5 MB.');
    const fd = new FormData();
    list.slice(0, 8).forEach((f) => fd.append('images', f));
    if (colorId) fd.append('colorId', colorId);
    setUploading(true);
    try {
      const created = await api.post(`/catalog/admin/products/${p.id}/images`, fd);
      toast.success(`${created.length} imagen(es) cargada(s). Ya se ven en la tienda.`);
      reload();
    } catch (e) { apiError(e); } finally { setUploading(false); }
  };
  const move = async (idx, dir) => {
    const next = [...order];
    const [x] = next.splice(idx, 1);
    next.splice(dir === 'first' ? 0 : idx + dir, 0, x);
    setOrder(next);
    try { await api.put(`/catalog/admin/products/${p.id}/images/order`, { order: next }); } catch (e) { apiError(e); reload(); }
  };
  const remove = async (img) => {
    if (!(await confirm({ title: '¿Eliminar esta imagen?', text: 'Dejará de mostrarse en la tienda.', confirmText: 'Eliminar', danger: true, icon: 'warning' }))) return;
    try { await api.del(`/catalog/admin/images/${img.id}`); toast.success('Imagen eliminada.'); reload(); } catch (e) { apiError(e); }
  };
  const setColor = async (img, c) => {
    try { await api.put(`/catalog/admin/images/${img.id}`, { colorId: c ? Number(c) : null }); toast.success('Color de la imagen actualizado.'); reload(); } catch (e) { apiError(e); }
  };
  return (
    <div className="stack">
      {canManage && (
        <div
          className={`dropzone dropzone--wide ${drag ? 'is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        >
          <UploadCloud size={32} />
          <span className="strong">{uploading ? 'Subiendo y optimizando…' : 'Arrastra fotos del producto o elige archivos'}</span>
          <span className="tiny muted">JPG, PNG o WebP · mínimo 300 × 300 px · máx. 5 MB c/u. Se validan en el servidor y se convierten a WebP sin metadatos.</span>
          <div className="row row--wrap" style={{ justifyContent: 'center' }}>
            <select className="select select--sm" style={{ width: 'auto' }} value={colorId} onChange={(e) => setColorId(e.target.value)} aria-label="Color de las imágenes">
              <option value="">Para todos los colores</option>
              {productColors.map((c) => <option key={c.id} value={c.id}>Color {c.name}</option>)}
            </select>
            <Button className="btn btn--primary btn--sm" loading={uploading} onClick={() => inputRef.current?.click()}><ImagePlus size={15} /> Elegir imágenes</Button>
          </div>
          <input ref={inputRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {order.length === 0 ? <Empty title="Sin imágenes">Sube al menos una foto para que el producto se vea bien en la tienda.</Empty> : (
        <motion.div className="img-grid" layout>
          {order.map((imgId, idx) => {
            const img = byId.get(imgId);
            if (!img) return null;
            return (
              <motion.figure key={img.id} layout className="img-card" transition={{ type: 'spring', stiffness: 400, damping: 34 }}>
                <div className="img-card__media"><Img src={img.thumbUrl} alt={img.alt || p.name} />{idx === 0 && <span className="flag flag--new img-card__main">Principal</span>}</div>
                <figcaption>
                  {canManage ? (
                    <select className="select select--sm" value={img.colorId || ''} onChange={(e) => setColor(img, e.target.value)} aria-label="Color de la imagen">
                      <option value="">Todos los colores</option>
                      {productColors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : <span className="small">{img.color?.name || 'Todos los colores'}</span>}
                  {canManage && (
                    <div className="row row--between" style={{ '--gap': '4px' }}>
                      <button className="btn btn--icon btn--ghost btn--sm" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Mover a la izquierda"><ArrowLeft size={15} /></button>
                      <button className="btn btn--icon btn--ghost btn--sm" disabled={idx === 0} onClick={() => move(idx, 'first')} aria-label="Hacer principal" title="Hacer principal"><Star size={15} /></button>
                      <button className="btn btn--icon btn--ghost btn--sm" disabled={idx === order.length - 1} onClick={() => move(idx, 1)} aria-label="Mover a la derecha"><ArrowRight size={15} /></button>
                      <button className="btn btn--icon btn--ghost btn--sm" style={{ color: 'var(--grana)' }} onClick={() => remove(img)} aria-label="Eliminar imagen"><Trash2 size={15} /></button>
                    </div>
                  )}
                </figcaption>
              </motion.figure>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function PurchasesTab({ productId }) {
  const { data, loading, error, reload } = useApi(`/inventory/products/${productId}/purchases`);
  const total = (data || []).filter((x) => x.status === 'REGISTRADA').reduce((a, x) => ({ u: a.u + x.quantity, q: a.q + Number(x.subtotal) }), { u: 0, q: 0 });
  return (
    <div className="stack">
      {data && <div className="row row--wrap small"><span className="chip chip--outline">{int(total.u)} unidades compradas</span><span className="chip chip--outline">{money(total.q)} en compras</span><span className="chip chip--outline">{new Set(data.map((d) => d.supplier)).size} proveedores</span></div>}
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => `${r.purchaseId}-${r.sku}`}
        empty="Este producto aún no tiene compras a proveedores."
        columns={[
          { key: 'code', label: 'Compra', render: (r) => <><Link to={`/admin/compras/${r.purchaseId}`} className="num strong">{r.code}</Link><div className="tiny muted">{dateOnly(r.date)}</div></> },
          { key: 'supplier', label: 'Proveedor', render: (r) => <>{r.supplier}<div className="tiny muted">Doc. {r.documentNumber}</div></> },
          { key: 'sku', label: 'Variante', render: (r) => <>{r.color} · {r.size}<div className="tiny muted num">{r.sku}</div></> },
          { key: 'qty', label: 'Cant.', className: 'r', render: (r) => <span className="num">{r.quantity}</span> },
          { key: 'cost', label: 'Costo u.', className: 'r', render: (r) => <span className="num">{money(r.unitCost)}</span> },
          { key: 'sub', label: 'Subtotal', className: 'r', render: (r) => <span className="num strong">{money(r.subtotal)}</span> },
          { key: 'status', label: 'Estado', render: (r) => <Status value={r.status} /> },
        ]}
      />
    </div>
  );
}

function SalesTab({ productId }) {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/sales/admin/products/${productId}/sales`);
  const lines = data?.lines || [];
  const active = lines.filter((l) => l.status !== 'CANCELADO');
  return (
    <div className="stack">
      {data && (
        <div className="row row--wrap small">
          <span className="chip chip--outline">{int(active.reduce((a, l) => a + l.quantity, 0))} unidades vendidas</span>
          <span className="chip chip--outline">{money(active.reduce((a, l) => a + Number(l.total), 0))} en ventas</span>
          <span className="chip chip--outline">{lines.length - active.length} líneas canceladas</span>
        </div>
      )}
      {data?.monthly?.length > 0 && (
        <ChartCard title="Unidades vendidas por mes" height={220}
          table={<table className="table"><thead><tr><th>Mes</th><th className="r">Unidades</th><th className="r">Ventas</th></tr></thead><tbody>{data.monthly.map((m) => <tr key={m.month}><td>{monthLabel(`${m.month}-01`)}</td><td className="r num">{m.units || 0}</td><td className="r num">{money(m.revenue)}</td></tr>)}</tbody></table>}>
          <Bar data={{ labels: data.monthly.map((m) => monthLabel(`${m.month}-01`)), datasets: [barDataset('Unidades', data.monthly.map((m) => m.units || 0), 0)] }} options={vbarOptions()} />
        </ChartCard>
      )}
      <DataTable
        rows={lines.slice(0, 200)}
        loading={loading}
        error={error}
        onRetry={reload}
        rowKey={(r) => `${r.orderId}-${r.sku}`}
        onRowClick={(r) => navigate(`/admin/pedidos/${r.orderId}`)}
        empty="Este producto aún no tiene ventas."
        columns={[
          { key: 'code', label: 'Pedido', render: (r) => <><b className="num">{r.code}</b><div className="tiny muted">{dateTime(r.date)}</div></> },
          { key: 'customer', label: 'Cliente', render: (r) => r.customer, hideSm: true },
          { key: 'var', label: 'Variante', render: (r) => <>{r.color} · {r.size}<div className="tiny muted num">{r.sku}</div></> },
          { key: 'qty', label: 'Cant.', className: 'r', render: (r) => <span className="num">{r.quantity}</span> },
          { key: 'total', label: 'Total', className: 'r', render: (r) => <><span className="num strong">{money(r.total)}</span>{Number(r.discount) > 0 && <div className="tiny muted num">− {money(r.discount)}</div>}</> },
          { key: 'status', label: 'Estado', render: (r) => <Status value={r.status} /> },
        ]}
      />
    </div>
  );
}

function AuditTab({ history }) {
  if (!history?.length) return <Empty title="Sin cambios registrados">Los cambios de precio, estado, imágenes y variantes aparecerán aquí.</Empty>;
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      {history.map((h) => (
        <div key={h.id} className="well">
          <div className="row row--between row--wrap"><b>{actionLabel(h.action)}</b><span className="tiny muted">{dateTime(h.createdAt)} · {h.userEmail || 'Sistema'}</span></div>
          <div className="mt-1"><AuditDiff before={h.before} after={h.after} /></div>
        </div>
      ))}
    </div>
  );
}

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id;
  const s = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'general';
  const canManage = s.can('catalog.manage');
  const cats = useApi('/catalog/admin/categories');
  const guides = useApi('/catalog/admin/size-guides');
  const sizes = useApi('/catalog/sizes', null, { auth: false });
  const colors = useApi('/catalog/colors', null, { auth: false });
  const prod = useApi(isNew ? null : `/catalog/admin/products/${id}`, null, { enabled: !isNew, keepPrevious: true });
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState({ sizes: [], colors: [] });
  const [stock, setStock] = useState({});
  const [unitCost, setUnitCost] = useState('');

  useEffect(() => {
    const p = prod.data;
    if (!p) return;
    setForm({
      name: p.name, description: p.description, categoryId: String(p.categoryId), sizeGuideId: p.sizeGuideId ? String(p.sizeGuideId) : '', basePrice: Number(p.basePrice).toFixed(2),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice).toFixed(2) : '', material: p.material || '', care: p.care || '', gender: p.gender, featured: p.featured, status: p.status,
    });
  }, [prod.data]);

  const p = prod.data;
  const tabs = useMemo(() => [
    { value: 'general', label: 'General' },
    { value: 'variantes', label: 'Variantes', count: p?.variants.length },
    { value: 'imagenes', label: 'Imágenes', count: p?.images.length },
    s.can('inventory.read', 'catalog.read') && { value: 'compras', label: 'Historial de compras' },
    s.can('orders.read', 'catalog.read') && { value: 'ventas', label: 'Historial de ventas' },
    s.can('inventory.read') && { value: 'kardex', label: 'Kardex' },
    { value: 'auditoria', label: 'Cambios', count: p?.history?.length },
  ].filter(Boolean), [p, s]);

  if (!isNew && prod.error) return <ErrorState error={prod.error} onRetry={prod.reload} />;
  if ((!isNew && !p) || !cats.data || !sizes.data || !colors.data) return <Loader />;

  const payload = () => ({
    ...form, categoryId: Number(form.categoryId) || 0, sizeGuideId: form.sizeGuideId ? Number(form.sizeGuideId) : null, basePrice: form.basePrice,
    compareAtPrice: form.compareAtPrice === '' ? null : form.compareAtPrice, material: form.material || null, care: form.care || null,
  });

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (isNew) {
        const initialStock = Object.entries(stock).filter(([, q]) => Number(q) > 0).map(([k, q]) => { const [sizeId, colorId] = k.split('-').map(Number); return { sizeId, colorId, quantity: Number(q) }; })
          .filter((x) => sel.sizes.includes(x.sizeId) && sel.colors.includes(x.colorId));
        const created = await api.post('/catalog/admin/products', { ...payload(), sizeIds: sel.sizes, colorIds: sel.colors, initialStock, unitCost: unitCost === '' ? null : Number(unitCost) });
        await success('Producto creado', `${created.variants.length} variantes con SKU único.${created.stockWarning ? ` ${created.stockWarning}` : ' Ahora sube sus fotos.'}`);
        navigate(`/admin/productos/${created.id}?tab=imagenes`, { replace: true });
      } else {
        await api.put(`/catalog/admin/products/${id}`, payload());
        toast.success('Cambios guardados.');
        prod.reload();
      }
    } catch (e) {
      setErrors(e.fields || {});
      if (!Object.keys(e.fields || {}).length) apiError(e);
      else toast.error('Revisa los campos marcados.');
    } finally { setSaving(false); }
  };

  const toggleStatus = async () => {
    const next = p.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    if (!(await confirm({ title: next === 'INACTIVO' ? '¿Desactivar el producto?' : '¿Activar el producto?', text: next === 'INACTIVO' ? 'Dejará de mostrarse en la tienda, pero conservará su historial de ventas y kardex.' : 'Volverá a mostrarse en la tienda.', confirmText: next === 'INACTIVO' ? 'Desactivar' : 'Activar', danger: next === 'INACTIVO' }))) return;
    try { await api.post(`/catalog/admin/products/${id}/status`, { status: next }); toast.success(next === 'INACTIVO' ? 'Producto desactivado.' : 'Producto activado.'); prod.reload(); } catch (e) { apiError(e); }
  };
  const remove = async () => {
    if (!(await confirm({ title: '¿Eliminar el producto?', text: 'Solo es posible si no tiene ventas ni movimientos de inventario. Si los tiene, desactívalo.', confirmText: 'Eliminar', danger: true, icon: 'warning' }))) return;
    try { await api.del(`/catalog/admin/products/${id}`); toast.success('Producto eliminado.'); navigate('/admin/productos'); } catch (e) { apiError(e); }
  };

  return (
    <>
      <PageHeader
        back={{ to: '/admin/productos', label: 'Productos' }}
        title={isNew ? 'Nuevo producto' : p.name}
        description={isNew ? 'Completa los datos, elige tallas y colores; luego podrás subir las fotos.' : `${p.category.name} · ${int(p.stock.available)} disponibles · ${int(p.sales.units)} vendidas (${money(p.sales.revenue)})`}
        actions={!isNew && (
          <>
            {p.status === 'ACTIVO' && <a className="btn btn--ghost btn--sm" href={`/producto/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Ver en la tienda</a>}
            {s.can('inventory.move', 'suppliers.manage') && <Link className="btn btn--ghost btn--sm" to={`/admin/compras/nueva?productId=${p.id}`}><PackagePlus size={15} /> Registrar compra</Link>}
            {canManage && <button className="btn btn--ghost btn--sm" onClick={toggleStatus}><Power size={15} /> {p.status === 'ACTIVO' ? 'Desactivar' : 'Activar'}</button>}
            {canManage && <button className="btn btn--ghost btn--sm" style={{ color: 'var(--grana)' }} onClick={remove}><Trash2 size={15} /> Eliminar</button>}
            {canManage && tab === 'general' && <Button className="btn btn--primary btn--sm" loading={saving} onClick={save}><Save size={15} /> Guardar</Button>}
          </>
        )}
      />
      {!isNew && <Tabs id="prod-tabs" tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />}
      <div className="mt-3">
        {(isNew || tab === 'general') && (
          <div className="adm-detail">
            <section className="panel">
              <div className="panel__head"><h2>Datos del producto</h2>{!isNew && <Status value={p.status} />}</div>
              <div className="panel__body"><GeneralForm value={form} onChange={setForm} errors={errors} cats={cats.data} guides={guides.data || []} disabled={!canManage} /></div>
            </section>
            {isNew ? (
              <section className="panel">
                <div className="panel__head"><h2>Variantes</h2></div>
                <div className="panel__body">
                  <VariantMatrix sizes={sizes.data} colors={colors.data.filter((c) => c.active)} sel={sel} setSel={setSel} stock={stock} setStock={setStock} unitCost={unitCost} setUnitCost={setUnitCost} errors={errors} />
                </div>
                <div className="panel__foot"><Button className="btn btn--primary" loading={saving} onClick={save}><Save size={16} /> Crear producto</Button></div>
              </section>
            ) : (
              <aside className="stack" style={{ '--gap': '20px' }}>
                <section className="panel"><div className="panel__body"><Img src={p.images[0]?.url} alt={p.name} className="cover-preview" /></div></section>
                <section className="panel">
                  <div className="panel__head"><h2>Existencias</h2></div>
                  <div className="panel__body stock-trio">
                    <div><small>Física</small><b>{int(p.stock.physical)}</b></div>
                    <div><small>Reservada</small><b>{int(p.stock.reserved)}</b></div>
                    <div><small>Disponible</small><b>{int(p.stock.available)}</b></div>
                  </div>
                </section>
                {!canManage && <Notice tone="info">Tu rol puede consultar el catálogo, pero no modificarlo.</Notice>}
              </aside>
            )}
          </div>
        )}
        {!isNew && tab === 'variantes' && <section className="panel"><div className="panel__body"><VariantsTab p={p} reload={prod.reload} canManage={canManage} sizes={sizes.data} colors={colors.data} /></div></section>}
        {!isNew && tab === 'imagenes' && <section className="panel"><div className="panel__body"><ImagesTab p={p} reload={prod.reload} canManage={canManage} colors={colors.data} /></div></section>}
        {!isNew && tab === 'compras' && <section className="panel"><div className="panel__body"><PurchasesTab productId={p.id} /></div></section>}
        {!isNew && tab === 'ventas' && <section className="panel"><div className="panel__body"><SalesTab productId={p.id} /></div></section>}
        {!isNew && tab === 'kardex' && <section className="panel"><div className="panel__body"><MovementsTable query={{ productId: p.id }} compact /></div></section>}
        {!isNew && tab === 'auditoria' && <section className="panel"><div className="panel__body"><AuditTab history={p.history} /></div></section>}
      </div>
    </>
  );
}

