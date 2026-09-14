<script setup lang="ts">
import type { Divergence } from '@tpm/shared';
import { computed } from 'vue';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import CardMore from '@/components/shared/CardMore.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import Terme from '@/components/shared/Terme.vue';
import { fmtPct } from '@/composables/useFormat';
import { useCardDetail } from '@/composables/useCardDetail';
const props = defineProps<{ divergences: Divergence[] }>();
const { open, detailMode, toggle } = useCardDetail();
const triggered = computed(() => props.divergences.filter((d) => d.status === 'triggered'));
const insufficient = computed(() => props.divergences.filter((d) => d.status === 'insufficient_data').length);
const shown = computed(() => (open.value ? props.divergences : triggered.value));
function series(d: Divergence) {
  return [
    { label: d.seriesA.label, unit: d.seriesA.unit, points: d.seriesA.points },
    { label: d.seriesB.label, unit: d.seriesB.unit, points: d.seriesB.points },
  ];
}
</script>
<template>
  <section id="card-divergences" class="card">
    <div class="card-head">
      <h2>Le marché confirme-t-il l’histoire ?</h2>
      <span class="faint small">{{ triggered.length }} <Terme mot="divergence">contradiction(s)</Terme> sur {{ divergences.length }} règles, calculé sur les relevés quotidiens</span>
    </div>
    <p v-if="!triggered.length" class="muted" style="margin:0">
      <template v-if="divergences.length - insufficient <= 1">Trop tôt : les règles demandent plusieurs jours de relevés quotidiens.</template>
      <template v-else>Aucune contradiction entre prix, volume, liquidité et détenteurs.</template>
    </p>
    <div v-if="shown.length" class="grid grid-2" style="margin-top:.5rem">
      <article v-for="d in shown" :key="d.id" class="card" style="background: var(--bg-elev-2)">
        <div class="card-head"><h3 style="color:var(--text)">{{ d.label }}</h3><StatusBadge :status="d.status" /></div>
        <p class="small">{{ d.explanation }}</p>
        <template v-if="open">
          <p class="faint small">Règle : {{ d.ruleText }} · fenêtre {{ d.windowDays }} j</p>
          <div class="row small" style="gap:1rem;margin-bottom:.4rem">
            <span>{{ d.seriesA.label }} : <strong>{{ fmtPct(d.seriesA.changePct) }}</strong></span>
            <span>{{ d.seriesB.label }} : <strong>{{ fmtPct(d.seriesB.changePct) }}</strong></span>
          </div>
          <TimeSeriesChart :series="series(d)" :height="140" />
        </template>
      </article>
    </div>
    <CardMore :open="open" :hidden="detailMode" @toggle="toggle" />
  </section>
</template>
