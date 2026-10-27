import { useEffect, useState } from 'react';
import { Save, Plus, Pencil, FilePlus2, Trash2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable } from '../../components/admin.jsx';
import { Button, Field, Loader, Modal, Notice, Status, Tabs } from '../../components/ui.jsx';
import { money, dateLong } from '../../lib/format.js';
import { Markdown } from '../store/Policy.jsx';
import { confirm, toast, apiError } from '../../lib/alerts.js';

function SettingForm({ keyName, value, fields, onSaved, note }) {
  const [form, setForm] = useState(value || {});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(value || {}), [value]);
  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, fields.find((f) => f.key === k)?.type === 'number' ? Number(v) : v]));
      await api.put(`/catalog/admin/settings/${keyName}`, body);
      toast.success('Configuración guardada y registrada en la bitácora.');
      onSaved();
    } catch (e) { setErrors(e.fields || {}); if (!Object.keys(e.fields || {}).length) apiError(e); } finally { setSaving(false); }
  };
  return (
    <section className="panel">
      <div className="panel__body">
        {note && <div className="mb-2"><Notice tone="info">{note}</Notice></div>}
        <div className="form-grid">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} error={errors[f.key]} className={f.wide ? 'span-2' : ''}>
              {(a) => (f.textarea
                ? <textarea className="textarea" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} {...a} />
                : <input className={`input ${f.type === 'number' ? 'num' : ''}`} inputMode={f.type === 'number' ? 'numeric' : undefined} value={form[f.key] ?? ''} disabled={f.readOnly} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} {...a} />)}
            </Field>
          ))}
        </div>
      </div>
      <div className="panel__foot"><Button className="btn btn--primary btn--sm" loading={saving} onClick={save}><Save size={15} /> Guardar</Button></div>
    </section>
  );
}

