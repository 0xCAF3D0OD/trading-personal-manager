<script setup lang="ts">
import type { WatchSource } from '@tpm/shared';
import { computed, reactive, ref, toRef } from 'vue';
import { ApiHttpError } from '@/api/http';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtDate, timeAgo } from '@/composables/useFormat';
import { useSnapshots, useWatchMutations } from '@/queries/useWatch';
import { useNotificationsStore } from '@/stores/notifications.store';

const props = defineProps<{ tokenId: number; sources: WatchSource[]; rendererAvailable: boolean }>();
const m = useWatchMutations(toRef(props, 'tokenId'));
const notify = useNotificationsStore();
const form = reactive({ kind: 'website' as WatchSource['kind'], label: '', url: '', handle: '' });
const openSnapshots = ref<number | null>(null);
const snapshots = useSnapshots(openSnapshots);
const chosenEndpoint = reactive<Record<number, string>>({});

const STATUS: Record<string, { s: string; l: string }> = {
  ok: { s: 'ok', l: 'référence prise' }, unchanged: { s: 'ok', l: 'inchangé' }, changed: { s: 'warning', l: 'changé' },
  needs_mode_choice: { s: 'warning', l: 'choix de mode requis' }, blocked_by_robots: { s: 'risk', l: 'interdit par robots.txt' },
  render_error: { s: 'risk', l: 'rendu impossible' }, http_error: { s: 'risk', l: 'erreur HTTP' }, timeout: { s: 'risk', l: 'délai dépassé' },
  network_error: { s: 'risk', l: 'erreur réseau' }, too_large: { s: 'risk', l: 'page trop lourde' }, error: { s: 'risk', l: 'erreur' }, manual: { s: 'unknown', l: 'suivi manuel' },
};
const MODE: Record<string, string> = { html: 'HTML', json_api: 'API JSON', headless: 'rendu sans tête' };
const KIND: Record<string, string> = { website: 'Site', docs: 'Documentation', github: 'GitHub', x_account: 'Compte X', news_query: 'Requête actualités', exchange_feed: 'Flux exchange' };
const needsUrl = computed(() => ['website', 'docs', 'github', 'exchange_feed'].includes(form.kind));

