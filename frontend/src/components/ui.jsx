import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Minus, Plus, CheckCircle2, Clock3, AlertTriangle, XCircle, Circle, Info, ChevronLeft, ChevronRight, Inbox,
} from 'lucide-react';
import { label, TONE } from '../lib/labels.js';
import { money } from '../lib/format.js';

export function Loader({ label: text = 'Cargando…', inline = false }) {
  return (
    <div className="loader" style={inline ? { minHeight: 120 } : undefined} role="status" aria-live="polite">
      <div className="loader__ring" />
      <span className="small">{text}</span>
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon"><Icon size={24} /></div>
      {title && <h3>{title}</h3>}
      {children && <div style={{ maxWidth: '46ch' }}>{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <div className="empty__icon" style={{ background: 'var(--grana-50)', color: 'var(--grana)' }}><AlertTriangle size={24} /></div>
      <h3>No pudimos cargar la información</h3>
      <p>{error?.message || 'Revisa tu conexión e inténtalo de nuevo.'}</p>
      {onRetry && <button className="btn btn--ghost" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}

const TONE_ICON = { ok: CheckCircle2, info: Circle, warn: Clock3, serious: AlertTriangle, bad: XCircle, neutral: Circle };

export function Status({ value, text, tone }) {
  const t = tone || TONE[value] || 'neutral';
  const Icon = TONE_ICON[t];
  return (
    <span className={`chip chip--${t}`}>
      <Icon aria-hidden="true" />
      {text || label(value)}
    </span>
  );
}

export function Price({ price, finalPrice, compareAtPrice, size = 'md' }) {
  const fp = finalPrice ?? price;
  const old = compareAtPrice && Number(compareAtPrice) > Number(fp) ? compareAtPrice : null;
  return (
    <span className={`price price--${size}`}>
      <span className={`price__now num ${old ? 'is-sale' : ''}`}>{money(fp)}</span>
      {old && <s className="price__old num" aria-label={`Antes ${money(old)}`}>{money(old)}</s>}
    </span>
  );
}

export function Spinner() {
  return <span className="spin" aria-hidden="true" />;
}

export function Button({ loading, children, className = 'btn', disabled, ...rest }) {
  return (
    <button className={className} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Field({ label: text, error, hint, children, className = '', htmlFor }) {
  const id = useId();
  const forId = htmlFor || id;
  const child = typeof children === 'function' ? children({ id: forId, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? `${forId}-err` : undefined }) : children;
  return (
    <div className={`field ${className}`}>
      {text && <label htmlFor={forId}>{text}</label>}
      {child}
      {hint && !error && <span className="hint">{hint}</span>}
      <AnimatePresence>
        {error && (
          <motion.span id={`${forId}-err`} className="error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AlertTriangle size={13} /> {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 10, size = 'md', disabled }) {
  return (
    <div className={`qty qty--${size}`} role="group" aria-label="Cantidad">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="Disminuir cantidad"><Minus size={15} /></button>
      <span className="num" aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="Aumentar cantidad"><Plus size={15} /></button>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  const items = [];
  const push = (p) => items.push(p);
  const win = 1;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= win) push(p);
    else if (items[items.length - 1] !== '…') push('…');
  }
  return (
    <nav className="pager" aria-label="Paginación">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft size={16} style={{ margin: 'auto' }} /></button>
      {items.map((p, i) => (p === '…' ? <span key={`g${i}`} className="gap">…</span> : (
        <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>
      )))}
      <button onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Página siguiente"><ChevronRight size={16} style={{ margin: 'auto' }} /></button>
    </nav>
  );
}

function useLockScroll(open) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
}

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, children, footer, wide = false, labelledBy }) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useRef(null);
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.querySelector('input,select,textarea,button:not(.modal__close)')?.focus(), 60);
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            aria-labelledby={labelledBy}
            className={`modal ${wide ? 'modal--wide' : ''}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="modal__head">
              <h2>{title}</h2>
              <button className="btn btn--icon btn--ghost btn--sm modal__close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="modal__body">{children}</div>
            {footer && <div className="modal__foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({ open, onClose, children, side = 'right', label: aria }) {
  useLockScroll(open);
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="overlay" style={{ zIndex: 85 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={aria}
            className={`drawer ${side === 'left' ? 'drawer--left' : ''}`}
            initial={{ x: side === 'left' ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'left' ? '-100%' : '100%' }}
            transition={{ type: 'tween', duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Tabs({ tabs, value, onChange, id = 'tabs' }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className="tab" onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
          {value === t.value && <motion.span layoutId={`${id}-bar`} className="tab__bar" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = 'info', children, icon: Icon }) {
  const I = Icon || { info: Info, ok: CheckCircle2, warn: AlertTriangle, bad: XCircle }[tone];
  return (
    <div className={`notice notice--${tone}`} role={tone === 'bad' ? 'alert' : 'note'}>
      <I size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Img({ src, alt = '', className, ...rest }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div className={`img-fallback ${className || ''}`} aria-hidden={!alt} role={alt ? 'img' : undefined} aria-label={alt}>EXC</div>;
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setErr(true)} {...rest} />;
}

export function CountUp({ value, format = (v) => v, duration = 700 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = Number(from.current) || 0;
    const b = Number(value) || 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || a === b) {
      setShown(b);
      from.current = b;
      return undefined;
    }
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - (1 - k) ** 3;
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}
