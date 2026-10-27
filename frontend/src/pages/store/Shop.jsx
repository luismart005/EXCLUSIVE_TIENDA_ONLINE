import { useMemo, useState } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, SearchX } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import ProductCard, { ProductGridSkeleton } from '../../components/ProductCard.jsx';
import { Drawer, Empty, Pagination } from '../../components/ui.jsx';
import { plural } from '../../lib/format.js';

const SORTS = [
  { value: 'relevancia', label: 'Recomendados' },
  { value: 'nuevos', label: 'Más recientes' },
  { value: 'precio-asc', label: 'Precio: menor a mayor' },
  { value: 'precio-desc', label: 'Precio: mayor a menor' },
  { value: 'nombre', label: 'Nombre (A–Z)' },
];

function Filters({ params, set, toggle, categories, filters, category }) {
  const sizes = params.getAll('size');
  const colors = params.getAll('color').map(Number);
  const [min, setMin] = useState(params.get('minPrice') || '');
  const [max, setMax] = useState(params.get('maxPrice') || '');
  return (
    <>
      <div className="filter-group">
        <h3>Categoría</h3>
        <div className="filter-list">
          <Link to={`/tienda?${new URLSearchParams([...params].filter(([k]) => k !== 'page'))}`} className={!category ? 'on' : ''}>Toda la tienda</Link>
          {(categories || []).map((c) => (
            <Link key={c.id} to={`/tienda/${c.slug}?${new URLSearchParams([...params].filter(([k]) => k !== 'page'))}`} className={category === c.slug ? 'on' : ''}>
              {c.name} <span className="faint small">{c.products}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <h3>Para</h3>
        <div className="filter-list">
          {[['', 'Todos'], ['MUJER', 'Mujer'], ['HOMBRE', 'Hombre']].map(([v, l]) => (
            <button key={v} className={(params.get('gender') || '') === v ? 'on' : ''} onClick={() => set('gender', v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <h3>Talla</h3>
        <div className="size-chips">
          {(filters?.sizes || []).map((s) => (
            <button key={s.id} className={`size-chip ${sizes.includes(s.code) ? 'on' : ''}`} aria-pressed={sizes.includes(s.code)} onClick={() => toggle('size', s.code)}>{s.code}</button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <h3>Color</h3>
        <div className="color-chips">
          {(filters?.colors || []).map((c) => (
            <button key={c.id} className={`color-chip ${colors.includes(c.id) ? 'on' : ''}`} style={{ background: c.hex }} title={c.name} aria-label={c.name} aria-pressed={colors.includes(c.id)} onClick={() => toggle('color', String(c.id))} />
          ))}
        </div>
      </div>
      <div className="filter-group">
        <h3>Precio (Q)</h3>
        <form className="row" style={{ '--gap': '8px' }} onSubmit={(e) => { e.preventDefault(); set({ minPrice: min, maxPrice: max }); }}>
          <input className="input input--sm" inputMode="numeric" placeholder={`Mín ${Math.floor(filters?.minPrice || 0)}`} value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))} aria-label="Precio mínimo" />
          <input className="input input--sm" inputMode="numeric" placeholder={`Máx ${Math.ceil(filters?.maxPrice || 0)}`} value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ''))} aria-label="Precio máximo" />
          <button className="btn btn--ghost btn--sm" type="submit">Ir</button>
        </form>
      </div>
      <div className="filter-group" style={{ display: 'grid', gap: 10 }}>
        <label className="check"><input type="checkbox" checked={params.get('onSale') === '1'} onChange={(e) => set('onSale', e.target.checked ? '1' : '')} /> Solo ofertas</label>
        <label className="check"><input type="checkbox" checked={params.get('inStock') === '1'} onChange={(e) => set('inStock', e.target.checked ? '1' : '')} /> Solo con existencias</label>
      </div>
    </>
  );
}

export default function Shop() {
  const { category } = useParams();
  const { categories } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState(false);
  const filters = useApi('/catalog/filters', null, { auth: false });

  const query = useMemo(() => ({
    category,
    search: params.get('search') || undefined,
    gender: params.get('gender') || undefined,
    size: params.getAll('size'),
    color: params.getAll('color'),
    minPrice: params.get('minPrice') || undefined,
    maxPrice: params.get('maxPrice') || undefined,
    onSale: params.get('onSale') || undefined,
    inStock: params.get('inStock') || undefined,
    sort: params.get('sort') || 'relevancia',
    page: params.get('page') || 1,
    pageSize: 12,
  }), [category, params]);
  const { data, loading } = useApi('/catalog/products', query, { auth: false });

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    const entries = typeof k === 'object' ? Object.entries(k) : [[k, v]];
    for (const [key, val] of entries) {
      if (val) next.set(key, val);
      else next.delete(key);
    }
    next.delete('page');
    setParams(next);
  };
  const toggle = (k, v) => {
    const next = new URLSearchParams(params);
    const all = next.getAll(k);
    next.delete(k);
    (all.includes(v) ? all.filter((x) => x !== v) : [...all, v]).forEach((x) => next.append(k, x));
    next.delete('page');
    setParams(next);
  };
  const cat = (categories || []).find((c) => c.slug === category);
  const title = params.get('search') ? `Resultados para “${params.get('search')}”` : params.get('onSale') === '1' && !cat ? 'Ofertas' : cat?.name || 'Toda la tienda';

  const chips = [];
  if (params.get('search')) chips.push(['search', null, `Búsqueda: ${params.get('search')}`]);
  if (params.get('gender')) chips.push(['gender', null, params.get('gender') === 'MUJER' ? 'Mujer' : 'Hombre']);
  params.getAll('size').forEach((s) => chips.push(['size', s, `Talla ${s}`]));
  params.getAll('color').forEach((c) => chips.push(['color', c, filters.data?.colors?.find((x) => String(x.id) === c)?.name || 'Color']));
  if (params.get('minPrice') || params.get('maxPrice')) chips.push(['price', null, `Q ${params.get('minPrice') || 0} – ${params.get('maxPrice') || '…'}`]);
  if (params.get('onSale')) chips.push(['onSale', null, 'Ofertas']);
  if (params.get('inStock')) chips.push(['inStock', null, 'Con existencias']);
  const removeChip = ([k, v]) => {
    if (k === 'price') return set({ minPrice: '', maxPrice: '' });
    if (v) return toggle(k, v);
    return set(k, '');
  };

  const filterProps = { params, set, toggle, categories, filters: filters.data, category };

  return (
    <>
      <div className="shop-head">
        <div className="container">
          <nav className="crumbs" aria-label="Ruta" style={{ paddingTop: 0 }}><Link to="/">Inicio</Link><span>/</span><Link to="/tienda">Tienda</Link>{cat && <><span>/</span><span>{cat.name}</span></>}</nav>
          <h1 className="display">{title}</h1>
          {cat?.description && <p className="lead" style={{ margin: '12px 0 0' }}>{cat.description}</p>}
        </div>
      </div>
      <div className="container shop-layout">
        <aside className="filters" aria-label="Filtros"><Filters {...filterProps} /></aside>
        <section>
          <div className="toolbar">
            <div className="row row--wrap" style={{ '--gap': '10px' }}>
              <button className="btn btn--ghost btn--sm only-sm" onClick={() => setDrawer(true)}><SlidersHorizontal size={16} /> Filtros</button>
              <span className="muted small" aria-live="polite">{data ? plural(data.total, 'producto', 'productos') : 'Buscando…'}</span>
              {chips.length > 0 && (
                <div className="active-filters">
                  {chips.map((c) => <button key={`${c[0]}-${c[1]}`} onClick={() => removeChip(c)}>{c[2]} <X size={13} /></button>)}
                  <button onClick={() => setParams(new URLSearchParams())} style={{ borderColor: 'transparent', color: 'var(--jade)' }}>Limpiar todo</button>
                </div>
              )}
            </div>
            <label className="row small" style={{ '--gap': '8px' }}>
              <span className="muted hide-sm">Ordenar por</span>
              <select className="select select--sm" style={{ width: 'auto' }} value={params.get('sort') || 'relevancia'} onChange={(e) => set('sort', e.target.value === 'relevancia' ? '' : e.target.value)}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
          {loading && !data ? <ProductGridSkeleton n={9} /> : data?.items?.length ? (
            <>
              <div className="product-grid" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
                {data.items.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
              </div>
              <Pagination page={data.page} pages={data.pages} onChange={(p) => { const n = new URLSearchParams(params); n.set('page', p); setParams(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </>
          ) : (
            <Empty icon={SearchX} title="No encontramos productos con esos filtros" action={<button className="btn btn--ghost" onClick={() => setParams(new URLSearchParams())}>Quitar filtros</button>}>
              Prueba con otra talla o color, amplía el rango de precio o revisa toda la tienda.
            </Empty>
          )}
        </section>
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} side="left" label="Filtros">
        <div className="cart-drawer__head"><h2>Filtros</h2><button className="btn btn--icon btn--ghost btn--sm" onClick={() => setDrawer(false)} aria-label="Cerrar"><X size={18} /></button></div>
        <div className="filters-drawer"><Filters {...filterProps} /></div>
        <div className="cart-drawer__foot"><button className="btn btn--primary btn--block" onClick={() => setDrawer(false)}>Ver {data ? plural(data.total, 'producto', 'productos') : 'productos'}</button></div>
      </Drawer>
    </>
  );
}
