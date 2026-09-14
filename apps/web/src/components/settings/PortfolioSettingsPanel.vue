<script setup lang="ts">
import type { PortfolioSettings } from '@tpm/shared';
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ApiHttpError } from '@/api/http';
import { watchApi } from '@/api/watch.api';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate } from '@/composables/useFormat';
import { usePortfolio } from '@/queries/usePortfolio';
import { useWatchlist } from '@/queries/useWatchlist';
import { useNotificationsStore } from '@/stores/notifications.store';

const qc = useQueryClient();
const q = useQuery({ queryKey: ['settings', 'portfolio'], queryFn: () => watchApi.settings('portfolio'), staleTime: 60_000 });
const save = useMutation({ mutationFn: (i: { settings: unknown; note: string | null }) => watchApi.updateSettings('portfolio', i.settings, i.note), onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'portfolio'] }); qc.invalidateQueries({ queryKey: ['portfolio'] }); } });
const reset = useMutation({ mutationFn: () => watchApi.resetSettings('portfolio'), onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'portfolio'] }); qc.invalidateQueries({ queryKey: ['portfolio'] }); } });
const notify = useNotificationsStore();
const watchlist = useWatchlist();
const portfolio = usePortfolio();
const env = computed(() => q.data.value?.data);
const form = ref<PortfolioSettings | null>(null);
const note = ref('');
watch(env, (e) => { if (e) form.value = JSON.parse(JSON.stringify(e.settings)); }, { immediate: true });

/** Actifs Kraken non fiat vus au dernier relevé, pour proposer des correspondances. La suggestion par symbole n'est jamais appliquée seule. */
const assets = computed(() => (portfolio.data.value?.data.positions ?? []).map((p) => p.asset).filter((a, i, arr) => !['EUR', 'USD', 'GBP', 'CHF'].includes(a) && arr.indexOf(a) === i));
const tokens = computed(() => watchlist.data.value?.data ?? []);
const suggestion = (asset: string) => tokens.value.find((t) => (t.symbol ?? '').toUpperCase() === asset.toUpperCase()) ?? null;
const newAsset = ref('');
const newToken = ref<number | null>(null);
function addMapping(asset: string, tokenId: number | null) {
  if (!form.value || !asset || !tokenId) return;
  form.value.mappings = [...form.value.mappings.filter((m) => m.asset.toUpperCase() !== asset.toUpperCase()), { asset: asset.toUpperCase(), tokenId }];
  newAsset.value = ''; newToken.value = null;
}
function removeMapping(asset: string) { if (form.value) form.value.mappings = form.value.mappings.filter((m) => m.asset !== asset); }
const tokenLabel = (id: number) => { const t = tokens.value.find((x) => x.id === id); return t ? `${t.symbol ?? '—'} (${t.address.slice(0, 6)}…)` : `token ${id}`; };
async function submit() {
  if (!form.value) return;
  try { await save.mutateAsync({ settings: form.value, note: note.value || null }); notify.push('success', 'Réglages du portefeuille enregistrés.'); note.value = ''; }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? `${e.message} ${JSON.stringify(e.details ?? '')}` : String(e), 10000); }
}
function resetAll() { if (window.confirm('Remettre les réglages du portefeuille à leurs valeurs par défaut ? Les correspondances seront effacées.')) reset.mutate(); }
</script>
<template>
  <div class="stack" style="gap:1rem">
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <template v-if="env && form">
      <div class="row" style="justify-content:space-between">
        <p class="small muted" style="margin:0">Défauts en code v{{ env.codeDefaultsVersion }} · enregistrés le {{ fmtDate(env.updatedAt) }} <span v-if="env.isDefault" class="badge ok">défauts</span><span v-else class="badge neutral">personnalisés</span></p>
        <button class="ghost" @click="resetAll">Restaurer les défauts</button>
      </div>
      <section class="card">
        <h3>Lecture</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <label class="row" style="cursor:pointer;color:var(--text);align-self:end"><input v-model="form.enabled" type="checkbox" style="width:auto" /> Module actif</label>
          <div><label>Monnaie d’affichage</label><select v-model="form.baseCurrency"><option value="EUR">Euro</option><option value="USD">Dollar</option></select></div>
          <div><label>Relire Kraken au plus toutes les (s)</label><input v-model.number="form.refreshIntervalS" type="number" min="60" step="60" /></div>
          <label class="row" style="cursor:pointer;color:var(--text);align-self:end"><input v-model="form.discreetByDefault" type="checkbox" style="width:auto" /> Mode discret à l’ouverture</label>
          <div><label>Alerte si la valeur varie sur un jour de plus de (%)</label><input v-model.number="form.dailyChangeAlertPct" type="number" min="0" step="1" /><div class="faint small">0 = pas d’alerte. Envoyée par le relevé de 23:55, valeur observée, aucune action.</div></div>
        </div>
      </section>
      <section class="card">
        <h3>Correspondances actif Kraken ↔ token surveillé</h3>
        <p class="small muted">Kraken ne publie pas les adresses de mint, et dix tokens portent le même symbole : la correspondance se déclare à la main. Une suggestion par symbole est proposée, jamais appliquée seule.</p>
        <table v-if="form.mappings.length">
          <thead><tr><th>Actif Kraken</th><th>Token surveillé</th><th></th></tr></thead>
          <tbody><tr v-for="m in form.mappings" :key="m.asset"><td><strong>{{ m.asset }}</strong></td><td>{{ tokenLabel(m.tokenId) }}</td><td class="num"><button class="ghost danger small" @click="removeMapping(m.asset)">✕</button></td></tr></tbody>
        </table>
        <div v-if="assets.filter((a) => !form!.mappings.some((m) => m.asset === a) && suggestion(a)).length" class="small" style="margin-top:.5rem">
          <span class="muted">Suggestions :</span>
          <button v-for="a in assets.filter((x) => !form!.mappings.some((m) => m.asset === x) && suggestion(x))" :key="a" class="ghost small" @click="addMapping(a, suggestion(a)!.id)">{{ a }} → {{ suggestion(a)!.symbol }}</button>
        </div>
        <div class="row" style="margin-top:.5rem">
          <input v-model="newAsset" placeholder="Actif Kraken (ex. EMBER)" list="kraken-assets" style="width:200px" />
          <datalist id="kraken-assets"><option v-for="a in assets" :key="a" :value="a" /></datalist>
          <select v-model="newToken" style="width:auto"><option :value="null">Token surveillé…</option><option v-for="t in tokens" :key="t.id" :value="t.id">{{ t.symbol ?? '—' }} · {{ t.address.slice(0, 8) }}…</option></select>
          <button :disabled="!newAsset || !newToken" @click="addMapping(newAsset, newToken)">Relier</button>
        </div>
      </section>
      <div class="row"><input v-model="note" placeholder="Note de version (optionnelle)" style="flex:1" /><button class="primary" :disabled="save.isPending.value" @click="submit">Enregistrer</button></div>
    </template>
  </div>
</template>
