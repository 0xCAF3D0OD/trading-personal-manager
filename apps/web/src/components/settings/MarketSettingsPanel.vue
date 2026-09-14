<script setup lang="ts">
import type { MarketSettings } from '@tpm/shared';
import { computed, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ApiHttpError } from '@/api/http';
import { watchApi } from '@/api/watch.api';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate } from '@/composables/useFormat';
import { useNotificationsStore } from '@/stores/notifications.store';

const qc = useQueryClient();
const q = useQuery({ queryKey: ['settings', 'market'], queryFn: () => watchApi.settings('market'), staleTime: 60_000 });
const save = useMutation({ mutationFn: (i: { settings: unknown; note: string | null }) => watchApi.updateSettings('market', i.settings, i.note), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'market'] }) });
const reset = useMutation({ mutationFn: () => watchApi.resetSettings('market'), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'market'] }) });
const notify = useNotificationsStore();
const env = computed(() => q.data.value?.data);
const f = reactive<Record<string, number>>({});
const lists = reactive({ liquidityBands: '', volumeBands: '', slippageOrderSizesUsd: '', constantProductDexIds: '', concentratedDexIds: '' });
const note = ref('');

watch(env, (e) => {
  if (!e) return;
  const s = e.settings as MarketSettings;
  Object.assign(f, {
    priceSpreadWarnPct: s.priceSpreadWarnPct, priceSpreadAlertConsecutive: s.priceSpreadAlertConsecutive, momentumTolerancePts: s.momentumTolerancePts,
    momentumMinVolume5mUsd: s.momentumMinVolume5mUsd, mcapGapWarnPct: s.mcapGapWarnPct, slippageCacheS: s.slippageCacheS,
    lwRatio24: s.liqWithdrawal.ratioDropPct24h, lwLiq6: s.liqWithdrawal.liqDropPct6h, lwFloor: s.liqWithdrawal.priceFloorPct, lwMig: s.liqWithdrawal.migrationTolerancePct, lwCooldown: s.liqWithdrawal.cooldownS,
    dLwRatio: s.divergences.liquidity_withdrawal.ratioDropPct, dLwFloor: s.divergences.liquidity_withdrawal.priceFloorPct,
    dUrVol: s.divergences.unconfirmed_rise.volumeDropPct, dUrPrice: s.divergences.unconfirmed_rise.priceRisePct, dBurn: s.divergences.announced_burn_no_supply_change.maxSupplyDropPct,
  });
  lists.liquidityBands = s.liquidityBands.join(', '); lists.volumeBands = s.volumeBands.join(', '); lists.slippageOrderSizesUsd = s.slippageOrderSizesUsd.join(', ');
  lists.constantProductDexIds = s.constantProductDexIds.join(', '); lists.concentratedDexIds = s.concentratedDexIds.join(', ');
}, { immediate: true });

const NUM: { key: string; label: string; hint: string }[] = [
  { key: 'priceSpreadWarnPct', label: 'Écart de prix : seuil visuel (%)', hint: 'DexScreener vs Jupiter' },
  { key: 'priceSpreadAlertConsecutive', label: 'Écart de prix : relevés consécutifs avant alerte', hint: '1 relevé = 15 min' },
  { key: 'momentumTolerancePts', label: 'Dérivée : tolérance par pas (points de %/h)', hint: '' },
  { key: 'momentumMinVolume5mUsd', label: 'Dérivée : volume 5 min minimal ($)', hint: 'En dessous, la fenêtre courte n’a pas de marché' },
  { key: 'mcapGapWarnPct', label: 'Écart capitalisation source / recalculée (%)', hint: '' },
  { key: 'slippageCacheS', label: 'Cache des cotations Jupiter (s)', hint: '' },
  { key: 'lwRatio24', label: 'Retrait de liquidité : baisse du ratio sur 24 h (%)', hint: 'Alerte' },
  { key: 'lwLiq6', label: 'Retrait de liquidité : baisse du pool sur 6 h (%)', hint: 'Alerte' },
  { key: 'lwFloor', label: 'Retrait de liquidité : plancher de prix (%)', hint: 'Le prix doit rester au-dessus' },
  { key: 'lwMig', label: 'Tolérance de migration (%)', hint: 'Liquidité totale stable à ± ce % = migration, pas retrait' },
  { key: 'lwCooldown', label: 'Silence après alerte (s)', hint: '' },
  { key: 'dLwRatio', label: 'Divergence liquidité : baisse du ratio sur 7 j (%)', hint: '' },
  { key: 'dLwFloor', label: 'Divergence liquidité : plancher de prix (%)', hint: '' },
  { key: 'dUrVol', label: 'Hausse non confirmée : baisse du volume (%)', hint: '' },
  { key: 'dUrPrice', label: 'Hausse non confirmée : hausse du prix (%)', hint: '' },
  { key: 'dBurn', label: 'Burn annoncé : baisse d’offre minimale attendue (%)', hint: '' },
];

