import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Img, Price } from './ui.jsx';

export default function ProductCard({ p, index = 0 }) {
  const [a, b] = p.images || [];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.03 }}>
      <Link to={`/producto/${p.slug}`} className="pcard">
        <div className="pcard__media">
          <Img src={a?.thumbUrl} alt={a?.alt || p.name} />
          {b && <img src={b.thumbUrl} alt="" className="alt" loading="lazy" aria-hidden="true" />}
          <div className="pcard__flags">
            {p.discountPercent > 0 && <span className="flag flag--sale">−{p.discountPercent} %</span>}
            {p.isNew && <span className="flag flag--new">Nuevo</span>}
            {!p.inStock && <span className="flag flag--out">Agotado</span>}
          </div>
          {p.sizes?.length > 0 && (
            <div className="pcard__quick" aria-label="Tallas disponibles">
              {p.sizes.map((s) => <span key={s.code} className={s.available ? '' : 'off'}>{s.code}</span>)}
            </div>
          )}
        </div>
        <div className="pcard__meta">
          <span className="pcard__cat">{p.category?.name}</span>
          <span className="swatches" aria-label={`${p.colors.length} colores`}>
            {p.colors.slice(0, 5).map((c) => <span key={c.id} className={`swatch-dot ${c.available ? '' : 'off'}`} style={{ background: c.hex }} title={c.name} />)}
          </span>
        </div>
        <span className="pcard__name">{p.name}</span>
        <Price price={p.price} finalPrice={p.finalPrice} compareAtPrice={p.compareAtPrice} />
        {p.promotion && <span className="tiny" style={{ color: 'var(--grana-700)', marginTop: -4 }}>{p.promotion}</span>}
      </Link>
    </motion.div>
  );
}

export function ProductGridSkeleton({ n = 8 }) {
  return (
    <div className="product-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="stack" style={{ '--gap': '10px' }}>
          <div className="skeleton" style={{ aspectRatio: '4 / 5' }} />
          <div className="skeleton" style={{ height: 14, width: '40%' }} />
          <div className="skeleton" style={{ height: 16, width: '80%' }} />
          <div className="skeleton" style={{ height: 16, width: '30%' }} />
        </div>
      ))}
    </div>
  );
}
