import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DataTable, SearchInput, Toolbar } from '../../components/admin.jsx';
import { Img, Pagination, Status } from '../../components/ui.jsx';
import { money, int } from '../../lib/format.js';
import { useParamsState } from './Orders.jsx';

export function ProductsList() {
  const s = useSession();
  const navigate = useNavigate();
  const [f, set] = useParamsState({ page: '1' });
  const cats = useApi('/catalog/admin/categories');
  const { data, error, loading, reload } = useApi('/catalog/admin/products', { ...f, pageSize: 20 });
  return (
    <>
      <PageHeader
        title="Productos"
        description="Los productos con ventas o movimientos de inventario se desactivan en lugar de eliminarse, para conservar su historial."
        actions={s.can('catalog.manage') && <button className="btn btn--primary btn--sm" onClick={() => navigate('/admin/productos/nuevo')}><Plus size={16} /> Nuevo producto</button>}
      />
      <Toolbar>
        <SearchInput value={f.search} onChange={(v) => set({ search: v })} placeholder="Nombre o SKU" />
        <select className="select select--sm" value={f.categoryId || ''} onChange={(e) => set({ categoryId: e.target.value })} aria-label="Categoría">
          <option value="">Categoría: todas</option>
          {(cats.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select select--sm" value={f.status || ''} onChange={(e) => set({ status: e.target.value })} aria-label="Estado">
          <option value="">Estado: todos</option>
          <option value="ACTIVO">Activos</option>
          <option value="BORRADOR">Borradores</option>
          <option value="INACTIVO">Inactivos</option>
        </select>
        {data && <span className="small muted">{int(data.total)} productos</span>}
      </Toolbar>
      <section className="panel">
        <DataTable
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          dim={loading}
          onRowClick={(p) => navigate(`/admin/productos/${p.id}`)}
          columns={[
            { key: 'name', label: 'Producto', render: (p) => <div className="row" style={{ '--gap': '12px' }}><Img src={p.cover} alt="" className="thumb thumb--lg" /><div><div className="strong">{p.name}</div><div className="tiny muted">{p.category.name} · {p.variants.length} variantes{p.featured ? ' · destacado' : ''}</div></div></div> },
            { key: 'price', label: 'Precio', className: 'r', render: (p) => <><span className="num strong">{money(p.basePrice)}</span>{p.compareAtPrice && <div className="tiny faint num"><s>{money(p.compareAtPrice)}</s></div>}</> },
            { key: 'stock', label: 'Disponible', className: 'r', render: (p) => <><span className="num">{int(p.stock.available)}</span><div className="tiny muted num">{int(p.stock.physical)} físicas · {int(p.stock.reserved)} reservadas</div></> },
            { key: 'sold', label: 'Vendidas', className: 'r', render: (p) => <span className="num">{int(p.sold)}</span>, hideSm: true },
            { key: 'status', label: 'Estado', render: (p) => <Status value={p.status} /> },
          ]}
        />
        {data && <div style={{ padding: '0 16px 12px' }}><Pagination page={data.page} pages={data.pages} onChange={(p) => set({ page: String(p) }, { resetPage: false })} /></div>}
      </section>
    </>
  );
}
