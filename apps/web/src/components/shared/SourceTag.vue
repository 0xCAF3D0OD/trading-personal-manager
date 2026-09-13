<script setup lang="ts">
import { SOURCE_LABEL, timeAgo } from '@/composables/useFormat';
defineProps<{ source: string | null | undefined; fetchedAt?: number | null; cached?: boolean }>();
</script>
<template>
  <span class="source-tag" :title="cached ? 'Servi depuis le cache backend' : 'Rafraîchi'">
    {{ SOURCE_LABEL[source ?? 'unavailable'] ?? source }}<template v-if="fetchedAt"> · {{ timeAgo(fetchedAt) }}</template>
  </span>
</template>
