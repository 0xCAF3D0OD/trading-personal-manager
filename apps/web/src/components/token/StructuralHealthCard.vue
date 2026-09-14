<script setup lang="ts">
import type { TokenHealth } from '@tpm/shared';
import { computed } from 'vue';
import CardMore from '@/components/shared/CardMore.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import Terme from '@/components/shared/Terme.vue';
import { shortAddr } from '@/composables/useFormat';
import { useCardDetail } from '@/composables/useCardDetail';
import { SUMMARY_PURPOSE } from '@tpm/shared';
const props = defineProps<{ health: TokenHealth; refreshing?: boolean }>();
defineEmits<{ refresh: [] }>();
const { open, detailMode, toggle } = useCardDetail();
/** Les trois questions qui comptent pour un débutant : créer, geler, prélever. */
const SIMPLE_KEYS = new Set(['mint_authority', 'freeze_authority', 'transfer_fee', 'token2022_extensions']);
const SIMPLE_TEXT: Record<string, { ok: string; bad: string; term: string }> = {
  mint_authority: { ok: 'Personne ne peut plus créer de tokens.', bad: 'L’équipe peut encore créer des tokens et diluer l’offre.', term: 'autorité de mint' },
  freeze_authority: { ok: 'Personne ne peut geler votre compte.', bad: 'L’équipe peut geler les comptes, donc bloquer vos ventes.', term: 'autorité de freeze' },
  transfer_fee: { ok: 'Aucun frais prélevé à chaque transfert.', bad: 'Des frais sont prélevés à chaque transfert.', term: 'frais de transfert' },
  token2022_extensions: { ok: 'Aucune extension risquée.', bad: 'Des extensions du programme donnent des pouvoirs particuliers à l’équipe.', term: 'Token-2022' },
};
const simpleItems = computed(() => props.health.items.filter((i) => SIMPLE_KEYS.has(i.key)));
</script>
<template>
  <section id="card-health" class="card">
    <div class="card-head">
      <h2>Peut-on me piéger ?</h2>
      <div class="row"><SourceTag source="rpc" :fetched-at="health.checkedAt" cached /><button class="ghost small" :disabled="refreshing" title="Revérifier" @click="$emit('refresh')">↻</button></div>
    </div>
    <p class="small faint purpose" style="margin:0 0 .4rem">{{ SUMMARY_PURPOSE.trap }}</p>
    <ul class="plain">
      <li v-for="it in simpleItems" :key="it.key" class="row" style="align-items:flex-start;gap:.6rem;padding:.25rem 0">
        <StatusBadge :status="it.status" />
        <span>
          <Terme :mot="SIMPLE_TEXT[it.key]?.term ?? it.label">{{ it.label }}</Terme> :
          {{ it.status === 'ok' ? SIMPLE_TEXT[it.key]?.ok : it.status === 'unknown' ? 'non vérifié' : SIMPLE_TEXT[it.key]?.bad }}
        </span>
      </li>
    </ul>
    <template v-if="open">
      <p class="small muted" style="margin-top:.5rem">Chaque point est à lire séparément. Aucun score global.</p>
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
    </template>
    <CardMore :open="open" :hidden="detailMode" @toggle="toggle" />
  </section>
</template>
