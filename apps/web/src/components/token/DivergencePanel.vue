<script setup lang="ts">
import type { Divergence } from '@tpm/shared';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtPct } from '@/composables/useFormat';
defineProps<{ divergences: Divergence[] }>();
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Détection de divergences</h2><span class="faint small">calculé sur les snapshots quotidiens</span></div>
    <p class="small muted">Chaque règle est affichée avec les deux séries qui la composent. Pas de voyant unique.</p>
    <div class="grid grid-2">
      <article v-for="d in divergences" :key="d.id" class="card" style="background: var(--bg-elev-2)">
        <div class="card-head"><h3 style="color:var(--text)">{{ d.label }}</h3><StatusBadge :status="d.status" /></div>
        <p class="small faint">Règle : {{ d.ruleText }}</p>
        <p class="small">{{ d.explanation }}</p>
        <div class="row small" style="gap:1rem">
          <span><span style="color:var(--chart-a)">●</span> {{ d.seriesA.label }} : <strong>{{ d.seriesA.changePct === null ? '—' : fmtPct(d.seriesA.changePct, { digits: 1 }) }}</strong></span>
          <span><span style="color:var(--chart-b)">●</span> {{ d.seriesB.label }} : <strong>{{ d.seriesB.changePct === null ? '—' : fmtPct(d.seriesB.changePct, { digits: 1 }) }}</strong></span>
        </div>
        <TimeSeriesChart :series="[{ label: d.seriesA.label, points: d.seriesA.points, unit: d.seriesA.unit }, { label: d.seriesB.label, points: d.seriesB.points, unit: d.seriesB.unit }]" :height="150" />
      </article>
    </div>
  </section>
</template>
