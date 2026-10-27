import { useRef, useState } from 'react';
import { Plus, Pencil, ImagePlus, Save, Trash2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable } from '../../components/admin.jsx';
import { Button, Field, Img, Loader, Modal, Status, Tabs } from '../../components/ui.jsx';
import { toast, apiError } from '../../lib/alerts.js';

function CategoryModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({ name: initial?.name || '', description: initial?.description || '', sortOrder: initial?.sortOrder ?? 0, active: initial?.active ?? true });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async () => {
    setSaving(true);
    try {
      if (initial?.id) await api.put(`/catalog/admin/categories/${initial.id}`, { ...form, sortOrder: Number(form.sortOrder) || 0 });
      else await api.post('/catalog/admin/categories', { ...form, sortOrder: Number(form.sortOrder) || 0 });
      toast.success('Categoría guardada.');
      onSaved();
      onClose();
    } catch (e) { setErrors(e.fields || {}); if (!Object.keys(e.fields || {}).length) apiError(e); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={initial?.id ? 'Editar categoría' : 'Nueva categoría'} footer={<><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={submit}>Guardar</Button></>}>
      <div className="form-grid">
        <Field label="Nombre" error={errors.name} className="span-2">{(a) => <input className="input" value={form.name} onChange={set('name')} {...a} />}</Field>
        <Field label="Descripción" error={errors.description} className="span-2">{(a) => <textarea className="textarea" value={form.description || ''} onChange={set('description')} {...a} />}</Field>
        <Field label="Orden en la tienda" error={errors.sortOrder}>{(a) => <input className="input num" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} {...a} />}</Field>
        <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={form.active} onChange={set('active')} /> Visible en la tienda</label>
      </div>
    </Modal>
  );
}

function Categories({ canManage }) {
  const { data, loading, error, reload } = useApi('/catalog/admin/categories');
  const [edit, setEdit] = useState(null);
  const fileRef = useRef(null);
  const [target, setTarget] = useState(null);
  const upload = async (file) => {
    if (!file || !target) return;
    const fd = new FormData();
    fd.append('image', file);
    try { await api.post(`/catalog/admin/categories/${target.id}/image`, fd); toast.success('Imagen de la categoría actualizada.'); reload(); } catch (e) { apiError(e); }
  };
  return (
    <section className="panel">
      <div className="panel__head"><h2>Categorías</h2>{canManage && <button className="btn btn--primary btn--sm" onClick={() => setEdit({})}><Plus size={15} /> Nueva categoría</button>}</div>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        columns={[
          { key: 'img', label: 'Imagen', render: (c) => <Img src={c.imageUrl} alt="" className="thumb thumb--lg" /> },
          { key: 'name', label: 'Categoría', render: (c) => <><b>{c.name}</b><div className="tiny muted">/{c.slug}</div></> },
          { key: 'desc', label: 'Descripción', render: (c) => <span className="small muted">{c.description}</span>, hideSm: true },
          { key: 'products', label: 'Productos', className: 'r', render: (c) => <span className="num">{c.products}</span> },
          { key: 'order', label: 'Orden', className: 'r', render: (c) => <span className="num">{c.sortOrder}</span> },
          { key: 'active', label: 'Estado', render: (c) => <Status value={c.active ? 'ACTIVO' : 'INACTIVO'} /> },
          canManage && { key: 'act', label: '', render: (c) => <span className="row" style={{ '--gap': '4px' }}><button className="btn btn--ghost btn--sm" onClick={() => setEdit(c)}><Pencil size={14} /> Editar</button><button className="btn btn--link btn--sm" onClick={() => { setTarget(c); fileRef.current?.click(); }}><ImagePlus size={14} /> Imagen</button></span> },
        ].filter(Boolean)}
      />
      <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {edit && <CategoryModal initial={edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </section>
  );
}

function Colors({ canManage }) {
  const { data, reload } = useApi('/catalog/colors', null, { auth: false });
  const sizes = useApi('/catalog/sizes', null, { auth: false });
  const [form, setForm] = useState({ name: '', hex: '#1B2433' });
  const [saving, setSaving] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/catalog/admin/colors', form); toast.success('Color agregado.'); setForm({ name: '', hex: '#1B2433' }); reload(); } catch (err) { apiError(err); } finally { setSaving(false); }
  };
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="panel">
        <div className="panel__head"><h2>Colores</h2><span className="small muted">{data?.length || 0}</span></div>
        <div className="panel__body">
          <div className="color-list">
            {(data || []).map((c) => <span key={c.id} className="color-list__item"><span style={{ background: c.hex }} />{c.name}<small className="num">{c.hex}</small></span>)}
          </div>
          {canManage && (
            <form className="row row--wrap mt-3" onSubmit={add}>
              <input className="input input--sm" style={{ width: 180 }} placeholder="Nombre del color" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nombre del color" />
              <input type="color" value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value.toUpperCase() })} aria-label="Color" style={{ width: 44, height: 36, border: '1px solid var(--line)', borderRadius: 8, padding: 2, background: '#fff' }} />
              <span className="num small muted">{form.hex}</span>
              <Button className="btn btn--primary btn--sm" loading={saving} type="submit"><Plus size={15} /> Agregar</Button>
            </form>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel__head"><h2>Tallas</h2></div>
        <div className="panel__body">
          <div className="size-chips">{(sizes.data || []).map((z) => <span key={z.id} className="size-chip" style={{ cursor: 'default', display: 'inline-grid', placeItems: 'center' }} title={z.name}>{z.code}</span>)}</div>
          <p className="tiny muted mt-2" style={{ marginBottom: 0 }}>Las tallas se ordenan de menor a mayor en la tienda y en los reportes.</p>
        </div>
      </section>
    </div>
  );
}

