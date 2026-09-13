<script setup lang="ts">
import type { Claim, ClaimDraft, ClaimStatus, ClaimType, VerificationKind } from '@tpm/shared';
import { computed, reactive, ref, toRef } from 'vue';
import { ApiHttpError } from '@/api/http';
import QueryState from '@/components/shared/QueryState.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtDate } from '@/composables/useFormat';
import { useClaims, useWatchMutations } from '@/queries/useWatch';
import { useNotificationsStore } from '@/stores/notifications.store';

const props = defineProps<{ tokenId: number }>();
const status = ref<string | undefined>(undefined);
const claims = useClaims(toRef(props, 'tokenId'), status);
const m = useWatchMutations(toRef(props, 'tokenId'));
const notify = useNotificationsStore();

const xUrl = ref('');
const pasted = reactive({ text: '', date: new Date().toISOString().slice(0, 16), url: '' });
const draft = ref<ClaimDraft | null>(null);
const edit = reactive({ type: 'tokenomics' as ClaimType, subtype: '', dueAt: '', verificationKind: '' as VerificationKind | '', verificationRef: '' });
const resolving = ref<Claim | null>(null);
const resolveForm = reactive({ status: 'kept' as ClaimStatus, note: '' });

const TYPE: Record<string, string> = { tokenomics: 'Tokenomics', product: 'Produit', partnership: 'Partenariat', listing: 'Listing', governance: 'Gouvernance', other: 'Autre' };
const ST: Record<string, { s: string; l: string }> = { pending: { s: 'warning', l: 'en attente' }, kept: { s: 'ok', l: 'tenu' }, contradicted: { s: 'risk', l: 'contredit' }, expired: { s: 'unknown', l: 'expiré' } };
const VK: Record<string, string> = { supply_decrease: 'Baisse de l’offre (burn)', lp_lock: 'Liquidité verrouillée', wallet_transfer: 'Transaction d’un wallet équipe', holders_growth: 'Croissance des détenteurs', page_content: 'Contenu de la page' };
const ORIGIN: Record<string, string> = { manual: 'saisie', x_oembed: 'X', x_api: 'X', website: 'site (diff)', github_release: 'GitHub', news: 'actualité', onchain: 'on-chain' };
const list = computed(() => claims.data.value?.data ?? []);

