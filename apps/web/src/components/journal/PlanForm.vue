<script setup lang="ts">
import { PlanInput, type Plan } from '@tpm/shared';
import { computed, reactive, ref } from 'vue';
import { ApiHttpError } from '@/api/http';
import { fmtUsd } from '@/composables/useFormat';
const props = defineProps<{ currentPrice: number | null; previous: Plan | null; pending: boolean }>();
const emit = defineEmits<{ submit: [input: PlanInput] }>();

const form = reactive({
  entryPrice: props.previous?.entryPrice ?? props.currentPrice ?? 0,
  takeProfitPrice: props.previous?.takeProfitPrice ?? 0,
  stopLossPrice: props.previous?.stopLossPrice ?? 0,
  amountUsd: props.previous?.amountUsd ?? 0,
  acceptsTotalLoss: false,
  note: '',
});
const error = ref<string | null>(null);
const parsed = computed(() => PlanInput.safeParse({ ...form, acceptsTotalLoss: form.acceptsTotalLoss ? true : false }));
const preview = computed(() => {
  const risk = form.entryPrice - form.stopLossPrice, reward = form.takeProfitPrice - form.entryPrice;
  const ready = form.entryPrice > 0 && form.takeProfitPrice > 0 && form.stopLossPrice > 0;
  return {
    rr: ready && risk > 0 ? (reward / risk).toFixed(2) : '—',
    maxLoss: form.entryPrice > 0 ? (risk / form.entryPrice) * form.amountUsd : 0,
    gain: form.entryPrice > 0 ? (reward / form.entryPrice) * form.amountUsd : 0,
  };
});

function submit() {
  error.value = null;
  const r = parsed.value;
  if (!r.success) { error.value = r.error.issues.map((i) => i.message).join(' '); return; }
  emit('submit', r.data);
}
defineExpose({ setError: (e: unknown) => { error.value = e instanceof ApiHttpError ? e.message : String(e); } });
</script>
<template>
  <form class="card" @submit.prevent="submit">
    <div class="card-head"><h2>{{ previous ? `Nouvelle version (v${previous.version + 1})` : 'Plan avant position' }}</h2><span v-if="currentPrice" class="faint small">prix actuel {{ fmtUsd(currentPrice) }}</span></div>
    <p class="small muted">Une fois enregistré, ce plan ne peut plus être modifié. Changer d’avis crée une nouvelle version et conserve l’ancienne.</p>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))">
      <div><label>Prix d’entrée cible ($)</label><input v-model.number="form.entryPrice" type="number" step="any" min="0" required /></div>
      <div><label>Sortie en gain ($)</label><input v-model.number="form.takeProfitPrice" type="number" step="any" min="0" required /></div>
      <div><label>Sortie en perte ($)</label><input v-model.number="form.stopLossPrice" type="number" step="any" min="0" required /></div>
      <div><label>Montant engagé ($)</label><input v-model.number="form.amountUsd" type="number" step="any" min="0" required /></div>
    </div>
    <div style="margin-top:.75rem"><label>Note libre</label><textarea v-model="form.note" rows="2" placeholder="Pourquoi cette position, qu’est-ce qui invaliderait la thèse…" /></div>
    <div class="row small" style="margin:.75rem 0; gap:1.5rem">
      <span>Ratio gain / risque : <strong>{{ preview.rr }}</strong></span>
      <span>Perte au stop : <strong class="down">{{ fmtUsd(-preview.maxLoss) }}</strong></span>
      <span>Gain à l’objectif : <strong class="up">{{ fmtUsd(preview.gain) }}</strong></span>
    </div>
    <label class="row" style="cursor:pointer; color: var(--text)">
      <input v-model="form.acceptsTotalLoss" type="checkbox" style="width:auto" />
      <span>Je confirme que <strong>{{ fmtUsd(form.amountUsd) }}</strong> peut aller à zéro et que je l’accepte.</span>
    </label>
    <p v-if="error" class="error small" style="margin-top:.5rem">{{ error }}</p>
    <button class="primary" type="submit" style="margin-top:.75rem" :disabled="pending || !form.acceptsTotalLoss">Enregistrer, sans retour possible</button>
  </form>
</template>
