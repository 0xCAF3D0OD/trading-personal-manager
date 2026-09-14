<script setup lang="ts">
import { computed } from 'vue';
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
const items = computed(() => q.data.value?.data ?? []);
const QUESTIONS = ['Piège ?', 'Sortie ?', 'Détenteurs', 'Équipe', 'Marché'];

function move(index: number, delta: number) {
  const ids = items.value.map((t) => t.id);
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
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <div v-if="q.data.value && !items.length" class="empty">Aucun token surveillé. Ajoutez une adresse de mint ci-dessus.</div>
    <div v-else-if="items.length" class="card overflow" style="padding:0">
      <table>
        <thead>
          <tr v-if="!detail"><th>Token</th><th class="num">Prix</th><th v-for="qn in QUESTIONS" :key="qn">{{ qn }}</th><th></th></tr>
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
