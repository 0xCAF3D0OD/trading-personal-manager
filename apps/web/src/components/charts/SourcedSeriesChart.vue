<script setup lang="ts">
import type { SourcedSeries } from '@tpm/shared';
import { computed } from 'vue';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart.vue';
import { SOURCE_LABEL } from '@/composables/useFormat';

/**
 * Une série par source : chaque groupe devient une courbe distincte, sur le même axe.
 * Il n'existe pas de chemin qui concatène deux sources : la rupture est structurelle.
 */
const props = defineProps<{ groups: SourcedSeries[]; label: string; unit?: string; height?: number }>();
const series = computed(() => props.groups.map((g, i) => ({
  label: `${props.label} (${SOURCE_LABEL[g.source] ?? g.source}${props.groups.length > 1 ? ` · ${i + 1}` : ''})`,
  points: g.points, unit: props.unit,
})));
const switched = computed(() => props.groups.length > 1);
</script>
<template>
  <div>
    <p v-if="switched" class="small warning" style="color:var(--warning);margin:0 0 .25rem">Changement de source au cours de la période : {{ groups.length }} segments, jamais reliés entre eux.</p>
    <TimeSeriesChart :series="series" :height="height ?? 160" single-axis />
  </div>
</template>
