<script setup lang="ts">
import type { UiSettings } from '@tpm/shared';
import { AI_REPORT_PROMPT, AI_REPORT_PROMPT_VERSION } from '@tpm/shared';
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ApiHttpError } from '@/api/http';
import { watchApi } from '@/api/watch.api';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate } from '@/composables/useFormat';
import { useNotificationsStore } from '@/stores/notifications.store';
import { useUiStore } from '@/stores/ui.store';

const qc = useQueryClient();
const ui = useUiStore();
const q = useQuery({ queryKey: ['settings', 'ui'], queryFn: () => watchApi.settings('ui'), staleTime: 60_000 });
const save = useMutation({ mutationFn: (i: { settings: unknown; note: string | null }) => watchApi.updateSettings('ui', i.settings, i.note), onSuccess: (env) => { ui.apply(env.data.settings as UiSettings); qc.invalidateQueries({ queryKey: ['settings', 'ui'] }); } });
const reset = useMutation({ mutationFn: () => watchApi.resetSettings('ui'), onSuccess: (env) => { ui.apply(env.data.settings as UiSettings); qc.invalidateQueries({ queryKey: ['settings', 'ui'] }); } });
const notify = useNotificationsStore();
const env = computed(() => q.data.value?.data);
const form = ref<UiSettings | null>(null);
const note = ref('');
watch(env, (e) => { if (e) form.value = { ...(e.settings as UiSettings) }; }, { immediate: true });
async function submit() {
  if (!form.value) return;
  try { await save.mutateAsync({ settings: form.value, note: note.value || null }); notify.push('success', 'Réglages d’affichage enregistrés.'); note.value = ''; }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? `${e.message} ${JSON.stringify(e.details ?? '')}` : String(e), 10000); }
}
function resetAll() { if (window.confirm('Remettre les réglages d’affichage à leurs valeurs par défaut ?')) reset.mutate(); }
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
        <h3>Niveau de lecture</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
          <div>
            <label>Mode à l’ouverture</label>
            <select v-model="form.mode"><option value="simple">Lecture simple : cinq questions, l’essentiel par carte</option><option value="detail">Détail : tout, pour vérifier ou trader</option></select>
            <div class="faint small">Le bouton en haut de page change de mode à tout moment ; ce réglage fixe le point de départ.</div>
          </div>
          <label class="row" style="cursor:pointer;color:var(--text);align-self:end"><input v-model="form.showPriceChartInSimple" type="checkbox" style="width:auto" /> Garder la courbe de prix sur 30 jours en lecture simple</label>
        </div>
      </section>
      <section class="card">
        <h3>Seuils de la synthèse</h3>
        <p class="small muted">Aucun seuil nouveau : ceux-ci reprennent ceux des autres modules.</p>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
          <div><label>Top 10 « concentré » au-delà de (%)</label><input v-model.number="form.summaryTop10ConcentratedPct" type="number" step="1" min="1" max="100" /><div class="faint small">Même seuil que le drapeau du scanner.</div></div>
          <div><label>Taille d’ordre lue pour « Puis-je sortir ? » ($)</label><input v-model.number="form.summarySlippageOrderUsd" type="number" step="100" min="1" /><div class="faint small">Doit être l’une des tailles du slippage (réglages du marché).</div></div>
          <div><label>Repère de taille : part du pool principal (%)</label><input v-model.number="form.orderSizeShareOfPoolPct" type="number" step="0.5" min="0.1" max="10" /><div class="faint small">Au-delà de cette part de la liquidité du pool principal, votre propre ordre fait le prix. Un repère, pas une recommandation.</div></div>
        </div>
      </section>
      <section class="card">
        <h3>Dossier pour l’IA</h3>
        <label class="row" style="cursor:pointer;color:var(--text)"><input v-model="form.dossierIncludesPlan" type="checkbox" style="width:auto" /> Inclure mon plan du journal dans le dossier exporté</label>
        <div class="faint small">Exclu par défaut : le plan est personnel, le dossier peut être collé chez un tiers.</div>
        <details style="margin-top:.5rem"><summary class="small muted">Consigne donnée à l’IA, en tête de chaque dossier (version {{ AI_REPORT_PROMPT_VERSION }}, versionnée dans le code)</summary><pre class="small" style="white-space:pre-wrap;margin:.5rem 0 0">{{ AI_REPORT_PROMPT }}</pre></details>
      </section>
      <div class="row"><input v-model="note" placeholder="Note de version (optionnelle)" style="flex:1" /><button class="primary" :disabled="save.isPending.value" @click="submit">Enregistrer</button></div>
    </template>
  </div>
</template>
