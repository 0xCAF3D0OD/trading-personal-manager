<script setup lang="ts">
import type { MarketMetricsView, SourcedSeries } from '@tpm/shared';
import { computed, ref, toRef } from 'vue';
import SourcedSeriesChart from '@/components/charts/SourcedSeriesChart.vue';
import CardMore from '@/components/shared/CardMore.vue';
import QueryState from '@/components/shared/QueryState.vue';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import Terme from '@/components/shared/Terme.vue';
import { fmtPct, fmtUsd, shortAddr, timeAgo } from '@/composables/useFormat';
import { useCardDetail } from '@/composables/useCardDetail';
import { useSlippage } from '@/queries/useTokenDetail';
import { useUiStore } from '@/stores/ui.store';
import { SUMMARY_PURPOSE } from '@tpm/shared';
const PURPOSE = SUMMARY_PURPOSE.exit;

const props = defineProps<{ tokenId: number; market: MarketMetricsView; ratioHistory: SourcedSeries[] }>();
const { open, detailMode, toggle } = useCardDetail();
const ui = useUiStore();
const showSlippage = ref(false);
const slippage = useSlippage(toRef(props, 'tokenId'), showSlippage);
const BAND: Record<string, string> = { comfortable: 'ok', correct: 'ok', thin: 'warning', very_thin: 'risk' };
const POOL: Record<string, string> = { constant_product: 'produit constant', concentrated: 'liquidité concentrée', unknown: 'type inconnu' };
const liq = computed(() => props.market.liquidity);
const sizes = computed(() => slippage.data.value?.data.sizes ?? []);
/** En lecture simple, une seule taille : celle des réglages (1 000 $ par défaut). */
const mainSize = computed(() => sizes.value.find((s) => s.orderUsd === ui.settings.summarySlippageOrderUsd) ?? sizes.value[sizes.value.length - 1] ?? null);
const simpleText = computed(() => {
  // Même lecture que la question 2 de la synthèse : l'état est porté par le pool principal, celui que la route de vente traverse.
  const b = liq.value.band;
  if (!b || liq.value.ratioPct === null) return 'Liquidité non rapportée à la capitalisation pour l’instant.';
  const r = `${fmtPct(liq.value.ratioPct, { signed: false, digits: 1 })} de la capitalisation`;
  const where = ' dans le pool principal';
  return b === 'very_thin' ? `Très mince : ${r} seulement est disponible pour vendre${where}. Sortir fera chuter le prix.`
    : b === 'thin' ? `Mince : ${r} est disponible pour vendre${where}. Une vente moyenne pèsera sur le prix.`
      : b === 'correct' ? `Correcte : ${r} est disponible pour vendre${where}.` : `Confortable : ${r} est disponible pour vendre${where}.`;
});
</script>
<template>
  <section id="card-liquidity" class="card">
    <div class="card-head"><h2>Puis-je sortir ?</h2><SourceTag :source="liq.source" :fetched-at="market.fetchedAt" /></div>
    <div class="row" style="gap:.75rem">
      <StatusBadge v-if="liq.band" :status="BAND[liq.band] ?? 'unknown'" :label="liq.bandLabel ?? ''" />
      <span>{{ simpleText }}</span>
    </div>
    <p v-if="liq.poolsCount > 1 && liq.totalRatioPct !== null" class="small muted" style="margin:.25rem 0 0">Tous pools confondus ({{ liq.poolsCount }}) : {{ fmtPct(liq.totalRatioPct, { signed: false, digits: 1 }) }}<template v-if="liq.totalBand !== liq.band">, mais les petits pools ne comptent pas pour une sortie : la route de vente ne les traverse pas</template>.</p>
    <p v-if="liq.ignoredPools" class="small muted" style="margin:.25rem 0 0">{{ liq.ignoredPools }} pool(s) au prix aberrant ignoré(s) : ni pool principal, ni dans les totaux.</p>
    <p v-if="liq.mainPoolUsd" class="small muted" style="margin:.25rem 0 0">Repère de taille : {{ ui.settings.orderSizeShareOfPoolPct }} % du pool principal = <strong>{{ fmtUsd(liq.mainPoolUsd * ui.settings.orderSizeShareOfPoolPct / 100) }}</strong>. Au-delà, c’est votre propre ordre qui fait le prix.</p>
    <p class="small faint purpose" style="margin:.25rem 0 0">{{ PURPOSE }}</p>
    <p class="small muted" style="margin:.4rem 0 0"><Terme mot="liquidité">Liquidité</Terme> du <Terme mot="pool">pool</Terme> principal : {{ fmtUsd(liq.mainPoolUsd, { compact: true }) }}<template v-if="liq.poolsCount > 1">, {{ liq.poolsCount }} pools au total pour {{ fmtUsd(liq.totalUsd, { compact: true }) }}</template>.</p>

    <div class="row" style="margin-top:.75rem;gap:.75rem;align-items:baseline">
      <button v-if="!showSlippage" @click="showSlippage = true">Estimer ce que coûte une vente</button>
      <template v-else>
        <QueryState :loading="slippage.isLoading.value" :error="slippage.error.value" />
        <span v-if="mainSize">
          Vendre {{ fmtUsd(mainSize.orderUsd) }} coûterait
          <strong :class="mainSize.impactPct === null ? 'faint' : mainSize.impactPct > 10 ? 'down' : mainSize.impactPct > 3 ? 'warning' : ''">{{ mainSize.impactPct === null ? 'un montant non estimable' : mainSize.receivedUsd !== null && mainSize.receivedUsd > mainSize.orderUsd * 1.02 ? 'un montant non estimable (cotation incohérente avec le prix de référence)' : mainSize.impactPct < 0.01 ? 'moins de 0,01 %' : `${mainSize.impactPct.toFixed(2)} %` }}</strong>
          de <Terme mot="slippage">slippage</Terme><template v-if="mainSize.receivedUsd !== null"> : vous recevriez {{ fmtUsd(mainSize.receivedUsd) }}, frais inclus</template> <span class="faint small">({{ mainSize.method === 'jupiter_quote' ? 'simulation Jupiter' : mainSize.method === 'constant_product' ? 'formule x·y = k' : 'indisponible' }} · {{ timeAgo(mainSize.fetchedAt) }})</span>
        </span>
      </template>
    </div>

    <template v-if="open">
      <details v-if="liq.pools.length" style="margin-top:.75rem" open>
        <summary class="small muted">Pools</summary>
        <div class="overflow"><table>
          <thead><tr><th>DEX</th><th>Type</th><th class="num">Liquidité</th><th class="num">Volume 24 h</th><th class="num">Prix</th><th></th></tr></thead>
          <tbody>
            <tr v-for="p in liq.pools" :key="p.address">
              <td>{{ p.dexId }} <span v-if="p.isMain" class="badge neutral">principal</span></td>
              <td class="small faint"><Terme :mot="p.poolType === 'constant_product' ? 'produit constant' : 'liquidité concentrée'">{{ POOL[p.poolType] }}</Terme></td>
              <td class="num">{{ fmtUsd(p.liquidityUsd, { compact: true }) }}</td>
              <td class="num">{{ fmtUsd(p.volumeH24Usd, { compact: true }) }}</td>
              <td class="num">{{ fmtUsd(p.priceUsd) }}</td>
              <td><a v-if="p.url" :href="p.url" target="_blank" rel="noopener" class="small">{{ shortAddr(p.address) }} ↗</a></td>
            </tr>
          </tbody>
        </table></div>
        <p class="small muted">Pool principal seul : {{ fmtPct(liq.ratioPct, { signed: false, digits: 1 }) }} de la capitalisation<span v-if="liq.bandLabel"> ({{ liq.bandLabel.toLowerCase() }})</span><template v-if="liq.poolsCount > 1"> · {{ fmtPct(liq.mainPoolUsd !== null && liq.totalUsd ? (liq.mainPoolUsd / liq.totalUsd) * 100 : null, { signed: false, digits: 0 }) }} de la liquidité totale y est déposée</template>. C’est cette lecture fine que suivent les divergences et l’alerte de retrait.</p>
      </details>

      <template v-if="showSlippage && sizes.length">
        <h3 style="margin-top:1rem">Slippage par taille d’ordre</h3>
        <table>
          <thead><tr><th class="num">Ordre</th><th class="num">Perte effective</th><th class="num">Reçu</th><th>Méthode</th><th>Route</th></tr></thead>
          <tbody>
            <tr v-for="s in sizes" :key="s.orderUsd">
              <td class="num">{{ fmtUsd(s.orderUsd) }}</td>
              <td class="num" :class="s.impactPct === null ? 'faint' : s.impactPct > 10 ? 'down' : s.impactPct > 3 ? 'warning' : ''">{{ s.impactPct === null ? 'indisponible' : `${s.impactPct.toFixed(2)} %` }}</td>
              <td class="num small">{{ s.receivedUsd === null ? '—' : fmtUsd(s.receivedUsd) }}</td>
              <td class="small">{{ s.method === 'jupiter_quote' ? 'Jupiter (simulation de route)' : s.method === 'constant_product' ? 'formule x·y = k (approximation)' : '—' }}</td>
              <td class="small faint">{{ s.route.join(' → ') }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="n in [...new Set(sizes.map((s) => s.note))]" :key="n" class="faint small">{{ n }}</p>
      </template>

      <h3 style="margin-top:1rem">Historique du ratio liquidité / capitalisation</h3>
      <SourcedSeriesChart :groups="ratioHistory" label="Ratio" unit="%" :height="150" />
    </template>
    <CardMore :open="open" :hidden="detailMode" @toggle="toggle" />
  </section>
</template>
