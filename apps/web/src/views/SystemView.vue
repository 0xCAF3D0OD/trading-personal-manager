<script setup lang="ts">
import { ApiHttpError } from '@/api/http';
import QueryState from '@/components/shared/QueryState.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { SOURCE_LABEL, fmtDate, fmtNum, timeAgo } from '@/composables/useFormat';
import { useRunJob, useSources, useUsage } from '@/queries/useSystem';
import { useNotificationsStore } from '@/stores/notifications.store';

const sources = useSources();
const usage = useUsage();
const run = useRunJob();
const notify = useNotificationsStore();
async function runJob(name: 'market-snapshot' | 'holder-snapshot') {
  try { await run.mutateAsync(name); notify.push('success', `Job ${name} exécuté.`); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : 'Échec', 8000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <h1>Système</h1>
    <QueryState :loading="sources.isLoading.value" :error="sources.error.value" />
    <template v-if="sources.data.value">
      <section class="card">
        <div class="card-head"><h2>Sources de données</h2><span class="badge neutral">{{ sources.data.value.data.tierLabel }}</span></div>
        <div class="overflow">
          <table>
            <thead><tr><th>Fournisseur</th><th>Configuré</th><th>État</th><th>Dernier succès</th><th>Dernière erreur</th></tr></thead>
            <tbody>
              <tr v-for="s in sources.data.value.data.sources" :key="s.name">
                <td>{{ SOURCE_LABEL[s.name] ?? s.name }}</td>
                <td>{{ s.configured ? 'oui' : 'non' }}</td>
                <td><StatusBadge v-if="!s.configured" status="unknown" label="non configuré" /><StatusBadge v-else :status="s.healthy ? 'ok' : 'risk'" :label="s.healthy ? 'OK' : s.degradedReason ?? 'dégradé'" /></td>
                <td class="small">{{ s.lastSuccessAt ? timeAgo(s.lastSuccessAt) : '—' }}</td>
                <td class="small">{{ s.lastErrorAt ? timeAgo(s.lastErrorAt) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3 style="margin-top:1rem">Ce que la configuration actuelle permet</h3>
        <div class="overflow">
          <table>
            <thead><tr><th>Donnée</th><th>Source active</th><th>Disponible</th><th>Variable manquante</th></tr></thead>
            <tbody>
              <tr v-for="c in sources.data.value.data.capabilities" :key="c.key">
                <td>{{ c.label }}</td><td>{{ SOURCE_LABEL[c.activeSource] ?? c.activeSource }}</td>
                <td><StatusBadge :status="c.available ? 'ok' : 'warning'" :label="c.available ? 'oui' : 'non'" /></td>
                <td class="mono small">{{ c.missingVariable ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <QueryState :loading="usage.isLoading.value" :error="usage.error.value" />
    <template v-if="usage.data.value">
      <section class="card">
        <h2>Consommation des API</h2>
        <div class="grid grid-2">
          <div v-for="[title, rows] in [['Aujourd’hui', usage.data.value.data.today], ['30 derniers jours', usage.data.value.data.last30Days]] as const" :key="title">
            <h3>{{ title }}</h3>
            <table>
              <thead><tr><th>Fournisseur</th><th class="num">Appels</th><th class="num">Erreurs</th><th class="num">CU</th></tr></thead>
              <tbody>
                <tr v-for="r in rows" :key="r.provider"><td>{{ SOURCE_LABEL[r.provider] ?? r.provider }}</td><td class="num">{{ r.calls }}</td><td class="num" :class="r.errors ? 'down' : ''">{{ r.errors }}</td><td class="num">{{ fmtNum(r.cu, { digits: 0 }) }}</td></tr>
                <tr v-if="!rows.length"><td colspan="4" class="muted">Aucun appel.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-if="usage.data.value.data.solscan" class="card" style="margin-top:1rem; background:var(--bg-elev-2)">
          <h3>Quota Solscan</h3>
          <dl class="kv">
            <dt>CU consommés ce mois (compteur local)</dt><dd>{{ fmtNum(usage.data.value.data.solscan.localCuThisMonth, { digits: 0 }) }} / {{ fmtNum(usage.data.value.data.solscan.monthlyBudget, { digits: 0 }) }} ({{ usage.data.value.data.solscan.budgetUsedPct.toFixed(1) }} %)</dd>
            <dt>Mode économie (≥ 80 %)</dt><dd>{{ usage.data.value.data.solscan.economyMode ? 'actif : snapshots un jour sur deux' : 'inactif' }}</dd>
          </dl>
          <details v-if="usage.data.value.data.solscan.remoteUsage"><summary class="small muted">Réponse brute de /monitor/usage</summary><pre class="small">{{ JSON.stringify(usage.data.value.data.solscan.remoteUsage, null, 2) }}</pre></details>
        </div>
      </section>
      <section class="card">
        <h2>Jobs planifiés</h2>
        <table>
          <thead><tr><th>Job</th><th>Cron</th><th>Dernière exécution</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            <tr v-for="j in usage.data.value.data.jobs" :key="j.name">
              <td>{{ j.name }}</td><td class="mono small">{{ j.schedule }}</td>
              <td class="small">{{ j.lastRunAt ? fmtDate(j.lastRunAt) : 'jamais' }}</td>
              <td><StatusBadge v-if="j.lastStatus" :status="j.lastStatus === 'ok' ? 'ok' : 'risk'" :label="j.lastStatus" /><span v-if="j.lastError" class="small down"> {{ j.lastError }}</span></td>
              <td class="num"><button v-if="j.name !== 'alert-eval'" class="ghost small" :disabled="run.isPending.value" @click="runJob(j.name as 'market-snapshot' | 'holder-snapshot')">Lancer</button></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
