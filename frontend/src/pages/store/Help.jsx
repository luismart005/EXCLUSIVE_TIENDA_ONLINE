import { Link, useOutletContext } from 'react-router-dom';
import { Phone, Mail, Clock, MapPin, MessageCircle } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { money } from '../../lib/format.js';

const FAQ = [
  ['¿Cuándo se reserva mi prenda?', 'Al confirmar el pedido. Agregar al carrito no aparta existencias. Con tarjeta tienes 30 minutos para completar el pago y con transferencia 48 horas para subir el comprobante; si no se completa, la reserva se libera automáticamente.'],
  ['¿Cómo pago con transferencia?', 'Elige "Transferencia" al confirmar. En el detalle del pedido verás la cuenta (simulada) y podrás subir la imagen o PDF del comprobante. El pago se confirma cuando nuestro equipo lo revisa.'],
  ['¿Puedo cancelar un pedido?', 'Sí, mientras esté pendiente de pago o confirmado. Una vez en preparación, escríbenos para ayudarte.'],
  ['¿Cómo solicito un cambio o devolución?', 'Desde "Mis pedidos", abre el pedido entregado y elige "Solicitar cambio o devolución". Tienes 30 días desde la entrega.'],
  ['¿Las facturas tienen validez fiscal?', 'No. Este es un entorno académico: los comprobantes llevan la leyenda "SIMULACIÓN — SIN VALIDEZ FISCAL".'],
];

export default function Help() {
  const { store } = useOutletContext() || {};
  const info = store?.info || {};
  const zones = useApi('/sales/shipping/zones', null, { auth: false });
  return (
    <div className="container" style={{ paddingBottom: 72 }}>
      <div className="page-head"><h1>Ayuda y contacto</h1><p className="lead" style={{ margin: '8px 0 0' }}>Estamos para ayudarte con tu compra, entregas y cambios.</p></div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="panel"><div className="panel__body stack">
          <h2 className="h3">Contáctanos</h2>
          <span className="row"><Phone size={18} color="var(--jade)" /> {info.phone}</span>
          <span className="row"><MessageCircle size={18} color="var(--jade)" /> WhatsApp {info.whatsapp}</span>
          <span className="row"><Mail size={18} color="var(--jade)" /> <a href={`mailto:${info.email}`}>{info.email}</a></span>
          <span className="row"><Clock size={18} color="var(--jade)" /> {info.hours}</span>
          <span className="row"><MapPin size={18} color="var(--jade)" /> {info.address}</span>
          <p className="tiny muted" style={{ margin: 0 }}>{info.sellerInfo}</p>
          <p className="small" style={{ margin: 0 }}>Para reclamos también puedes acudir a la Dirección de Atención y Asistencia al Consumidor (DIACO). <Link to="/politicas/reclamos">Ver política de reclamos</Link>.</p>
        </div></div>
        <div className="accordion">
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q} <span aria-hidden="true">+</span></summary><div className="acc-body">{a}</div></details>
          ))}
        </div>
      </div>
      <h2 className="h2 mt-4 mb-2">Cobertura y tarifas de envío</h2>
      <div className="panel table-wrap">
        <table className="table">
          <thead><tr><th>Departamento</th><th>Tarifa</th><th>Tiempo estimado</th></tr></thead>
          <tbody>
            {(zones.data || []).map((z) => (
              <tr key={z.id}><td>{z.department}</td><td className="num">{z.covered ? money(z.rate) : '—'}</td><td>{z.covered ? z.estimatedDays : <span className="chip chip--neutral">Sin cobertura por ahora</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted mt-1">Envío gratis en compras desde Q 600 en productos.</p>
    </div>
  );
}
