<script setup lang="ts">
import type { PageChange } from '@tpm/shared';
import { computed, ref, toRef } from 'vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtDate } from '@/composables/useFormat';
import { useWatchMutations } from '@/queries/useWatch';

const props = defineProps<{ tokenId: number; changes: PageChange[] }>();
const m = useWatchMutations(toRef(props, 'tokenId'));
const showMinor = ref(false);
const list = computed(() => props.changes.filter((c) => showMinor.value || c.severity !== 'minor'));
const SEV: Record<string, { s: string; l: string }> = { tokenomics: { s: 'risk', l: 'Tokenomics' }, content: { s: 'warning', l: 'Contenu' }, minor: { s: 'unknown', l: 'Mineur' } };
</script>
<template>
  <div class="stack" style="gap:.75rem">
    <div class="row" style="justify-content:space-between">
      <p class="small muted" style="margin:0">Chaque changement montre l'ancienne valeur, la nouvelle et le chemin de titres. Un chiffre de tokenomics qui bouge est prioritaire, annonce ou pas ; « sans communication » est un drapeau ajouté après 48 h.</p>
      <label class="row small" style="cursor:pointer"><input v-model="showMinor" type="checkbox" style="width:auto" /> afficher les changements mineurs</label>
    </div>
    <div v-if="!list.length" class="empty">Aucun changement détecté. Le premier relevé de chaque source sert de référence.</div>
    <article v-for="c in list" :key="c.id" class="card" :style="c.reviewedAt ? 'opacity:.7' : ''">
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <StatusBadge :status="SEV[c.severity]!.s" :label="SEV[c.severity]!.l" />
          <strong>{{ c.sourceLabel }}</strong>
          <a v-if="c.sourceUrl" :href="c.sourceUrl" target="_blank" rel="noopener" class="small">↗</a>
          <span class="faint small">{{ fmtDate(c.detectedAt) }}</span>
        </div>
        <div class="row">
          <StatusBadge v-if="c.unannouncedFlag" status="risk" label="sans communication" />
          <StatusBadge v-else-if="c.announced === true" status="ok" label="annoncé" />
          <StatusBadge v-else-if="c.announced === false" status="warning" :label="`annonce recherchée jusqu’au ${fmtDate(c.announceCheckDueAt)}`" />
          <button v-if="!c.reviewedAt" class="ghost small" @click="m.reviewChange.mutate({ cid: c.id, note: null })">Marquer comme relu</button>
        </div>
      </div>
      <table v-if="c.numericChanges.length" style="margin:.5rem 0">
        <thead><tr><th>Où</th><th class="num">Avant</th><th class="num">Après</th><th>Mots-clés</th></tr></thead>
        <tbody>
          <tr v-for="(n, i) in c.numericChanges" :key="i">
            <td class="small">{{ n.path || '(racine)' }}</td>
            <td class="num down">{{ n.before }}</td><td class="num up">{{ n.after }}</td>
            <td class="small faint">{{ n.keywords.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
      <details :open="c.severity !== 'minor' && !c.numericChanges.length">
        <summary class="small muted">{{ c.hunks.length }} bloc(s) de texte</summary>
        <div v-for="(h, i) in c.hunks" :key="i" class="small" style="padding:.3rem 0;border-top:1px solid var(--border)">
          <div class="faint">{{ h.path || '(racine)' }} · {{ h.op === 'added' ? 'ajouté' : h.op === 'removed' ? 'supprimé' : 'modifié' }}</div>
          <div v-if="h.before !== null" class="down" style="white-space:pre-wrap">− {{ h.before }}</div>
          <div v-if="h.after !== null" class="up" style="white-space:pre-wrap">+ {{ h.after }}</div>
        </div>
      </details>
      <p v-if="c.reviewNote" class="small faint">{{ c.reviewNote }}</p>
    </article>
  </div>
</template>
