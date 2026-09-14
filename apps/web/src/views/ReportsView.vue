<script setup lang="ts">
import type { AiReportProvider } from '@tpm/shared';
import { AI_REPORT_PROMPT, AI_REPORT_PROMPT_VERSION } from '@tpm/shared';
import { computed, ref, toRef } from 'vue';
import { ApiHttpError } from '@/api/http';
import QueryState from '@/components/shared/QueryState.vue';
import { fmtDate, shortAddr } from '@/composables/useFormat';
import { useCreateReport, useDossier, useReports } from '@/queries/useReports';
import { useToken } from '@/queries/useTokenDetail';
import { useNotificationsStore } from '@/stores/notifications.store';
import { useUiStore } from '@/stores/ui.store';

const props = defineProps<{ id: number }>();
const id = toRef(props, 'id');
const token = useToken(id);
const wantDossier = ref(false);
const dossier = useDossier(id, wantDossier);
const reports = useReports(id);
const create = useCreateReport(id);
const notify = useNotificationsStore();
const ui = useUiStore();
const t = computed(() => token.data.value?.data);
const md = computed(() => dossier.data.value?.data.markdown ?? '');
const copied = ref(false);
const showPrompt = ref(false);
const form = ref<{ provider: AiReportProvider; model: string; content: string; note: string }>({ provider: 'manuel', model: '', content: '', note: '' });
const open = ref<number | null>(null);
/** Liens directs vers l'API (même origine) : le navigateur télécharge le fichier, sans JavaScript. */
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
const dossierExport = (format: 'md' | 'html') => `${API}/tokens/${id.value}/dossier/export?format=${format}`;
const reportExport = (rid: number, format: 'md' | 'html') => `${API}/tokens/${id.value}/reports/${rid}/export?format=${format}`;
async function copyReport(content: string) {
  try { await navigator.clipboard.writeText(content); notify.push('success', 'Rapport copié.'); }
  catch { notify.push('info', 'Copie refusée par le navigateur : ouvrez le rapport et sélectionnez le texte.'); }
}

