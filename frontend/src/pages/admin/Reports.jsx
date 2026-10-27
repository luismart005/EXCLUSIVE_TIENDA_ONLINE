import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, DateRange, ChartCard, ExportButton, Kpi, DataTable } from '../../components/admin.jsx';
import { ErrorState, Loader, Tabs } from '../../components/ui.jsx';
import { money, moneyShort, int, isoToday, shortDay, monthLabel, pct } from '../../lib/format.js';
import { label, MOVEMENT_LABELS } from '../../lib/labels.js';
import { lineOptions, hbarOptions, vbarOptions, lineDataset, barDataset } from '../../lib/charts.js';

const TABS = [
  { value: 'ventas', label: 'Ventas por período' },
  { value: 'productos', label: 'Productos' },
  { value: 'dimensiones', label: 'Categoría, talla y color' },
  { value: 'descuentos', label: 'Descuentos' },
  { value: 'devoluciones', label: 'Cancelaciones y devoluciones' },
  { value: 'inventario', label: 'Inventario' },
];

function SalesTab({ range }) {
  const s = useSession();
  const [groupBy, setGroupBy] = useState('week');
  const { data, error, loading, reload } = useApi('/analytics/reports/sales', { ...range, groupBy });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loader inline />;
  const k = data.kpis;
  const fmt = (iso) => (groupBy === 'month' ? monthLabel(iso) : shortDay(iso));
  return (
    <div className="stack" style={{ '--gap': '20px', opacity: loading ? 0.6 : 1 }}>
      <div className="kpis">
        <Kpi label="Ventas" value={moneyShort(k.sales)} hint={`${int(k.orders)} pedidos`} />
        <Kpi label="Cobrado (simulado)" value={moneyShort(k.collected)} hint="pagos aprobados" />
        <Kpi label="Unidades" value={int(k.units)} hint={`${int(k.buyers)} clientes`} />
        <Kpi label="Descuentos" value={moneyShort(k.discounts)} />
        <Kpi label="Cancelados" value={int(k.cancelled)} hint={`${pct(k.cancelRate)} de los pedidos`} />
        <Kpi label="Reembolsado" value={moneyShort(k.refunded)} hint={`${int(k.refunds)} reembolsos`} />
      </div>
      <ChartCard
        title="Ventas, cobros y reembolsos"
        subtitle="Quetzales por período · una sola escala"
        height={320}
        actions={(
          <>
            <div className="seg seg--sm" role="group" aria-label="Agrupar por">
              {[['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']].map(([v, l]) => <button key={v} type="button" className={groupBy === v ? 'on' : ''} onClick={() => setGroupBy(v)}>{l}</button>)}
            </div>
            {s.can('reports.export') && <ExportButton path="/analytics/reports/sales" query={{ ...range, groupBy, format: 'csv' }} filename={`ventas-${range.from}-a-${range.to}.csv`} label="CSV" />}
          </>
        )}
        table={(
          <table className="table">
            <thead><tr><th>Período</th><th className="r">Pedidos</th><th className="r">Unid.</th><th className="r">Subtotal</th><th className="r">Desc.</th><th className="r">Envío</th><th className="r">Ventas</th><th className="r">Cobrado</th><th className="r">Cancel.</th><th className="r">Reembolsado</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.period}><td>{fmt(r.period)}</td><td className="r num">{r.orders}</td><td className="r num">{r.units}</td><td className="r num">{money(r.gross)}</td><td className="r num">{money(r.discounts)}</td><td className="r num">{money(r.shipping)}</td><td className="r num strong">{money(r.sales)}</td><td className="r num">{money(r.collected)}</td><td className="r num">{r.cancelled}</td><td className="r num">{money(r.refunded)}</td></tr>)}</tbody>
          </table>
        )}
      >
        <Line
          data={{ labels: data.rows.map((r) => fmt(r.period)), datasets: [lineDataset('Ventas', data.rows.map((r) => Number(r.sales)), 0, { fill: true }), lineDataset('Cobrado', data.rows.map((r) => Number(r.collected)), 1), lineDataset('Reembolsado', data.rows.map((r) => Number(r.refunded)), 2)] }}
          options={lineOptions({ money: true, legend: true })}
        />
      </ChartCard>
      <ChartCard title="Pedidos y cancelaciones" subtitle="Cantidad de pedidos por período" height={240}
        table={<table className="table"><thead><tr><th>Período</th><th className="r">Pedidos</th><th className="r">Cancelados</th></tr></thead><tbody>{data.rows.map((r) => <tr key={r.period}><td>{fmt(r.period)}</td><td className="r num">{r.orders}</td><td className="r num">{r.cancelled}</td></tr>)}</tbody></table>}>
        <Bar data={{ labels: data.rows.map((r) => fmt(r.period)), datasets: [barDataset('Pedidos', data.rows.map((r) => r.orders), 0), barDataset('Cancelados', data.rows.map((r) => r.cancelled), 2)] }} options={vbarOptions({ legend: true })} />
      </ChartCard>
    </div>
  );
}

