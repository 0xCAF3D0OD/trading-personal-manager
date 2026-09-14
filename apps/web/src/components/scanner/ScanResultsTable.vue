<script setup lang="ts">
import type { ScanResult } from '@tpm/shared';
import { ref } from 'vue';
import { ApiHttpError } from '@/api/http';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtDate, fmtPct, fmtUsd, pctClass, shortAddr } from '@/composables/useFormat';
import { useWatchlistMutations } from '@/queries/useWatchlist';
import { useNotificationsStore } from '@/stores/notifications.store';

defineProps<{ rows: ScanResult[]; mode: 'kept' | 'excluded' }>();
const open = ref<number | null>(null);
const { add } = useWatchlistMutations();
const notify = useNotificationsStore();
async function watch(r: ScanResult) {
  try { await add.mutateAsync(r.tokenAddress); notify.push('success', `${r.tokenSymbol ?? shortAddr(r.tokenAddress)} ajouté à la surveillance.`); }
  catch (e) { notify.push('error', e instanceof ApiHttpError ? e.message : String(e), 8000); }
}
function age(h: number | null): string { return h === null ? '—' : h < 48 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(0)} j`; }
</script>
<template>
  <div class="overflow">
    <table>
      <thead>
        <tr>
          <th>Token</th><th class="num">Âge</th><th class="num">24 h</th><th class="num">1 h</th><th class="num">Capitalisation</th><th class="num">Liquidité</th><th class="num">Volume 24 h</th><th class="num">Vol / cap</th>
          <th v-if="mode === 'kept'" class="num">Filtres</th><th>{{ mode === 'kept' ? 'Drapeaux' : 'Motif d’exclusion' }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="r in rows" :key="r.id">
          <tr style="cursor:pointer" @click="open = open === r.id ? null : r.id">
            <td><strong>{{ r.tokenSymbol ?? shortAddr(r.tokenAddress) }}</strong> <span class="faint small">{{ r.tokenName }}</span><div class="mono faint small">{{ shortAddr(r.tokenAddress, 6) }} · {{ r.metrics.dexId }}</div></td>
            <td class="num">{{ age(r.metrics.ageHours) }}</td>
            <td class="num" :class="pctClass(r.metrics.pctH24)">{{ fmtPct(r.metrics.pctH24, { digits: 0 }) }}</td>
            <td class="num" :class="pctClass(r.metrics.pctH1)">{{ fmtPct(r.metrics.pctH1, { digits: 1 }) }}</td>
            <td class="num">{{ fmtUsd(r.metrics.capUsd, { compact: true }) }}<span v-if="r.metrics.mcapIsFdv" class="faint small" title="La source ne fournit pas de capitalisation : FDV affichée, non vérifiée"> FDV</span></td>
            <td class="num">{{ fmtUsd(r.metrics.liquidityUsd, { compact: true }) }}</td>
            <td class="num">{{ fmtUsd(r.metrics.volumeH24Usd, { compact: true }) }}</td>
            <td class="num">{{ r.metrics.volumeToMcap === null ? '—' : r.metrics.volumeToMcap.toFixed(2) }}</td>
            <td v-if="mode === 'kept'" class="num">{{ r.structuralPassed }}/{{ r.structuralTotal }}</td>
            <td>
              <template v-if="mode === 'kept'">
                <span class="badge" :class="r.flagCount === 0 ? 'ok' : r.flagCount <= 2 ? 'warning' : 'risk'">{{ r.flagCount }} levé(s)</span>
                <span v-if="r.unverifiedCount" class="badge unknown" style="margin-left:.25rem">{{ r.unverifiedCount }} non vérifié(s)</span>
              </template>
              <template v-else>
                <span class="badge neutral">étage {{ r.excludedStage }}</span>
                <span v-for="e in r.exclusionReasons" :key="e.code" class="badge risk" style="margin-left:.25rem">{{ e.label }}</span>
              </template>
            </td>
            <td class="num" @click.stop>
              <span v-if="r.inWatchlist" class="badge ok">surveillé</span>
              <button v-else class="ghost small" :disabled="add.isPending.value" @click="watch(r)">Ajouter à ma surveillance</button>
            </td>
          </tr>
          <tr v-if="open === r.id">
            <td :colspan="mode === 'kept' ? 11 : 10" style="background:var(--bg-elev-2)">
              <div class="grid grid-2">
                <div>
                  <h3>Filtres structurels</h3>
                  <table class="small"><tbody>
                    <tr v-for="c in r.structural" :key="c.code"><td><StatusBadge :status="c.passed ? 'ok' : 'risk'" :label="c.passed ? 'passé' : 'échoué'" /></td><td>{{ c.label }}</td><td class="num">{{ c.observed ?? '—' }}</td><td class="faint">{{ c.threshold }}</td><td class="faint">{{ c.source }}</td></tr>
                    <tr v-if="!r.structural.length"><td colspan="5" class="muted">Non évalués (exclu à l’étage 2).</td></tr>
                  </tbody></table>
                </div>
                <div>
                  <h3>Drapeaux</h3>
                  <table class="small"><tbody>
                    <tr v-for="f in r.flags" :key="f.code">
                      <td><StatusBadge :status="!f.verified ? 'unknown' : f.raised ? 'warning' : 'ok'" :label="!f.verified ? 'non vérifié' : f.raised ? 'levé' : 'absent'" /></td>
                      <td>{{ f.label }}</td><td class="num">{{ f.observed ?? '—' }}</td><td class="faint">{{ f.threshold ?? '' }}</td><td>{{ f.detail }}</td>
                    </tr>
                    <tr v-if="!r.flags.length"><td colspan="5" class="muted">Non évalués.</td></tr>
                  </tbody></table>
                </div>
              </div>
              <p class="small faint" style="margin:.5rem 0 0">
                Relevé du {{ fmtDate(r.observedAt) }} · prix {{ fmtUsd(r.metrics.priceUsd) }} ({{ r.metrics.priceSource }})
                <template v-if="r.metrics.txH1"> · 1 h : {{ r.metrics.txH1.buys }} achats / {{ r.metrics.txH1.sells }} ventes, {{ r.metrics.txH1.buyers }} acheteurs / {{ r.metrics.txH1.sellers }} vendeurs</template>
                <template v-if="r.metrics.otherPools.length"> · {{ r.metrics.otherPools.length }} autre(s) pool(s)</template>
                · <a :href="`https://www.geckoterminal.com/solana/pools/${r.poolAddress}`" target="_blank" rel="noopener">GeckoTerminal ↗</a>
                · <a :href="`https://solscan.io/token/${r.tokenAddress}`" target="_blank" rel="noopener">Solscan ↗</a>
              </p>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
