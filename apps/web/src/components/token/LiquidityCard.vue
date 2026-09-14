<script setup lang="ts">
import type { MarketMetricsView, SourcedSeries } from '@tpm/shared';
import { computed, ref, toRef } from 'vue';
import SourcedSeriesChart from '@/components/charts/SourcedSeriesChart.vue';
import QueryState from '@/components/shared/QueryState.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtPct, fmtUsd, shortAddr, timeAgo } from '@/composables/useFormat';
import { useSlippage } from '@/queries/useTokenDetail';

const props = defineProps<{ tokenId: number; market: MarketMetricsView; ratioHistory: SourcedSeries[] }>();
const showSlippage = ref(false);
const slippage = useSlippage(toRef(props, 'tokenId'), showSlippage);
const BAND: Record<string, string> = { comfortable: 'ok', correct: 'ok', thin: 'warning', very_thin: 'risk' };
const POOL: Record<string, string> = { constant_product: 'produit constant', concentrated: 'liquidité concentrée', unknown: 'type inconnu' };
const liq = computed(() => props.market.liquidity);
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Liquidité</h2><SourceTag :source="liq.source" :fetched-at="market.fetchedAt" /></div>
    <div class="row" style="align-items:baseline;gap:1rem">
      <span style="font-size:1.6rem;font-weight:600">{{ liq.ratioPct === null ? '—' : `${liq.ratioPct.toFixed(2)} %` }}</span>
      <span class="muted">de la capitalisation recalculée est disponible dans le pool principal</span>
    </div>
    <StatusBadge v-if="liq.band" :status="BAND[liq.band] ?? 'unknown'" :label="liq.bandLabel ?? ''" />
    <dl class="kv" style="margin-top:.75rem">
      <dt>Pool principal</dt><dd>{{ fmtUsd(liq.mainPoolUsd, { compact: true }) }}</dd>
      <dt>Tous pools connus ({{ liq.poolsCount }})</dt><dd>{{ fmtUsd(liq.totalUsd, { compact: true }) }}</dd>
    </dl>
    <p v-if="liq.poolsCount > 1" class="small muted">
      {{ fmtPct(liq.mainPoolUsd !== null && liq.totalUsd ? (liq.mainPoolUsd / liq.totalUsd) * 100 : null, { signed: false, digits: 0 }) }} de la liquidité est sur le pool principal : le reste est fragmenté sur {{ liq.poolsCount - 1 }} autre(s) pool(s).
    </p>
    <details v-if="liq.pools.length" style="margin-top:.25rem">
      <summary class="small muted">Pools</summary>
      <div class="overflow"><table>
        <thead><tr><th>DEX</th><th>Type</th><th class="num">Liquidité</th><th class="num">Volume 24 h</th><th class="num">Prix</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in liq.pools" :key="p.address">
            <td>{{ p.dexId }} <span v-if="p.isMain" class="badge ok">principal</span></td>
            <td class="small faint">{{ POOL[p.poolType] }}</td>
            <td class="num">{{ fmtUsd(p.liquidityUsd, { compact: true }) }}</td>
            <td class="num">{{ fmtUsd(p.volumeH24Usd, { compact: true }) }}</td>
            <td class="num">{{ fmtUsd(p.priceUsd) }}</td>
            <td><a v-if="p.url" :href="p.url" target="_blank" rel="noopener" class="small">{{ shortAddr(p.address) }} ↗</a></td>
          </tr>
        </tbody>
      </table></div>
    </details>

    <h3 style="margin-top:1rem">Slippage estimé pour une sortie</h3>
    <p class="small muted">La traduction concrète du ratio : combien vous perdez en sortant. Cotation Jupiter à la demande, mise en cache 60 s.</p>
    <button v-if="!showSlippage" @click="showSlippage = true">Estimer</button>
    <template v-else>
      <QueryState :loading="slippage.isLoading.value" :error="slippage.error.value" />
      <table v-if="slippage.data.value">
        <thead><tr><th class="num">Ordre</th><th class="num">Impact</th><th>Méthode</th><th>Route</th></tr></thead>
        <tbody>
          <tr v-for="s in slippage.data.value.data.sizes" :key="s.orderUsd">
            <td class="num">{{ fmtUsd(s.orderUsd) }}</td>
            <td class="num" :class="s.impactPct === null ? 'faint' : s.impactPct > 10 ? 'down' : s.impactPct > 3 ? 'warning' : ''">{{ s.impactPct === null ? 'indisponible' : `${s.impactPct.toFixed(2)} %` }}</td>
            <td class="small">{{ s.method === 'jupiter_quote' ? 'Jupiter (simulation de route)' : s.method === 'constant_product' ? 'formule x·y = k (approximation)' : '—' }}</td>
            <td class="small faint">{{ s.route.join(' → ') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="slippage.data.value" class="faint small">{{ slippage.data.value.data.sizes[0]?.note }} <span v-if="slippage.data.value.data.sizes[0]">· {{ timeAgo(slippage.data.value.data.sizes[0].fetchedAt) }}</span></p>
    </template>

    <h3 style="margin-top:1rem">Historique du ratio liquidité / capitalisation</h3>
    <SourcedSeriesChart :groups="ratioHistory" label="Ratio" unit="%" :height="150" />
  </section>
</template>
