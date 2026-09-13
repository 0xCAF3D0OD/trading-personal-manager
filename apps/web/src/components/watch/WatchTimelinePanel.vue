<script setup lang="ts">
import type { TimelineItem } from '@tpm/shared';
import { computed } from 'vue';
import { fmtDate } from '@/composables/useFormat';

const props = defineProps<{ items: TimelineItem[] }>();
const days = computed(() => {
  const groups = new Map<string, TimelineItem[]>();
  for (const it of props.items) {
    const d = new Date(it.ts * 1000).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    (groups.get(d) ?? groups.set(d, []).get(d)!).push(it);
  }
  return [...groups.entries()];
});
function tone(it: TimelineItem): string {
  if (it.lane === 'said') return it.status === 'contradicted' ? 'risk' : it.status === 'kept' ? 'ok' : 'neutral';
  if (it.kind.includes('transfer_out') || it.kind.includes('lp_remove') || it.kind.includes('swap_sell') || it.kind === 'change:tokenomics') return 'risk';
  if (it.kind.startsWith('supply:burn') || it.kind.includes('lp_add')) return 'ok';
  return 'neutral';
}
</script>
<template>
  <div>
    <p class="small muted">En haut ce qui a été dit, en bas ce qui a été fait sur la blockchain et sur le site. Même axe de temps : un burn annoncé qui n'apparaît pas dans l'offre doit sauter aux yeux.</p>
    <div v-if="!items.length" class="empty">Rien à afficher sur la période. Enregistrez des engagements et laissez les jobs collecter les actions on-chain.</div>
    <div v-for="[day, list] in days" :key="day" class="card" style="margin-bottom:.75rem">
      <h3>{{ day }}</h3>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <div class="faint small" style="text-transform:uppercase;letter-spacing:.04em">Dit</div>
          <div v-for="it in list.filter((x) => x.lane === 'said')" :key="`${it.refType}-${it.refId}`" class="small" style="padding:.35rem 0;border-top:1px solid var(--border)">
            <span class="badge" :class="tone(it)">{{ it.kind.replace('claim:', '') }}</span>
            <span class="faint">{{ fmtDate(it.ts) }}</span>
            <div style="margin-top:.2rem">{{ it.title }}</div>
            <div class="faint">{{ it.detail }} <a v-if="it.url" :href="it.url" target="_blank" rel="noopener">↗</a></div>
          </div>
        </div>
        <div>
          <div class="faint small" style="text-transform:uppercase;letter-spacing:.04em">Fait</div>
          <div v-for="it in list.filter((x) => x.lane === 'done')" :key="`${it.refType}-${it.refId}`" class="small" style="padding:.35rem 0;border-top:1px solid var(--border)">
            <span class="badge" :class="tone(it)">{{ it.kind.replace(/^(onchain|supply|change):/, '') }}</span>
            <span class="faint">{{ fmtDate(it.ts) }}</span>
            <div style="margin-top:.2rem">{{ it.title }}</div>
            <div class="faint">{{ it.detail }} <a v-if="it.url" :href="it.url" target="_blank" rel="noopener">↗</a></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
