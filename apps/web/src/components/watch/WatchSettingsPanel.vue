<script setup lang="ts">
import type { WatchSettings } from '@tpm/shared';
import { computed, reactive, ref, toRef, watch } from 'vue';
import { ApiHttpError } from '@/api/http';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate } from '@/composables/useFormat';
import { useModuleSettings, useWatchMutations } from '@/queries/useWatch';
import { useNotificationsStore } from '@/stores/notifications.store';

const props = defineProps<{ tokenId: number }>();
const q = useModuleSettings('watch');
const m = useWatchMutations(toRef(props, 'tokenId'));
const notify = useNotificationsStore();
const form = reactive<Partial<WatchSettings>>({});
const lists = reactive({ tokenomicsKeywords: '', prWireDomains: '', sponsoredPatterns: '', exchangeFeeds: '', incineratorAddresses: '' });
const note = ref('');
const env = computed(() => q.data.value?.data);

watch(env, (e) => {
  if (!e) return;
  const s = e.settings as WatchSettings;
  Object.assign(form, s);
  lists.tokenomicsKeywords = s.tokenomicsKeywords.join(', ');
  lists.prWireDomains = s.prWireDomains.join('\n');
  lists.sponsoredPatterns = s.sponsoredPatterns.join(', ');
  lists.exchangeFeeds = s.exchangeFeeds.map((f) => `${f.name} | ${f.url}`).join('\n');
  lists.incineratorAddresses = s.incineratorAddresses.join('\n');
}, { immediate: true });

const NUM: { key: keyof WatchSettings; label: string; hint: string }[] = [
  { key: 'associationWindowH', label: 'Fenêtre d’association (h)', hint: 'Délai pour trouver une annonce autour d’un changement de page' },
  { key: 'similarityThreshold', label: 'Seuil de similarité', hint: 'Deux lignes plus proches que ce seuil sont appariées comme « modifiée »' },
  { key: 'volatileAfterChanges', label: 'Passages avant « volatile »', hint: 'Une ligne dont seuls les chiffres bougent autant de fois de suite est exclue' },
  { key: 'pageCheckIntervalS', label: 'Intervalle pages (s)', hint: '21600 = 6 h' },
  { key: 'newsIntervalS', label: 'Intervalle actualités (s)', hint: '' },
  { key: 'onchainIntervalS', label: 'Intervalle on-chain (s)', hint: '' },
  { key: 'headlessWaitMs', label: 'Attente après rendu (ms)', hint: 'Mode rendu sans tête' },
  { key: 'pricePredictionMaxTokenAgeDays', label: 'Âge max pour « prédiction de prix » (j)', hint: '' },
  { key: 'claimExpiryDays', label: 'Expiration des engagements sans échéance (j)', hint: '' },
  { key: 'teamTransferMinPctSupply', label: 'Transfert équipe : % de l’offre min', hint: 'Alerte vers un exchange' },
  { key: 'teamTransferMinUsd', label: 'Transfert équipe : $ min', hint: '' },
  { key: 'teamSellMinPctSupply', label: 'Vente équipe : % de l’offre min', hint: '' },
];

async function save() {
  const payload: WatchSettings = {
    ...(form as WatchSettings),
    tokenomicsKeywords: split(lists.tokenomicsKeywords, ','), prWireDomains: split(lists.prWireDomains, '\n'), sponsoredPatterns: split(lists.sponsoredPatterns, ','),
    exchangeFeeds: split(lists.exchangeFeeds, '\n').map((l) => { const [name, url] = l.split('|').map((x) => x.trim()); return { name: name ?? '', url: url ?? '' }; }).filter((f) => f.name && f.url),
    incineratorAddresses: split(lists.incineratorAddresses, '\n'),
  };
  try { await m.saveSettings.mutateAsync({ settings: payload, note: note.value || null }); notify.push('success', 'Réglages enregistrés (nouvelle version).'); note.value = ''; }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? `${e.message} ${JSON.stringify(e.details ?? '')}` : String(e), 10000); }
}
function split(s: string, sep: string): string[] { return s.split(sep).map((x) => x.trim()).filter(Boolean); }
function resetAll() { if (window.confirm('Remettre les réglages de la veille à leurs valeurs par défaut ?')) m.resetSettings.mutate(); }
</script>
<template>
  <div class="stack" style="gap:1rem">
    <QueryState :loading="q.isLoading.value" :error="q.error.value" />
    <template v-if="env">
      <div class="row" style="justify-content:space-between">
        <p class="small muted" style="margin:0">
          Version des défauts en code : {{ env.codeDefaultsVersion }} · réglages actuels enregistrés le {{ fmtDate(env.updatedAt) }}
          <span v-if="env.isDefault" class="badge ok">défauts</span><span v-else class="badge neutral">personnalisés</span>
          <span v-if="env.defaultsVersion < env.codeDefaultsVersion" class="badge warning">de nouveaux défauts existent</span>
        </p>
        <button class="ghost" @click="resetAll">Restaurer les défauts</button>
      </div>
      <section class="card">
        <h3>Seuils</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <div v-for="f in NUM" :key="f.key"><label :title="f.hint">{{ f.label }}</label><input v-model.number="(form as any)[f.key]" type="number" step="any" /><div class="faint small">{{ f.hint }}</div></div>
        </div>
        <label class="row" style="margin-top:.75rem;cursor:pointer;color:var(--text)"><input v-model="form.notifyContentChanges" type="checkbox" style="width:auto" /> Notifier aussi les changements de contenu (hors chiffres de tokenomics)</label>
      </section>
      <section class="card">
        <h3>Listes</h3>
        <div><label>Mots-clés tokenomics (séparés par des virgules)</label><textarea v-model="lists.tokenomicsKeywords" rows="3" /></div>
        <div style="margin-top:.5rem"><label>Fils de communiqués payants (un domaine ou domaine/chemin par ligne)</label><textarea v-model="lists.prWireDomains" rows="4" /></div>
        <div style="margin-top:.5rem"><label>Mentions sponsorisées (virgules)</label><textarea v-model="lists.sponsoredPatterns" rows="2" /></div>
        <div style="margin-top:.5rem"><label>Flux d'exchanges (un par ligne : Nom | URL du flux RSS)</label><textarea v-model="lists.exchangeFeeds" rows="3" /></div>
        <div style="margin-top:.5rem"><label>Adresses incinérateur (une par ligne)</label><textarea v-model="lists.incineratorAddresses" rows="2" class="mono" /></div>
      </section>
      <div class="row">
        <input v-model="note" placeholder="Note de version (optionnelle)" style="flex:1" />
        <button class="primary" :disabled="m.saveSettings.isPending.value" @click="save">Enregistrer</button>
      </div>
      <details><summary class="small muted">Historique des versions ({{ env.history.length }})</summary>
        <ul class="small"><li v-for="h in env.history" :key="h.id">{{ fmtDate(h.createdAt) }} · {{ h.isDefault ? 'défauts' : 'personnalisé' }} · {{ h.note ?? '' }}</li></ul>
      </details>
    </template>
  </div>
</template>
