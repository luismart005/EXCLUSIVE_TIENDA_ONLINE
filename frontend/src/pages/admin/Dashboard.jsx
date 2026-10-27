import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import {
  CreditCard, PackageOpen, Truck, Navigation, RefreshCcw, AlertTriangle, Receipt, ShoppingBag, Tag, Coins, Undo2, BrainCircuit, ArrowRight, Boxes,
} from 'lucide-react';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, Kpi, DateRange, ChartCard, DataTable } from '../../components/admin.jsx';
import { Img, Loader, Status, ErrorState } from '../../components/ui.jsx';
import { money, moneyShort, int, isoToday, shortDay, monthLabel, dateTime, pct } from '../../lib/format.js';
import { label } from '../../lib/labels.js';
import { lineOptions, hbarOptions, lineDataset, barDataset, SERIES } from '../../lib/charts.js';

function Queues({ s }) {
  const items = [
    { to: '/admin/pagos', icon: CreditCard, label: 'Pagos por revisar', n: s.toReview, tone: 'warn' },
    { to: '/admin/pedidos?queue=por-preparar', icon: PackageOpen, label: 'Por preparar', n: s.toPrepare },
    { to: '/admin/pedidos?queue=por-despachar', icon: Truck, label: 'Por despachar', n: s.toDispatch },
    { to: '/admin/pedidos?queue=en-ruta', icon: Navigation, label: 'En ruta', n: s.inRoute },
    { to: '/admin/posventa', icon: RefreshCcw, label: 'Posventa abierta', n: s.postsaleOpen },
    { to: '/admin/envios', icon: AlertTriangle, label: 'Incidencias de entrega', n: s.incidents, tone: 'bad' },
  ];
  return (
    <div className="queues">
      {items.map((q) => (
        <Link key={q.label} to={q.to} className={`queue ${q.n > 0 ? `has-items ${q.tone ? `is-${q.tone}` : ''}` : ''}`}>
          <q.icon size={18} aria-hidden="true" />
          <span className="queue__n">{q.n ?? '—'}</span>
          <span className="queue__label">{q.label}</span>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const s = useSession();
  const navigate = useNavigate();
  const [range, setRange] = useState({ from: isoToday(-29), to: isoToday() });
  const dash = useApi('/analytics/dashboard', range);
  const summary = useApi('/sales/admin/summary', null, { enabled: s.can('orders.read', 'payments.review', 'postsale.read') });
  const alerts = useApi('/inventory/alerts', null, { enabled: s.can('inventory.read') });
  const forecast = useApi('/analytics/ai/forecast', null, { enabled: s.can('ai.read') });
  const recent = useApi('/sales/admin/orders', { pageSize: 6 }, { enabled: s.can('orders.read') });

  const d = dash.data;
  const k = d?.kpis;
  const p = d?.previous;
  const days = (new Date(range.to) - new Date(range.from)) / 86400e3;
  const fmtPeriod = (iso) => (days > 120 ? monthLabel(iso) : shortDay(iso));

  return (
    <>
      <PageHeader
        title={`Hola, ${s.user?.firstName || ''}`}
        description="Así va la tienda en el período seleccionado. Las variaciones comparan con el período anterior de la misma duración."
        actions={<DateRange from={range.from} to={range.to} onChange={setRange} />}
      />

      {summary.data && <Queues s={summary.data} />}

      {dash.error ? <ErrorState error={dash.error} onRetry={dash.reload} /> : !d ? <Loader inline /> : d.limited ? null : (
        <div className="stack" style={{ '--gap': '20px', opacity: dash.loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <div className="kpis">
            <Kpi label="Ventas" value={moneyShort(k.sales)} current={k.sales} previous={p.sales} icon={Receipt} hint={`${int(k.orders)} pedidos`} />
            <Kpi label="Ticket promedio" value={money(k.avgTicket)} current={k.avgTicket} previous={p.avgTicket} icon={ShoppingBag} hint={`${int(k.buyers)} clientes`} />
            <Kpi label="Unidades vendidas" value={int(k.units)} current={k.units} previous={p.units} icon={Boxes} hint="sin cancelaciones" />
            <Kpi label="Cobrado (simulado)" value={moneyShort(k.collected)} current={k.collected} previous={p.collected} icon={Coins} hint="pagos aprobados" />
            <Kpi label="Descuentos" value={moneyShort(k.discounts)} current={k.discounts} previous={p.discounts} icon={Tag} goodWhenUp={false} hint="promociones y cupones" />
            <Kpi label="Cancelación" value={pct(k.cancelRate)} current={k.cancelRate} previous={p.cancelRate} icon={Undo2} goodWhenUp={false} hint={`${int(k.cancelled)} pedidos · ${money(k.refunded)} reembolsado`} />
          </div>

          <ChartCard
            title="Ventas y cobros"
            subtitle={`${days > 31 ? 'Por semana' : 'Por día'} · quetzales`}
            height={300}
            table={(
              <table className="table">
                <thead><tr><th>Período</th><th className="r">Pedidos</th><th className="r">Unidades</th><th className="r">Ventas</th><th className="r">Cobrado</th><th className="r">Cancelados</th></tr></thead>
                <tbody>{d.series.map((r) => <tr key={r.period}><td>{fmtPeriod(r.period)}</td><td className="r num">{r.orders}</td><td className="r num">{r.units}</td><td className="r num">{money(r.sales)}</td><td className="r num">{money(r.collected)}</td><td className="r num">{r.cancelled}</td></tr>)}</tbody>
              </table>
            )}
          >
            <Line
              data={{ labels: d.series.map((r) => fmtPeriod(r.period)), datasets: [lineDataset('Ventas', d.series.map((r) => Number(r.sales)), 0, { fill: true }), lineDataset('Cobrado', d.series.map((r) => Number(r.collected)), 1)] }}
              options={lineOptions({ money: true, legend: true })}
            />
          </ChartCard>

          <div className="grid-2">
            <ChartCard
              title="Ventas por categoría"
              subtitle="Unidades vendidas en el período"
              height={Math.max(220, d.categories.length * 34)}
              table={<table className="table"><thead><tr><th>Categoría</th><th className="r">Unidades</th><th className="r">Ventas</th></tr></thead><tbody>{d.categories.map((c) => <tr key={c.label}><td>{c.label}</td><td className="r num">{c.units}</td><td className="r num">{money(c.revenue)}</td></tr>)}</tbody></table>}
            >
              <Bar data={{ labels: d.categories.map((c) => c.label), datasets: [barDataset('Unidades', d.categories.map((c) => c.units), 0)] }} options={hbarOptions()} />
            </ChartCard>
            <ChartCard
              title="Métodos de pago"
              subtitle="Pedidos no cancelados"
              height={Math.max(220, d.methods.length * 60)}
              table={<table className="table"><thead><tr><th>Método</th><th className="r">Pedidos</th><th className="r">Ventas</th></tr></thead><tbody>{d.methods.map((m) => <tr key={m.method}><td>{label(m.method)}</td><td className="r num">{m.orders}</td><td className="r num">{money(m.sales)}</td></tr>)}</tbody></table>}
            >
              <Bar data={{ labels: d.methods.map((m) => label(m.method)), datasets: [barDataset('Pedidos', d.methods.map((m) => m.orders), 1)] }} options={hbarOptions()} />
            </ChartCard>
          </div>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="panel">
              <div className="panel__head"><h2>Productos más vendidos</h2>{s.can('reports.read') && <Link to="/admin/reportes?tab=productos" className="small">Ver reporte</Link>}</div>
              <div className="panel__body" style={{ paddingBlock: 6 }}>
                {d.top.length === 0 && <p className="small muted">Sin ventas en el período.</p>}
                {d.top.map((t, i) => (
                  <Link key={t.productId} to={`/admin/productos/${t.productId}`} className="rank-row">
                    <span className="rank-row__n">{i + 1}</span>
                    <Img src={t.image} alt="" className="rank-row__img" />
                    <span className="grow"><span className="strong truncate" style={{ display: 'block' }}>{t.name}</span><span className="tiny muted">{t.category} · {t.orders} pedidos</span></span>
                    <span style={{ textAlign: 'right' }}><span className="strong num" style={{ display: 'block' }}>{int(t.units)} u.</span><span className="tiny muted num">{money(t.revenue)}</span></span>
                  </Link>
                ))}
              </div>
            </section>
            {s.can('inventory.read') && (
              <section className="panel">
                <div className="panel__head"><h2>Existencias bajas</h2><Link to="/admin/inventario?filtro=bajas" className="small">Ver todas</Link></div>
                <div className="panel__body" style={{ paddingBlock: 6 }}>
                  {!alerts.data ? <Loader inline /> : alerts.data.length === 0 ? <p className="small muted">Todas las variantes están por encima de su mínimo.</p> : alerts.data.slice(0, 6).map((a) => (
                    <Link key={a.variantId} to={`/admin/kardex?variantId=${a.variantId}`} className="rank-row">
                      <Img src={a.image} alt="" className="rank-row__img" />
                      <span className="grow"><span className="strong truncate" style={{ display: 'block' }}>{a.productName}</span><span className="tiny muted">{a.sku} · {a.color} · {a.size}</span></span>
                      <span style={{ textAlign: 'right' }}>
                        <Status value={a.available <= 0 ? 'AGOTADO' : 'BAJO'} tone={a.available <= 0 ? 'bad' : 'warn'} text={a.available <= 0 ? 'Agotado' : `${a.available} disp.`} />
                        <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>mínimo {a.minStock}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {s.can('ai.read') && forecast.data?.model && (
            <section className="panel forecast-teaser">
              <div className="panel__head">
                <div><h2 className="row"><BrainCircuit size={18} /> Estimación de la próxima semana</h2><p className="tiny muted" style={{ margin: '2px 0 0' }}>Modelo {forecast.data.model.version} · MAE {forecast.data.model.metrics?.mae} u. vs. {forecast.data.model.metrics?.baselineMae} u. del promedio simple</p></div>
                <Link to="/admin/ia" className="btn btn--ghost btn--sm">Ver detalle <ArrowRight size={15} /></Link>
              </div>
              <div className="panel__body forecast-chips">
                {forecast.data.forecasts.map((f) => (
                  <div key={f.categoryId} className="forecast-chip">
                    <span className="forecast-chip__dot" style={{ background: SERIES[0] }} aria-hidden="true" />
                    <span className="small">{f.category}</span>
                    <b className="num">{Math.round(Number(f.predicted))} u.</b>
                    {!f.sufficient && <span className="tiny muted">historial insuficiente</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {s.can('orders.read') && (
            <section className="panel">
              <div className="panel__head"><h2>Pedidos recientes</h2><Link to="/admin/pedidos" className="small">Ver todos</Link></div>
              <DataTable
                rows={recent.data?.items}
                loading={recent.loading}
                onRowClick={(o) => navigate(`/admin/pedidos/${o.id}`)}
                columns={[
                  { key: 'code', label: 'Pedido', render: (o) => <b className="num">{o.code}</b> },
                  { key: 'customer', label: 'Cliente', render: (o) => `${o.customer.firstName} ${o.customer.lastName}` },
                  { key: 'createdAt', label: 'Fecha', render: (o) => dateTime(o.createdAt), hideSm: true },
                  { key: 'status', label: 'Pedido', render: (o) => <Status value={o.status} /> },
                  { key: 'paymentStatus', label: 'Pago', render: (o) => <Status value={o.paymentStatus} /> },
                  { key: 'total', label: 'Total', className: 'r', render: (o) => <span className="num strong">{money(o.total)}</span> },
                ]}
              />
            </section>
          )}
        </div>
      )}
    </>
  );
}