function BankForm({ value, onSaved }) {
  const [form, setForm] = useState(value || { accounts: [], instructions: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(value || { accounts: [], instructions: '' }), [value]);
  const upd = (i, k, v) => setForm((f) => ({ ...f, accounts: f.accounts.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const save = async () => {
    setSaving(true);
    try { await api.put('/catalog/admin/settings/bank_transfer', form); toast.success('Cuentas actualizadas.'); onSaved(); } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <section className="panel">
      <div className="panel__body stack">
        <Notice tone="warn">Cuentas simuladas: se muestran al cliente que elige pagar por transferencia. No uses datos bancarios reales en la demostración.</Notice>
        {form.accounts.map((a, i) => (
          <div key={i} className="form-grid well">
            <Field label="Banco">{(x) => <input className="input" value={a.bank} onChange={(e) => upd(i, 'bank', e.target.value)} {...x} />}</Field>
            <Field label="Tipo">{(x) => <input className="input" value={a.type} onChange={(e) => upd(i, 'type', e.target.value)} {...x} />}</Field>
            <Field label="Número">{(x) => <input className="input num" value={a.number} onChange={(e) => upd(i, 'number', e.target.value)} {...x} />}</Field>
            <Field label="A nombre de">{(x) => <input className="input" value={a.holder} onChange={(e) => upd(i, 'holder', e.target.value)} {...x} />}</Field>
            <button className="btn btn--link btn--sm span-2" style={{ justifySelf: 'start', color: 'var(--grana)', paddingLeft: 0 }} onClick={() => setForm((f) => ({ ...f, accounts: f.accounts.filter((_, j) => j !== i) }))}><Trash2 size={14} /> Quitar cuenta</button>
          </div>
        ))}
        {form.accounts.length < 5 && <button className="btn btn--ghost btn--sm" style={{ justifySelf: 'start' }} onClick={() => setForm((f) => ({ ...f, accounts: [...f.accounts, { bank: '', type: 'Monetaria', number: '', holder: '' }] }))}><Plus size={14} /> Agregar cuenta</button>}
        <Field label="Instrucciones para el cliente">{(x) => <textarea className="textarea" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} {...x} />}</Field>
      </div>
      <div className="panel__foot"><Button className="btn btn--primary btn--sm" loading={saving} onClick={save}><Save size={15} /> Guardar</Button></div>
    </section>
  );
}

const POLICY_SLUGS = [['terminos', 'Términos y condiciones'], ['privacidad', 'Política de privacidad'], ['cambios-y-devoluciones', 'Cambios y devoluciones'], ['envios', 'Envíos'], ['reclamos', 'Reclamos']];

function Policies() {
  const { data, reload } = useApi('/catalog/admin/policies');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', content: '' });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!data) return <Loader inline />;
  const open = (slug, title) => {
    const cur = data.find((p) => p.slug === slug && p.isCurrent);
    setForm({ title: cur?.title || title, content: cur?.content || '' });
    setPreview(false);
    setEditing(slug);
  };
  const publish = async () => {
    if (!(await confirm({ title: 'Publicar nueva versión', text: editing === 'terminos' ? 'Los clientes deberán aceptar la nueva versión en su siguiente compra. Los pedidos anteriores conservan la versión que aceptaron.' : 'La versión anterior queda en el historial.', confirmText: 'Publicar' }))) return;
    setSaving(true);
    try { await api.post(`/catalog/admin/policies/${editing}`, form); toast.success('Nueva versión publicada.'); setEditing(null); reload(); } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <>
      <div className="stack" style={{ '--gap': '12px' }}>
        {POLICY_SLUGS.map(([slug, title]) => {
          const versions = data.filter((p) => p.slug === slug);
          const cur = versions.find((p) => p.isCurrent);
          return (
            <section key={slug} className="panel">
              <div className="panel__head">
                <div><h2>{cur?.title || title}</h2><p className="tiny muted" style={{ margin: '2px 0 0' }}>{cur ? `Versión ${cur.version} vigente desde el ${dateLong(cur.publishedAt)}` : 'Sin publicar'} · {versions.length} versión(es) en el historial</p></div>
                <button className="btn btn--ghost btn--sm" onClick={() => open(slug, title)}><FilePlus2 size={15} /> Publicar nueva versión</button>
              </div>
            </section>
          );
        })}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title="Nueva versión de la política" footer={<><button className="btn btn--ghost" onClick={() => setPreview((p) => !p)}>{preview ? 'Editar' : 'Vista previa'}</button><Button className="btn btn--primary" loading={saving} onClick={publish}>Publicar versión</Button></>}>
        <div className="stack">
          <Field label="Título">{(a) => <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} {...a} />}</Field>
          {preview ? <div className="well"><Markdown text={form.content} /></div> : (
            <Field label="Contenido" hint="Usa ## para subtítulos y guiones (- ) para listas.">{(a) => <textarea className="textarea" style={{ minHeight: 320, fontSize: 14 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} {...a} />}</Field>
          )}
        </div>
      </Modal>
    </>
  );
}

function Coverage() {
  const { data, reload, loading } = useApi('/sales/shipping/zones', null, { auth: false });
  const [rows, setRows] = useState({});
  const upd = (z, patch) => setRows((r) => ({ ...r, [z.id]: { covered: z.covered, rate: Number(z.rate).toFixed(2), estimatedDays: z.estimatedDays, ...r[z.id], ...patch } }));
  const save = async (z) => {
    try {
      await api.put(`/sales/admin/shipping/zones/${z.id}`, { ...rows[z.id], rate: Number(rows[z.id].rate) });
      toast.success(`Cobertura de ${z.department} actualizada.`);
      setRows((r) => { const n = { ...r }; delete n[z.id]; return n; });
      reload();
    } catch (e) { apiError(e); }
  };
  return (
    <section className="panel">
      <div className="panel__head"><h2>Cobertura y tarifas por departamento</h2><span className="tiny muted">El checkout rechaza destinos sin cobertura (HU-07)</span></div>
      <DataTable
        rows={data}
        loading={loading}
        columns={[
          { key: 'department', label: 'Departamento', render: (z) => <b>{z.department}</b> },
          { key: 'covered', label: 'Cobertura', render: (z) => { const v = rows[z.id]?.covered ?? z.covered; return <button className={`switch ${v ? 'on' : ''}`} role="switch" aria-checked={v} aria-label={`Cobertura en ${z.department}`} onClick={() => upd(z, { covered: !v })}><span /></button>; } },
          { key: 'rate', label: 'Tarifa (Q)', render: (z) => <input className="input input--sm num" style={{ width: 96 }} value={rows[z.id]?.rate ?? Number(z.rate).toFixed(2)} onChange={(e) => upd(z, { rate: e.target.value })} aria-label={`Tarifa a ${z.department}`} /> },
          { key: 'days', label: 'Tiempo estimado', render: (z) => <input className="input input--sm" style={{ width: 150 }} value={rows[z.id]?.estimatedDays ?? z.estimatedDays} onChange={(e) => upd(z, { estimatedDays: e.target.value })} aria-label={`Tiempo a ${z.department}`} /> },
          { key: 'act', label: '', render: (z) => rows[z.id] && <button className="btn btn--soft btn--sm" onClick={() => save(z)}>Guardar</button> },
        ]}
      />
    </section>
  );
}

function Carriers() {
  const { data, reload, loading } = useApi('/sales/admin/carriers');
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const openEdit = (c) => { setForm({ name: c.name || '', phone: c.phone || '', prefix: c.prefix || '', active: c.active ?? true }); setEdit(c); };
  const save = async () => {
    setSaving(true);
    try {
      if (edit.id) await api.put(`/sales/admin/carriers/${edit.id}`, form);
      else await api.post('/sales/admin/carriers', form);
      toast.success('Transportista guardado.');
      setEdit(null);
      reload();
    } catch (e) { apiError(e); } finally { setSaving(false); }
  };
  return (
    <section className="panel">
      <div className="panel__head"><h2>Transportistas (ficticios)</h2><button className="btn btn--primary btn--sm" onClick={() => openEdit({})}><Plus size={15} /> Nuevo</button></div>
      <DataTable rows={data} loading={loading}
        columns={[
          { key: 'name', label: 'Nombre', render: (c) => <b>{c.name}</b> },
          { key: 'phone', label: 'Teléfono' },
          { key: 'prefix', label: 'Prefijo de guía', render: (c) => <code>{c.prefix}</code> },
          { key: 'shipments', label: 'Envíos', className: 'r', render: (c) => <span className="num">{c._count?.shipments || 0}</span> },
          { key: 'active', label: 'Estado', render: (c) => <Status value={c.active ? 'ACTIVO' : 'INACTIVO'} /> },
          { key: 'act', label: '', render: (c) => <button className="btn btn--ghost btn--sm" onClick={() => openEdit(c)}><Pencil size={14} /> Editar</button> },
        ]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar transportista' : 'Nuevo transportista'} footer={<><button className="btn btn--ghost" onClick={() => setEdit(null)}>Cancelar</button><Button className="btn btn--primary" loading={saving} onClick={save}>Guardar</Button></>}>
        <div className="form-grid">
          <Field label="Nombre" className="span-2">{(a) => <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} {...a} />}</Field>
          <Field label="Teléfono">{(a) => <input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} {...a} />}</Field>
          <Field label="Prefijo de guía" hint="2 a 6 letras">{(a) => <input className="input" value={form.prefix || ''} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} {...a} />}</Field>
          <label className="check span-2"><input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activo</label>
        </div>
      </Modal>
    </section>
  );
}

export default function SettingsPage() {
  const s = useSession();
  const canStore = s.can('settings.manage');
  const canShip = s.can('shipping.config');
  const settings = useApi('/catalog/admin/settings', null, { enabled: canStore });
  const tabs = [
    canStore && { value: 'tienda', label: 'Datos de la tienda' },
    canStore && { value: 'comercial', label: 'Parámetros comerciales' },
    canStore && { value: 'transferencias', label: 'Transferencias' },
    canStore && { value: 'politicas', label: 'Políticas' },
    canShip && { value: 'cobertura', label: 'Cobertura y tarifas' },
    canShip && { value: 'transportistas', label: 'Transportistas' },
    canStore && { value: 'simulacion', label: 'Simulación' },
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.value);
  const v = settings.data;
  return (
    <>
      <PageHeader title="Configuración" description="Cada cambio de configuración queda registrado en la bitácora de auditoría con su valor anterior." />
      <Tabs id="set-tabs" value={tab} onChange={setTab} tabs={tabs} />
      <div className="mt-3">
        {canStore && !v && ['tienda', 'comercial', 'transferencias', 'simulacion'].includes(tab) ? <Loader inline /> : (
          <>
            {tab === 'tienda' && <SettingForm keyName="store_info" value={v.store_info} onSaved={settings.reload} note="Estos datos se muestran en el pie de página, la ayuda y los comprobantes de demostración." fields={[
              { key: 'name', label: 'Nombre comercial' }, { key: 'legalName', label: 'Razón social' }, { key: 'nit', label: 'NIT' }, { key: 'phone', label: 'Teléfono' },
              { key: 'email', label: 'Correo de atención' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'address', label: 'Dirección', wide: true }, { key: 'hours', label: 'Horario de atención', wide: true },
              { key: 'sellerInfo', label: 'Información del vendedor', wide: true, textarea: true },
            ]} />}
            {tab === 'comercial' && <SettingForm keyName="commerce" value={v.commerce} onSaved={settings.reload} note="La reserva de existencias se crea al confirmar el pedido y vence según el método de pago. Agregar al carrito no reserva." fields={[
              { key: 'currency', label: 'Moneda', readOnly: true }, { key: 'reservationMinutesCard', label: 'Reserva con tarjeta (minutos)', type: 'number', hint: 'Entre 5 y 240' },
              { key: 'reservationHoursTransfer', label: 'Reserva con transferencia (horas)', type: 'number', hint: 'Entre 1 y 168' }, { key: 'maxQtyPerItem', label: 'Máximo de unidades por producto', type: 'number' },
              { key: 'returnDays', label: 'Días para cambios y devoluciones', type: 'number' }, { key: 'lowStockDefault', label: 'Mínimo de existencias por defecto', type: 'number' },
              { key: 'rounding', label: 'Regla de redondeo documentada', wide: true },
            ]} />}
            {tab === 'transferencias' && <BankForm value={v.bank_transfer} onSaved={settings.reload} />}
            {tab === 'politicas' && <Policies />}
            {tab === 'cobertura' && <Coverage />}
            {tab === 'transportistas' && <Carriers />}
            {tab === 'simulacion' && (
              <section className="panel">
                <div className="panel__body stack">
                  <Notice tone="warn">{v.simulation?.banner}</Notice>
                  <div className="label">Tarjetas de prueba del simulador de pagos</div>
                  <table className="table"><thead><tr><th>Número</th><th>Resultado</th></tr></thead><tbody>{(v.simulation?.testCards || []).map((c) => <tr key={c.number}><td className="num">{c.number}</td><td>{c.result}</td></tr>)}</tbody></table>
                  <p className="small muted" style={{ margin: 0 }}>Cualquier otro número válido (algoritmo de Luhn) se aprueba. Los documentos llevan la leyenda “SIMULACIÓN — SIN VALIDEZ FISCAL”. Para operar comercialmente deben activarse pagos, facturación FEL, correo y logística reales con HTTPS.</p>
                  <p className="tiny muted" style={{ margin: 0 }}>Envío gratis automático: {money(600)} en productos (promoción configurable en Promociones).</p>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
