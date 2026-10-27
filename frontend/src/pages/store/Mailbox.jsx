import { useEffect, useState } from 'react';
import { Mail, Inbox } from 'lucide-react';
import { api } from '../../api/client.js';
import { useApi } from '../../lib/useApi.js';
import { Empty, Loader, Notice, Pagination } from '../../components/ui.jsx';
import { relative, dateTime } from '../../lib/format.js';

export default function Mailbox() {
  const [page, setPage] = useState(1);
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = useApi('/auth/mailbox', { page, to: to || undefined, pageSize: 20 });
  useEffect(() => {
    if (!selected) return setMsg(null);
    api.get(`/auth/mailbox/${selected}`).then(setMsg).catch(() => setMsg(null));
  }, [selected]);
  return (
    <div className="container" style={{ paddingBottom: 72 }}>
      <div className="page-head">
        <h1>Buzón de pruebas</h1>
        <p className="lead" style={{ margin: '8px 0 0' }}>Aquí llegan los correos del sistema (bienvenida, recuperación de contraseña, avisos de pedidos). No se envían por internet.</p>
      </div>
      <div className="row mb-2">
        <input className="input" style={{ maxWidth: 360 }} placeholder="Filtrar por destinatario (correo)" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>
      {list.error ? <Notice tone="warn">{list.error.message}</Notice> : !list.data ? <Loader /> : list.data.items.length === 0 ? <Empty icon={Inbox} title="No hay mensajes">Cuando el sistema envíe un correo aparecerá aquí.</Empty> : (
        <div className="mailbox">
          <div className="mailbox__list">
            {list.data.items.map((m) => (
              <button key={m.id} className={`mailbox__item ${selected === m.id ? 'on' : ''} ${m.readAt ? '' : 'unread'}`} onClick={() => setSelected(m.id)}>
                <span className="row row--between small"><b className="truncate">{m.toEmail}</b><span className="tiny muted nowrap">{relative(m.createdAt)}</span></span>
                <span className="small truncate">{m.subject}</span>
              </button>
            ))}
            <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />
          </div>
          <div className="mailbox__view">
            {msg ? (
              <>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-2)' }}>
                  <div className="strong">{msg.subject}</div>
                  <div className="tiny muted">Para {msg.toEmail} · {dateTime(msg.createdAt)}</div>
                </div>
                <iframe title={msg.subject} sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" srcDoc={msg.html.replace('<head>', '<head><base target="_top">').replace('<html lang="es">', '<html lang="es"><head><base target="_top"></head>')} />
              </>
            ) : <Empty icon={Mail} title="Selecciona un mensaje">Elige un correo de la lista para verlo.</Empty>}
          </div>
        </div>
      )}
    </div>
  );
}
