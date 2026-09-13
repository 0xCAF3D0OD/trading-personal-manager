<script setup lang="ts">
import type { SupplyView } from '@tpm/shared';
import { computed } from 'vue';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import { fmtDate, fmtNum, fmtPct } from '@/composables/useFormat';
const props = defineProps<{ supply: SupplyView }>();
const series = computed(() => [{ label: 'Offre', points: props.supply.series.map((p) => ({ ts: p.ts, value: p.supply })) }]);
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Suivi de l’offre</h2><SourceTag :source="supply.current.source" :fetched-at="supply.current.fetchedAt" /></div>
    <div style="font-size:1.3rem;font-weight:600">{{ fmtNum(supply.current.supplyCirc, { compact: true }) }} <span class="muted small">tokens en circulation</span></div>
    <table style="margin:.75rem 0">
      <thead><tr><th>Fenêtre</th><th class="num">Offre alors</th><th class="num">Brûlé</th><th class="num">Taux</th></tr></thead>
      <tbody>
        <tr v-for="b in supply.burnRates" :key="b.windowLabel">
          <td>{{ b.windowLabel }} <span v-if="b.thenTs" class="faint small">({{ fmtDate(b.thenTs) }})</span></td>
          <td class="num">{{ fmtNum(b.supplyThen, { compact: true }) }}</td>
          <td class="num" :class="(b.burned ?? 0) > 0 ? 'up' : ''">{{ b.burned === null ? 'pas encore d’historique' : fmtNum(b.burned, { compact: true }) }}</td>
          <td class="num">{{ b.burnedPct === null ? '—' : fmtPct(b.burnedPct, { signed: false, digits: 4 }) }}</td>
        </tr>
      </tbody>
    </table>
    <TimeSeriesChart :series="series" :height="160" />
  </section>
</template>