function ProductsTab({ range }) {
  const s = useSession();
  const { data, error, loading, reload } = useApi('/analytics/reports/products', range);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loader inline />;
  return (
    <div className="stack" style={{ '--gap': '20px', opacity: loading ? 0.6 : 1 }}>
      <ChartCard title="Productos más vendidos" subtitle="Unidades en el período" height={Math.max(260, data.top.length * 28)}
        actions={s.can('reports.export') && <ExportButton path="/analytics/reports/products" query={{ ...range, format: 'csv' }} filename="mas-vendidos.csv" label="CSV" />}
        table={<table className="table"><thead><tr><th>Producto</th><th>Categoría</th><th className="r">Unidades</th><th className="r">Pedidos</th><th className="r">Ventas</th></tr></thead><tbody>{data.top.map((t) => <tr key={t.productId}><td><Link to={`/admin/productos/${t.productId}`}>{t.name}</Link></td><td>{t.category}</td><td className="r num">{t.units}</td><td className="r num">{t.orders}</td><td className="r num">{money(t.revenue)}</td></tr>)}</tbody></table>}>
        <Bar data={{ labels: data.top.map((t) => t.name), datasets: [barDataset('Unidades', data.top.map((t) => t.units), 0)] }} options={hbarOptions()} />
      </ChartCard>
      <section className="panel">
        <div className="panel__head">
          <div><h2>Productos con poca rotación</h2><p className="tiny muted" style={{ margin: '2px 0 0' }}>Productos activos con existencias y pocas ventas en el período (rotación = unidades vendidas ÷ existencia física)</p></div>
          {s.can('reports.export') && <ExportButton path="/analytics/reports/products" query={{ ...range, format: 'csv', kind: 'low' }} filename="baja-rotacion.csv" label="CSV" />}
        </div>
        <DataTable rows={data.low} rowKey={(r) => r.productId} empty="No hay productos con baja rotación en el período."
          columns={[
            { key: 'name', label: 'Producto', render: (r) => <Link to={`/admin/productos/${r.productId}`} className="strong">{r.name}</Link> },
            { key: 'category', label: 'Categoría' },
            { key: 'stock', label: 'Existencia', className: 'r', render: (r) => <span className="num">{r.stock}</span> },
            { key: 'units', label: 'Vendidas', className: 'r', render: (r) => <span className="num">{r.units}</span> },
            { key: 'rotation', label: 'Rotación', className: 'r', render: (r) => <b className="num">{Number(r.rotation).toFixed(2)}</b> },
          ]} />
      </section>
    </div>
  );
}

