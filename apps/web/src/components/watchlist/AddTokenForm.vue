<script setup lang="ts">
import { ApiHttpError } from '@/api/http';
import { useSolanaAddress } from '@/composables/useSolanaAddress';
import { useWatchlistMutations } from '@/queries/useWatchlist';
import { useNotificationsStore } from '@/stores/notifications.store';

const { input, trimmed, valid, error } = useSolanaAddress();
const { add } = useWatchlistMutations();
const notify = useNotificationsStore();

async function submit() {
  if (!valid.value) return;
  try {
    const r = await add.mutateAsync(trimmed.value);
    notify.push('success', `${r.data.symbol ?? r.data.address.slice(0, 6)} ajouté. Premiers snapshots en cours.`);
    input.value = '';
  } catch (e) {
    notify.push('error', e instanceof ApiHttpError ? e.message : 'Ajout impossible', 8000);
  }
}
</script>
<template>
  <form class="card" @submit.prevent="submit">
    <label for="addr">Ajouter un token par son adresse de mint</label>
    <div class="row">
      <input id="addr" v-model="input" class="mono" placeholder="Ex. DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" autocomplete="off" spellcheck="false" style="flex:1; min-width: 280px" />
      <button class="primary" type="submit" :disabled="!valid || add.isPending.value">{{ add.isPending.value ? 'Résolution…' : 'Ajouter' }}</button>
    </div>
    <p v-if="error" class="error small" style="margin-top:.4rem">{{ error }}</p>
    <p v-else class="faint small" style="margin-top:.4rem">L’adresse est validée localement avant tout appel réseau. Copiez-la depuis Solscan ou DexScreener pour éviter les homonymes.</p>
  </form>
</template>
