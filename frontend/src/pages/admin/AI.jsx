import { useEffect, useMemo, useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { BrainCircuit, RefreshCw, Play, Info, History } from 'lucide-react';
import { api } from '../../api/client.js';
import { useSession } from '../../auth/session.jsx';
import { useApi } from '../../lib/useApi.js';
import { PageHeader, ChartCard, Kpi, DataTable, KV } from '../../components/admin.jsx';
import { Button, ErrorState, Loader, Notice, Status, Spinner } from '../../components/ui.jsx';
import { dateTime, dateOnly, shortDay, int } from '../../lib/format.js';
import { toast, apiError, confirm } from '../../lib/alerts.js';
import { lineOptions, vbarOptions, lineDataset, barDataset, SERIES } from '../../lib/charts.js';

const FEATURE_LABELS = {
  lag_1: 'Unidades de la semana anterior', lag_2: 'Unidades de hace 2 semanas', lag_3: 'Unidades de hace 3 semanas', lag_4: 'Unidades de hace 4 semanas',
  media_4: 'Promedio de las últimas 4 semanas', semana_sin: 'Estacionalidad (seno de la semana del año)', semana_cos: 'Estacionalidad (coseno de la semana del año)',
  tendencia: 'Tendencia (posición en el historial)', categoria_onehot: 'Categoría (codificación one-hot)',
};

export default function AiForecast() {
  const s = useSession();
  const fc = useApi('/analytics/ai/forecast');
  const models = useApi('/analytics/ai/models');
  const [cat, setCat] = useState(null);
  const [busy, setBusy] = useState(null);
  const d = fc.data;
  const m = d?.model;

  useEffect(() => {
    if (!d?.running) return undefined;
    const t = setInterval(() => { fc.reload(); models.reload(); }, 4000);
    return () => clearInterval(t);
  }, [d?.running]);

  useEffect(() => { if (!cat && d?.history?.length) setCat(d.history[0].categoryId); }, [d, cat]);

  const train = async () => {
    if (!(await confirm({ title: '¿Entrenar un nuevo modelo?', text: 'Se prepara el historial semanal y el entrenamiento corre en un proceso independiente (no bloquea las compras). Tarda menos de un minuto.', confirmText: 'Entrenar' }))) return;
    setBusy('train');
    try {
      const r = await api.post('/analytics/ai/train', {});
      toast.success(`Entrenamiento ${r.version} iniciado con ${r.history.weeks} semanas de historial.`);
      fc.reload();
      models.reload();
    } catch (e) { apiError(e); } finally { setBusy(null); }
  };
  const refresh = async () => {
    setBusy('hist');
    try {
      const r = await api.post('/analytics/ai/history/refresh', {});
      toast.success(`Historial preparado: ${int(r.weeks)} semanas × ${r.categories} categorías (${r.from} a ${r.to}).`);
      fc.reload();
    } catch (e) { apiError(e); } finally { setBusy(null); }
  };

  const series = useMemo(() => d?.history?.find((h) => h.categoryId === cat), [d, cat]);
  const forecast = d?.forecasts?.find((f) => f.categoryId === cat);
  const evalPoints = useMemo(() => (m?.metrics?.testPredictions || []).filter((p) => p.categoryId === cat), [m, cat]);

  if (fc.error) return <ErrorState error={fc.error} onRetry={fc.reload} />;
  if (!d) return <Loader />;

  const weeks = series?.weeks || [];
  const labels = [...weeks.map((w) => shortDay(w.weekStart)), forecast ? `${shortDay(forecast.weekStart)} (estimada)` : null].filter(Boolean);
  const actual = [...weeks.map((w) => w.net), null];
  const fcLine = weeks.map(() => null);
  if (forecast && weeks.length) { fcLine[weeks.length - 1] = weeks[weeks.length - 1].net; fcLine.push(Number(forecast.predicted)); }

  return (
    <>
      <PageHeader
        title="Predicción de ventas"
        description="Estimación de unidades que podrían venderse la siguiente semana en cada categoría, como apoyo para planificar el abastecimiento. El modelo no ejecuta compras ni ajustes de inventario."
        actions={s.can('ai.train') && (
          <>
            <Button className="btn btn--ghost btn--sm" loading={busy === 'hist'} onClick={refresh}><RefreshCw size={15} /> Preparar historial</Button>
            <Button className="btn btn--primary btn--sm" loading={busy === 'train'} disabled={!!d.running} onClick={train}><Play size={15} /> Entrenar modelo</Button>
          </>
        )}
      />

      {d.running && <div className="mb-2"><Notice tone="info"><span className="row" style={{ '--gap': '10px' }}><Spinner /> Entrenando el modelo {d.running.version} en un proceso independiente… la página se actualizará sola.</span></Notice></div>}

      {!m ? (
        <Notice tone="warn">Aún no hay un modelo entrenado. {s.can('ai.train') ? 'Usa "Entrenar modelo" para crear la primera versión.' : 'Pide a un usuario con permiso que entrene el modelo.'}</Notice>
      ) : (
        <div className="stack" style={{ '--gap': '20px' }}>
          <div className="kpis">
            <Kpi label="Semana estimada" value={dateOnly(m.metrics?.forecastWeek)} hint="siguiente a la última semana completa" icon={BrainCircuit} />
            <Kpi label="Error absoluto medio (modelo)" value={`${m.metrics?.mae} u.`} hint="en semanas de prueba" />
            <Kpi label="Error del promedio simple" value={`${m.metrics?.baselineMae} u.`} hint="promedio de las 4 semanas previas" />
            <Kpi label="Mejora vs. promedio" value={`${m.metrics?.improvementPct} %`} hint={m.metrics?.improvementPct > 0 ? 'el modelo se equivoca menos' : 'el promedio fue mejor'} />
            <Kpi label="Muestras" value={`${int(m.metrics?.samples?.train)} / ${int(m.metrics?.samples?.test)}`} hint={`entrenamiento / prueba · ${int(m.metrics?.samples?.excludedCensored)} excluidas por agotados`} />
            <Kpi label="Versión" value={m.version} hint={`generada ${dateTime(m.completedAt)}`} icon={History} />
          </div>

          <ChartCard
            title={`Estimación para la semana del ${dateOnly(m.metrics?.forecastWeek)}`}
            subtitle="Unidades netas por categoría: modelo vs. promedio de las últimas 4 semanas"
            height={300}
            table={(
              <table className="table">
                <thead><tr><th>Categoría</th><th className="r">Modelo</th><th className="r">Promedio 4 sem.</th><th>Historial</th></tr></thead>
                <tbody>{d.forecasts.map((f) => <tr key={f.categoryId}><td>{f.category}</td><td className="r num strong">{Number(f.predicted).toFixed(1)}</td><td className="r num">{Number(f.baseline).toFixed(1)}</td><td>{f.sufficient ? <Status tone="ok" text="Suficiente" /> : <Status tone="warn" text="Insuficiente: se usa el promedio" />}</td></tr>)}</tbody>
              </table>
            )}
          >
            <Bar
              data={{ labels: d.forecasts.map((f) => f.category), datasets: [barDataset('Modelo', d.forecasts.map((f) => Number(f.predicted)), 0), barDataset('Promedio 4 semanas', d.forecasts.map((f) => Number(f.baseline)), 1)] }}
              options={vbarOptions({ legend: true })}
            />
          </ChartCard>
          {d.forecasts.some((f) => !f.sufficient) && <Notice tone="warn">Algunas categorías tienen historial insuficiente (menos de 12 semanas con ventas): para ellas se muestra el promedio reciente en lugar de la estimación del modelo.</Notice>}

          <section className="panel">
            <div className="panel__head">
              <div><h2>Historial y estimación por categoría</h2><p className="tiny muted" style={{ margin: '2px 0 0' }}>Últimas 26 semanas de unidades netas (vendidas − devueltas) y la estimación de la siguiente</p></div>
              <select className="select select--sm" style={{ width: 'auto' }} value={cat || ''} onChange={(e) => setCat(Number(e.target.value))} aria-label="Categoría">
                {d.history.map((h) => <option key={h.categoryId} value={h.categoryId}>{h.name}</option>)}
              </select>
            </div>
            <div className="panel__body">
              <div style={{ height: 300 }}>
                <Line
                  data={{ labels, datasets: [lineDataset('Unidades netas', actual, 0, { fill: true }), { ...lineDataset('Estimación', fcLine, 2, { dashed: true }), pointRadius: fcLine.map((v, i) => (i === fcLine.length - 1 ? 5 : 0)), pointBackgroundColor: SERIES[2] }] }}
                  options={lineOptions({ legend: true })}
                />
              </div>
              {forecast && <p className="small mt-2" style={{ marginBottom: 0 }}>Estimación: <b className="num">{Number(forecast.predicted).toFixed(1)} unidades</b> · promedio reciente {Number(forecast.baseline).toFixed(1)} · {forecast.sufficient ? 'historial suficiente' : 'historial insuficiente'}</p>}
            </div>
          </section>

          {evalPoints.length > 0 && (
            <ChartCard
              title="Evaluación con semanas posteriores al entrenamiento"
              subtitle={`Semanas de prueba ${dateOnly(m.testFrom)} a ${dateOnly(m.testTo)}: el modelo no vio estos datos al entrenar`}
              height={260}
              table={<table className="table"><thead><tr><th>Semana</th><th className="r">Real</th><th className="r">Modelo</th><th className="r">Promedio</th></tr></thead><tbody>{evalPoints.map((p) => <tr key={p.weekStart}><td>{shortDay(p.weekStart)}</td><td className="r num">{p.actual}</td><td className="r num">{p.predicted}</td><td className="r num">{p.baseline}</td></tr>)}</tbody></table>}
            >
              <Line
                data={{ labels: evalPoints.map((p) => shortDay(p.weekStart)), datasets: [{ ...lineDataset('Real', evalPoints.map((p) => p.actual), 0), pointRadius: 4 }, { ...lineDataset('Modelo', evalPoints.map((p) => p.predicted), 2), pointRadius: 4 }, { ...lineDataset('Promedio 4 semanas', evalPoints.map((p) => p.baseline), 1), pointRadius: 4 }] }}
                options={lineOptions({ legend: true })}
              />
            </ChartCard>
          )}

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="panel">
              <div className="panel__head"><h2>Ficha del modelo</h2><Status value={m.status} /></div>
              <div className="panel__body stack">
                <KV items={[
                  ['Algoritmo', m.algorithm],
                  ['Período de entrenamiento', `${dateOnly(m.trainFrom)} a ${dateOnly(m.trainTo)}`],
                  ['Período de prueba', `${dateOnly(m.testFrom)} a ${dateOnly(m.testTo)}`],
                  ['Objetivo', m.features?.target],
                  ['Épocas (promedio)', m.metrics?.epochsRun],
                  ['Tiempo de entrenamiento', `${m.metrics?.seconds} s`],
                  ['Generado', dateTime(m.completedAt)],
                ]} />
                <div>
                  <div className="label mb-1">Variables utilizadas</div>
                  <ul className="feature-list">{(m.features?.list || []).map((f) => <li key={f}>{FEATURE_LABELS[f] || f}</li>)}</ul>
                </div>
                {m.dataNote && <Notice tone="warn">{m.dataNote}</Notice>}
              </div>
            </section>
            <section className="panel">
              <div className="panel__head"><h2>Error por categoría</h2></div>
              <DataTable rows={m.metrics?.perCategory || []} rowKey={(r) => r.categoryId}
                columns={[
                  { key: 'name', label: 'Categoría' },
                  { key: 'mae', label: 'MAE modelo', className: 'r', render: (r) => <b className="num">{r.mae}</b> },
                  { key: 'baselineMae', label: 'MAE promedio', className: 'r', render: (r) => <span className="num">{r.baselineMae}</span> },
                  { key: 'testWeeks', label: 'Semanas', className: 'r', render: (r) => <span className="num">{r.testWeeks}</span> },
                ]} />
            </section>
          </div>
        </div>
      )}

      <section className="panel mt-3">
        <div className="panel__head"><h2 className="row"><History size={17} /> Versiones del modelo</h2><span className="tiny muted">Cada versión conserva período, variables, fecha y métricas</span></div>
        <DataTable
          rows={models.data}
          loading={models.loading}
          empty="Sin versiones."
          columns={[
            { key: 'version', label: 'Versión', render: (x) => <b className="num">{x.version}</b> },
            { key: 'status', label: 'Estado', render: (x) => <><Status value={x.status} />{x.error && <div className="tiny" style={{ color: 'var(--grana)' }}>{x.error}</div>}</> },
            { key: 'period', label: 'Entrenamiento', render: (x) => (x.trainFrom ? `${dateOnly(x.trainFrom)} – ${dateOnly(x.trainTo)}` : '—'), hideSm: true },
            { key: 'mae', label: 'MAE', className: 'r', render: (x) => <span className="num">{x.metrics?.mae ?? '—'}</span> },
            { key: 'base', label: 'MAE base', className: 'r', render: (x) => <span className="num">{x.metrics?.baselineMae ?? '—'}</span> },
            { key: 'date', label: 'Fecha', render: (x) => dateTime(x.completedAt || x.createdAt) },
          ]}
        />
      </section>

      <section className="panel mt-3">
        <div className="panel__head"><h2 className="row"><Info size={17} /> Reglas del historial semanal</h2></div>
        <div className="panel__body">
          <ol className="rules">
            <li>Semanas de lunes a domingo en hora de Guatemala; solo se usan semanas completas.</li>
            <li>Unidades vendidas: artículos de pedidos no cancelados, en la semana en que se creó el pedido.</li>
            <li>Las cancelaciones se registran aparte y no cuentan como demanda.</li>
            <li>Las devoluciones se descuentan de la semana de la venta original (unidades netas).</li>
            <li>Las semanas en que alguna variante quedó sin existencias se conservan, pero no se usan como objetivo de entrenamiento (la demanda real pudo ser mayor).</li>
            <li>Las semanas sin ventas se registran con cero.</li>
            <li>La evaluación usa las últimas 8 semanas, posteriores a las de entrenamiento, para no usar información futura; se compara contra el promedio de las 4 semanas previas.</li>
            <li>Con menos de 12 semanas con ventas en una categoría se indica historial insuficiente.</li>
          </ol>
        </div>
      </section>
    </>
  );
}

