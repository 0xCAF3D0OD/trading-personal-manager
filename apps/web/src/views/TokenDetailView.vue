<script setup lang="ts">
import { computed, toRef } from 'vue';
import { ApiHttpError } from '@/api/http';
import CreatorCard from '@/components/token/CreatorCard.vue';
import DivergencePanel from '@/components/token/DivergencePanel.vue';
import HolderConcentrationCard from '@/components/token/HolderConcentrationCard.vue';
import MarketCard from '@/components/token/MarketCard.vue';
import StructuralHealthCard from '@/components/token/StructuralHealthCard.vue';
import SupplyCard from '@/components/token/SupplyCard.vue';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate, shortAddr } from '@/composables/useFormat';
import { useCreator, useDivergences, useHealth, useHolders, useMarket, useSupply, useToken, useTokenRefresh } from '@/queries/useTokenDetail';
import { usePlans } from '@/queries/usePlans';
import { useNotificationsStore } from '@/stores/notifications.store';

const props = defineProps<{ id: number }>();
const id = toRef(props, 'id');
const token = useToken(id);
const health = useHealth(id);
const market = useMarket(id);
const supply = useSupply(id);
const holders = useHolders(id);
const divergences = useDivergences(id);
const creator = useCreator(id);
const plans = usePlans(id);
const refresh = useTokenRefresh(id);
const notify = useNotificationsStore();
const t = computed(() => token.data.value?.data);
const currentPlan = computed(() => plans.data.value?.data.plans.find((p) => p.isCurrent) ?? null);

async function refreshHolders() {
  try { await refresh.holders.mutateAsync(); notify.push('success', 'Snapshot détenteurs pris.'); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : 'Échec', 8000); }
}
async function refreshHealth() {
  try { await refresh.health.mutateAsync(); notify.push('success', 'Santé structurelle revérifiée.'); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : 'Échec', 8000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <QueryState :loading="token.isLoading.value" :error="token.error.value" />
    <template v-if="t">
      <header class="row" style="justify-content: space-between; align-items: flex-start">
        <div>
          <h1>{{ t.symbol ?? shortAddr(t.address) }} <span class="muted" style="font-weight:400">{{ t.name }}</span></h1>
          <div class="small mono row" style="gap:.75rem">
            <span>{{ t.address }}</span>
            <a :href="`https://solscan.io/token/${t.address}`" target="_blank" rel="noopener">Solscan ↗</a>
            <a :href="`https://dexscreener.com/solana/${t.address}`" target="_blank" rel="noopener">DexScreener ↗</a>
          </div>
          <div class="faint small">{{ t.program === 'token-2022' ? 'Token-2022' : 'SPL Token' }} · {{ t.decimals }} décimales · créé {{ t.createdAt ? fmtDate(t.createdAt, false) : 'date inconnue' }} · suivi depuis {{ fmtDate(t.addedAt, false) }}</div>
        </div>
        <div class="stack" style="align-items:flex-end">
          <router-link :to="`/token/${t.id}/journal`"><button class="primary">Journal de discipline</button></router-link>
          <span v-if="currentPlan" class="small muted">Plan v{{ currentPlan.version }} · stop {{ currentPlan.stopLossPrice }} · objectif {{ currentPlan.takeProfitPrice }}</span>
          <span v-else class="small down">Aucun plan enregistré</span>
        </div>
      </header>

      <div class="grid grid-2">
        <div class="stack" style="gap:1rem">
          <QueryState :loading="market.isLoading.value" :error="market.error.value" />
          <MarketCard v-if="market.data.value" :market="market.data.value.data" />
          <QueryState :loading="supply.isLoading.value" :error="supply.error.value" />
          <SupplyCard v-if="supply.data.value" :supply="supply.data.value.data" />
        </div>
        <div class="stack" style="gap:1rem">
          <QueryState :loading="health.isLoading.value" :error="health.error.value" />
          <StructuralHealthCard v-if="health.data.value" :health="health.data.value.data" :refreshing="refresh.health.isPending.value" @refresh="refreshHealth" />
          <QueryState :loading="holders.isLoading.value" :error="holders.error.value" />
          <HolderConcentrationCard v-if="holders.data.value" :holders="holders.data.value.data" :refreshing="refresh.holders.isPending.value" @refresh="refreshHolders" />
        </div>
      </div>

      <QueryState :loading="divergences.isLoading.value" :error="divergences.error.value" />
      <DivergencePanel v-if="divergences.data.value" :divergences="divergences.data.value.data" />

      <QueryState :loading="creator.isLoading.value" :error="creator.error.value" />
      <CreatorCard v-if="creator.data.value" :creator="creator.data.value.data" />
    </template>
  </div>
</template>
