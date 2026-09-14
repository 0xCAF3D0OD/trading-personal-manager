<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSeries { label: string; points: { ts: number; value: number | null }[]; unit?: string; color?: string }
const props = defineProps<{ series: ChartSeries[]; height?: number; percent?: boolean; singleAxis?: boolean }>();

const el = ref<HTMLDivElement | null>(null);
let plot: uPlot | null = null;
let ro: ResizeObserver | null = null;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function fmtVal(v: number | null, unit?: string): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  const s = abs >= 1000 ? new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 }).format(v)
    : abs >= 1 ? v.toFixed(2) : abs === 0 ? '0' : v.toPrecision(3);
  return unit ? `${s} ${unit}` : s;
}

function build() {
  if (!el.value) return;
  plot?.destroy();
  plot = null;
  const xs = [...new Set(props.series.flatMap((s) => s.points.map((p) => p.ts)))].sort((a, b) => a - b);
  if (xs.length === 0) return;
  const data: uPlot.AlignedData = [
    xs,
    ...props.series.map((s) => {
      const m = new Map(s.points.map((p) => [p.ts, p.value]));
      return xs.map((x) => m.get(x) ?? null) as (number | null)[];
    }),
  ] as uPlot.AlignedData;
  const colors = [cssVar('--chart-a'), cssVar('--chart-b'), cssVar('--ok'), cssVar('--warning')];
  const width = el.value.clientWidth || 600;
  const opts: uPlot.Options = {
    width, height: props.height ?? 200,
    cursor: { drag: { x: true, y: false } },
    legend: { show: true },
    scales: { x: { time: true }, y: { auto: true }, ...(props.series.length > 1 && !props.singleAxis ? { y2: { auto: true } } : {}) },
    axes: [
      { stroke: cssVar('--text-faint'), grid: { stroke: cssVar('--border'), width: 1 }, ticks: { stroke: cssVar('--border') } },
      { stroke: colors[0], grid: { stroke: cssVar('--border'), width: 1 }, size: 64, values: (_u, vals) => vals.map((v) => fmtVal(v)) },
      ...(props.series.length > 1 && !props.singleAxis
        ? [{ side: 1, scale: 'y2', stroke: colors[1], grid: { show: false }, size: 64, values: (_u: uPlot, vals: number[]) => vals.map((v) => fmtVal(v)) } as uPlot.Axis]
        : []),
    ],
    series: [
      { label: 'Date', value: (_u, v) => (v === null || v === undefined ? '—' : new Date(v * 1000).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })) },
      ...props.series.map((s, i) => ({
        label: s.label,
        stroke: s.color ?? colors[i % colors.length],
        width: 2,
        scale: i === 0 || props.singleAxis ? 'y' : 'y2',
        spanGaps: true,
        points: { show: xs.length < 40 },
        value: (_u: uPlot, v: number | null) => fmtVal(v, s.unit),
      })),
    ],
  };
  plot = new uPlot(opts, data, el.value);
}

onMounted(() => {
  build();
  ro = new ResizeObserver(() => {
    if (plot && el.value) plot.setSize({ width: el.value.clientWidth, height: props.height ?? 200 });
  });
  if (el.value) ro.observe(el.value);
});
watch(() => props.series, build, { deep: true });
onBeforeUnmount(() => { ro?.disconnect(); plot?.destroy(); });
</script>
<template>
  <div class="chart">
    <div ref="el" />
    <div v-if="!series.some((s) => s.points.some((p) => p.value !== null))" class="muted small">Pas encore de données historisées.</div>
  </div>
</template>
