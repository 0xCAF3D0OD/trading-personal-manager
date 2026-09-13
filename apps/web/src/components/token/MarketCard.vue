<script setup lang="ts">
import type { MarketView } from '@tpm/shared';
import SourceTag from '@/components/shared/SourceTag.vue';
import { fmtPct, fmtUsd, pctClass } from '@/composables/useFormat';
defineProps<{ market: MarketView }>();
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Prix et volume</h2><SourceTag :source="market.source" :fetched-at="market.fetchedAt" /></div>
    <div class="row" style="align-items: baseline; gap: 1rem">
      <span style="font-size: 1.6rem; font-weight: 600">{{ fmtUsd(market.price.primary.value) }}</span>
      <span :class="pctClass(market.priceChange.h24)">{{ fmtPct(market.priceChange.h24) }} / 24 h</span>
    </div>
    <p v-if="market.price.secondary" class="small muted">
      Jupiter cote {{ fmtUsd(market.price.secondary.value) }}
      <span :class="Math.abs(market.price.spreadPct ?? 0) > 2 ? 'down' : ''">(écart {{ fmtPct(market.price.spreadPct) }})</span>.
      Les deux sources sont affichées, jamais moyennées.
    </p>
    <dl class="kv" style="margin-top:.75rem">
      <dt>Variation 5 min / 1 h / 6 h</dt>
      <dd><span :class="pctClass(market.priceChange.m5)">{{ fmtPct(market.priceChange.m5) }}</span> · <span :class="pctClass(market.priceChange.h1)">{{ fmtPct(market.priceChange.h1) }}</span> · <span :class="pctClass(market.priceChange.h6)">{{ fmtPct(market.priceChange.h6) }}</span></dd>
      <dt>Volume 24 h</dt><dd>{{ fmtUsd(market.volume24hUsd, { compact: true }) }}</dd>
      <dt>Capitalisation (DexScreener)</dt><dd>{{ fmtUsd(market.marketCapUsd, { compact: true }) }}</dd>
      <dt>Capitalisation recalculée (prix × offre RPC)</dt><dd>{{ fmtUsd(market.marketCapLocalUsd, { compact: true }) }}</dd>
      <dt>FDV</dt><dd>{{ fmtUsd(market.fdvUsd, { compact: true }) }}</dd>
      <dt>Liquidité du pool principal</dt><dd>{{ fmtUsd(market.liquidityUsd, { compact: true }) }}</dd>
      <dt>Ratio volume / capitalisation</dt>
      <dd :class="(market.volumeToMcap ?? 0) > 1 ? 'down' : ''" :title="(market.volumeToMcap ?? 0) > 1 ? 'Au-dessus de 1 : tout le token tourne plus d’une fois par jour' : ''">
        {{ market.volumeToMcap === null ? '—' : market.volumeToMcap.toFixed(3) }}
      </dd>
    </dl>
    <p v-if="market.pair" class="small faint" style="margin-top:.5rem">
      Pool {{ market.pair.dexId }} · <a :href="market.pair.url ?? '#'" target="_blank" rel="noopener">DexScreener ↗</a>
    </p>
  </section>
</template>
