<script setup lang="ts">
defineProps<{ status: string; label?: string }>();
const LABELS: Record<string, string> = {
  ok: 'OK', warning: 'Attention', risk: 'Risque', unknown: 'Inconnu',
  triggered: 'Déclenchée', insufficient_data: 'Historique insuffisant', neutral: '—',
  loosened: 'Assoupli', tightened: 'Resserré',
};
</script>
<template>
  <span class="badge" :class="status">{{ label ?? LABELS[status] ?? status }}</span>
</template>
