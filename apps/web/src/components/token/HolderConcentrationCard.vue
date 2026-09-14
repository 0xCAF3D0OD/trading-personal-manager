<script setup lang="ts">
import type { HoldersView } from '@tpm/shared';
import { computed } from 'vue';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import CardMore from '@/components/shared/CardMore.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import Terme from '@/components/shared/Terme.vue';
import { fmtNum, fmtPct, fmtUsd, shortAddr } from '@/composables/useFormat';
import { useCardDetail } from '@/composables/useCardDetail';
import { useUiStore } from '@/stores/ui.store';
import { SUMMARY_PURPOSE } from '@tpm/shared';
const props = defineProps<{ holders: HoldersView; refreshing?: boolean }>();
defineEmits<{ refresh: [] }>();
const { open, detailMode, toggle } = useCardDetail();
const ui = useUiStore();
const latest = computed(() => props.holders.latest);
const history = computed(() => [
  { label: 'Détenteurs', points: props.holders.history.map((h) => ({ ts: h.ts, value: h.holderCount })) },
  { label: 'Top 10 (%)', unit: '%', points: props.holders.history.map((h) => ({ ts: h.ts, value: h.top10Pct })) },
]);
const tops = computed(() => latest.value ? [
  ['Top 5', latest.value.top5Pct], ['Top 10', latest.value.top10Pct], ['Top 20', latest.value.top20Pct],
  ['Top 50', latest.value.top50Pct], ['Top 100', latest.value.top100Pct],
] as [string, number | null][] : []);
const concentrated = computed(() => latest.value?.top10Pct !== null && latest.value?.top10Pct !== undefined && latest.value.top10Pct > ui.settings.summaryTop10ConcentratedPct);
</script>
<template>
  <section id="card-holders" class="card">
    <div class="card-head">
      <h2>Qui tient le token ?</h2>
      <div class="row">
        <SourceTag v-if="latest" :source="latest.source" :fetched-at="latest.ts" cached />
        <button class="ghost small" :disabled="refreshing" title="Forcer un relevé (limité)" @click="$emit('refresh')">↻</button>
      </div>
    </div>
    <p class="small faint purpose" style="margin:0 0 .4rem">{{ SUMMARY_PURPOSE.holders }}</p>
    <div v-if="!latest" class="empty">Aucun relevé des détenteurs pour l’instant. Le premier est pris à l’ajout, puis chaque jour à 06:00.</div>
    <template v-else>
      <div class="row" style="gap:.75rem">
        <StatusBadge v-if="latest.top10Pct !== null" :status="latest.truncated ? 'unknown' : concentrated ? 'risk' : 'ok'" :label="latest.truncated ? 'partiel' : concentrated ? 'concentrée' : 'répartie'" />
        <span>
          Les dix premiers portefeuilles détiennent <strong>{{ latest.top10Pct === null ? 'n/d' : fmtPct(latest.top10Pct, { signed: false, digits: 0 }) }}</strong>
          <template v-if="latest.holderCount !== null"> sur {{ fmtNum(latest.holderCount, { digits: 0 }) }} <Terme mot="détenteur">détenteurs</Terme></template>.
          <template v-if="concentrated && !latest.truncated"> Une seule vente peut faire chuter le prix.</template>
        </span>
      </div>
      <p v-if="latest.truncated" class="small muted" style="margin:.4rem 0 0">Seuls les vingt premiers sont connus dans la configuration actuelle : la <Terme mot="concentration">concentration</Terme> réelle est au moins celle-ci.</p>
      <div v-if="!holders.capabilities.top50And100" class="banner warn small" style="margin-top:.5rem">
        Top 50 / 100 et nombre total de détenteurs non disponibles. Renseignez <code>{{ holders.capabilities.missingVariable }}</code> (plan Helius gratuit).
      </div>
      <template v-if="open">
        <div class="row" style="gap:1.5rem; margin:.75rem 0 .5rem">
          <div v-for="[label, v] in tops" :key="label"><div class="faint small">{{ label }}</div><strong>{{ v === null ? 'n/d' : fmtPct(v, { signed: false, digits: 1 }) }}</strong></div>
        </div>
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
    </template>
    <CardMore :open="open" :hidden="detailMode || !latest" @toggle="toggle" />
  </section>
</template>
