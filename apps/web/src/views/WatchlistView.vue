<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import AddTokenForm from '@/components/watchlist/AddTokenForm.vue';
import TokenRow from '@/components/watchlist/TokenRow.vue';
import QueryState from '@/components/shared/QueryState.vue';
import { useSummaries, useWatchlist, useWatchlistMutations } from '@/queries/useWatchlist';
import { useNotificationsStore } from '@/stores/notifications.store';
import { useUiStore } from '@/stores/ui.store';
import { SUMMARY_DISCLAIMER } from '@tpm/shared';

const q = useWatchlist();
const summaries = useSummaries();
const { remove, reorder } = useWatchlistMutations();
const notify = useNotificationsStore();
const { settings } = storeToRefs(useUiStore());
const detail = computed(() => settings.value.mode === 'detail');
const all = computed(() => q.data.value?.data ?? []);
/** Filtres de lecture : récent (âge du token) et forte évolution (variation sur 24 h). Le tri manuel reste la base. */
const maxAgeDays = ref<number>(0);
const minAbsPct24 = ref<number>(0);
const sortBy = ref<'manual' | 'change' | 'age'>('manual');
const filtering = computed(() => maxAgeDays.value > 0 || minAbsPct24.value > 0 || sortBy.value !== 'manual');
const items = computed(() => {
  const rows = all.value.filter((t) =>
    (maxAgeDays.value === 0 || (t.ageDays !== null && t.ageDays <= maxAgeDays.value))
    && (minAbsPct24.value === 0 || (t.priceChange24hPct !== null && Math.abs(t.priceChange24hPct) >= minAbsPct24.value)));
  if (sortBy.value === 'change') return [...rows].sort((a, b) => Math.abs(b.priceChange24hPct ?? 0) - Math.abs(a.priceChange24hPct ?? 0));
  if (sortBy.value === 'age') return [...rows].sort((a, b) => (a.ageDays ?? Infinity) - (b.ageDays ?? Infinity));
  return rows;
});
const QUESTIONS = ['Piège ?', 'Sortie ?', 'Détenteurs', 'Équipe', 'Marché'];

function move(index: number, delta: number) {
  if (filtering.value) return;
  const ids = all.value.map((t) => t.id);
  const [id] = ids.splice(index, 1);
  ids.splice(index + delta, 0, id as number);
  reorder.mutate(ids);
}
async function del(id: number, symbol: string | null) {
  if (!confirm(`Retirer ${symbol ?? id} de la liste ? L’historique est conservé.`)) return;
  await remove.mutateAsync(id);
  notify.push('info', 'Token retiré de la liste.');
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <h1>Liste de surveillance</h1>
    <AddTokenForm />
    <div v-if="all.length > 1" class="row small filters">
      <span class="muted">Affiner :</span>
      <select v-model.number="maxAgeDays" style="width:auto"><option :value="0">Tout âge</option><option :value="7">Récent : moins de 7 jours</option><option :value="30">Moins de 30 jours</option><option :value="90">Moins de 90 jours</option></select>
      <select v-model.number="minAbsPct24" style="width:auto"><option :value="0">Toute variation</option><option :value="10">Évolution ≥ 10 % / 24 h</option><option :value="25">≥ 25 %</option><option :value="50">Forte : ≥ 50 %</option><option :value="100">≥ 100 %</option></select>
      <select v-model="sortBy" style="width:auto"><option value="manual">Mon ordre</option><option value="change">Plus forte variation d’abord</option><option value="age">Plus récent d’abord</option></select>
      <span class="faint">{{ items.length }} / {{ all.length }}</span>
    </div>
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <div v-if="q.data.value && !all.length" class="empty">Aucun token surveillé. Ajoutez une adresse de mint ci-dessus.</div>
    <div v-else-if="q.data.value && !items.length" class="empty">Aucun token ne correspond à ces critères. Élargissez un filtre.</div>
    <div v-else-if="items.length" class="card overflow" style="padding:0">
      <table>
        <thead>
          <tr v-if="!detail"><th>Token</th><th class="num">Prix</th><th class="num">24 h</th><th v-for="qn in QUESTIONS" :key="qn">{{ qn }}</th><th></th></tr>
          <tr v-else><th>Token</th><th class="num">Prix</th><th class="num">24 h</th><th class="num">Capitalisation</th><th class="num">Volume 24 h</th><th class="num">Âge</th><th class="num">Détenteurs relevés</th><th></th></tr>
        </thead>
        <tbody>
          <TokenRow v-for="(t, i) in items" :key="t.id" :item="t" :index="i" :count="items.length" :detail="detail" :summary="summaries.data.value?.data[t.id] ?? null" @up="move(i, -1)" @down="move(i, 1)" @remove="del(t.id, t.symbol)" />
        </tbody>
      </table>
    </div>
    <p class="faint small">
      <template v-if="!detail">{{ SUMMARY_DISCLAIMER }} Survolez une réponse pour la phrase complète, ouvrez la fiche pour la justification. </template>
      Prix rafraîchi toutes les 60 s depuis le cache. Relevé des détenteurs quotidien à 06:00.
    </p>
  </div>
</template>
