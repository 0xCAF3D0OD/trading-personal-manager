<script setup lang="ts">
import type { CreatorView } from '@/api/tokens.api';
import type { SummaryAnswer } from '@tpm/shared';
import { SUMMARY_PURPOSE } from '@tpm/shared';
import { computed } from 'vue';
import CardMore from '@/components/shared/CardMore.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import Terme from '@/components/shared/Terme.vue';
import { fmtDate, fmtNum, fmtUsd, shortAddr } from '@/composables/useFormat';
import { useCardDetail } from '@/composables/useCardDetail';
const props = defineProps<{ creator: CreatorView; teamAnswer: SummaryAnswer | null; tokenId: number }>();
const { open, detailMode, toggle } = useCardDetail();
const KIND: Record<string, string> = { swap: 'échange', transfer: 'transfert', withdraw_liquidity: 'retrait de liquidité', add_liquidity: 'ajout de liquidité', burn: 'burn', token_mint: 'émission', create_pool: 'création de pool' };
const STATE: Record<string, string> = { ok: 'ok', warn: 'warning', risk: 'risk', partial: 'unknown', unknown: 'unknown' };
const risky = computed(() => props.creator.activities.filter((a) => a.kind.includes('swap') || a.kind.includes('withdraw') || a.kind.includes('transfer')).length);
</script>
<template>
  <section id="card-team" class="card">
    <div class="card-head"><h2>Que fait l’équipe ?</h2><SourceTag :source="creator.source" :fetched-at="creator.fetchedAt" /></div>
    <p class="small faint purpose" style="margin:0 0 .4rem">{{ SUMMARY_PURPOSE.team }}</p>
    <div v-if="teamAnswer" class="row" style="gap:.75rem;align-items:flex-start">
      <StatusBadge :status="STATE[teamAnswer.state] ?? 'unknown'" :label="teamAnswer.short" />
      <span>{{ teamAnswer.answer }}</span>
    </div>
    <p class="small muted" style="margin:.4rem 0 0">
      <template v-if="creator.creatorAddress"><Terme mot="créateur">Créateur</Terme> : <a :href="`https://solscan.io/account/${creator.creatorAddress}`" target="_blank" rel="noopener" class="mono">{{ shortAddr(creator.creatorAddress, 6) }}</a> · {{ creator.activities.length }} activité(s) lue(s), dont {{ risky }} échange(s) ou transfert(s).</template>
      <template v-else>Créateur non identifiable dans les métadonnées du token.</template>
      Les <Terme mot="engagement">engagements</Terme> et les portefeuilles d’équipe se gèrent dans la <router-link :to="`/token/${tokenId}/veille`">veille</router-link>.
    </p>
    <template v-if="open">
      <div v-if="creator.creatorAddress && !creator.available" class="banner warn small" style="margin-top:.5rem">Non disponible dans la configuration actuelle. Renseignez <code>{{ creator.missingVariable }}</code>.</div>
      <div v-else-if="creator.creatorAddress && !creator.activities.length" class="empty" style="margin-top:.5rem">Aucune activité pertinente récente (échanges, transferts, liquidité).</div>
      <div v-else-if="creator.activities.length" class="overflow" style="margin-top:.5rem">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="num">Montant</th></tr></thead>
          <tbody>
            <tr v-for="a in creator.activities.slice(0, 30)" :key="a.signature">
              <td class="small">{{ fmtDate(a.ts) }}</td>
              <td><span class="badge" :class="a.kind.includes('swap') || a.kind.includes('withdraw') ? 'warning' : 'neutral'">{{ KIND[a.kind] ?? a.kind }}</span></td>
              <td class="small">{{ a.description ?? '—' }} <a :href="`https://solscan.io/tx/${a.signature}`" target="_blank" rel="noopener" class="faint">{{ shortAddr(a.signature, 4) }}</a></td>
              <td class="num small">{{ a.amountUsd !== null ? fmtUsd(a.amountUsd) : fmtNum(a.amount, { compact: true }) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <CardMore :open="open" :hidden="detailMode || !creator.creatorAddress" @toggle="toggle" />
  </section>
</template>
