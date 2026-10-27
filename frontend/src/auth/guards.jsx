import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useSession } from './session.jsx';
import { Loader } from '../components/ui.jsx';

export function RequireAuth({ children }) {
  const s = useSession();
  useEffect(() => {
    if (s.ready && !s.isAuthenticated) s.login();
  }, [s.ready, s.isAuthenticated]);
  if (!s.ready || !s.isAuthenticated || !s.user) return <Loader label="Verificando tu sesión…" />;
  return children;
}

export function RequirePermission({ perms, children }) {
  const s = useSession();
  if (!s.user) return <Loader />;
  if (perms && !s.can(...[].concat(perms))) return <Forbidden />;
  return children;
}

export function Forbidden() {
  return (
    <div className="empty" style={{ minHeight: '50vh' }}>
      <div className="empty__icon"><ShieldAlert size={26} /></div>
      <h3>No tienes acceso a esta sección</h3>
      <p>Tu rol no incluye el permiso necesario. Si crees que es un error, pide al administrador que lo revise.</p>
      <Link className="btn btn--ghost" to="/admin">Volver al panel</Link>
    </div>
  );
}
