<script setup lang="ts">
import type { CreatorView } from '@/api/tokens.api';
import SourceTag from '@/components/shared/SourceTag.vue';
import { fmtDate, fmtNum, fmtUsd, shortAddr } from '@/composables/useFormat';
defineProps<{ creator: CreatorView }>();
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Activités du créateur</h2><SourceTag :source="creator.source" :fetched-at="creator.fetchedAt" /></div>
    <p v-if="creator.creatorAddress" class="small mono">
      <a :href="`https://solscan.io/account/${creator.creatorAddress}`" target="_blank" rel="noopener">{{ creator.creatorAddress }}</a>
    </p>
    <div v-if="!creator.creatorAddress" class="empty">Créateur non résolu.</div>
    <div v-else-if="!creator.available" class="banner warn small">Non disponible dans la configuration actuelle. Renseignez <code>{{ creator.missingVariable }}</code>.</div>
    <div v-else-if="!creator.activities.length" class="empty">Aucune activité pertinente récente (swaps, transferts, liquidité).</div>
    <div v-else class="overflow">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Montant</th></tr></thead>
        <tbody>
          <tr v-for="a in creator.activities.slice(0, 30)" :key="a.signature">
            <td class="small">{{ fmtDate(a.ts) }}</td>
            <td><span class="badge" :class="a.kind.includes('swap') || a.kind.includes('withdraw') ? 'warning' : 'neutral'">{{ a.kind }}</span></td>
            <td class="small">{{ a.description ?? '—' }} <a :href="`https://solscan.io/tx/${a.signature}`" target="_blank" rel="noopener" class="faint">{{ shortAddr(a.signature, 4) }}</a></td>
            <td class="num small">{{ a.amountUsd !== null ? fmtUsd(a.amountUsd) : fmtNum(a.amount, { compact: true }) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
