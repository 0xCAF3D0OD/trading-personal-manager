<script setup lang="ts">
/** Pied de carte en lecture simple : déplie ou replie le détail de cette carte seulement. */
defineProps<{ open: boolean; hidden?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>
<template>
  <div v-if="!hidden" class="card-more">
    <button class="ghost small" @click="$emit('toggle')">{{ open ? 'Réduire' : 'Voir le détail' }}</button>
  </div>
</template>
