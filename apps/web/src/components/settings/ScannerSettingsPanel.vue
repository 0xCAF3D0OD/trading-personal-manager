<script setup lang="ts">
import type { ScannerSettings } from '@tpm/shared';
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ApiHttpError } from '@/api/http';
import { watchApi } from '@/api/watch.api';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate } from '@/composables/useFormat';
import { useNotificationsStore } from '@/stores/notifications.store';

const qc = useQueryClient();
const q = useQuery({ queryKey: ['settings', 'scanner'], queryFn: () => watchApi.settings('scanner'), staleTime: 60_000 });
const save = useMutation({ mutationFn: (i: { settings: unknown; note: string | null }) => watchApi.updateSettings('scanner', i.settings, i.note), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'scanner'] }) });
const reset = useMutation({ mutationFn: () => watchApi.resetSettings('scanner'), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'scanner'] }) });
const notify = useNotificationsStore();
const env = computed(() => q.data.value?.data);
const form = ref<ScannerSettings | null>(null);
const advanced = ref('');
const note = ref('');
watch(env, (e) => { if (e) { form.value = JSON.parse(JSON.stringify(e.settings)); advanced.value = JSON.stringify({ discovery: form.value!.discovery, rateLimit: form.value!.rateLimit }, null, 2); } }, { immediate: true });

const PERF: { key: keyof ScannerSettings['performance']; label: string; why: string }[] = [
  { key: 'minChangeH24Pct', label: 'Variation minimale sur 24 h (%)', why: 'Le critère demandé. Sélectionne par construction des mouvements déjà entamés.' },
  { key: 'minAgeHours', label: 'Âge minimum du pool (h)', why: 'En dessous, pas assez de données pour juger quoi que ce soit.' },
  { key: 'maxAgeDays', label: 'Âge maximum du pool (j)', why: 'Au-delà, ce n’est plus un « nouveau » token.' },
  { key: 'minLiquidityUsd', label: 'Liquidité minimale ($)', why: 'En dessous, impossible de sortir sans slippage massif.' },
  { key: 'minVolumeH24Usd', label: 'Volume 24 h minimum ($)', why: 'Élimine les tokens morts.' },
  { key: 'maxMarketCapUsd', label: 'Capitalisation maximale ($)', why: 'Au-delà, le +100 % est déjà consommé.' },
];
const FLAGS: { key: keyof ScannerSettings['flags']; label: string }[] = [
  { key: 'top10MaxPct', label: 'Top 10 au-delà de (%)' }, { key: 'buyerSellerRatioMin', label: 'Acheteurs / vendeurs ≥' }, { key: 'stagnantH1AbsPct', label: 'Prix stagnant sur 1 h : ± (%)' },
  { key: 'buysPerBuyerMin', label: 'Achats par acheteur ≥' }, { key: 'creatorMaxTokens', label: 'Créateur en série : tokens >' }, { key: 'decelerationFraction', label: 'Décélération : fraction du rythme horaire' }, { key: 'developerHoldingMaxPct', label: 'Part du développeur > (%)' },
];
async function submit() {
  if (!form.value) return;
  try {
    const adv = JSON.parse(advanced.value) as Pick<ScannerSettings, 'discovery' | 'rateLimit'>;
    await save.mutateAsync({ settings: { ...form.value, ...adv }, note: note.value || null });
    notify.push('success', 'Réglages du scanner enregistrés (nouvelle version).'); note.value = '';
  } catch (e) { notify.push('error', e instanceof ApiHttpError ? `${e.message} ${JSON.stringify(e.details ?? '')}` : `JSON avancé invalide : ${String(e)}`, 10000); }
}
function resetAll() { if (window.confirm('Remettre les réglages du scanner à leurs valeurs par défaut ?')) reset.mutate(); }
</script>
<template>
  <div class="stack" style="gap:1rem">
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <template v-if="env && form">
      <div class="row" style="justify-content:space-between">
        <p class="small muted" style="margin:0">Défauts en code v{{ env.codeDefaultsVersion }} · enregistrés le {{ fmtDate(env.updatedAt) }} <span v-if="env.isDefault" class="badge ok">défauts</span><span v-else class="badge neutral">personnalisés</span></p>
        <button class="ghost" @click="resetAll">Restaurer les défauts</button>
      </div>
      <label class="row" style="cursor:pointer;color:var(--text)"><input v-model="form.enabled" type="checkbox" style="width:auto" /> Scanner actif (jobs de découverte et d’évaluation)</label>
      <section class="card">
        <h3>Étage 2 — filtres de performance</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          <div v-for="f in PERF" :key="f.key"><label>{{ f.label }}</label><input v-model.number="form.performance[f.key]" type="number" step="any" /><div class="faint small">{{ f.why }}</div></div>
        </div>
      </section>
      <section class="card">
        <h3>Étage 3 — filtres structurels éliminatoires</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          <label class="row" style="cursor:pointer;color:var(--text)"><input v-model="form.structural.requireMintRevoked" type="checkbox" style="width:auto" /> Exiger l’autorité de mint révoquée</label>
          <label class="row" style="cursor:pointer;color:var(--text)"><input v-model="form.structural.requireNoFreeze" type="checkbox" style="width:auto" /> Exiger l’absence d’autorité de freeze</label>
          <label class="row" style="cursor:pointer;color:var(--text)"><input v-model="form.structural.allowTransferFee" type="checkbox" style="width:auto" /> Autoriser les frais de transfert Token-2022</label>
          <div><label>Volume / capitalisation maximal</label><input v-model.number="form.structural.maxVolumeToMcap" type="number" step="any" /><div class="faint small">Au-dessus, c’est du lavage de volume ou du bot.</div></div>
          <div><label>Liquidité / capitalisation minimale (%)</label><input v-model.number="form.structural.minLiquidityToMcapPct" type="number" step="any" /><div class="faint small">En dessous, la capitalisation est théorique.</div></div>
        </div>
      </section>
      <section class="card">
        <h3>Étage 4 — drapeaux (signalés, non éliminatoires)</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <div v-for="f in FLAGS" :key="f.key"><label>{{ f.label }}</label><input v-model.number="form.flags[f.key]" type="number" step="any" /></div>
        </div>
      </section>
      <details class="card"><summary class="muted">Avancé : découverte et cadence des appels (JSON)</summary>
        <textarea v-model="advanced" rows="14" class="mono" style="margin-top:.5rem" />
        <p class="faint small">Pages de nouveaux pools par passage, tokens de cotation reconnus, paliers de fraîcheur, appels par minute, disjoncteur. Le plan démo CoinGecko est plafonné à 10 000 crédits par mois : la voie principale est l’API publique GeckoTerminal.</p>
      </details>
      <div class="row"><input v-model="note" placeholder="Note de version (optionnelle)" style="flex:1" /><button class="primary" :disabled="save.isPending.value" @click="submit">Enregistrer</button></div>
    </template>
  </div>
</template>
