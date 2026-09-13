<script setup lang="ts">
defineProps<{ text: string }>();
</script>
<template>
  <div class="empty"><slot>{{ text }}</slot></div>
</template>
