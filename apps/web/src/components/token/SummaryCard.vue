<script setup lang="ts">
import type { TokenSummary } from '@tpm/shared';
import { SUMMARY_DISCLAIMER } from '@tpm/shared';
import SourceTag from '@/components/shared/SourceTag.vue';
defineProps<{ summary: TokenSummary }>();
function go(card: string) {
  document.getElementById(`card-${card}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
<template>
  <section class="card summary">
    <div class="card-head">
      <h2>En cinq questions</h2>
      <span class="faint small">cinq réponses, pas de note : la somme est la vôtre</span>
    </div>
    <p class="small muted" style="margin:0 0 .5rem">{{ SUMMARY_DISCLAIMER }}</p>
    <ol class="summary-list">
      <li v-for="a in summary.answers" :key="a.id" class="summary-row" :class="`state-${a.state}`">
        <div class="summary-q">
          <span class="summary-dot" aria-hidden="true"></span>
          <div><strong>{{ a.question }}</strong><div class="faint small purpose">{{ a.purpose }}</div></div>
        </div>
        <div class="summary-a">
          <span>{{ a.answer }}</span>
          <div class="row small faint" style="margin-top:.2rem">
            <SourceTag :source="a.source" :fetched-at="a.fetchedAt" />
            <span v-if="a.missing">variable manquante : <code>{{ a.missing }}</code></span>
            <a href="#" @click.prevent="go(a.card)">voir la carte</a>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>
