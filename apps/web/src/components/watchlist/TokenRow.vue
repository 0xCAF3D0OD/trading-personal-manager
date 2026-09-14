<script setup lang="ts">
import type { TokenSummary, WatchlistItem } from '@tpm/shared';
import SourceTag from '@/components/shared/SourceTag.vue';
import { fmtPct, fmtUsd, pctClass, shortAddr, timeAgo } from '@/composables/useFormat';
defineProps<{ item: WatchlistItem; index: number; count: number; detail: boolean; summary: TokenSummary | null }>();
defineEmits<{ up: []; down: []; remove: [] }>();
</script>
<template>
  <tr>
    <td>
      <router-link :to="`/token/${item.id}`"><strong>{{ item.symbol ?? '—' }}</strong></router-link>
      <div class="faint small">{{ item.name ?? shortAddr(item.address) }} · <span class="mono">{{ shortAddr(item.address) }}</span></div>
    </td>
    <td class="num">{{ fmtUsd(item.priceUsd) }}<div v-if="detail"><SourceTag :source="item.priceSource" :fetched-at="item.lastMarketTs" /></div></td>
    <template v-if="!detail">
      <td class="num" :class="pctClass(item.priceChange24hPct)">{{ fmtPct(item.priceChange24hPct) }}</td>
      <td v-if="!summary" colspan="5" class="faint small">synthèse indisponible</td>
      <td v-for="a in summary?.answers ?? []" v-else :key="a.id" :title="a.answer" class="summary-cell" :class="`state-${a.state}`">
        <span class="summary-dot" aria-hidden="true"></span>{{ a.short }}
      </td>
    </template>
    <template v-else>
      <td class="num" :class="pctClass(item.priceChange24hPct)">{{ fmtPct(item.priceChange24hPct) }}</td>
      <td class="num">{{ fmtUsd(item.marketCapUsd, { compact: true }) }}</td>
      <td class="num">{{ fmtUsd(item.volume24hUsd, { compact: true }) }}</td>
      <td class="num">{{ item.ageDays !== null ? `${item.ageDays} j` : '—' }}</td>
      <td class="num small muted">{{ item.lastHolderTs ? timeAgo(item.lastHolderTs) : 'jamais' }}</td>
    </template>
    <td class="num" style="white-space:nowrap">
      <button class="ghost" title="Monter" :disabled="index === 0" @click="$emit('up')">↑</button>
      <button class="ghost" title="Descendre" :disabled="index === count - 1" @click="$emit('down')">↓</button>
      <button class="ghost danger" title="Retirer de la liste" @click="$emit('remove')">✕</button>
    </td>
  </tr>
</template>
