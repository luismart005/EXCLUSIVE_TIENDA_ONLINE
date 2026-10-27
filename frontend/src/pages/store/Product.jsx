import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Ruler, Tag, Truck, PackageCheck, AlertTriangle, CheckCircle2, ShoppingBag } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useCart } from '../../store/cart.jsx';
import { Button, ErrorState, Img, Loader, Modal, Price, QtyStepper } from '../../components/ui.jsx';
import ProductCard from '../../components/ProductCard.jsx';
import { label } from '../../lib/labels.js';
import { toast } from '../../lib/alerts.js';

export default function Product() {
  const { slug } = useParams();
  const { data: p, error, loading, reload } = useApi(`/catalog/products/${slug}`, null, { auth: false, keepPrevious: false });
  const cart = useCart();
  const [colorId, setColorId] = useState(null);
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [guide, setGuide] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sizeError, setSizeError] = useState(false);

  useEffect(() => {
    if (!p) return;
    const firstAvailable = p.colors.find((c) => c.available) || p.colors[0];
    setColorId(firstAvailable?.id || null);
    setSize(null);
    setQty(1);
    setImg(0);
    document.title = `${p.name} · Exclusive`;
  }, [p]);

  const images = useMemo(() => {
    if (!p) return [];
    const byColor = p.images.filter((i) => i.colorId === colorId);
    return byColor.length ? [...byColor, ...p.images.filter((i) => i.colorId !== colorId)] : p.images;
  }, [p, colorId]);

  if (loading && !p) return <Loader label="Cargando producto…" />;
  if (error) return <div className="container"><ErrorState error={error} onRetry={reload} /></div>;
  if (!p) return null;

  const variantsOfColor = p.variants.filter((v) => v.colorId === colorId);
  const selected = variantsOfColor.find((v) => v.size === size);
  const colorName = p.colors.find((c) => c.id === colorId)?.name;
  const maxQty = selected ? Math.min(10, selected.available) : 10;

  const addToCart = async () => {
    if (!selected) {
      setSizeError(true);
      toast.warning('Selecciona una talla para continuar.');
      return;
    }
    setAdding(true);
    const ok = await cart.add(selected.id, qty);
    setAdding(false);
    if (ok) {
      toast.success(`${p.name} (${colorName}, ${size}) agregado al carrito.`, { action: { label: 'Ver carrito', onClick: () => cart.setOpen(true) } });
      cart.setOpen(true);
    }
  };

  return (
    <div className="container">
      <nav className="crumbs" aria-label="Ruta">
        <Link to="/">Inicio</Link><span>/</span><Link to={`/tienda/${p.category.slug}`}>{p.category.name}</Link><span>/</span><span>{p.name}</span>
      </nav>
      <div className="pdp">
        <div className="gallery">
          <div className="gallery__thumbs" role="tablist" aria-label="Imágenes del producto">
            {images.map((im, i) => (
              <button key={im.id} className={i === img ? 'on' : ''} onClick={() => setImg(i)} role="tab" aria-selected={i === img} aria-label={`Imagen ${i + 1}`}>
                <img src={im.thumbUrl} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <div className={`gallery__main ${zoom ? 'zoom' : ''}`} onClick={() => setZoom((z) => !z)} onMouseLeave={() => setZoom(false)}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img key={images[img]?.id} src={images[img]?.url} alt={images[img]?.alt || p.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
            </AnimatePresence>
            <div className="pcard__flags">
              {p.discountPercent > 0 && <span className="flag flag--sale">−{p.discountPercent} %</span>}
              {p.isNew && <span className="flag flag--new">Nuevo</span>}
            </div>
          </div>
        </div>

        <div className="buybox">
          <div className="stack" style={{ '--gap': '10px' }}>
            <span className="muted small">{p.category.name} · {label(p.gender)}</span>
            <h1>{p.name}</h1>
            <Price size="lg" price={p.price} finalPrice={selected?.finalPrice ?? p.finalPrice} compareAtPrice={selected?.compareAtPrice ?? p.compareAtPrice} />
            {p.promotion && <div className="promo-line"><Tag size={16} /> {p.promotion}: el descuento ya está aplicado.</div>}
          </div>

          <div>
            <div className="opt-label"><span>Color: <b>{colorName}</b></span></div>
            <div className="color-opts" role="radiogroup" aria-label="Color">
              {p.colors.map((c) => (
                <button key={c.id} role="radio" aria-checked={c.id === colorId} aria-label={`${c.name}${c.available ? '' : ' (agotado)'}`} title={c.name}
                  className={`color-opt ${c.id === colorId ? 'on' : ''} ${c.available ? '' : 'off'}`} style={{ background: c.hex }}
                  onClick={() => { setColorId(c.id); setImg(0); setSize(null); setQty(1); }} />
              ))}
            </div>
          </div>

          <div>
            <div className="opt-label">
              <span>Talla{size ? <>: <b>{size}</b></> : ''}</span>
              {p.sizeGuide && <button className="btn btn--link btn--sm" onClick={() => setGuide(true)}><Ruler size={15} /> Guía de tallas</button>}
            </div>
            <motion.div className="size-opts" role="radiogroup" aria-label="Talla" animate={sizeError ? { x: [0, -6, 6, -4, 4, 0] } : {}} transition={{ duration: 0.4 }} onAnimationComplete={() => setSizeError(false)}>
              {variantsOfColor.map((v) => (
                <button key={v.id} role="radio" aria-checked={size === v.size} className={`size-opt ${size === v.size ? 'on' : ''}`} disabled={v.available <= 0}
                  onClick={() => { setSize(v.size); setQty(1); }} aria-label={`Talla ${v.size}${v.available <= 0 ? ', agotada' : ''}`}>
                  {v.size}
                </button>
              ))}
            </motion.div>
            <div style={{ minHeight: 26, marginTop: 10 }}>
              {selected ? (
                selected.available <= 0 ? <span className="stock-note stock-note--out"><AlertTriangle size={16} /> Agotado en esta talla</span>
                  : selected.lowStock ? <span className="stock-note stock-note--low"><AlertTriangle size={16} /> Últimas {selected.available} unidades</span>
                    : <span className="stock-note stock-note--ok"><CheckCircle2 size={16} /> Disponible</span>
              ) : variantsOfColor.every((v) => v.available <= 0) ? (
                <span className="stock-note stock-note--out"><AlertTriangle size={16} /> Este color está agotado. Elige otro color.</span>
              ) : <span className="small muted">Selecciona tu talla para ver la disponibilidad.</span>}
            </div>
          </div>

          <div className="buy-row">
            <QtyStepper value={qty} onChange={setQty} max={Math.max(1, maxQty)} disabled={!selected} />
            <Button className="btn btn--primary btn--lg" loading={adding} onClick={addToCart} disabled={selected && selected.available <= 0}>
              <ShoppingBag size={18} /> Agregar al carrito
            </Button>
          </div>

          <div className="well small" style={{ display: 'grid', gap: 8 }}>
            <span className="row" style={{ '--gap': '10px' }}><Truck size={17} color="var(--jade)" /> Envío gratis en compras desde Q 600 en productos.</span>
            <span className="row" style={{ '--gap': '10px' }}><PackageCheck size={17} color="var(--jade)" /> Agregar al carrito no aparta la prenda: se reserva al confirmar tu pedido.</span>
          </div>

          <div className="accordion">
            <details open>
              <summary>Descripción <Plus size={18} /></summary>
              <div className="acc-body"><p style={{ margin: 0 }}>{p.description}</p>{selected && <p className="tiny muted" style={{ margin: '10px 0 0' }}>SKU: {selected.sku}</p>}</div>
            </details>
            {p.material && <details><summary>Material <Plus size={18} /></summary><div className="acc-body">{p.material}</div></details>}
            {p.care && <details><summary>Cuidados <Plus size={18} /></summary><div className="acc-body">{p.care}</div></details>}
            <details>
              <summary>Envíos y cambios <Plus size={18} /></summary>
              <div className="acc-body">Enviamos a 21 departamentos; la tarifa y el tiempo estimado se muestran al elegir tu dirección. Tienes 30 días desde la entrega para solicitar cambios o devoluciones. <Link to="/politicas/cambios-y-devoluciones">Ver política</Link>.</div>
            </details>
          </div>
        </div>
      </div>

      {p.related?.length > 0 && (
        <section style={{ paddingBottom: 72 }}>
          <div className="section__head"><h2 className="h2">También te puede gustar</h2></div>
          <div className="product-grid">{p.related.map((r, i) => <ProductCard key={r.id} p={r} index={i} />)}</div>
        </section>
      )}

      <Modal open={guide} onClose={() => setGuide(false)} title={`Guía de tallas · ${p.sizeGuide?.name || ''}`}>
        {p.sizeGuide && (
          <>
            <div className="table-wrap">
              <table className="size-table">
                <thead><tr>{p.sizeGuide.columns.map((c, i) => <th key={c}>{c}{i > 0 ? ` (${p.sizeGuide.unit})` : ''}</th>)}</tr></thead>
                <tbody>{p.sizeGuide.rows.map((r) => <tr key={r[0]} style={r[0] === size ? { background: 'var(--jade-50)' } : undefined}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {p.sizeGuide.notes && <p className="small muted" style={{ marginBottom: 0 }}>{p.sizeGuide.notes}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
