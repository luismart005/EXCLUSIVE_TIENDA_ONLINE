import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Database, Server, ShieldCheck, Shirt, Boxes, ShoppingCart, BarChart3, Network, RefreshCw } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { PageHeader } from '../../components/admin.jsx';
import { Loader, Notice, Status } from '../../components/ui.jsx';
import { relative } from '../../lib/format.js';

const INFO = {
  auth: { icon: ShieldCheck, title: 'auth-service', desc: 'Proveedor OAuth 2.0 / OpenID Connect, usuarios, roles, permisos, direcciones y buzón de pruebas.', port: 4001 },
  catalog: { icon: Shirt, title: 'catalog-service', desc: 'Catálogo público, productos, variantes, imágenes, categorías, configuración y políticas.', port: 4002 },
  inventory: { icon: Boxes, title: 'inventory-service', desc: 'Existencias, reservas, kardex, compras a proveedores y alertas de mínimos.', port: 4003 },
  sales: { icon: ShoppingCart, title: 'sales-service', desc: 'Carrito, checkout, pedidos, pagos simulados, comprobantes, envíos, posventa y promociones.', port: 4004 },
  analytics: { icon: BarChart3, title: 'analytics-service', desc: 'Reportes, panel, auditoría e inteligencia artificial (TensorFlow.js en proceso aparte).', port: 4005 },
};

const uptime = (s) => (s >= 86400 ? `${Math.floor(s / 86400)} d ${Math.floor((s % 86400) / 3600)} h` : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);

export default function SystemHealth() {
  const { data, loading, reload, error } = useApi('/health');
  useEffect(() => { const t = setInterval(reload, 10000); return () => clearInterval(t); }, [reload]);
  return (
    <>
      <PageHeader title="Estado del sistema" description="Comprobación de funcionamiento de cada microservicio y de su conexión con PostgreSQL. Se actualiza cada 10 segundos." actions={<button className="btn btn--ghost btn--sm" onClick={reload}><RefreshCw size={15} /> Actualizar</button>} />
      {error && !data?.services ? <Notice tone="bad">No se pudo consultar el estado: {error.message}</Notice> : !data ? <Loader /> : (
        <div className="stack" style={{ '--gap': '20px' }}>
          <Notice tone={data.status === 'ok' ? 'ok' : 'bad'}>{data.status === 'ok' ? 'Todos los servicios responden y tienen conexión con la base de datos.' : 'Hay servicios con problemas. Revisa que estén en ejecución y que PostgreSQL esté disponible.'} · consultado {relative(data.time)}</Notice>
          <section className="panel arch">
            <div className="panel__head"><h2 className="row"><Network size={18} /> Arquitectura</h2><span className="tiny muted">El navegador solo habla con el gateway; los servicios escuchan en 127.0.0.1</span></div>
            <div className="panel__body arch__body">
              <div className="arch__node arch__node--edge"><Server size={18} /><b>API Gateway</b><span className="tiny muted">:4000 · Helmet, límite de solicitudes, enrutamiento, React</span><Status tone="ok" text={data.gateway.mode} /></div>
              <div className="arch__lines" aria-hidden="true" />
              <div className="arch__services">
                {data.services.map((sv, i) => {
                  const inf = INFO[sv.name] || { icon: Activity, title: sv.name };
                  return (
                    <motion.div key={sv.name} className={`arch__node ${sv.ok ? '' : 'is-down'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: loading ? 0.7 : 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <inf.icon size={18} />
                      <b>{inf.title}</b>
                      <span className="tiny muted">{inf.desc}</span>
                      <div className="arch__meta">
                        <Status tone={sv.ok ? 'ok' : 'bad'} text={sv.ok ? 'En línea' : 'Sin respuesta'} />
                        {sv.ok && <span className="tiny muted num">:{inf.port} · {sv.latencyMs} ms · BD {sv.dbLatencyMs} ms · {uptime(sv.uptimeSeconds)} · {sv.memoryMb} MB</span>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div className="arch__lines" aria-hidden="true" />
              <div className="arch__node arch__node--db"><Database size={18} /><b>PostgreSQL</b><span className="tiny muted">exclusive_db · Prisma ORM · propiedad de tablas por servicio · bitácora inmutable</span></div>
            </div>
          </section>
          <p className="tiny muted">La comunicación entre servicios usa tokens OAuth 2.0 “client credentials” con audiencia interna; los usuarios usan tokens JWT firmados (RS256) que cada servicio valida con las llaves públicas (JWKS) del proveedor.</p>
        </div>
      )}
    </>
  );
}
