<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import QueryState from '@/components/shared/QueryState.vue';
import WatchChangesPanel from '@/components/watch/WatchChangesPanel.vue';
import WatchClaimsPanel from '@/components/watch/WatchClaimsPanel.vue';
import WatchNewsPanel from '@/components/watch/WatchNewsPanel.vue';
import WatchSettingsPanel from '@/components/watch/WatchSettingsPanel.vue';
import WatchSourcesPanel from '@/components/watch/WatchSourcesPanel.vue';
import WatchTeamPanel from '@/components/watch/WatchTeamPanel.vue';
import WatchTimelinePanel from '@/components/watch/WatchTimelinePanel.vue';
import { shortAddr } from '@/composables/useFormat';
import { useToken } from '@/queries/useTokenDetail';
import { useTimeline, useWatchChanges, useWatchOverview } from '@/queries/useWatch';

const props = defineProps<{ id: number }>();
const id = toRef(props, 'id');
const token = useToken(id);
const overview = useWatchOverview(id);
const changes = useWatchChanges(id);
const timeline = useTimeline(id);
const tab = ref<'claims' | 'changes' | 'timeline' | 'news' | 'promo' | 'sources' | 'team' | 'settings'>('timeline');
const o = computed(() => overview.data.value?.data);
const tabs = computed(() => [
  { k: 'claims', l: 'Engagements', n: o.value?.counts.claimsPending },
  { k: 'changes', l: 'Changements détectés', n: o.value?.counts.changesUnreviewed },
  { k: 'timeline', l: 'Dire vs faire', n: undefined },
  { k: 'news', l: 'Actualités', n: o.value?.counts.news },
  { k: 'promo', l: 'Signaux de promotion', n: o.value?.counts.promo },
  { k: 'sources', l: 'Sources', n: o.value?.sources.length },
  { k: 'team', l: 'Wallets équipe', n: undefined },
  { k: 'settings', l: 'Réglages', n: undefined },
] as const);
</script>
<template>
  <div class="stack" style="gap:1rem">
    <div class="row" style="justify-content:space-between;align-items:flex-start">
      <div>
        <h1>Veille <span class="muted" style="font-weight:400">{{ token.data.value?.data.symbol ?? shortAddr(token.data.value?.data.address) }}</span></h1>
        <p class="small muted" style="margin:0">Un journal horodaté de ce qui a été promis et de ce qui a été fait. Ni fil d'actualités, ni sentiment, ni résumé automatique : le texte original, toujours.</p>
        <p v-if="o" class="small faint" style="margin:.25rem 0 0">
          Collecte automatique : {{ o.automatedSources.length ? o.automatedSources.join(', ') : 'aucune source configurée' }}.
          <template v-if="o.manualSources.length"> Suivi manuel : {{ o.manualSources.join(', ') }}.</template>
          Service de rendu : {{ o.rendererAvailable ? 'disponible' : 'absent' }}.
        </p>
      </div>
      <router-link :to="`/token/${id}`">← Vue détaillée</router-link>
    </div>
    <QueryState :loading="overview.isLoading.value" :error="overview.error.value" />
    <nav class="row" style="gap:.25rem;border-bottom:1px solid var(--border);padding-bottom:.5rem">
      <button v-for="t in tabs" :key="t.k" :class="tab === t.k ? 'primary' : 'ghost'" @click="tab = t.k">{{ t.l }}<span v-if="t.n" class="badge neutral" style="margin-left:.35rem">{{ t.n }}</span></button>
    </nav>
    <WatchClaimsPanel v-if="tab === 'claims'" :token-id="id" />
    <template v-else-if="tab === 'changes'">
      <QueryState :loading="changes.isLoading.value" :error="changes.error.value" />
      <WatchChangesPanel v-if="changes.data.value" :token-id="id" :changes="changes.data.value.data" />
    </template>
    <template v-else-if="tab === 'timeline'">
      <QueryState :loading="timeline.isLoading.value" :error="timeline.error.value" />
      <WatchTimelinePanel v-if="timeline.data.value" :items="timeline.data.value.data" />
    </template>
    <WatchNewsPanel v-else-if="tab === 'news'" :token-id="id" kinds="news,listing" />
    <WatchNewsPanel v-else-if="tab === 'promo'" :token-id="id" kinds="promo" />
    <WatchSourcesPanel v-else-if="tab === 'sources' && o" :token-id="id" :sources="o.sources" :renderer-available="o.rendererAvailable" />
    <WatchTeamPanel v-else-if="tab === 'team'" :token-id="id" />
    <WatchSettingsPanel v-else-if="tab === 'settings'" :token-id="id" />
  </div>
</template>
