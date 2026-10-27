import { useState } from 'react';
import { api } from '../api/client.js';
import { DEPARTMENTS } from '../lib/labels.js';
import { Button, Field, Modal } from './ui.jsx';
import { toast, apiError } from '../lib/alerts.js';

const EMPTY = { label: 'Casa', recipientName: '', phone: '', department: 'Guatemala', municipality: '', line1: '', reference: '', isDefault: false };

export default function AddressModal({ open, onClose, initial, onSaved, defaultName = '', defaultPhone = '' }) {
  const [form, setForm] = useState(initial || { ...EMPTY, recipientName: defaultName, phone: defaultPhone });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const saved = initial?.id ? await api.put(`/auth/me/addresses/${initial.id}`, form) : await api.post('/auth/me/addresses', form);
      toast.success(initial?.id ? 'Dirección actualizada.' : 'Dirección guardada.');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) apiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Editar dirección' : 'Nueva dirección de entrega'}
      footer={<><button className="btn btn--ghost" type="button" onClick={onClose}>Cancelar</button><Button className="btn btn--primary" loading={saving} type="submit" form="address-form">Guardar dirección</Button></>}>
      <form id="address-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Nombre de quien recibe" error={errors.recipientName} className="span-2">
          {(a) => <input className="input" value={form.recipientName} onChange={set('recipientName')} autoComplete="name" {...a} />}
        </Field>
        <Field label="Teléfono" error={errors.phone} hint="8 dígitos, por ejemplo 5512 3456">
          {(a) => <input className="input" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" {...a} />}
        </Field>
        <Field label="Etiqueta" error={errors.label} hint="Casa, trabajo, apartamento…">
          {(a) => <input className="input" value={form.label} onChange={set('label')} {...a} />}
        </Field>
        <Field label="Departamento" error={errors.department}>
          {(a) => <select className="select" value={form.department} onChange={set('department')} {...a}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>}
        </Field>
        <Field label="Municipio" error={errors.municipality}>
          {(a) => <input className="input" value={form.municipality} onChange={set('municipality')} autoComplete="address-level2" {...a} />}
        </Field>
        <Field label="Dirección" error={errors.line1} className="span-2" hint="Calle o avenida, número, zona, colonia">
          {(a) => <input className="input" value={form.line1} onChange={set('line1')} autoComplete="street-address" {...a} />}
        </Field>
        <Field label="Referencias (opcional)" error={errors.reference} className="span-2">
          {(a) => <input className="input" value={form.reference || ''} onChange={set('reference')} placeholder="Portón negro, frente al parque…" {...a} />}
        </Field>
        <label className="check span-2"><input type="checkbox" checked={!!form.isDefault} onChange={set('isDefault')} /> Usar como dirección predeterminada</label>
      </form>
    </Modal>
  );
}