function DimensionsTab({ range }) {
  const s = useSession();
  const { data, error, loading, reload } = useApi('/analytics/reports/dimensions', range);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loader inline />;
  const table = (rows, showHex) => (
    <table className="table"><thead><tr><th>Valor</th><th className="r">Unidades</th><th className="r">Pedidos</th><th className="r">Ventas</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{showHex && r.hex && <span className="swatch-dot" style={{ background: r.hex, display: 'inline-block', marginRight: 8, verticalAlign: '-2px' }} />}{r.label}</td><td className="r num">{r.units}</td><td className="r num">{r.orders}</td><td className="r num">{money(r.revenue)}</td></tr>)}</tbody></table>
  );
  const exp = (dim) => s.can('reports.export') && <ExportButton path="/analytics/reports/dimensions" query={{ ...range, format: 'csv', dim }} filename={`ventas-por-${dim}.csv`} label="CSV" />;
  return (
    <div className="stack" style={{ '--gap': '20px', opacity: loading ? 0.6 : 1 }}>
      <div className="grid-2">
        <ChartCard title="Por categoría" subtitle="Ventas en quetzales" height={Math.max(240, data.category.length * 34)} table={table(data.category)} actions={exp('category')}>
          <Bar data={{ labels: data.category.map((r) => r.label), datasets: [barDataset('Ventas', data.category.map((r) => Number(r.revenue)), 0)] }} options={hbarOptions({ money: true })} />
        </ChartCard>
        <ChartCard title="Por talla" subtitle="Unidades vendidas" height={Math.max(240, data.size.length * 34)} table={table(data.size)} actions={exp('size')}>
          <Bar data={{ labels: data.size.map((r) => r.label), datasets: [barDataset('Unidades', data.size.map((r) => r.units), 1)] }} options={vbarOptions()} />
        </ChartCard>
      </div>
      <div className="grid-2">
        <ChartCard title="Por color" subtitle="Unidades vendidas · el color real aparece en la tabla" height={Math.max(260, data.color.length * 26)} table={table(data.color, true)} actions={exp('color')}>
          <Bar data={{ labels: data.color.map((r) => r.label), datasets: [barDataset('Unidades', data.color.map((r) => r.units), 0)] }} options={hbarOptions()} />
        </ChartCard>
        <ChartCard title="Por método de pago" subtitle="Pedidos no cancelados" height={220}
          table={<table className="table"><thead><tr><th>Método</th><th className="r">Pedidos</th><th className="r">Ventas</th></tr></thead><tbody>{data.methods.map((m) => <tr key={m.method}><td>{label(m.method)}</td><td className="r num">{m.orders}</td><td className="r num">{money(m.sales)}</td></tr>)}</tbody></table>}>
          <Bar data={{ labels: data.methods.map((m) => label(m.method)), datasets: [barDataset('Pedidos', data.methods.map((m) => m.orders), 1)] }} options={hbarOptions()} />
        </ChartCard>
      </div>
    </div>
  );
}

function DiscountsTab({ range }) {
  const { data, error, loading, reload } = useApi('/analytics/reports/discounts', range);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loader inline />;
  const total = data.byPromotion.reduce((a, p) => a + Number(p.amount), 0);
  return (
    <div className="stack" style={{ '--gap': '20px', opacity: loading ? 0.6 : 1 }}>
      <div className="kpis kpis--compact">
        <Kpi label="Descuento en productos" value={money(total)} hint="promociones y cupones" />
        <Kpi label="Envío gratis" value={money(data.freeShipping.amount)} hint={`${int(data.freeShipping.orders)} pedidos`} />
        <Kpi label="Cupones canjeados" value={int(data.byCoupon.reduce((a, c) => a + c.uses, 0))} hint={`${int(data.byCoupon.reduce((a, c) => a + c.reversed, 0))} revertidos por cancelación`} />
      </div>
      <ChartCard title="Descuento por promoción" subtitle="Quetzales descontados en líneas de pedido" height={Math.max(220, data.byPromotion.length * 34)}
        table={<table className="table"><thead><tr><th>Promoción</th><th className="r">Pedidos</th><th className="r">Unidades</th><th className="r">Monto</th></tr></thead><tbody>{data.byPromotion.map((p) => <tr key={p.name}><td>{p.name}</td><td className="r num">{p.orders}</td><td className="r num">{p.units}</td><td className="r num">{money(p.amount)}</td></tr>)}</tbody></table>}>
        <Bar data={{ labels: data.byPromotion.map((p) => p.name), datasets: [barDataset('Monto', data.byPromotion.map((p) => Number(p.amount)), 2)] }} options={hbarOptions({ money: true })} />
      </ChartCard>
      <section className="panel">
        <div className="panel__head"><h2>Uso de cupones</h2></div>
        <DataTable rows={data.byCoupon} rowKey={(r) => r.code} empty="No se canjearon cupones en el período."
          columns={[{ key: 'code', label: 'Cupón', render: (r) => <b>{r.code}</b> }, { key: 'uses', label: 'Usos', className: 'r', render: (r) => <span className="num">{r.uses}</span> }, { key: 'reversed', label: 'Revertidos', className: 'r', render: (r) => <span className="num">{r.reversed}</span> }, { key: 'amount', label: 'Monto', className: 'r', render: (r) => <b className="num">{money(r.amount)}</b> }]} />
      </section>
    </div>
  );
}

