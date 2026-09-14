<script setup lang="ts">
import type { SupplyView } from '@tpm/shared';
import { computed } from 'vue';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import CardMore from '@/components/shared/CardMore.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import Terme from '@/components/shared/Terme.vue';
import { fmtDate, fmtNum, fmtPct } from '@/composables/useFormat';
import { useCardDetail } from '@/composables/useCardDetail';
const props = defineProps<{ supply: SupplyView }>();
const { open, detailMode, toggle } = useCardDetail();
const series = computed(() => [{ label: 'Offre', points: props.supply.series.map((p) => ({ ts: p.ts, value: p.supply })) }]);
const week = computed(() => props.supply.burnRates.find((b) => /7/.test(b.windowLabel)) ?? props.supply.burnRates[0] ?? null);
const simpleText = computed(() => {
  const w = week.value;
  if (!w || w.burned === null) return 'Pas encore assez d’historique pour dire si l’offre bouge.';
  if (w.burned <= 0) return `Offre stable sur ${w.windowLabel.toLowerCase()} : aucun burn constaté.`;
  return `${fmtNum(w.burned, { compact: true })} tokens brûlés sur ${w.windowLabel.toLowerCase()} (${fmtPct(w.burnedPct, { signed: false, digits: 3 })} de l’offre).`;
});
</script>
<template>
  <section id="card-supply" class="card">
    <div class="card-head"><h2>Offre</h2><SourceTag :source="supply.current.source" :fetched-at="supply.current.fetchedAt" /></div>
    <div style="font-size:1.3rem;font-weight:600">{{ fmtNum(supply.current.supplyCirc, { compact: true }) }} <span class="muted small">tokens émis, nets des <Terme mot="burn">burns</Terme></span></div>
    <p class="small muted" style="margin:.25rem 0 0">{{ simpleText }}</p>
    <template v-if="open">
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
    </template>
    <CardMore :open="open" :hidden="detailMode" @toggle="toggle" />
  </section>
</template>
