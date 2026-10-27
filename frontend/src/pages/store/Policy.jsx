import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../../lib/useApi.js';
import { ErrorState, Loader } from '../../components/ui.jsx';
import { dateLong } from '../../lib/format.js';

export function Markdown({ text = '' }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (b.startsWith('## ')) return <Fragment key={i}><h2>{b.slice(3).split('\n')[0]}</h2>{lines.length > 1 && <p>{lines.slice(1).join(' ')}</p>}</Fragment>;
        if (lines.every((l) => /^\d+\.\s/.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^\d+\.\s/, '')}</li>)}</ol>;
        if (lines.every((l) => /^[-*]\s/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
        return <p key={i}>{lines.join(' ')}</p>;
      })}
    </div>
  );
}

export default function Policy() {
  const { slug } = useParams();
  const { data, error, loading } = useApi(`/catalog/policies/${slug}`, null, { auth: false, keepPrevious: false });
  if (loading) return <Loader />;
  if (error) return <div className="container"><ErrorState error={error} /></div>;
  return (
    <div className="container" style={{ paddingBottom: 72 }}>
      <nav className="crumbs"><Link to="/">Inicio</Link><span>/</span><span>Políticas</span></nav>
      <h1 className="h1">{data.title}</h1>
      <p className="muted small" style={{ margin: '8px 0 28px' }}>Versión {data.version} · publicada el {dateLong(data.publishedAt)}</p>
      <Markdown text={data.content} />
    </div>
  );
}
