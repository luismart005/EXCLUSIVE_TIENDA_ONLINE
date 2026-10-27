import { Link, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Truck, RefreshCcw, CreditCard, ShieldCheck, ArrowRight } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import ProductCard, { ProductGridSkeleton } from '../../components/ProductCard.jsx';
import { Img } from '../../components/ui.jsx';
import { money, date } from '../../lib/format.js';

function Rack({ products }) {
  const items = (products || []).slice(0, 3);
  const pos = [
    { left: '0%', rot: 9, delay: 0.1 },
    { left: '31.5%', rot: -7, delay: 0.25 },
    { left: '63%', rot: 6, delay: 0.4 },
  ];
  return (
    <div className="rack" aria-label="Prendas destacadas">
      <div className="rack__bar" />
      <div className="rack__bracket" style={{ left: '-1%' }} />
      {items.map((p, i) => (
        <motion.div
          key={p.id}
          className="hanging"
          style={{ left: pos[i].left }}
          initial={{ rotate: pos[i].rot, opacity: 0, y: -14 }}
          animate={{ rotate: [pos[i].rot, -pos[i].rot * 0.55, pos[i].rot * 0.25, -pos[i].rot * 0.1, 0], opacity: 1, y: 0 }}
          transition={{ duration: 2.4, delay: pos[i].delay, ease: [0.3, 0.6, 0.4, 1], opacity: { duration: 0.4, delay: pos[i].delay }, y: { duration: 0.5, delay: pos[i].delay } }}
          whileHover={{ rotate: [0, -3, 2, -1, 0], transition: { duration: 0.9 } }}
        >
          <Link to={`/producto/${p.slug}`} aria-label={`${p.name}, ${money(p.finalPrice)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="hanging__hook" aria-hidden="true" />
            <Img src={p.images?.[0]?.url} alt={p.name} />
            <span className="hanging__tag"><b>{p.name.split(' ').slice(0, 2).join(' ')}</b><span className="num">{money(p.finalPrice)}</span></span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export default function Home() {
  const { categories } = useOutletContext() || {};
  const featured = useApi('/catalog/products', { featured: 1, pageSize: 8, sort: 'relevancia' }, { auth: false });
  const newest = useApi('/catalog/products', { sort: 'nuevos', pageSize: 4 }, { auth: false });
  const promos = useApi('/catalog/promotions/active', null, { auth: false });
  const highlight = (promos.data || []).find((p) => p.type === 'PORCENTAJE' && p.scope !== 'TODO');
  const highlightProducts = useApi('/catalog/products', highlight ? { onSale: 1, pageSize: 1, category: highlight.scope === 'CATEGORIA' ? categories?.find((c) => c.id === highlight.categoryId)?.slug : undefined } : null, { auth: false, enabled: !!highlight && !!categories });
  const rackItems = (featured.data?.items || []).filter((p) => p.inStock);

  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero__copy">
            <h1 className="hero__title display">
              <span>Ropa para</span>
              <span>quedarse.</span>
            </h1>
            <p className="hero__lead">Básicos de algodón, lino fresco y mezclilla que aguanta. Compra en línea y recibe en cualquier departamento de Guatemala.</p>
            <div className="hero__ctas">
              <Link to="/tienda" className="btn btn--primary btn--lg">Ver la tienda <ArrowRight size={18} /></Link>
              <Link to="/tienda?sort=nuevos" className="btn btn--ghost btn--lg">Novedades</Link>
            </div>
            <div className="hero__facts">
              <div><strong>Envío gratis</strong>desde Q 600 en productos</div>
              <div><strong>30 días</strong>para cambios y devoluciones</div>
              <div><strong>3 formas de pago</strong>tarjeta, transferencia o contra entrega</div>
            </div>
          </div>
          {rackItems.length >= 3 ? <Rack products={rackItems} /> : <div className="rack" />}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <div>
              <h2 className="h2">Compra por categoría</h2>
              <p>Ocho líneas de prendas, todas con guía de tallas.</p>
            </div>
            <Link to="/tienda" className="btn btn--link">Ver todo <ArrowRight size={16} /></Link>
          </div>
          <div className="cat-strip">
            {(categories || []).map((c) => (
              <Link key={c.id} to={`/tienda/${c.slug}`} className="cat-tile">
                <div className="cat-tile__img"><Img src={c.imageUrl} alt="" /></div>
                <span>{c.name}</span>
                <small>{c.products} productos</small>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--stone">
        <div className="container">
          <div className="section__head">
            <div>
              <h2 className="h2">Lo que más se lleva</h2>
              <p>Las prendas destacadas con más ventas en los últimos 90 días.</p>
            </div>
            <Link to="/tienda" className="btn btn--link">Ver más <ArrowRight size={16} /></Link>
          </div>
          {featured.loading && !featured.data ? <ProductGridSkeleton n={8} /> : (
            <div className="product-grid">
              {(featured.data?.items || []).map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
            </div>
          )}
        </div>
      </section>

      {highlight && (
        <section className="section section--tight">
          <div className="container">
            <div className="promo-band">
              <div className="promo-band__copy">
                <span className="chip" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', justifySelf: 'start' }}>Hasta el {date(highlight.endsAt, { day: 'numeric', month: 'long' })}</span>
                <h2>{highlight.name}</h2>
                <p>{highlight.description} El descuento ya aparece en el precio de cada prenda; no necesitas cupón.</p>
                <Link to={highlight.scope === 'CATEGORIA' ? `/tienda/${categories?.find((c) => c.id === highlight.categoryId)?.slug || ''}` : '/tienda?onSale=1'} className="btn btn--primary btn--lg">Ver la promoción <ArrowRight size={18} /></Link>
              </div>
              <div className="promo-band__img">
                {highlightProducts.data?.items?.[0] && <Img src={highlightProducts.data.items[0].images?.[0]?.url} alt="" />}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <div className="section__head">
            <div>
              <h2 className="h2">Recién llegados</h2>
              <p>Lo último que agregamos al catálogo.</p>
            </div>
            <Link to="/tienda?sort=nuevos" className="btn btn--link">Ver novedades <ArrowRight size={16} /></Link>
          </div>
          {newest.loading && !newest.data ? <ProductGridSkeleton n={4} /> : (
            <div className="product-grid">
              {(newest.data?.items || []).map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
            </div>
          )}
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 64 }}>
        <div className="benefits">
          <div className="benefit"><Truck size={24} /><strong>Envíos a 21 departamentos</strong><span>Tarifa y tiempo según tu destino, visibles antes de pagar.</span></div>
          <div className="benefit"><RefreshCcw size={24} /><strong>Cambios en 30 días</strong><span>Solicítalos desde tu pedido y sigue cada paso.</span></div>
          <div className="benefit"><CreditCard size={24} /><strong>Paga como prefieras</strong><span>Tarjeta, transferencia o contra entrega (simulados).</span></div>
          <div className="benefit"><ShieldCheck size={24} /><strong>Cuenta protegida</strong><span>Inicio de sesión con OpenID Connect y contraseñas cifradas.</span></div>
        </div>
      </section>
    </>
  );
}