async function run<T>(p: Promise<T>, ok?: string) {
  try { await p; if (ok) notify.push('success', ok); } catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
async function add() {
  await run(m.createSource.mutateAsync({ kind: form.kind, label: form.label, url: needsUrl.value ? form.url : undefined, handle: form.kind === 'x_account' ? form.handle : undefined }), 'Source ajoutée. Découverte en cours.');
  form.label = ''; form.url = ''; form.handle = '';
}
function remove(s: WatchSource) {
  if (window.confirm('Supprimer cette source et ses snapshots ?')) void run(m.deleteSource.mutateAsync(s.id), 'Source supprimée.');
}
function chooseJson(s: WatchSource) {
  const url = chosenEndpoint[s.id];
  if (!url) return;
  void run(m.updateSource.mutateAsync({ sid: s.id, patch: { mode: 'json_api', apiUrl: url } }), 'Mode API JSON activé : référence prise au prochain relevé.');
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <form class="card" @submit.prevent="add">
      <h3>Ajouter une source</h3>
      <div class="row" style="align-items:flex-end">
        <div><label>Type</label><select v-model="form.kind" style="width:auto"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select></div>
        <div style="flex:1;min-width:160px"><label>{{ form.kind === 'news_query' ? 'Requête (mots exacts)' : 'Libellé' }}</label><input v-model="form.label" required placeholder="Tokenomics, Accueil, Whitepaper…" /></div>
        <div v-if="needsUrl" style="flex:2;min-width:240px"><label>URL</label><input v-model="form.url" type="url" required placeholder="https://…" /></div>
        <div v-if="form.kind === 'x_account'" style="flex:1"><label>Compte X</label><input v-model="form.handle" required placeholder="@compte" /></div>
        <button class="primary" type="submit" :disabled="m.createSource.isPending.value">Ajouter</button>
      </div>
      <p class="faint small" style="margin-top:.5rem">
        Site et documentation : relevé toutes les 6 h, diff automatique. Compte X : suivi manuel (collez les posts dans l'onglet Engagements).
        <span v-if="!rendererAvailable">Service de rendu absent : les pages rendues côté client demandent une URL d'API JSON saisie à la main.</span>
      </p>
    </form>

    <div v-if="!sources.length" class="empty">Aucune source. Commencez par la page tokenomics du site officiel.</div>
    <article v-for="s in sources" :key="s.id" class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <strong>{{ s.label }}</strong> <span class="faint small">{{ KIND[s.kind] }}</span>
          <span v-if="['website','docs'].includes(s.kind)" class="badge neutral">{{ MODE[s.mode] }}</span>
          <span v-if="!s.automated" class="badge unknown">manuel</span>
          <div class="small mono faint">{{ s.mode === 'json_api' ? s.apiUrl : s.url ?? (s.handle ? '@' + s.handle : '') }}</div>
        </div>
        <div class="row">
          <StatusBadge v-if="s.lastStatus" :status="STATUS[s.lastStatus]?.s ?? 'unknown'" :label="STATUS[s.lastStatus]?.l ?? s.lastStatus" />
          <span class="faint small">{{ s.lastCheckedAt ? timeAgo(s.lastCheckedAt) : 'jamais vérifié' }}</span>
          <template v-if="['website','docs'].includes(s.kind)">
            <button class="ghost small" :disabled="m.checkNow.isPending.value" @click="run(m.checkNow.mutateAsync(s.id), 'Vérification faite.')">Vérifier</button>
            <button class="ghost small" :disabled="m.discover.isPending.value" @click="run(m.discover.mutateAsync(s.id), 'Découverte relancée.')">Découverte</button>
            <button class="ghost small" @click="openSnapshots = openSnapshots === s.id ? null : s.id">Snapshots</button>
          </template>
          <button class="ghost small" @click="run(m.updateSource.mutateAsync({ sid: s.id, patch: { enabled: !s.enabled } }))">{{ s.enabled ? 'Suspendre' : 'Reprendre' }}</button>
          <button class="ghost danger small" @click="remove(s)">✕</button>
        </div>
      </div>
      <p v-if="s.lastError" class="small" :class="s.lastStatus === 'needs_mode_choice' ? 'muted' : 'error'" style="margin-top:.4rem">{{ s.lastError }}</p>

      <div v-if="s.lastStatus === 'needs_mode_choice'" class="card" style="background:var(--bg-elev-2);margin-top:.5rem">
        <h3>Choisir comment surveiller cette page</h3>
        <template v-if="s.discoveredEndpoints.length">
          <p class="small muted">Appels JSON observés pendant le chargement, les plus prometteurs en premier. Choisissez celui qui porte les tokenomics.</p>
          <div v-for="e in s.discoveredEndpoints" :key="e.url" class="small" style="padding:.3rem 0;border-bottom:1px solid var(--border)">
            <label class="row" style="cursor:pointer;color:var(--text)">
              <input v-model="chosenEndpoint[s.id]" type="radio" :value="e.url" style="width:auto" />
              <span class="mono" style="word-break:break-all">{{ e.url }}</span>
              <span class="faint">{{ e.size }} o · score {{ e.score }} · clés : {{ e.topKeys.join(', ') || '—' }}</span>
            </label>
            <details><summary class="faint">aperçu</summary><pre class="small" style="white-space:pre-wrap">{{ e.preview }}</pre></details>
          </div>
          <div class="row" style="margin-top:.5rem">
            <button class="primary" :disabled="!chosenEndpoint[s.id]" @click="chooseJson(s)">Surveiller cet appel JSON</button>
            <button :disabled="!rendererAvailable" @click="run(m.updateSource.mutateAsync({ sid: s.id, patch: { mode: 'headless' } }), 'Mode rendu sans tête activé.')">Rendu sans tête à la place</button>
          </div>
        </template>
        <template v-else>
          <p class="small muted">Aucun appel JSON exploitable détecté. Collez l'URL d'une API si vous la connaissez, ou passez en rendu sans tête.</p>
          <div class="row">
            <input v-model="chosenEndpoint[s.id]" placeholder="https://…/api/config" style="flex:1" />
            <button class="primary" :disabled="!chosenEndpoint[s.id]" @click="chooseJson(s)">Surveiller ce JSON</button>
            <button :disabled="!rendererAvailable" @click="run(m.updateSource.mutateAsync({ sid: s.id, patch: { mode: 'headless' } }), 'Mode rendu sans tête activé.')">Rendu sans tête</button>
          </div>
        </template>
      </div>

      <details v-if="s.volatileLines.length" style="margin-top:.5rem">
        <summary class="small muted">{{ s.volatileLines.length }} ligne(s) volatile(s) exclue(s) du diff</summary>
        <ul class="small" style="margin:.25rem 0;padding-left:1rem">
          <li v-for="v in s.volatileLines" :key="v.key">{{ v.sample }} <span class="faint">({{ v.changes }} changements)</span> <button class="ghost small" @click="run(m.updateSource.mutateAsync({ sid: s.id, patch: { removeVolatileKey: v.key } }), 'Ligne réintégrée au diff.')">réintégrer</button></li>
        </ul>
      </details>

      <div v-if="openSnapshots === s.id" style="margin-top:.5rem">
        <h3>Snapshots</h3>
        <div v-if="snapshots.data.value && !snapshots.data.value.data.length" class="empty">Aucun snapshot.</div>
        <details v-for="snap in snapshots.data.value?.data ?? []" :key="snap.id">
          <summary class="small">{{ fmtDate(snap.fetchedAt) }} · {{ MODE[snap.mode] }} · {{ snap.lines.length }} lignes · <span class="mono faint">{{ snap.contentHash.slice(0, 10) }}</span></summary>
          <div class="overflow"><table class="small"><tbody><tr v-for="(l, i) in snap.lines" :key="i"><td class="faint" style="white-space:nowrap">{{ l.path }}</td><td>{{ l.text }}</td></tr></tbody></table></div>
        </details>
      </div>
    </article>
  </div>
</template>
