import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MailCheck, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useAuth } from 'react-oidc-context';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { Button, Field, Loader, Notice } from '../../components/ui.jsx';
import { success, apiError } from '../../lib/alerts.js';

const RULES = [
  [/.{8,}/, 'Al menos 8 caracteres'],
  [/[a-z]/, 'Una letra minúscula'],
  [/[A-Z]/, 'Una letra mayúscula'],
  [/\d/, 'Un número'],
];

export function PasswordInput({ value, onChange, id, autoComplete = 'new-password', showRules = true, ...rest }) {
  const [show, setShow] = useState(false);
  const score = RULES.filter(([r]) => r.test(value)).length;
  return (
    <>
      <div style={{ position: 'relative' }}>
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} style={{ paddingRight: 48 }} {...rest} />
        <button type="button" className="btn btn--icon btn--sm btn--link" style={{ position: 'absolute', right: 4, top: 5 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {showRules && (
        <>
          <div className="pw-meter" data-score={value ? score : 0} aria-hidden="true"><span /><span /><span /><span /></div>
          <ul className="pw-rules">{RULES.map(([r, t]) => <li key={t} className={r.test(value) ? 'ok' : ''}>{r.test(value) ? '✓' : '·'} {t}</li>)}</ul>
        </>
      )}
    </>
  );
}

export function Register() {
  const session = useSession();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', acceptTerms: false });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api.post('/auth/register', form, { auth: false });
      await success('¡Cuenta creada!', 'Te enviamos un correo de bienvenida al buzón de pruebas. Ahora inicia sesión.');
      session.login('/tienda', { login_hint: form.email, extraQueryParams: { registered: '1' } });
    } catch (err) {
      setErrors(err.fields || {});
      if (!Object.keys(err.fields || {}).length) apiError(err);
    } finally {
      setSaving(false);
    }
  };
  if (session.ready && session.isAuthenticated) {
    return <div className="auth-page"><div className="auth-card"><Notice tone="ok">Ya iniciaste sesión. <Link to="/tienda">Ir a la tienda</Link></Notice></div></div>;
  }
  return (
    <div className="auth-page">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1>Crea tu cuenta</h1>
        <p className="muted" style={{ margin: '0 0 24px' }}>Guarda tus direcciones, sigue tus pedidos y recibe 10 % de descuento en tu primera compra.</p>
        <form className="form-grid" onSubmit={submit} noValidate>
          <Field label="Nombre" error={errors.firstName}>{(a) => <input className="input" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" {...a} />}</Field>
          <Field label="Apellido" error={errors.lastName}>{(a) => <input className="input" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" {...a} />}</Field>
          <Field label="Correo electrónico" error={errors.email} className="span-2">{(a) => <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" {...a} />}</Field>
          <Field label="Teléfono (opcional)" error={errors.phone} className="span-2">{(a) => <input className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" {...a} />}</Field>
          <Field label="Contraseña" error={errors.password} className="span-2">{(a) => <PasswordInput value={form.password} onChange={set('password')} {...a} />}</Field>
          <div className="span-2">
            <label className="check"><input type="checkbox" checked={form.acceptTerms} onChange={set('acceptTerms')} /> <span>Acepto los <Link to="/politicas/terminos" target="_blank">términos</Link> y la <Link to="/politicas/privacidad" target="_blank">política de privacidad</Link>.</span></label>
            {errors.acceptTerms && <p className="field-error" role="alert">{errors.acceptTerms}</p>}
          </div>
          <Button className="btn btn--primary btn--lg btn--block span-2" loading={saving} type="submit">Crear cuenta</Button>
        </form>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 20 }}>¿Ya tienes cuenta? <button className="btn btn--link" style={{ padding: 0, minHeight: 0 }} onClick={() => session.login('/tienda')}>Inicia sesión</button></p>
      </motion.div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post('/auth/password/forgot', { email }, { auth: false });
      setSent(r.message);
    } catch (err) {
      setError(err.fields?.email || err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="auth-page">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {sent ? (
          <div className="success" style={{ paddingTop: 0 }}>
            <div className="success__mark"><MailCheck size={38} /></div>
            <h1 style={{ fontSize: 28 }}>Revisa tu correo</h1>
            <p className="muted">{sent}</p>
            <Link to={`/buzon?to=${encodeURIComponent(email)}`} className="btn btn--primary">Abrir buzón de pruebas</Link>
          </div>
        ) : (
          <>
            <h1>Recupera tu acceso</h1>
            <p className="muted" style={{ margin: '0 0 24px' }}>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva contraseña. El enlace vence en 30 minutos.</p>
            <form className="stack" onSubmit={submit} noValidate>
              <Field label="Correo electrónico" error={error}>{(a) => <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus {...a} />}</Field>
              <Button className="btn btn--primary btn--lg btn--block" loading={saving} type="submit">Enviar enlace</Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const session = useSession();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setErrors({ confirm: 'Las contraseñas no coinciden.' });
    setSaving(true);
    setErrors({});
    try {
      const r = await api.post('/auth/password/reset', { token, password }, { auth: false });
      await success('Contraseña actualizada', r.message);
      session.login('/tienda');
    } catch (err) {
      setErrors({ password: err.fields?.password, general: err.fields?.password ? null : err.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="auth-page">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="success__mark" style={{ width: 60, height: 60, marginBottom: 16 }}><KeyRound size={28} /></div>
        <h1>Crea una nueva contraseña</h1>
        <p className="muted" style={{ margin: '0 0 20px' }}>Al guardarla cerraremos todas tus sesiones abiertas.</p>
        {!token && <Notice tone="bad">El enlace no es válido. <Link to="/recuperar">Solicita uno nuevo</Link>.</Notice>}
        {errors.general && <div className="mb-2"><Notice tone="bad">{errors.general} <Link to="/recuperar">Solicitar otro enlace</Link></Notice></div>}
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="Nueva contraseña" error={errors.password}>{(a) => <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} {...a} />}</Field>
          <Field label="Confirma la contraseña" error={errors.confirm}>{(a) => <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} showRules={false} {...a} />}</Field>
          <Button className="btn btn--primary btn--lg btn--block" loading={saving} disabled={!token} type="submit">Guardar contraseña</Button>
        </form>
      </motion.div>
    </div>
  );
}

export function Callback() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.error) {
      const t = setTimeout(() => navigate('/', { replace: true }), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [auth.error, navigate]);
  if (auth.error) {
    return <div className="auth-page"><div className="auth-card"><Notice tone="bad">No se pudo completar el inicio de sesión: {auth.error.message}. Te llevaremos al inicio…</Notice></div></div>;
  }
  return <Loader label="Iniciando sesión…" />;
}

export function NotFound() {
  return (
    <div className="container">
      <div className="success">
        <span className="display" style={{ fontSize: 96, color: 'var(--line)' }}>404</span>
        <h1 style={{ fontSize: 28 }}>Esta página no existe</h1>
        <p className="muted">Puede que el enlace esté mal escrito o que el producto ya no esté disponible.</p>
        <div className="row"><Link to="/" className="btn btn--ghost">Ir al inicio</Link><Link to="/tienda" className="btn btn--primary">Ver la tienda</Link></div>
      </div>
    </div>
  );
}