function ReturnsTab({ range }) {
  const { data, error, loading, reload } = useApi('/analytics/reports/returns', range);
  const sales = useApi('/analytics/reports/sales', { ...range, groupBy: 'month' });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loader inline />;
  const types = ['DEVOLUCION', 'CAMBIO', 'RECLAMO'];
  const byType = types.map((t) => ({ type: t, total: data.byType.filter((x) => x.type === t).reduce((a, x) => a + x.requests, 0) }));
  return (
    <div className="stack" style={{ '--gap': '20px', opacity: loading ? 0.6 : 1 }}>
      {sales.data && (
        <div className="kpis kpis--compact">
          <Kpi label="Pedidos cancelados" value={int(sales.data.kpis.cancelled)} hint={`${pct(sales.data.kpis.cancelRate)} del total`} />
          <Kpi label="Reembolsado (simulado)" value={money(sales.data.kpis.refunded)} hint={`${int(sales.data.kpis.refunds)} reembolsos`} />
          {byType.map((t) => <Kpi key={t.type} label={{ DEVOLUCION: 'Devoluciones', CAMBIO: 'Cambios', RECLAMO: 'Reclamos' }[t.type]} value={int(t.total)} hint="solicitudes" />)}
        </div>
      )}
      <ChartCard title="Tasa de devolución por categoría" subtitle="Unidades devueltas o cambiadas ÷ unidades vendidas" height={Math.max(240, data.byCategory.length * 34)}
        table={<table className="table"><thead><tr><th>Categoría</th><th className="r">Vendidas</th><th className="r">Devueltas</th><th className="r">Reintegradas</th><th className="r">Tasa</th></tr></thead><tbody>{data.byCategory.map((c) => <tr key={c.category}><td>{c.category}</td><td className="r num">{c.sold}</td><td className="r num">{c.returned}</td><td className="r num">{c.restocked}</td><td className="r num">{c.rate} %</td></tr>)}</tbody></table>}>
        <Bar data={{ labels: data.byCategory.map((c) => c.category), datasets: [barDataset('Tasa (%)', data.byCategory.map((c) => Number(c.rate)), 2)] }} options={hbarOptions()} />
      </ChartCard>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="panel__head"><h2>Solicitudes por tipo y estado</h2></div>
          <DataTable rows={data.byType} rowKey={(r) => `${r.type}-${r.status}`} empty="Sin solicitudes en el período." columns={[{ key: 'type', label: 'Tipo', render: (r) => label(r.type) }, { key: 'status', label: 'Estado', render: (r) => label(r.status) }, { key: 'requests', label: 'Solicitudes', className: 'r', render: (r) => <span className="num">{r.requests}</span> }]} />
        </section>
        <section className="panel">
          <div className="panel__head"><h2>Reembolsos por motivo</h2></div>
          <DataTable rows={data.refunds} rowKey={(r) => r.reason} empty="Sin reembolsos en el período." columns={[{ key: 'reason', label: 'Motivo', render: (r) => <span className="small">{r.reason}</span> }, { key: 'refunds', label: 'Cant.', className: 'r', render: (r) => <span className="num">{r.refunds}</span> }, { key: 'amount', label: 'Monto', className: 'r', render: (r) => <b className="num">{money(r.amount)}</b> }]} />
        </section>
      </div>
    </div>
  );
}

