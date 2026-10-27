import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Plus, Undo2, Boxes, PackageX, AlertTriangle, Lock, Coins, Layers } from 'lucide-react';
import { api, newKey } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, SearchInput, Toolbar, ExportButton, Kpi } from '../../components/admin.jsx';
import { Button, Field, Img, Loader, Modal, Notice, Pagination, Status, Tabs } from '../../components/ui.jsx';
import { money, date, time, int } from '../../lib/format.js';
import { MOVEMENT_LABELS } from '../../lib/labels.js';
import { promptText, toast, apiError } from '../../lib/alerts.js';
import { useParamsState } from './Orders.jsx';

export function VariantPicker({ value, onChange, autoFocus }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useApi('/inventory/stock', { search: term || undefined, pageSize: 8 }, { enabled: open && term.length >= 2 });
  return (
    <div className="picker">
      {value ? (
        <div className="picker__value">
          <Img src={value.image} alt="" className="thumb" />
          <div className="grow"><div className="strong">{value.productName}</div><div className="tiny muted">{value.sku} · {value.color} · {value.size} · disponible {value.available}</div></div>
          <button type="button" className="btn btn--link btn--sm" onClick={() => onChange(null)}>Cambiar</button>
        </div>
      ) : (
        <>
          <input className="input" autoFocus={autoFocus} placeholder="Escribe un SKU o nombre de producto (mín. 2 letras)" value={term} onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Buscar variante" />
          {open && term.length >= 2 && (
            <div className="picker__list" role="listbox">
              {!data ? <div className="small muted" style={{ padding: 12 }}>Buscando…</div> : data.items.length === 0 ? <div className="small muted" style={{ padding: 12 }}>Sin coincidencias.</div> : data.items.map((v) => (
                <button type="button" key={v.variantId} role="option" aria-selected="false" className="picker__opt" onClick={() => { onChange(v); setOpen(false); setTerm(''); }}>
                  <Img src={v.image} alt="" className="thumb" />
                  <span className="grow"><span className="strong">{v.productName}</span><span className="tiny muted" style={{ display: 'block' }}>{v.sku} · {v.color} · {v.size}</span></span>
                  <span className="tiny num">{v.available} disp.</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MovementModal({ open, onClose, initialVariant, onDone }) {
  const meta = useApi('/inventory/meta', null, { enabled: open });
  const suppliers = useApi('/inventory/suppliers', null, { enabled: open });
  const [variant, setVariant] = useState(initialVariant || null);
  const [form, setForm] = useState({ type: 'ENTRADA_AJUSTE', quantity: '', reason: '', documentRef: '', supplierId: '', unitCost: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [key] = useState(newKey);
  useEffect(() => { setVariant(initialVariant || null); }, [initialVariant]);
  const types = (meta.data?.types || []).filter((t) => t.manual);
  const t = types.find((x) => x.code === form.type);
  const qty = Number(form.quantity) || 0;
  const after = variant && t ? (t.direction === 'ENTRADA' ? variant.physical + qty : variant.physical - qty) : null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (!variant) return setErrors({ variantId: 'Selecciona una variante.' });
    setSaving(true);
    setErrors({});
    try {
      await api.post('/inventory/movements', {
        variantId: variant.variantId, type: form.type, quantity: form.quantity, reason: form.reason, documentRef: form.documentRef || null,
        supplierId: form.supplierId ? Number(form.supplierId) : null, unitCost: form.unitCost === '' ? null : form.unitCost,
      }, { idempotencyKey: key });
      toast.success(`Movimiento registrado en el kardex de ${variant.sku}.`);
      onDone?.();
      onClose();
    } catch (e) {
      setErrors(e.fields || {});
      if (!Object.keys(e.fields || {}).length) apiError(e);
    } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Registrar movimiento de inventario" wide
      footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Registrar movimiento</Button></>}>
      <div className="stack">
        <Field label="Variante" error={errors.variantId}>{() => <VariantPicker value={variant} onChange={setVariant} autoFocus={!initialVariant} />}</Field>
        <div className="form-grid">
          <Field label="Tipo de movimiento" error={errors.type}>
            {(a) => <select className="select" value={form.type} onChange={set('type')} {...a}>{types.map((x) => <option key={x.code} value={x.code}>{x.direction === 'ENTRADA' ? '↓ ' : '↑ '}{x.label}</option>)}</select>}
          </Field>
          <Field label="Cantidad" error={errors.quantity}>{(a) => <input className="input num" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value.replace(/\D/g, '').slice(0, 5) }))} {...a} />}</Field>
          <Field label="Motivo / justificación" error={errors.reason} className="span-2" hint="Obligatorio: queda en el kardex y en la bitácora de auditoría.">
            {(a) => <textarea className="textarea" style={{ minHeight: 70 }} value={form.reason} onChange={set('reason')} placeholder="Ej.: conteo físico del 23/10 encontró 2 unidades más" {...a} />}
          </Field>
          <Field label="Documento de respaldo (opcional)" error={errors.documentRef}>{(a) => <input className="input" value={form.documentRef} onChange={set('documentRef')} placeholder="Acta, nota de envío…" {...a} />}</Field>
          {form.type === 'SALIDA_DEVOLUCION_PROVEEDOR' && (
            <Field label="Proveedor" error={errors.supplierId}>{(a) => <select className="select" value={form.supplierId} onChange={set('supplierId')} {...a}><option value="">Selecciona…</option>{(suppliers.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
          )}
          {t?.direction === 'ENTRADA' && <Field label="Costo unitario (Q, opcional)" error={errors.unitCost}>{(a) => <input className="input num" inputMode="decimal" value={form.unitCost} onChange={set('unitCost')} {...a} />}</Field>}
        </div>
        {variant && t && qty > 0 && (
          <div className={`notice ${after < 0 || after < variant.reserved ? 'notice--bad' : 'notice--info'}`}>
            {t.direction === 'ENTRADA' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
            <div>Existencia física: <b className="num">{variant.physical}</b> → <b className="num">{after}</b> · reservada {variant.reserved} · disponible después <b className="num">{after - variant.reserved}</b>
              {after < variant.reserved && <div className="small">No se puede: dejaría sin respaldo unidades reservadas para pedidos.</div>}
            </div>
          </div>
        )}
        <p className="tiny muted" style={{ margin: 0 }}><Lock size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Los movimientos no se editan ni se borran: un error se corrige con un movimiento compensatorio (regla 9).</p>
      </div>
    </Modal>
  );
}

export function StockList() {
  const s = useSession();
  const [f, set] = useParamsState({ page: '1' });
  const cats = useApi('/catalog/admin/categories');
  const summary = useApi('/inventory/stock/summary');
  const { data, error, loading, reload } = useApi('/inventory/stock', { ...f, pageSize: 25 });
  const [mov, setMov] = useState(null);
  const [mins, setMins] = useState({});
  const canMove = s.can('inventory.move');
  const saveMin = async (v) => {
    try {
      await api.put(`/inventory/stock/${v.variantId}/min`, { minStock: mins[v.variantId] });
      toast.success(`Mínimo de ${v.sku} actualizado.`);
      setMins((m) => { const n = { ...m }; delete n[v.variantId]; return n; });
      reload();
      summary.reload();
    } catch (e) { apiError(e); }
  };
  const sm = summary.data;
  return (
    <>
      <PageHeader
        title="Existencias"
        description="Existencia física (en bodega), reservada (apartada por pedidos confirmados) y disponible para vender, por talla y color."
        actions={canMove && <button className="btn btn--primary btn--sm" onClick={() => setMov({})}><Plus size={16} /> Registrar movimiento</button>}
      />
      {sm && (
        <div className="kpis kpis--compact mb-3">
          <Kpi label="Variantes" value={int(sm.variants)} icon={Layers} />
          <Kpi label="Unidades físicas" value={int(sm.physical)} icon={Boxes} />
          <Kpi label="Reservadas" value={int(sm.reserved)} icon={Lock} hint="por pedidos" />
          <Kpi label="Disponibles" value={int(sm.available)} icon={Boxes} />
          <Kpi label="Bajo el mínimo" value={int(sm.low)} icon={AlertTriangle} tone="warn" to="/admin/inventario?filtro=bajas" />
          <Kpi label="Valor al costo" value={money(sm.inventoryCost)} icon={Coins} hint={`${int(sm.out)} agotadas`} />
        </div>
      )}
      <Tabs id="stock-tabs" value={f.filtro || ''} onChange={(v) => set({ filtro: v })} tabs={[{ value: '', label: 'Todas' }, { value: 'bajas', label: 'Bajo el mínimo' }, { value: 'agotadas', label: 'Agotadas' }, { value: 'reservadas', label: 'Con reservas' }]} />
      <Toolbar>
        <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="SKU o producto" />
        <select className="select select--sm" value={f.categoryId || ''} onChange={(e) => set({ categoryId: e.target.value })} aria-label="Categoría">
          <option value="">Categoría: todas</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {data && <span className="small muted">{int(data.total)} variantes</span>}
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          rowKey={(v) => v.variantId}
          columns={[
            { key: 'p', label: 'Producto', render: (v) => <div className="row" style={{ '--gap': '10px' }}><Img src={v.image} alt="" className="thumb" /><div><Link to={`/admin/productos/${v.productId}`} className="strong">{v.productName}</Link><div className="tiny muted num">{v.sku}</div></div></div> },
            { key: 'var', label: 'Variante', render: (v) => <span className="row" style={{ '--gap': '6px' }}><span className="swatch-dot" style={{ background: v.colorHex }} />{v.color} · {v.size}</span> },
            { key: 'physical', label: 'Física', className: 'r', render: (v) => <span className="num">{v.physical}</span> },
            { key: 'reserved', label: 'Reservada', className: 'r', render: (v) => <span className="num">{v.reserved}</span> },
            { key: 'available', label: 'Disponible', className: 'r', render: (v) => <b className="num">{v.available}</b> },
            {
              key: 'min', label: 'Mínimo', className: 'r', render: (v) => canMove ? (
                <span className="row row--end" style={{ '--gap': '4px' }}>
                  <input className="input input--sm num" style={{ width: 64, textAlign: 'right' }} value={mins[v.variantId] ?? v.minStock} onChange={(e) => setMins((m) => ({ ...m, [v.variantId]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} aria-label={`Mínimo de ${v.sku}`} />
                  {mins[v.variantId] !== undefined && <button className="btn btn--soft btn--sm" onClick={() => saveMin(v)}>OK</button>}
                </span>
              ) : <span className="num">{v.minStock}</span>,
            },
            { key: 'st', label: 'Alerta', render: (v) => (v.available <= 0 ? <Status tone="bad" text="Agotada" /> : v.low ? <Status tone="warn" text="Bajo el mínimo" /> : <Status tone="ok" text="Normal" />) },
            {
              key: 'act', label: '', render: (v) => (
                <span className="row" style={{ '--gap': '4px' }}>
                  {canMove && <button className="btn btn--ghost btn--sm" onClick={() => setMov(v)}>Movimiento</button>}
                  <Link className="btn btn--link btn--sm" to={`/admin/kardex?variantId=${v.variantId}`}>Kardex</Link>
                </span>
              ),
            },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
      {mov && <MovementModal open={!!mov} onClose={() => setMov(null)} initialVariant={mov.variantId ? mov : null} onDone={() => { reload(); summary.reload(); }} />}
    </>
  );
}

const ORDER_TYPES = ['SALIDA_VENTA', 'SALIDA_CAMBIO', 'ENTRADA_DEVOLUCION'];

function refLink(m) {
  if (!m.referenceCode) return m.referenceType ? <span className="tiny muted">{m.referenceType.toLowerCase()}</span> : '—';
  if (m.referenceType === 'PEDIDO' && m.referenceId) return <Link to={`/admin/pedidos/${m.referenceId}`} className="num">{m.referenceCode}</Link>;
  if (m.referenceType === 'COMPRA' && m.referenceId) return <Link to={`/admin/compras/${m.referenceId}`} className="num">{m.referenceCode}</Link>;
  if (m.referenceType === 'POSVENTA' && m.referenceId) return <Link to={`/admin/posventa/${m.referenceId}`} className="num">{m.referenceCode}</Link>;
  return <span className="num">{m.referenceCode}</span>;
}

export function MovementsTable({ query, compact = false, path = '/inventory/movements', onChanged }) {
  const s = useSession();
  const [page, setPage] = useState(1);
  const q = useMemo(() => ({ ...query, page, pageSize: compact ? 15 : 30 }), [query, page, compact]);
  useEffect(() => setPage(1), [JSON.stringify(query)]);
  const { data, error, loading, reload } = useApi(path, q);
  const correct = async (m) => {
    const reason = await promptText({ title: `Corregir movimiento #${m.id}`, text: `Se registrará un movimiento compensatorio de ${m.quantity} unidad(es) en sentido contrario. El original se conserva.`, placeholder: 'Motivo de la corrección', confirmText: 'Registrar corrección' });
    if (reason === null) return;
    try {
      await api.post(`/inventory/movements/${m.id}/correct`, { reason });
      toast.success('Corrección registrada con un movimiento compensatorio.');
      reload();
      onChanged?.();
    } catch (e) { apiError(e); }
  };
  const canCorrect = (m) => s.can('inventory.move') && !m.corrected && !m.correctsId && !ORDER_TYPES.includes(m.type);
  return (
    <>
      <DataTable
        rows={data?.items}
        loading={loading}
        error={error}
        onRetry={reload}
        dim={loading}
        empty="No hay movimientos con estos filtros."
        columns={[
          { key: 'date', label: 'Fecha', render: (m) => <><span className="small nowrap">{date(m.createdAt)}</span><div className="tiny faint nowrap">{time(m.createdAt)} · #{m.id}</div></> },
          !compact || !query?.variantId ? { key: 'sku', label: 'Variante', render: (m) => <><span className="strong">{m.productName}</span><div className="tiny muted num">{m.sku} · {m.color} · {m.size}</div></> } : null,
          { key: 'type', label: 'Movimiento', render: (m) => <><span className={`mov mov--${m.direction === 'ENTRADA' ? 'in' : 'out'}`}>{m.direction === 'ENTRADA' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{MOVEMENT_LABELS[m.type] || m.typeLabel}</span><div className="num strong">{m.direction === 'ENTRADA' ? '+' : '−'}{m.quantity} u.</div></> },
          { key: 'bal', label: 'Saldo físico', render: (m) => <><span className="num nowrap">{m.physicalBefore} → <b>{m.physicalAfter}</b></span><div className="tiny muted nowrap">disp. {m.availableAfter} · res. {m.reservedAfter}</div></> },
          { key: 'ref', label: 'Referencia', render: (m) => <>{refLink(m)}{m.documentRef && <div className="tiny muted">Doc. {m.documentRef}</div>}</>, hideSm: false },
          { key: 'reason', label: 'Motivo y responsable', render: (m) => <div style={{ maxWidth: 300 }}><span className="small">{m.reason}</span><div className="tiny muted">{m.userEmail || 'Sistema'}{m.supplier ? ` · ${m.supplier}` : ''}{m.unitCost ? ` · costo ${money(m.unitCost)}` : ''}</div>{m.corrected && <span className="chip chip--neutral" style={{ marginTop: 4 }}>Corregido</span>}{m.correctsId && <span className="chip chip--info" style={{ marginTop: 4 }}>Corrige #{m.correctsId}</span>}</div> },
          s.can('inventory.move') ? { key: 'act', label: '', render: (m) => canCorrect(m) && <button className="btn btn--link btn--sm" onClick={() => correct(m)}><Undo2 size={14} /> Corregir</button> } : null,
        ].filter(Boolean)}
      />
      {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={setPage} /></div>}
    </>
  );
}

const TYPES = ['INVENTARIO_INICIAL', 'ENTRADA_COMPRA', 'ENTRADA_DEVOLUCION', 'ENTRADA_AJUSTE', 'SALIDA_VENTA', 'SALIDA_CAMBIO', 'SALIDA_DEVOLUCION_PROVEEDOR', 'SALIDA_DANIO', 'SALIDA_PERDIDA', 'SALIDA_AJUSTE'];

export function Kardex() {
  const s = useSession();
  const [params] = useSearchParams();
  const [f, set] = useParamsState({});
  const variantId = params.get('variantId');
  const variant = useApi(variantId ? `/inventory/kardex/${variantId}` : null, { pageSize: 1 }, { enabled: !!variantId });
  const [mov, setMov] = useState(false);
  const query = useMemo(() => {
    const { page, ...rest } = f;
    return rest;
  }, [f]);
  const st = variant.data?.stock;
  return (
    <>
      <PageHeader
        title="Kardex"
        description="Todos los movimientos de inventario con cantidad, motivo, responsable, referencia y saldos antes y después. Los movimientos no se editan: se corrigen con nuevos movimientos."
        actions={(
          <>
            {s.can('reports.export') && <ExportButton path="/inventory/movements/export" query={query} filename="kardex.csv" />}
            {s.can('inventory.move') && <button className="btn btn--primary btn--sm" onClick={() => setMov(true)}><Plus size={16} /> Movimiento</button>}
          </>
        )}
      />
      {variantId && (variant.loading && !st ? <Loader inline /> : st && (
        <section className="panel mb-3">
          <div className="panel__body variant-head">
            <Img src={st.image} alt="" className="thumb thumb--xl" />
            <div className="grow">
              <div className="h3">{st.productName}</div>
              <div className="small muted num">{st.sku} · {st.color} · {st.size} · {st.category}</div>
              <Link to="/admin/kardex" className="small">Ver kardex de todas las variantes</Link>
            </div>
            <div className="stock-trio">
              <div><small>Física</small><b>{st.physical}</b></div>
              <div><small>Reservada</small><b>{st.reserved}</b></div>
              <div><small>Disponible</small><b>{st.available}</b></div>
              <div><small>Mínimo</small><b>{st.minStock}</b></div>
            </div>
          </div>
          {variant.data.reservations?.length > 0 && (
            <div className="panel__foot" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <span className="small strong">Reservas activas:</span>
              {variant.data.reservations.map((r) => <Link key={r.id} to={`/admin/pedidos/${r.orderId}`} className="chip chip--info">{r.order.code} · {r.quantity} u.</Link>)}
            </div>
          )}
        </section>
      ))}
      {!variantId && (
        <Toolbar>
          <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="SKU o producto" />
          <select className="select select--sm" value={f.type || ''} onChange={(e) => set({ type: e.target.value })} aria-label="Tipo">
            <option value="">Tipo: todos</option>
            {TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
          </select>
          <select className="select select--sm" value={f.direction || ''} onChange={(e) => set({ direction: e.target.value })} aria-label="Dirección">
            <option value="">Entradas y salidas</option>
            <option value="ENTRADA">Solo entradas</option>
            <option value="SALIDA">Solo salidas</option>
          </select>
          <input className="input input--sm" style={{ width: 180 }} placeholder="Referencia o documento" value={f.reference || ''} onChange={(e) => set({ reference: e.target.value })} aria-label="Referencia" />
          <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.from || ''} onChange={(e) => set({ from: e.target.value })} aria-label="Desde" />
          <input type="date" className="input input--sm" style={{ width: 'auto' }} value={f.to || ''} onChange={(e) => set({ to: e.target.value })} aria-label="Hasta" />
        </Toolbar>
      )}
      <section className="panel">
        <MovementsTable query={variantId ? { variantId } : query} onChanged={() => variant.reload()} />
      </section>
      {!variantId && <Notice tone="info"><PackageX size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> Las salidas por venta se generan al despachar un pedido (una sola vez) y las entradas por devolución al recibir prendas en buen estado.</Notice>}
      {mov && <MovementModal open={mov} onClose={() => setMov(false)} initialVariant={st ? { ...st } : null} onDone={() => { variant.reload(); set({ t: String(Date.now()) }); }} />}
    </>
  );
}
