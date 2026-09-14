<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ApiHttpError } from '@/api/http';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import QueryState from '@/components/shared/QueryState.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import Terme from '@/components/shared/Terme.vue';
import { fmtDate, fmtNum, fmtPct, pctClass, timeAgo } from '@/composables/useFormat';
import { usePortfolio, usePortfolioHistory, usePortfolioRefresh } from '@/queries/usePortfolio';
import { useSummaries } from '@/queries/useWatchlist';
import { useModuleSettings } from '@/queries/useWatch';
import { useNotificationsStore } from '@/stores/notifications.store';
import { useUiStore } from '@/stores/ui.store';

const q = usePortfolio();
const refresh = usePortfolioRefresh();
const days = ref(90);
const history = usePortfolioHistory(days);
const summaries = useSummaries();
const settings = useModuleSettings('portfolio');
const notify = useNotificationsStore();
const { settings: ui } = storeToRefs(useUiStore());
const detail = computed(() => ui.value.mode === 'detail');
const v = computed(() => q.data.value?.data);
const cur = computed(() => (v.value?.baseCurrency === 'USD' ? '$' : '€'));

/** Mode discret : les montants disparaissent, seules les parts restent. Mémorisé dans le navigateur ; défaut depuis les réglages. */
const discreet = ref<boolean>(localStorage.getItem('ui.discreet') === '1');
let seeded = localStorage.getItem('ui.discreet') !== null;
watch(() => settings.data.value?.data.settings, (s) => { if (!seeded && s && (s as { discreetByDefault?: boolean }).discreetByDefault) { discreet.value = true; seeded = true; } }, { immediate: true });
watch(discreet, (d) => localStorage.setItem('ui.discreet', d ? '1' : '0'));
const money = (n: number | null | undefined) => (discreet.value ? '•••' : n === null || n === undefined ? '—' : `${fmtNum(n, { digits: n >= 100 ? 0 : 2 })} ${cur.value}`);
const qty = (n: number) => (discreet.value ? '•••' : fmtNum(n, { digits: n >= 1000 ? 0 : 4 }));
const STATE: Record<string, string> = { staking: 'en staking', earn_flex: 'en Earn flexible', earn_locked: 'verrouillé' };

