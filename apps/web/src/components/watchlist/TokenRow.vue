<script setup lang="ts">
import type { WatchlistItem } from '@tpm/shared';
import SourceTag from '@/components/shared/SourceTag.vue';
import { fmtUsd, shortAddr, timeAgo } from '@/composables/useFormat';
defineProps<{ item: WatchlistItem; index: number; count: number }>();
defineEmits<{ up: []; down: []; remove: [] }>();
</script>
<template>
  <tr>
    <td>
      <router-link :to="`/token/${item.id}`"><strong>{{ item.symbol ?? '—' }}</strong></router-link>
      <div class="faint small">{{ item.name ?? shortAddr(item.address) }} · <span class="mono">{{ shortAddr(item.address) }}</span></div>
    </td>
    <td class="num">{{ fmtUsd(item.priceUsd) }}<div><SourceTag :source="item.priceSource" :fetched-at="item.lastMarketTs" /></div></td>
    <td class="num">{{ fmtUsd(item.marketCapUsd, { compact: true }) }}</td>
    <td class="num">{{ fmtUsd(item.volume24hUsd, { compact: true }) }}</td>
    <td class="num">{{ item.ageDays !== null ? `${item.ageDays} j` : '—' }}</td>
    <td class="num small muted">{{ item.lastHolderTs ? timeAgo(item.lastHolderTs) : 'jamais' }}</td>
    <td class="num">
      <button class="ghost" title="Monter" :disabled="index === 0" @click="$emit('up')">↑</button>
      <button class="ghost" title="Descendre" :disabled="index === count - 1" @click="$emit('down')">↓</button>
      <button class="ghost danger" title="Retirer de la liste" @click="$emit('remove')">✕</button>
    </td>
  </tr>
</template>