async function copy() {
  wantDossier.value = true;
  if (!md.value) { await dossier.refetch(); }
  const text = dossier.data.value?.data.markdown ?? '';
  if (!text) return;
  try { await navigator.clipboard.writeText(text); copied.value = true; notify.push('success', 'Dossier copié. Collez-le dans votre IA.'); setTimeout(() => (copied.value = false), 3000); }
  catch { notify.push('info', 'Copie automatique refusée par le navigateur : sélectionnez le texte ci-dessous.'); }
}
async function submit() {
  try {
    await create.mutateAsync({ provider: form.value.provider, model: form.value.model || null, content: form.value.content, note: form.value.note || null, dossierHash: dossier.data.value?.data.hash ?? null });
    notify.push('success', 'Rapport enregistré, figé avec la date et l’empreinte du dossier.');
    form.value = { provider: 'manuel', model: '', content: '', note: '' };
  } catch (e) { notify.push('error', e instanceof ApiHttpError ? `${e.message} ${JSON.stringify(e.details ?? '')}` : String(e), 10000); }
}
</script>
<template>
  <div class="stack" style="gap:1rem">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h1>Rapport IA <span class="muted" style="font-weight:400">{{ t?.symbol ?? shortAddr(t?.address) }}</span></h1>
        <p class="small muted" style="margin:0">Tout ce que la plateforme sait de ce token, en un texte daté et sourcé, à donner à l’IA de votre choix. Le rapport qu’elle rend peut être collé ici : il est alors figé, comme un plan du journal.</p>
      </div>
      <router-link :to="`/token/${id}`">← Fiche</router-link>
    </div>

    <section class="card">
      <div class="card-head"><h2>1. Copier le dossier pour votre IA</h2><span class="faint small" v-if="dossier.data.value">généré {{ fmtDate(dossier.data.value.data.generatedAt) }} · empreinte <code>{{ dossier.data.value.data.hash }}</code>{{ dossier.data.value.data.includesPlan ? ' · plan inclus' : ' · plan exclu' }}</span></div>
      <p class="small muted">Trois façons de l’utiliser, sans clé ni coût supplémentaire.</p>
      <ol class="small" style="margin:0 0 .75rem;padding-left:1.2rem">
        <li><strong>Copier-coller</strong> dans n’importe quelle IA (claude.ai, ChatGPT, un modèle local). La consigne de rédaction est en tête du dossier.</li>
        <li><strong>Connecteur Claude Desktop</strong> : l’application de bureau lit le dossier directement, sous votre abonnement. Configuration dans le README, section « L’accès pour l’IA ».</li>
        <li><strong>Coller le rapport obtenu</strong> ci-dessous pour le conserver, daté et relié aux données du moment.</li>
      </ol>
      <div class="row">
        <button class="primary" :disabled="dossier.isFetching.value" @click="copy">{{ dossier.isFetching.value ? 'Préparation…' : copied ? 'Copié ✓' : 'Copier le dossier' }}</button>
        <button class="ghost" @click="wantDossier = true">Afficher</button>
        <a :href="dossierExport('md')" download><button class="ghost">Télécharger .md</button></a>
        <a :href="dossierExport('html')" download><button class="ghost" title="Page autonome, imprimable en PDF">Télécharger .html</button></a>
        <span class="faint small">{{ ui.settings.dossierIncludesPlan ? 'Le plan du journal est inclus (réglages, Affichage).' : 'Le plan du journal est exclu : il est personnel (réglages, Affichage).' }}</span>
      </div>
      <QueryState :loading="dossier.isLoading.value" :error="dossier.error.value" />
      <textarea v-if="md" :value="md" readonly rows="18" class="mono small" style="margin-top:.75rem;white-space:pre" />
      <details style="margin-top:.5rem" :open="showPrompt"><summary class="small muted" @click.prevent="showPrompt = !showPrompt">Consigne donnée à l’IA (version {{ AI_REPORT_PROMPT_VERSION }})</summary>
        <pre class="small" style="white-space:pre-wrap;margin:.5rem 0 0">{{ AI_REPORT_PROMPT }}</pre>
      </details>
    </section>

    <section class="card">
      <h2>2. Coller le rapport obtenu</h2>
      <p class="small muted">Le texte est conservé tel quel, avec la date, le fournisseur et l’empreinte du dossier. Il ne pourra plus être modifié. Chaque rapport conservé se partage ensuite en fichier : Markdown, ou page HTML autonome à envoyer telle quelle ou à imprimer en PDF.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
        <div><label>Fournisseur</label><select v-model="form.provider"><option value="manuel">Collé à la main</option><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="ollama">Ollama (local)</option></select></div>
        <div><label>Modèle (optionnel)</label><input v-model="form.model" placeholder="Ex. Claude Fable 5.1" /></div>
        <div><label>Note (optionnelle)</label><input v-model="form.note" placeholder="Contexte, question posée…" /></div>
      </div>
      <label style="margin-top:.5rem">Rapport</label>
      <textarea v-model="form.content" rows="10" placeholder="Collez ici le rapport rendu par l’IA." />
      <div class="row" style="margin-top:.5rem"><button class="primary" :disabled="form.content.trim().length < 20 || create.isPending.value" @click="submit">Enregistrer, sans retour possible</button></div>
    </section>

    <section class="card">
      <h2>3. Rapports conservés</h2>
      <QueryState :loading="reports.isLoading.value" :error="reports.error.value" />
      <div v-if="reports.data.value && !reports.data.value.data.length" class="empty">Aucun rapport pour l’instant.</div>
      <div v-else-if="reports.data.value" class="stack" style="gap:.5rem">
        <article v-for="r in reports.data.value.data" :key="r.id" class="card" style="background:var(--bg-elev-2)">
          <div class="row" style="justify-content:space-between">
            <span><strong>{{ fmtDate(r.createdAt) }}</strong> · {{ r.provider }}{{ r.model ? ` · ${r.model}` : '' }} · dossier <code>{{ r.dossierHash }}</code> · consigne v{{ r.promptVersion }}</span>
            <span class="row" style="gap:.25rem">
              <button class="ghost small" @click="open = open === r.id ? null : r.id">{{ open === r.id ? 'Replier' : 'Lire' }}</button>
              <button class="ghost small" @click="copyReport(r.content)">Copier</button>
              <a :href="reportExport(r.id, 'md')" download><button class="ghost small">.md</button></a>
              <a :href="reportExport(r.id, 'html')" download title="Page autonome, imprimable en PDF"><button class="ghost small">.html</button></a>
            </span>
          </div>
          <p v-if="r.note" class="small muted" style="margin:.25rem 0 0">{{ r.note }}</p>
          <pre v-if="open === r.id" class="small" style="white-space:pre-wrap;margin:.5rem 0 0">{{ r.content }}</pre>
          <p v-else class="small faint" style="margin:.25rem 0 0">{{ r.content.slice(0, 240) }}{{ r.content.length > 240 ? '…' : '' }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