const series = computed(() => [{ label: `Valeur totale (${cur.value})`, points: (history.data.value?.data ?? []).map((p) => ({ ts: p.ts, value: discreet.value ? null : p.total })) }]);
async function doRefresh() {
  try { await refresh.mutateAsync(); notify.push('success', 'Soldes relus chez Kraken.'); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h1>Portefeuille Kraken</h1>
        <p class="small muted" style="margin:0">Une fenêtre sur le compte, pas une télécommande : la clé ne sait que lire les soldes, et le code n’a aucune route d’ordre. Deux prix, jamais moyennés : Kraken, là où l’actif est détenu, et la chaîne pour les tokens surveillés.</p>
      </div>
      <div class="row">
        <button :class="discreet ? 'primary' : ''" :title="discreet ? 'Afficher les montants' : 'Masquer les montants, garder les parts'" @click="discreet = !discreet">{{ discreet ? 'Mode discret ✓' : 'Mode discret' }}</button>
        <button :disabled="refresh.isPending.value || !v?.configured" @click="doRefresh">{{ refresh.isPending.value ? 'Lecture…' : 'Rafraîchir' }}</button>
      </div>
    </div>
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <template v-if="v">
      <div v-if="!v.configured" class="banner warn">
        Non configuré. Créez sur Kraken une clé dédiée avec la seule permission « Query Funds » et une date d’expiration, puis renseignez <code>{{ v.missingVariable }}</code> dans le <code>.env</code> et relancez. Ne collez jamais la clé ailleurs que dans ce fichier.
      </div>
      <div v-else-if="!v.enabled" class="banner warn">Module désactivé dans les réglages (onglet Portefeuille).</div>
      <div v-else-if="v.error" class="banner err">Kraken n’a pas répondu : {{ v.error }}. Les derniers relevés conservés restent consultables dans l’historique.</div>
      <template v-else>
        <section class="card">
          <div class="row" style="justify-content:space-between;align-items:baseline">
            <div class="row" style="align-items:baseline;gap:1rem">
              <span style="font-size:1.8rem;font-weight:600">{{ money(v.total) }}</span>
              <span v-if="v.changeDayPct !== null" :class="pctClass(v.changeDayPct)">{{ fmtPct(v.changeDayPct) }} depuis le relevé du {{ v.previousDay }}</span>
              <span v-else class="faint small">Pas encore de relevé de la veille : la variation apparaît demain.</span>
            </div>
            <SourceTag source="kraken" :fetched-at="v.fetchedAt" :cached="v.cached" />
          </div>
          <p class="small muted" style="margin:.25rem 0 0">
            <template v-if="v.unknownCount">{{ v.unknownCount }} position(s) sans prix Kraken en euro ou en dollar : le total est une borne basse. </template>
            <template v-if="detail && v.totalEur !== null && v.totalUsd !== null">Soit {{ discreet ? '•••' : `${fmtNum(v.totalEur, { digits: 0 })} €` }} / {{ discreet ? '•••' : `${fmtNum(v.totalUsd, { digits: 0 })} $` }}. </template>
            Relevé Kraken {{ v.fetchedAt ? timeAgo(v.fetchedAt) : '—' }}, relu au plus toutes les 15 minutes ; un relevé conservé par jour.
          </p>
        </section>

        <section class="card overflow" style="padding:0">
          <table>
            <thead><tr><th>Actif</th><th class="num">Quantité</th><th class="num">Prix Kraken</th><th v-if="detail" class="num">Prix on-chain</th><th class="num">Valeur</th><th class="num">Part</th><th>Suivi</th></tr></thead>
            <tbody>
              <tr v-for="p in v.positions" :key="p.krakenCode">
                <td><strong>{{ p.asset }}</strong> <span v-if="p.state" class="badge neutral" title="Non vendable immédiatement">{{ STATE[p.state] }}</span><div v-if="detail" class="faint small mono">{{ p.krakenCode }}</div></td>
                <td class="num">{{ qty(p.balance) }}</td>
                <td class="num">{{ p.price === null ? 'inconnu' : `${p.price >= 1 ? fmtNum(p.price, { digits: 2 }) : p.price.toPrecision(4)} ${cur}` }}<div v-if="detail" class="faint small"><SourceTag :source="p.priceSource" /></div></td>
                <td v-if="detail" class="num">
                  <template v-if="p.onchainPriceUsd !== null">{{ p.onchainPriceUsd >= 1 ? fmtNum(p.onchainPriceUsd, { digits: 2 }) : p.onchainPriceUsd.toPrecision(4) }} $<div class="faint small"><SourceTag :source="p.onchainSource" :fetched-at="p.onchainFetchedAt" /> · écart <span :class="Math.abs(p.spreadPct ?? 0) >= 2 ? 'down' : ''">{{ fmtPct(p.spreadPct) }}</span></div></template>
                  <span v-else class="faint">—</span>
                </td>
                <td class="num">{{ money(p.value) }}</td>
                <td class="num">{{ p.sharePct === null ? '—' : fmtPct(p.sharePct, { signed: false, digits: 1 }) }}</td>
                <td class="small">
                  <template v-if="p.tokenId !== null">
                    <router-link :to="`/token/${p.tokenId}`">{{ p.tokenSymbol ?? 'fiche' }}</router-link>
                    <span v-if="summaries.data.value?.data[p.tokenId]" class="faint"> · {{ summaries.data.value.data[p.tokenId]!.answers.map((a) => a.short).join(' · ') }}</span>
                  </template>
                  <span v-else-if="!['EUR', 'USD', 'GBP', 'CHF'].includes(p.asset)" class="faint" title="Relier cet actif à un token surveillé dans Réglages, onglet Portefeuille">non relié</span>
                </td>
              </tr>
              <tr v-if="!v.positions.length"><td colspan="7" class="empty">Aucun solde non nul sur le compte.</td></tr>
            </tbody>
          </table>
        </section>

        <section v-if="v.planVsAccount.length" class="card">
          <h2>Le plan face au compte</h2>
          <p class="small muted">Ce que le <Terme mot="engagement">journal</Terme> prévoyait, et ce que le compte contient. Des phrases, aucune action.</p>
          <div class="stack" style="gap:.6rem">
            <div v-for="pv in v.planVsAccount" :key="pv.tokenId" class="row" style="align-items:flex-start;gap:.75rem">
              <StatusBadge :status="pv.state === 'ok' ? 'ok' : pv.state === 'warn' ? 'warning' : pv.state === 'risk' ? 'risk' : 'neutral'" :label="`${pv.symbol} · plan v${pv.planVersion}`" />
              <ul class="plain small" style="flex:1"><li v-for="(l, i) in pv.lines" :key="i" :class="discreet && i === 0 ? 'faint' : ''">{{ discreet && i === 0 ? 'Montants masqués (mode discret).' : l }}</li></ul>
            </div>
          </div>
        </section>

        <section v-if="detail || (history.data.value?.data.length ?? 0) > 1" class="card">
          <div class="card-head"><h2>Valeur dans le temps</h2><select v-model.number="days" style="width:auto"><option :value="30">30 jours</option><option :value="90">90 jours</option><option :value="365">1 an</option></select></div>
          <QueryState :loading="history.isLoading.value" :error="history.error.value" />
          <div v-if="history.data.value && history.data.value.data.length < 2" class="empty">La courbe apparaît après deux relevés quotidiens (23:55).</div>
          <TimeSeriesChart v-else-if="history.data.value && !discreet" :series="series" :height="180" />
          <p v-else-if="discreet" class="faint small">Courbe masquée en mode discret.</p>
        </section>
        <p class="faint small">Les montants du portefeuille ne sont jamais inclus dans les dossiers pour l’IA. Correspondances actif ↔ token, monnaie et alerte : Réglages, onglet Portefeuille. Dernier relevé conservé : {{ history.data.value?.data.length ? fmtDate(history.data.value.data[history.data.value.data.length - 1]!.ts, false) : 'aucun' }}.</p>
      </template>
    </template>
  </div>
</template>
