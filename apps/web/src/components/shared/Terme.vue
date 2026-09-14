<script setup lang="ts">
import { defineTerm } from '@tpm/shared';
import { computed } from 'vue';
/** Un mot technique expliqué là où il apparaît : survol ou toucher. Le terme sert de clé dans le glossaire partagé. */
const props = defineProps<{ mot: string }>();
const def = computed(() => defineTerm(props.mot));
</script>
<template>
  <span v-if="def" class="term" :title="def" tabindex="0"><slot>{{ mot }}</slot></span>
  <span v-else><slot>{{ mot }}</slot></span>
</template>
