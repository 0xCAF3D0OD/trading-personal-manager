<script setup lang="ts">
import { computed } from 'vue';
import AddTokenForm from '@/components/watchlist/AddTokenForm.vue';
import TokenRow from '@/components/watchlist/TokenRow.vue';
import QueryState from '@/components/shared/QueryState.vue';
import { useWatchlist, useWatchlistMutations } from '@/queries/useWatchlist';
import { useNotificationsStore } from '@/stores/notifications.store';

const q = useWatchlist();
const { remove, reorder } = useWatchlistMutations();
const notify = useNotificationsStore();
const items = computed(() => q.data.value?.data ?? []);

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
          <tr><th>Token</th><th class="num">Prix</th><th class="num">Capitalisation</th><th class="num">Volume 24 h</th><th class="num">Âge</th><th class="num">Détenteurs relevés</th><th class="num"></th></tr>
        </thead>
        <tbody>
          <TokenRow v-for="(t, i) in items" :key="t.id" :item="t" :index="i" :count="items.length" @up="move(i, -1)" @down="move(i, 1)" @remove="del(t.id, t.symbol)" />
        </tbody>
      </table>
    </div>
    <p class="faint small">Prix et volume rafraîchis toutes les 60 s depuis le cache backend. Snapshot détenteurs quotidien à 06:00.</p>
  </div>
</template>
