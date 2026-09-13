<script setup lang="ts">
import type { TokenHealth } from '@tpm/shared';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { shortAddr } from '@/composables/useFormat';
defineProps<{ health: TokenHealth; refreshing?: boolean }>();
defineEmits<{ refresh: [] }>();
</script>
<template>
  <section class="card">
    <div class="card-head">
      <h2>Santé structurelle</h2>
      <div class="row"><SourceTag source="rpc" :fetched-at="health.checkedAt" cached /><button class="ghost small" :disabled="refreshing" @click="$emit('refresh')">↻</button></div>
    </div>
    <p class="small muted">Pas de score global : chaque point est à lire séparément.</p>
    <table>
      <tbody>
        <tr v-for="it in health.items" :key="it.key">
          <td style="width: 40%">{{ it.label }}</td>
          <td><StatusBadge :status="it.status" /></td>
          <td>
            <span v-if="it.key === 'creator' && it.value" class="mono"><a :href="`https://solscan.io/account/${it.value}`" target="_blank" rel="noopener">{{ shortAddr(it.value, 6) }}</a></span>
            <span v-else-if="it.key === 'created_at' && it.value">{{ new Date(it.value).toLocaleString('fr-FR') }}</span>
            <span v-else>{{ it.value ?? '—' }}</span>
            <div v-if="it.detail" class="faint small">{{ it.detail }}</div>
          </td>
          <td class="num"><SourceTag :source="it.source" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
