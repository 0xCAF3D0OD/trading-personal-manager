<script setup lang="ts">
import type { HoldersView } from '@tpm/shared';
import { computed } from 'vue';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import { fmtNum, fmtPct, fmtUsd, shortAddr } from '@/composables/useFormat';
const props = defineProps<{ holders: HoldersView; refreshing?: boolean }>();
defineEmits<{ refresh: [] }>();
const latest = computed(() => props.holders.latest);
const history = computed(() => [
  { label: 'Détenteurs', points: props.holders.history.map((h) => ({ ts: h.ts, value: h.holderCount })) },
  { label: 'Top 10 (%)', unit: '%', points: props.holders.history.map((h) => ({ ts: h.ts, value: h.top10Pct })) },
]);
const tops = computed(() => latest.value ? [
  ['Top 5', latest.value.top5Pct], ['Top 10', latest.value.top10Pct], ['Top 20', latest.value.top20Pct],
  ['Top 50', latest.value.top50Pct], ['Top 100', latest.value.top100Pct],
] as [string, number | null][] : []);
</script>
<template>
  <section class="card">
    <div class="card-head">
      <h2>Concentration des détenteurs</h2>
      <div class="row">
        <SourceTag v-if="latest" :source="latest.source" :fetched-at="latest.ts" cached />
        <button class="ghost small" :disabled="refreshing" title="Forcer un snapshot (limité)" @click="$emit('refresh')">↻</button>
      </div>
    </div>
    <div v-if="!holders.capabilities.top50And100" class="banner warn small">
      Top 50 / 100 et nombre total de détenteurs non disponibles dans la configuration actuelle. Renseignez <code>{{ holders.capabilities.missingVariable }}</code> (plan Helius gratuit).
    </div>
    <div v-if="!latest" class="empty">Aucun snapshot détenteurs pour l’instant. Le premier est pris à l’ajout, puis chaque jour à 06:00.</div>
    <template v-else>
      <div class="row" style="gap:1.5rem; margin-bottom:.5rem">
        <div><div class="faint small">Détenteurs</div><strong style="font-size:1.2rem">{{ fmtNum(latest.holderCount, { digits: 0 }) }}</strong></div>
        <div v-for="[label, v] in tops" :key="label"><div class="faint small">{{ label }}</div><strong>{{ v === null ? 'n/d' : fmtPct(v, { signed: false, digits: 1 }) }}</strong></div>
      </div>
      <p v-if="latest.truncated" class="small muted">Liste tronquée par la source : les pourcentages au-delà du top 20 peuvent être sous-estimés.</p>
      <p v-if="latest.excludedAccounts?.length" class="small faint">
        Exclus du calcul : {{ latest.excludedAccounts.length }} compte(s) détenus par des programmes ou adresses de burn
        ({{ fmtPct(latest.excludedAccounts.reduce((n, e) => n + e.pct, 0), { signed: false, digits: 1 }) }} de l’offre).
      </p>
      <div v-if="latest.buckets" class="overflow">
        <table>
          <thead><tr><th>Tranche de valeur détenue</th><th class="num">Wallets</th></tr></thead>
          <tbody><tr v-for="b in latest.buckets" :key="b.label"><td>{{ b.label }}</td><td class="num">{{ fmtNum(b.count, { digits: 0 }) }}</td></tr></tbody>
        </table>
      </div>
      <h3 style="margin-top:.75rem">Historique quotidien</h3>
      <TimeSeriesChart :series="history" :height="180" />
      <details style="margin-top:.5rem">
        <summary class="muted small">Top {{ holders.topHolders.length }} wallets (hors pools)</summary>
        <div class="overflow">
          <table>
            <thead><tr><th>#</th><th>Wallet</th><th class="num">Part</th><th class="num">Valeur</th></tr></thead>
            <tbody>
              <tr v-for="h in holders.topHolders" :key="h.owner">
                <td>{{ h.rank }}</td>
                <td class="mono"><a :href="`https://solscan.io/account/${h.owner}`" target="_blank" rel="noopener">{{ shortAddr(h.owner, 6) }}</a></td>
                <td class="num">{{ fmtPct(h.pct, { signed: false }) }}</td>
                <td class="num">{{ fmtUsd(h.valueUsd, { compact: true }) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </section>
</template>
