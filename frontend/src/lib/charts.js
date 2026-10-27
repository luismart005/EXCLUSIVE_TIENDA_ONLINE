import {
  Chart, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { money, int } from './format.js';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

export const SERIES = ['#12906f', '#2a78d6', '#eb6834', '#6250d6', '#eda100', '#e87ba4'];
export const MUTED_SERIES = '#c3c8c0';
export const INK = '#1b2433';
export const TEXT_MUTED = '#5e6672';
export const GRID = '#eef0ed';

Chart.defaults.font.family = "'Archivo Variable', 'Archivo', system-ui, sans-serif";
Chart.defaults.font.size = 12.5;
Chart.defaults.color = TEXT_MUTED;
Chart.defaults.borderColor = GRID;
Chart.defaults.animation.duration = 650;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyle = 'rectRounded';
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.legend.labels.color = '#3b4452';
Chart.defaults.plugins.tooltip.backgroundColor = '#ffffff';
Chart.defaults.plugins.tooltip.titleColor = INK;
Chart.defaults.plugins.tooltip.bodyColor = '#3b4452';
Chart.defaults.plugins.tooltip.borderColor = '#e3e6e2';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.boxPadding = 4;
Chart.defaults.plugins.tooltip.usePointStyle = true;
Chart.defaults.plugins.tooltip.titleFont = { weight: '650' };
Chart.defaults.elements.line.borderWidth = 2;
Chart.defaults.elements.line.borderCapStyle = 'round';
Chart.defaults.elements.line.borderJoinStyle = 'round';
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 5;
Chart.defaults.elements.point.hitRadius = 14;
Chart.defaults.elements.point.borderWidth = 2;
Chart.defaults.elements.point.hoverBorderWidth = 2;
Chart.defaults.elements.point.borderColor = '#ffffff';
Chart.defaults.elements.bar.borderRadius = 4;
Chart.defaults.elements.bar.borderSkipped = 'start';
Chart.defaults.datasets.bar.maxBarThickness = 24;

export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const axis = (extra = {}) => ({
  grid: { color: GRID, drawTicks: false },
  border: { display: false },
  ticks: { padding: 8 },
  ...extra,
});

export const compactQ = (v) => {
  const n = Number(v);
  if (Math.abs(n) >= 1_000_000) return `Q${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `Q${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `Q${n}`;
};
export const compactN = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`);

export function lineOptions({ money: isMoney = false, legend = false, stacked = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, position: 'top', align: 'end' },
      tooltip: {
        callbacks: { label: (c) => ` ${c.dataset.label}: ${isMoney ? money(c.parsed.y) : int(c.parsed.y)}` },
      },
    },
    scales: {
      x: axis({ grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9, padding: 6 } }),
      y: axis({ beginAtZero: true, stacked, ticks: { padding: 8, maxTicksLimit: 6, callback: (v) => (isMoney ? compactQ(v) : compactN(v)) } }),
    },
  };
}

export function hbarOptions({ money: isMoney = false, legend = false } = {}) {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: legend, position: 'top', align: 'end' },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${isMoney ? money(c.parsed.x) : int(c.parsed.x)}` } },
    },
    scales: {
      x: axis({ beginAtZero: true, ticks: { maxTicksLimit: 6, callback: (v) => (isMoney ? compactQ(v) : compactN(v)) } }),
      y: axis({ grid: { display: false }, ticks: { color: '#3b4452' } }),
    },
  };
}

export function vbarOptions({ money: isMoney = false, legend = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, position: 'top', align: 'end' },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${isMoney ? money(c.parsed.y) : int(c.parsed.y)}` } },
    },
    scales: {
      x: axis({ grid: { display: false }, ticks: { color: '#3b4452' } }),
      y: axis({ beginAtZero: true, ticks: { maxTicksLimit: 6, callback: (v) => (isMoney ? compactQ(v) : compactN(v)) } }),
    },
  };
}

export function lineDataset(label, data, i = 0, { fill = false, dashed = false } = {}) {
  const color = SERIES[i % SERIES.length];
  return {
    label, data, borderColor: color, backgroundColor: fill ? hexA(color, 0.1) : color, fill, tension: 0.3, cubicInterpolationMode: 'monotone',
    pointBackgroundColor: color, borderDash: dashed ? [6, 5] : undefined,
  };
}

export function barDataset(label, data, i = 0, extra = {}) {
  const color = SERIES[i % SERIES.length];
  return { label, data, backgroundColor: color, hoverBackgroundColor: hexA(color, 0.85), borderColor: '#fff', borderWidth: 0, ...extra };
}