function GuideEditor({ guide, canManage, onSaved }) {
  const [g, setG] = useState({ name: guide.name, columns: guide.columns, rows: guide.rows, notes: guide.notes || '' });
  const [saving, setSaving] = useState(false);
  const setCell = (r, c, v) => setG((x) => ({ ...x, rows: x.rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)) }));
  const save = async () => {
    setSaving(true);
    try { await api.put(`/catalog/admin/size-guides/${guide.id}`, g); toast.success(`Guía "${g.name}" actualizada.`); onSaved(); } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <section className="panel">
      <div className="panel__head">
        {canManage ? <input className="input input--sm" style={{ maxWidth: 320, fontWeight: 650 }} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} aria-label="Nombre de la guía" /> : <h2>{g.name}</h2>}
        <span className="small muted">Medidas en {guide.unit}</span>
      </div>
      <div className="panel__body">
        <div className="table-wrap">
          <table className="table size-edit">
            <thead><tr>{g.columns.map((c, j) => <th key={j}>{c}</th>)}{canManage && <th />}</tr></thead>
            <tbody>
              {g.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j}>{canManage ? <input className="input input--sm" value={cell} onChange={(e) => setCell(i, j, e.target.value)} aria-label={`${g.columns[j]} fila ${i + 1}`} /> : cell}</td>)}
                  {canManage && <td><button className="btn btn--icon btn--ghost btn--sm" onClick={() => setG((x) => ({ ...x, rows: x.rows.filter((_, k) => k !== i) }))} aria-label="Quitar fila"><Trash2 size={14} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && (
          <div className="stack mt-2">
            <button className="btn btn--link btn--sm" style={{ justifySelf: 'start', paddingLeft: 0 }} onClick={() => setG((x) => ({ ...x, rows: [...x.rows, x.columns.map(() => '')] }))}><Plus size={14} /> Agregar fila</button>
            <Field label="Notas">{(a) => <input className="input" value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} {...a} />}</Field>
          </div>
        )}
      </div>
      {canManage && <div className="panel__foot"><Button className="btn btn--primary btn--sm" loading={saving} onClick={save}><Save size={15} /> Guardar guía</Button></div>}
    </section>
  );
}

function Guides({ canManage }) {
  const { data, loading, reload } = useApi('/catalog/admin/size-guides');
  if (loading && !data) return <Loader inline />;
  return <div className="stack" style={{ '--gap': '20px' }}>{(data || []).map((g) => <GuideEditor key={`${g.id}-${JSON.stringify(g.rows).length}`} guide={g} canManage={canManage} onSaved={reload} />)}</div>;
}

export default function CatalogSettings() {
  const s = useSession();
  const [tab, setTab] = useState('categorias');
  const canManage = s.can('catalog.manage');
  return (
    <>
      <PageHeader title="Categorías y tallas" description="Organización del catálogo: categorías visibles en la tienda, colores disponibles y guías de tallas que ven los clientes." />
      <Tabs id="cat-tabs" value={tab} onChange={setTab} tabs={[{ value: 'categorias', label: 'Categorías' }, { value: 'colores', label: 'Colores y tallas' }, { value: 'guias', label: 'Guías de tallas' }]} />
      <div className="mt-3">
        {tab === 'categorias' && <Categories canManage={canManage} />}
        {tab === 'colores' && <Colors canManage={canManage} />}
        {tab === 'guias' && <Guides canManage={canManage} />}
      </div>
    </>
  );
}
