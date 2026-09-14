<script setup lang="ts">
import type { MarketMetricsView } from '@tpm/shared';
import SourceTag from '@/components/shared/SourceTag.vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { fmtNum, fmtPct, fmtUsd, pctClass, shortAddr } from '@/composables/useFormat';
defineProps<{ market: MarketMetricsView }>();
const MOM: Record<string, { s: string; l: string }> = {
  extinction: { s: 'warning', l: 'Mouvement en extinction' }, acceleration: { s: 'ok', l: 'Accélération en cours' },
  none: { s: 'neutral', l: 'Sans tendance nette' }, insufficient: { s: 'unknown', l: 'Dérivée non calculable' },
};
</script>
<template>
  <section class="card">
    <div class="card-head"><h2>Prix</h2><SourceTag :source="market.source" :fetched-at="market.fetchedAt" /></div>
    <div class="row" style="align-items: baseline; gap: 1rem">
      <span style="font-size: 1.6rem; font-weight: 600">{{ fmtUsd(market.price.primary.value) }}</span>
      <span :class="pctClass(market.priceChange.h24)">{{ fmtPct(market.priceChange.h24) }} / 24 h</span>
    </div>
    <p v-if="market.price.secondary" class="small" :class="market.price.spreadWarn ? 'down' : 'muted'">
      Jupiter cote {{ fmtUsd(market.price.secondary.value) }}, écart {{ fmtPct(market.price.spreadPct) }}
      <template v-if="market.price.spreadWarn"> · <strong>écart supérieur au seuil</strong>{{ market.price.spreadConsecutiveOver > 1 ? ` sur ${market.price.spreadConsecutiveOver} relevés` : '' }} : liquidité fragmentée ou routage défaillant, l’arbitrage ne fonctionne pas.</template>
      <template v-else>. Les deux sources sont affichées, jamais moyennées.</template>
    </p>
    <div class="row small" style="gap:1rem;margin:.5rem 0">
      <span>5 min <strong :class="pctClass(market.priceChange.m5)">{{ fmtPct(market.priceChange.m5) }}</strong></span>
      <span>1 h <strong :class="pctClass(market.priceChange.h1)">{{ fmtPct(market.priceChange.h1) }}</strong></span>
      <span>6 h <strong :class="pctClass(market.priceChange.h6)">{{ fmtPct(market.priceChange.h6) }}</strong></span>
      <span>24 h <strong :class="pctClass(market.priceChange.h24)">{{ fmtPct(market.priceChange.h24) }}</strong></span>
    </div>
    <div class="row small">
      <StatusBadge :status="MOM[market.momentum.state]!.s" :label="MOM[market.momentum.state]!.l" />
      <span class="faint">{{ market.momentum.label.replace(/^[^:]+: /, '') }}</span>
    </div>

    <h3 style="margin-top:1rem">Capitalisation, trois lectures</h3>
    <table>
      <tbody>
        <tr>
          <td>Source ({{ market.mcap.sourceName }})</td>
          <td class="num">
            <template v-if="market.mcap.sourceIsFdv"><span class="muted">non vérifiée : la source ne fournit pas de capitalisation distincte de la FDV</span></template>
            <template v-else>{{ fmtUsd(market.mcap.sourceValue, { compact: true }) }}</template>
          </td>
        </tr>
        <tr><td>Recalculée : prix × offre émise nette des burns (RPC)</td><td class="num">{{ fmtUsd(market.mcap.local, { compact: true }) }}</td></tr>
        <tr><td>FDV : prix × offre émise</td><td class="num">{{ fmtUsd(market.mcap.fdvLocal, { compact: true }) }} <span v-if="market.mcap.fdvSource" class="faint small">(source {{ fmtUsd(market.mcap.fdvSource, { compact: true }) }})</span></td></tr>
        <tr v-if="market.mcap.gapPct !== null">
          <td>Écart source / recalculée</td>
          <td class="num" :class="market.mcap.gapWarn ? 'down' : ''">{{ fmtPct(market.mcap.gapPct) }}<span v-if="market.mcap.gapWarn" class="small"> · offre périmée ou FDV substituée côté source</span></td>
        </tr>
      </tbody>
    </table>
    <details class="small" style="margin-top:.5rem">
      <summary class="muted">Composants de l’offre <SourceTag :source="market.supply.source" :fetched-at="market.supply.fetchedAt" /></summary>
      <dl class="kv" style="margin-top:.4rem">
        <dt>Offre du mint (déjà nette des burns SPL)</dt><dd>{{ fmtNum(market.supply.minted, { compact: true }) }}</dd>
        <dt>Soldes des adresses de burn identifiées</dt><dd>{{ fmtNum(market.supply.incinerated, { compact: true }) }}</dd>
        <dt><strong>Offre émise nette des burns</strong></dt><dd><strong>{{ fmtNum(market.supply.net, { compact: true }) }}</strong></dd>
      </dl>
      <ul v-if="market.supply.incineratorAddresses.length" class="faint" style="margin:.25rem 0;padding-left:1rem">
        <li v-for="a in market.supply.incineratorAddresses" :key="a.address"><span class="mono">{{ shortAddr(a.address, 6) }}</span> : {{ fmtNum(a.balance, { compact: true }) }}</li>
      </ul>
      <p class="faint" style="margin:.25rem 0 0">« Offre en circulation » n’est pas affichée : rien ne permet d’identifier de façon fiable les tokens équipe ou verrouillés.</p>
    </details>

    <h3 style="margin-top:1rem">Volume</h3>
    <dl class="kv">
      <dt>Volume 24 h <SourceTag :source="market.volume.source" /></dt><dd>{{ fmtUsd(market.volume.h24Usd, { compact: true }) }}</dd>
      <dt>Ratio volume / capitalisation recalculée</dt>
      <dd>{{ market.volume.toMcap === null ? '—' : market.volume.toMcap.toFixed(3) }} <span v-if="market.volume.bandLabel" class="badge" :class="market.volume.band === 'extreme' ? 'risk' : market.volume.band === 'low' ? 'warning' : 'neutral'">{{ market.volume.bandLabel }}</span></dd>
      <dt>Variation du ratio 24 h / 7 j (même source)</dt><dd><span :class="pctClass(market.volume.ratioChange24hPct)">{{ fmtPct(market.volume.ratioChange24hPct) }}</span> · <span :class="pctClass(market.volume.ratioChange7dPct)">{{ fmtPct(market.volume.ratioChange7dPct) }}</span></dd>
    </dl>
    <p class="faint small" style="margin-top:.25rem">DexScreener ne compte que les pools DEX. Deux relevés de sources différentes ne sont jamais comparés dans le temps.</p>
  </section>
</template>
