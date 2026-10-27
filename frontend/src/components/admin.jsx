import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Download, Minus, Search, TableProperties, BarChart3 } from 'lucide-react';
import { openProtected } from '../api/client.js';
import { apiError, toast } from '../lib/alerts.js';
import { isoToday } from '../lib/format.js';
import { useDebounced } from '../lib/useApi.js';
import { Loader, Empty, ErrorState } from './ui.jsx';

export function PageHeader({ title, description, actions, back }) {
  return (
    <div className="adm-head">
      <div className="grow">
        {back && <Link to={back.to} className="adm-back">← {back.label}</Link>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="adm-head__actions">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, previous, current, goodWhenUp = true, hint, icon: Icon, to, tone }) {
  let delta = null;
  if (previous !== undefined && current !== undefined) {
    const p = Number(previous) || 0;
    const c = Number(current) || 0;
    delta = p === 0 ? (c === 0 ? 0 : null) : ((c - p) / Math.abs(p)) * 100;
  }
  const up = delta !== null && delta > 0.05;
  const down = delta !== null && delta < -0.05;
  const good = (up && goodWhenUp) || (down && !goodWhenUp);
  const bad = (down && goodWhenUp) || (up && !goodWhenUp);
  const Inner = (
    <>
      <div className="kpi__top">
        <span className="kpi__label">{label}</span>
        {Icon && <span className={`kpi__icon ${tone ? `kpi__icon--${tone}` : ''}`}><Icon size={17} /></span>}
      </div>
      <div className="kpi__value">{value}</div>
      <div className="kpi__foot">
        {delta !== null && (
          <span className={`kpi__delta ${good ? 'is-good' : bad ? 'is-bad' : ''}`}>
            {up ? <ArrowUpRight size={14} /> : down ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            {Math.abs(delta).toFixed(1)} %
          </span>
        )}
        {hint && <span className="kpi__hint">{hint}</span>}
      </div>
    </>
  );
  return to ? <Link to={to} className="kpi kpi--link">{Inner}</Link> : <div className="kpi">{Inner}</div>;
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', width = 280 }) {
  const [v, setV] = useState(value || '');
  const d = useDebounced(v, 350);
  useEffect(() => { if (d !== (value || '')) onChange(d); }, [d]);
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <div className="search-input" style={{ width }}>
      <Search size={16} aria-hidden="true" />
      <input className="input input--sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

const PRESETS = [
  ['7d', 'Últimos 7 días', 6],
  ['30d', 'Últimos 30 días', 29],
  ['90d', 'Últimos 90 días', 89],
  ['365d', 'Último año', 364],
];

export function DateRange({ from, to, onChange }) {
  const active = PRESETS.find(([, , d]) => to === isoToday() && from === isoToday(-d))?.[0];
  return (
    <div className="date-range">
      <div className="seg seg--sm" role="group" aria-label="Período">
        {PRESETS.map(([k, l, d]) => (
          <button key={k} type="button" className={active === k ? 'on' : ''} onClick={() => onChange({ from: isoToday(-d), to: isoToday() })} title={l}>{k.replace('d', ' d').replace('365 d', '1 año')}</button>
        ))}
      </div>
      <label className="sr-only" htmlFor="dr-from">Desde</label>
      <input id="dr-from" type="date" className="input input--sm" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} />
      <span className="muted small">a</span>
      <label className="sr-only" htmlFor="dr-to">Hasta</label>
      <input id="dr-to" type="date" className="input input--sm" value={to} min={from} max={isoToday()} onChange={(e) => onChange({ from, to: e.target.value })} />
    </div>
  );
}

export function ExportButton({ path, query, filename, label = 'Exportar CSV', className = 'btn btn--ghost btn--sm' }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await openProtected(path, { query, download: filename });
      toast.success('Archivo CSV descargado.');
    } catch (e) {
      apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return <button className={className} onClick={run} disabled={busy}><Download size={15} /> {busy ? 'Generando…' : label}</button>;
}

export function ChartCard({ title, subtitle, children, table, height = 280, actions, className = '' }) {
  const [view, setView] = useState('chart');
  return (
    <section className={`panel chart-card ${className}`}>
      <div className="panel__head">
        <div><h2>{title}</h2>{subtitle && <p className="tiny muted" style={{ margin: '2px 0 0' }}>{subtitle}</p>}</div>
        <div className="row row--wrap" style={{ '--gap': '6px' }}>
          {actions}
          {table && (
            <div className="seg seg--sm" role="group" aria-label="Vista">
              <button type="button" className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')} aria-label="Ver gráfica" title="Gráfica"><BarChart3 size={15} /></button>
              <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} aria-label="Ver tabla" title="Tabla"><TableProperties size={15} /></button>
            </div>
          )}
        </div>
      </div>
      <div className="panel__body">
        {view === 'chart' ? <div style={{ height, position: 'relative' }}>{children}</div> : <div className="table-wrap" style={{ maxHeight: height + 40 }}>{table}</div>}
      </div>
    </section>
  );
}

export function DataTable({ columns, rows, onRowClick, empty = 'No hay registros con estos filtros.', loading, error, onRetry, rowKey = (r) => r.id, footer, dim }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows) return <Loader inline label="Cargando…" />;
  if (!rows?.length) return <Empty title="Sin resultados">{empty}</Empty>;
  return (
    <div className="table-wrap" style={{ opacity: dim ? 0.55 : 1, transition: 'opacity .2s' }}>
      <table className="table table--stack">
        <thead>
          <tr>{columns.map((c) => <th key={c.key || c.label} className={c.className}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <motion.tr
              key={rowKey(r)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.012 }}
              className={onRowClick ? 'is-link' : ''}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key || c.label} data-label={c.label} className={`${c.className || ''} ${c.hideSm ? 'hide-sm' : ''}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

export function AuditDiff({ before, after }) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  if (!keys.length) return <span className="tiny muted">Sin detalle de cambios.</span>;
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <table className="diff">
      <thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="diff__before">{show(before?.[k])}</td>
            <td className="diff__after">{show(after?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Toolbar({ children }) {
  return <div className="adm-toolbar">{children}</div>;
}

export function Section({ title, children, actions, description }) {
  return (
    <section className="panel">
      <div className="panel__head">
        <div><h2>{title}</h2>{description && <p className="tiny muted" style={{ margin: '2px 0 0' }}>{description}</p>}</div>
        {actions}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.filter(Boolean).map(([k, v]) => (
        <span key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v ?? '—'}</dd></span>
      ))}
    </dl>
  );
}
