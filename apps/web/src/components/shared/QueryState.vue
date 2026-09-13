<script setup lang="ts">
import { ApiHttpError } from '@/api/http';
defineProps<{ loading?: boolean; error?: unknown }>();
function msg(e: unknown): string {
  if (e instanceof ApiHttpError) return e.code === 'quota' ? `${e.message} — nouvelle tentative au prochain rafraîchissement.` : e.message;
  return (e as Error)?.message ?? 'Erreur';
}
</script>
<template>
  <div v-if="loading" class="muted small">Chargement…</div>
  <div v-else-if="error" class="banner err small">{{ msg(error) }}</div>
</template>