function InventoryTab({ range }) {
  const s = useSession();
  const { data, error, loading, reload } = useApi('/analytics/reports/inventory', range);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loader inline />;
  return (
    <div className="stack" style={{ '--gap': '20px', opacity: loading ? 0.6 : 1 }}>
      <div className="grid-2">
        <ChartCard title="Movimientos por tipo" subtitle="Unidades movidas en el período" height={Math.max(240, data.byType.length * 32)}
          actions={s.can('reports.export') && <ExportButton path="/inventory/movements/export" query={range} filename="kardex.csv" label="Kardex CSV" />}
          table={<table className="table"><thead><tr><th>Tipo</th><th className="r">Movimientos</th><th className="r">Unidades</th></tr></thead><tbody>{data.byType.map((t) => <tr key={t.type}><td>{MOVEMENT_LABELS[t.type] || t.type}</td><td className="r num">{t.movements}</td><td className="r num">{t.units}</td></tr>)}</tbody></table>}>
          <Bar data={{ labels: data.byType.map((t) => MOVEMENT_LABELS[t.type] || t.type), datasets: [barDataset('Unidades', data.byType.map((t) => t.units), 1)] }} options={hbarOptions()} />
        </ChartCard>
        <ChartCard title="Existencias por categoría" subtitle="Situación actual (no depende del período)" height={Math.max(240, data.byCategory.length * 34)}
          table={<table className="table"><thead><tr><th>Categoría</th><th className="r">Física</th><th className="r">Reservada</th><th className="r">Disponible</th><th className="r">Bajo mínimo</th></tr></thead><tbody>{data.byCategory.map((c) => <tr key={c.category}><td>{c.category}</td><td className="r num">{c.physical}</td><td className="r num">{c.reserved}</td><td className="r num">{c.available}</td><td className="r num">{c.low}</td></tr>)}</tbody></table>}>
          <Bar data={{ labels: data.byCategory.map((c) => c.category), datasets: [barDataset('Disponible', data.byCategory.map((c) => c.available), 0)] }} options={hbarOptions()} />
        </ChartCard>
      </div>
    </div>
  );
}

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'ventas';
  const [range, setRange] = useState({ from: isoToday(-89), to: isoToday() });
  return (
    <>
      <PageHeader title="Reportes" description="Desempeño comercial de la tienda. Los montos son de la demostración (datos ficticios)." actions={<DateRange from={range.from} to={range.to} onChange={setRange} />} />
      <Tabs id="rep-tabs" tabs={TABS} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
      <div className="mt-3">
        {tab === 'ventas' && <SalesTab range={range} />}
        {tab === 'productos' && <ProductsTab range={range} />}
        {tab === 'dimensiones' && <DimensionsTab range={range} />}
        {tab === 'descuentos' && <DiscountsTab range={range} />}
        {tab === 'devoluciones' && <ReturnsTab range={range} />}
        {tab === 'inventario' && <InventoryTab range={range} />}
      </div>
      <p className="tiny muted mt-3">Definiciones: <b>Ventas</b> = total de pedidos no cancelados creados en el período · <b>Cobrado</b> = pagos aprobados en el período · <b>Reembolsado</b> = reembolsos registrados en el período · <b>Cancelaciones</b> = pedidos cancelados creados en el período. Fechas en hora de Guatemala.</p>
    </>
  );
}