function nums(s: string): number[] { return s.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n)); }
function strs(s: string): string[] { return s.split(',').map((x) => x.trim()).filter(Boolean); }
async function submit() {
  const lb = nums(lists.liquidityBands), vb = nums(lists.volumeBands);
  const payload: MarketSettings = {
    priceSpreadWarnPct: f.priceSpreadWarnPct!, priceSpreadAlertConsecutive: f.priceSpreadAlertConsecutive!, momentumTolerancePts: f.momentumTolerancePts!,
    momentumMinVolume5mUsd: f.momentumMinVolume5mUsd!, mcapGapWarnPct: f.mcapGapWarnPct!, slippageCacheS: f.slippageCacheS!,
    liquidityBands: [lb[0] ?? 10, lb[1] ?? 5, lb[2] ?? 2], volumeBands: [vb[0] ?? 1, vb[1] ?? 0.3, vb[2] ?? 0.1],
    slippageOrderSizesUsd: nums(lists.slippageOrderSizesUsd),
    liqWithdrawal: { ratioDropPct24h: f.lwRatio24!, liqDropPct6h: f.lwLiq6!, priceFloorPct: f.lwFloor!, migrationTolerancePct: f.lwMig!, cooldownS: f.lwCooldown! },
    divergences: { liquidity_withdrawal: { ratioDropPct: f.dLwRatio!, priceFloorPct: f.dLwFloor! }, unconfirmed_rise: { volumeDropPct: f.dUrVol!, priceRisePct: f.dUrPrice! }, announced_burn_no_supply_change: { maxSupplyDropPct: f.dBurn! } },
    constantProductDexIds: strs(lists.constantProductDexIds), concentratedDexIds: strs(lists.concentratedDexIds),
  };
  try { await save.mutateAsync({ settings: payload, note: note.value || null }); notify.push('success', 'Réglages du marché enregistrés (nouvelle version).'); note.value = ''; }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? `${e.message} ${JSON.stringify(e.details ?? '')}` : String(e), 10000); }
}
function resetAll() { if (window.confirm('Remettre les réglages du marché à leurs valeurs par défaut ?')) reset.mutate(); }
</script>
<template>
  <div class="stack" style="gap:1rem">
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <template v-if="env">
      <div class="row" style="justify-content:space-between">
        <p class="small muted" style="margin:0">
          Défauts en code v{{ env.codeDefaultsVersion }} · enregistrés le {{ fmtDate(env.updatedAt) }}
          <span v-if="env.isDefault" class="badge ok">défauts</span><span v-else class="badge neutral">personnalisés</span>
        </p>
        <button class="ghost" @click="resetAll">Restaurer les défauts</button>
      </div>
      <section class="card">
        <h3>Seuils</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          <div v-for="n in NUM" :key="n.key"><label :title="n.hint">{{ n.label }}</label><input v-model.number="f[n.key]" type="number" step="any" /><div class="faint small">{{ n.hint }}</div></div>
        </div>
      </section>
      <section class="card">
        <h3>Listes</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          <div><label>Bandes de liquidité (% décroissants : confortable, correcte, mince)</label><input v-model="lists.liquidityBands" /></div>
          <div><label>Bandes de volume / capi (décroissantes : extrême, très élevée, soutenue)</label><input v-model="lists.volumeBands" /></div>
          <div><label>Tailles d’ordre pour le slippage ($)</label><input v-model="lists.slippageOrderSizesUsd" /></div>
          <div><label>DEX à produit constant (formule applicable en repli)</label><input v-model="lists.constantProductDexIds" /></div>
          <div><label>DEX à liquidité concentrée (formule fausse)</label><input v-model="lists.concentratedDexIds" /></div>
        </div>
      </section>
      <div class="row"><input v-model="note" placeholder="Note de version (optionnelle)" style="flex:1" /><button class="primary" :disabled="save.isPending.value" @click="submit">Enregistrer</button></div>
    </template>
  </div>
</template>
