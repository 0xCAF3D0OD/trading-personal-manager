<script setup lang="ts">
import type { PlanInput } from '@tpm/shared';
import { computed, ref, toRef } from 'vue';
import PlanForm from '@/components/journal/PlanForm.vue';
import PlanHistory from '@/components/journal/PlanHistory.vue';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate, fmtUsd } from '@/composables/useFormat';
import { useAlerts } from '@/queries/useAlerts';
import { useCreatePlan, usePlans } from '@/queries/usePlans';
import { useMarket, useToken } from '@/queries/useTokenDetail';
import { useNotificationsStore } from '@/stores/notifications.store';

const props = defineProps<{ id: number }>();
const id = toRef(props, 'id');
const token = useToken(id);
const market = useMarket(id);
const plans = usePlans(id);
const create = useCreatePlan(id);
const alerts = useAlerts(computed(() => id.value));
const notify = useNotificationsStore();
const formRef = ref<InstanceType<typeof PlanForm> | null>(null);
const showForm = ref(false);
const current = computed(() => plans.data.value?.data.plans.find((p) => p.isCurrent) ?? null);
const planAlerts = computed(() => (alerts.data.value?.data ?? []).filter((a) => a.planId && a.enabled));

async function submit(input: PlanInput) {
  try {
    await create.mutateAsync(input);
    notify.push('success', 'Plan enregistré. Alertes de seuil créées.');
    showForm.value = false;
  } catch (e) {
    formRef.value?.setError(e);
  }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <div class="row" style="justify-content:space-between">
      <h1>Journal de discipline <span class="muted" style="font-weight:400">{{ token.data.value?.data.symbol ?? '' }}</span></h1>
      <router-link :to="`/token/${id}`">← Vue détaillée</router-link>
    </div>
    <QueryState :loading="plans.isLoading.value" :error="plans.error.value" />
    <template v-if="plans.data.value">
      <div v-if="current && !showForm" class="card">
        <div class="card-head"><h2>Plan actuel (v{{ current.version }})</h2><span class="faint small">{{ fmtDate(current.createdAt) }}</span></div>
        <dl class="kv">
          <dt>Prix d’entrée cible</dt><dd>{{ fmtUsd(current.entryPrice) }}</dd>
          <dt>Sortie en gain</dt><dd class="up">{{ fmtUsd(current.takeProfitPrice) }}</dd>
          <dt>Sortie en perte</dt><dd class="down">{{ fmtUsd(current.stopLossPrice) }}</dd>
          <dt>Montant engagé</dt><dd>{{ fmtUsd(current.amountUsd) }}</dd>
          <dt>Perte maximale au stop</dt><dd class="down">{{ fmtUsd(-current.maxLossUsd) }}</dd>
          <dt>Ratio gain / risque</dt><dd>{{ current.riskRewardRatio }}</dd>
        </dl>
        <p v-if="current.note" class="small muted" style="margin-top:.5rem">{{ current.note }}</p>
        <div v-if="planAlerts.length" class="small faint" style="margin-top:.5rem">Alertes actives : {{ planAlerts.map((a) => a.ruleText).join(' · ') }}</div>
        <button style="margin-top:.75rem" @click="showForm = true">Réviser (crée une nouvelle version)</button>
      </div>
      <PlanForm v-if="showForm || !current" ref="formRef" :current-price="market.data.value?.data.price.primary.value ?? null" :previous="current" :pending="create.isPending.value" @submit="submit" />
      <button v-if="showForm && current" class="ghost" @click="showForm = false">Annuler la révision</button>
      <PlanHistory :plans="plans.data.value.data.plans" :revisions="plans.data.value.data.revisions" />
    </template>
  </div>
</template>
