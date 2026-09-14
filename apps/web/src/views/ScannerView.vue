<script setup lang="ts">
import { computed, ref } from 'vue';
import { ApiHttpError } from '@/api/http';
import ScanResultsTable from '@/components/scanner/ScanResultsTable.vue';
import ScanRetroPanel from '@/components/scanner/ScanRetroPanel.vue';
import ScannerSettingsPanel from '@/components/settings/ScannerSettingsPanel.vue';
import QueryState from '@/components/shared/QueryState.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { SCAN_STAGE2_REASONS } from '@tpm/shared';
import { fmtDate, timeAgo } from '@/composables/useFormat';
import { useScanExcluded, useScannerOverview, useScannerRun, useScanResults, useScanRetro, useScanRuns } from '@/queries/useScanner';
import { useNotificationsStore } from '@/stores/notifications.store';

const tab = ref<'results' | 'excluded' | 'retro' | 'runs' | 'settings'>('results');
const days = ref(1);
const exDays = ref(7);
const overview = useScannerOverview();
const results = useScanResults(days);
const excluded = useScanExcluded(exDays);
const retro = useScanRetro();
const runs = useScanRuns();
const run = useScannerRun();
const notify = useNotificationsStore();
const o = computed(() => overview.data.value?.data);
const stage2Only = ref<'all' | 2 | 3>('all');
const excludedRows = computed(() => (excluded.data.value?.data ?? []).filter((r) => stage2Only.value === 'all' || r.excludedStage === stage2Only.value));
async function runNow() {
  try { const r = await run.mutateAsync(); notify.push('success', `Découverte : ${r.data.discover.inserted} nouveau(x) pool(s). Évaluation : ${r.data.evaluate}`, 9000); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 9000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h1>Scanner de nouveaux tokens</h1>
        <p class="small muted" style="margin:0">Réduit le flux des nouveaux pools Solana à une liste courte de tokens à +100 % sur 24 h, à examiner ensuite à la main. Conçu pour éliminer, pas pour promouvoir : le plus propre en premier, jamais le plus spectaculaire. Aucun bouton d'achat.</p>
      </div>
      <button :disabled="run.isPending.value || !o?.enabled" @click="runNow">{{ run.isPending.value ? 'Scan en cours…' : 'Lancer un passage' }}</button>
    </div>
    <QueryState :loading="overview.isLoading.value" :error="overview.error.value" />
    <div v-if="o" class="row small" style="gap:1rem">
      <StatusBadge :status="o.enabled ? 'ok' : 'unknown'" :label="o.enabled ? 'actif' : 'désactivé'" />
      <span>Dernier passage : {{ o.lastRun ? `${timeAgo(o.lastRun.finishedAt ?? o.lastRun.startedAt)} · ${o.lastRun.poolsChecked} pools · ${o.lastRun.keptCount} gardés · ${o.lastRun.status}` : 'jamais' }}</span>
      <span class="faint">Pools suivis : {{ o.pools.hot }} chauds, {{ o.pools.warm }} tièdes, {{ o.pools.cold }} froids, {{ o.pools.retired }} retirés</span>
      <span class="faint">Voie {{ o.lane === 'geckoterminal' ? 'GeckoTerminal public' : 'CoinGecko démo (secours)' }} · {{ o.callsLastHour }} appels / h</span>
      <StatusBadge v-if="o.breaker.open" status="risk" :label="`disjoncteur ouvert jusqu’à ${fmtDate(o.breaker.until)}`" />
      <StatusBadge v-if="!o.heliusAvailable" status="warning" label="sans Helius : créateur non vérifié, alerte zéro drapeau impossible" />
    </div>
    <nav class="row" style="gap:.25rem;border-bottom:1px solid var(--border);padding-bottom:.5rem">
      <button :class="tab === 'results' ? 'primary' : 'ghost'" @click="tab = 'results'">Résultats</button>
      <button :class="tab === 'excluded' ? 'primary' : 'ghost'" @click="tab = 'excluded'">Exclus</button>
      <button :class="tab === 'retro' ? 'primary' : 'ghost'" @click="tab = 'retro'">Rétrospective</button>
      <button :class="tab === 'runs' ? 'primary' : 'ghost'" @click="tab = 'runs'">Passages</button>
      <button :class="tab === 'settings' ? 'primary' : 'ghost'" @click="tab = 'settings'">Réglages</button>
    </nav>

    <template v-if="tab === 'results'">
      <div class="row small"><span class="muted">Tokens gardés au cours des</span><select v-model.number="days" style="width:auto"><option :value="1">24 h</option><option :value="3">3 jours</option><option :value="7">7 jours</option></select><span class="muted">tri : drapeaux croissants, puis liquidité</span></div>
      <QueryState :loading="results.isLoading.value" :error="results.error.value" />
      <div v-if="results.data.value && !results.data.value.data.length" class="empty">Aucun token n'a passé les filtres sur la période. C'est normal la plupart du temps : les seuils sont faits pour éliminer.</div>
      <ScanResultsTable v-else-if="results.data.value" :rows="results.data.value.data" mode="kept" />
    </template>

    <template v-else-if="tab === 'excluded'">
      <p class="small muted">Pour vérifier que les filtres ne sont pas trop agressifs. Étage 2 : seuls les cas qui avaient le +100 % mais ont échoué ailleurs sont conservés ({{ exDays }} jours). Étage 3 : tous.</p>
      <div class="row small">
        <select v-model="stage2Only" style="width:auto"><option value="all">Tous les étages</option><option :value="2">Étage 2 (performance)</option><option :value="3">Étage 3 (structurel)</option></select>
        <template v-if="o?.lastRun && Object.keys(o.lastRun.stage2Reasons).length"><span class="muted">Dernier passage, motifs d’exclusion à l’étage 2 :</span><span v-for="(n, code) in o.lastRun.stage2Reasons" :key="code" class="badge neutral">{{ SCAN_STAGE2_REASONS[code] ?? code }} : {{ n }}</span></template>
      </div>
      <QueryState :loading="excluded.isLoading.value" :error="excluded.error.value" />
      <div v-if="excluded.data.value && !excludedRows.length" class="empty">Aucune exclusion enregistrée.</div>
      <ScanResultsTable v-else-if="excluded.data.value" :rows="excludedRows" mode="excluded" />
    </template>

    <template v-else-if="tab === 'retro'">
      <QueryState :loading="retro.isLoading.value" :error="retro.error.value" />
      <ScanRetroPanel v-if="retro.data.value" :retro="retro.data.value.data" />
    </template>

    <template v-else-if="tab === 'runs'">
      <QueryState :loading="runs.isLoading.value" :error="runs.error.value" />
      <table v-if="runs.data.value">
        <thead><tr><th>Début</th><th>Statut</th><th class="num">Pools</th><th class="num">Après étage 2</th><th class="num">Après étage 3</th><th class="num">Gardés</th><th class="num">Appels</th><th>Erreur</th></tr></thead>
        <tbody><tr v-for="r in runs.data.value.data" :key="r.id">
          <td class="small">{{ fmtDate(r.startedAt) }}</td><td><StatusBadge :status="r.status === 'ok' ? 'ok' : r.status === 'running' ? 'unknown' : 'warning'" :label="r.status" /></td>
          <td class="num">{{ r.poolsChecked }}</td><td class="num">{{ r.passedStage2 }}</td><td class="num">{{ r.passedStage3 }}</td><td class="num">{{ r.keptCount }}</td><td class="num">{{ r.apiCalls }}</td><td class="small down">{{ r.error ?? '' }}</td>
        </tr></tbody>
      </table>
    </template>

    <ScannerSettingsPanel v-else-if="tab === 'settings'" />
  </div>
</template>