function applyDraft(d: ClaimDraft) {
  draft.value = d;
  edit.type = d.type; edit.subtype = d.subtype ?? ''; edit.verificationKind = d.verificationKind ?? ''; edit.verificationRef = '';
  edit.dueAt = d.dueAt ? new Date(d.dueAt * 1000).toISOString().slice(0, 16) : '';
  if (d.publishedAt) pasted.date = new Date(d.publishedAt * 1000).toISOString().slice(0, 16);
  pasted.text = d.text; pasted.url = d.url ?? '';
}
async function fromX() {
  try { applyDraft((await m.draftFromX.mutateAsync(xUrl.value)).data); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
async function analyse() {
  try { applyDraft((await m.draft.mutateAsync({ text: pasted.text, publishedAt: toTs(pasted.date), url: pasted.url || null })).data); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
async function save() {
  try {
    await m.createClaim.mutateAsync({
      text: pasted.text, publishedAt: toTs(pasted.date) ?? Math.floor(Date.now() / 1000), url: pasted.url || null, author: draft.value?.author ?? null,
      type: edit.type, subtype: edit.subtype || null, dueAt: toTs(edit.dueAt), verificationKind: edit.verificationKind || null, verificationRef: edit.verificationRef || null,
      origin: draft.value?.url && /(twitter|x)\.com/.test(draft.value.url) ? 'x_oembed' : 'manual',
    });
    notify.push('success', 'Engagement enregistré. Son texte est désormais figé.');
    draft.value = null; pasted.text = ''; pasted.url = ''; xUrl.value = '';
  } catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
async function resolve() {
  if (!resolving.value) return;
  try { await m.resolveClaim.mutateAsync({ cid: resolving.value.id, input: { status: resolveForm.status, note: resolveForm.note } }); resolving.value = null; resolveForm.note = ''; }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
function toTs(v: string): number | null { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? Math.floor(t / 1000) : null; }
</script>
<template>
  <div class="stack" style="gap:1rem">
    <section class="card">
      <h3>Enregistrer une affirmation</h3>
      <p class="small muted">Le texte est conservé tel quel, jamais reformulé. Tout ce qui est proposé ci-dessous (type, échéance, mode de vérification) reste modifiable jusqu'à l'enregistrement, puis figé.</p>
      <div class="row">
        <input v-model="xUrl" placeholder="URL d’un post X (x.com/compte/status/…) — importé via l’endpoint oEmbed officiel" style="flex:2;min-width:280px" />
        <button :disabled="!xUrl || m.draftFromX.isPending.value" @click="fromX">Importer le post</button>
      </div>
      <div style="margin-top:.5rem"><label>Ou collez le texte</label><textarea v-model="pasted.text" rows="3" placeholder="Texte exact de l’annonce" /></div>
      <div class="row" style="margin-top:.5rem;align-items:flex-end">
        <div><label>Date de publication</label><input v-model="pasted.date" type="datetime-local" style="width:auto" /></div>
        <div style="flex:1"><label>Lien vers l’original</label><input v-model="pasted.url" type="url" placeholder="https://…" /></div>
        <button :disabled="!pasted.text || m.draft.isPending.value" @click="analyse">Analyser</button>
      </div>
      <div v-if="draft" class="card" style="background:var(--bg-elev-2);margin-top:.75rem">
        <p class="small" style="white-space:pre-wrap"><strong>Texte figé :</strong> {{ pasted.text }}</p>
        <p v-if="draft.author" class="small faint">Auteur : {{ draft.author }}</p>
        <p v-if="draft.extractedNumbers.length" class="small">Chiffres repérés : <span v-for="(n, i) in draft.extractedNumbers" :key="i" class="badge neutral" style="margin-right:.3rem">{{ n.raw }}</span></p>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
          <div><label>Type</label><select v-model="edit.type"><option v-for="(l, k) in TYPE" :key="k" :value="k">{{ l }}</option></select></div>
          <div><label>Sous-type</label><input v-model="edit.subtype" placeholder="burn, tax, lp_lock…" /></div>
          <div><label>Échéance (optionnelle)</label><input v-model="edit.dueAt" type="datetime-local" /></div>
          <div><label>Vérification automatique</label><select v-model="edit.verificationKind"><option value="">Aucune (manuelle)</option><option v-for="(l, k) in VK" :key="k" :value="k">{{ l }}</option></select></div>
          <div v-if="edit.verificationKind === 'wallet_transfer'"><label>Adresse ou signature attendue</label><input v-model="edit.verificationRef" class="mono" /></div>
        </div>
        <button class="primary" style="margin-top:.75rem" :disabled="m.createClaim.isPending.value" @click="save">Enregistrer, texte figé</button>
      </div>
    </section>

    <section>
      <div class="row" style="justify-content:space-between;margin-bottom:.5rem">
        <h3 style="margin:0">Journal</h3>
        <select v-model="status" style="width:auto"><option :value="undefined">Tous les statuts</option><option v-for="(v, k) in ST" :key="k" :value="k">{{ v.l }}</option></select>
      </div>
      <QueryState :loading="claims.isLoading.value" :error="claims.error.value" />
      <div v-if="claims.data.value && !list.length" class="empty">Aucun engagement enregistré.</div>
      <article v-for="c in list" :key="c.id" class="card" style="margin-bottom:.5rem">
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <StatusBadge :status="ST[c.status]!.s" :label="ST[c.status]!.l" />
            <span class="badge neutral">{{ TYPE[c.type] }}<template v-if="c.subtype"> · {{ c.subtype }}</template></span>
            <span class="faint small">{{ fmtDate(c.publishedAt) }} · {{ ORIGIN[c.origin] }}<template v-if="c.author"> · {{ c.author }}</template></span>
          </div>
          <div class="row">
            <a v-if="c.url" :href="c.url" target="_blank" rel="noopener" class="small">original ↗</a>
            <button class="ghost small" @click="resolving = c; resolveForm.status = c.status === 'kept' ? 'contradicted' : 'kept'">Qualifier</button>
          </div>
        </div>
        <p style="white-space:pre-wrap;margin:.5rem 0">{{ c.text }}</p>
        <p class="small faint" style="margin:0">
          <template v-if="c.dueAt">Échéance {{ fmtDate(c.dueAt) }} · </template>
          <template v-if="c.verificationKind">Vérification : {{ VK[c.verificationKind] }}<template v-if="c.verificationRef"> ({{ c.verificationRef }})</template> · </template>
          <template v-if="c.resolvedAt">Résolu {{ c.resolvedBy === 'auto' ? 'automatiquement' : 'à la main' }} le {{ fmtDate(c.resolvedAt) }}</template>
        </p>
        <p v-if="c.verificationNote" class="small" style="margin:.25rem 0 0">{{ c.verificationNote }}</p>
        <div v-if="resolving?.id === c.id" class="card" style="background:var(--bg-elev-2);margin-top:.5rem">
          <div class="row" style="align-items:flex-end">
            <div><label>Nouveau statut</label><select v-model="resolveForm.status" style="width:auto"><option v-for="(v, k) in ST" :key="k" :value="k">{{ v.l }}</option></select></div>
            <div style="flex:1"><label>Note obligatoire</label><input v-model="resolveForm.note" placeholder="Pourquoi ce statut, avec la preuve si possible" /></div>
            <button class="primary" :disabled="resolveForm.note.length < 3" @click="resolve">Valider</button>
            <button class="ghost" @click="resolving = null">Annuler</button>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
