<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { SOURCE_LABEL, timeAgo } from '@/composables/useFormat';
import { useNotificationsStore } from '@/stores/notifications.store';
const { degraded } = storeToRefs(useNotificationsStore());
</script>
<template>
  <div v-if="degraded.length" class="banner warn">
    <strong>Mode dégradé.</strong>
    <span v-for="d in degraded" :key="d.provider">
      {{ SOURCE_LABEL[d.provider] ?? d.provider }} : {{ d.reason }}<template v-if="d.since"> ({{ timeAgo(d.since) }})</template>.
    </span>
    Les chiffres affichés proviennent du cache ou de la dernière valeur connue.
  </div>
</template>
