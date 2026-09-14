<script setup lang="ts">
import type { ScanRetroView } from '@tpm/shared';
import { fmtDate, fmtPct, fmtUsd, shortAddr } from '@/composables/useFormat';
defineProps<{ retro: ScanRetroView }>();
const H: Record<string, string> = { d1: 'J+1', d7: 'J+7', d30: 'J+30' };
</script>
<template>
  <div class="stack" style="gap:1rem">
    <p class="small muted">La seule question qui compte : si j'avais acheté chaque token remonté, où en serais-je ? La médiane d'abord, la moyenne ensuite, parce qu'un seul x50 masque cinquante pertes à −90 %. Deux calculs : tokens disparus comptés à −100 %, ou exclus.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section v-for="s in retro.stats" :key="s.horizon" class="card">
        <div class="card-head"><h2>{{ H[s.horizon] }}</h2><span class="faint small">{{ s.count }} token(s) échus, {{ s.unavailable }} disparu(s)</span></div>
        <div v-if="!s.count" class="empty">Aucun horizon échu.</div>
        <template v-else>
          <div class="row" style="gap:1.5rem;align-items:baseline">
            <div><div class="faint small">Médiane (disparus à −100 %)</div><strong style="font-size:1.5rem" :class="(s.withLoss.medianPct ?? 0) >= 0 ? 'up' : 'down'">{{ fmtPct(s.withLoss.medianPct, { digits: 0 }) }}</strong></div>
            <div><div class="faint small">Médiane (disparus exclus)</div><strong :class="(s.excluding.medianPct ?? 0) >= 0 ? 'up' : 'down'">{{ fmtPct(s.excluding.medianPct, { digits: 0 }) }}</strong></div>
          </div>
          <dl class="kv small" style="margin-top:.5rem">
            <dt>Moyenne</dt><dd>{{ fmtPct(s.withLoss.meanPct, { digits: 0 }) }} · {{ fmtPct(s.excluding.meanPct, { digits: 0 }) }}</dd>
            <dt>En gain</dt><dd>{{ fmtPct(s.withLoss.positivePct, { signed: false, digits: 0 }) }}</dd>
            <dt>Sous −50 %</dt><dd>{{ fmtPct(s.withLoss.belowMinus50Pct, { signed: false, digits: 0 }) }}</dd>
            <dt>Meilleur · pire</dt><dd>{{ fmtPct(s.withLoss.best, { digits: 0 }) }} · {{ fmtPct(s.withLoss.worst, { digits: 0 }) }}</dd>
            <dt>100 $ sur chacun</dt><dd>{{ fmtUsd(s.withLoss.value100Each) }} sur {{ fmtUsd(s.count * 100) }} misés</dd>
          </dl>
          <table class="small" style="margin-top:.5rem"><tbody><tr v-for="b in s.histogram" :key="b.label"><td>{{ b.label }}</td><td class="num">{{ b.count }}</td></tr></tbody></table>
        </template>
      </section>
    </div>
    <section class="card">
      <h2>Par nombre de drapeaux au moment du relevé</h2>
      <p class="small muted">Si les tokens à zéro drapeau ne font pas mieux que les autres, les drapeaux ne discriminent pas.</p>
      <table><thead><tr><th>Drapeaux</th><th v-for="h in ['d1','d7','d30']" :key="h" class="num">{{ H[h] }} (médiane, n)</th></tr></thead>
        <tbody><tr v-for="fc in ['0','1','2','3+']" :key="fc"><td>{{ fc }}</td>
          <td v-for="h in ['d1','d7','d30']" :key="h" class="num">
            <template v-for="c in retro.byFlagCount.filter((x) => x.flagCount === fc && x.horizon === h)" :key="c.horizon">{{ c.count ? `${fmtPct(c.medianPct, { digits: 0 })} (${c.count})` : '—' }}</template>
          </td></tr></tbody></table>
    </section>
    <section v-if="retro.byFlag.length" class="card">
      <h2>Pouvoir d'élimination de chaque drapeau</h2>
      <table><thead><tr><th>Drapeau</th><th>Horizon</th><th class="num">Avec (médiane, n)</th><th class="num">Sans (médiane, n)</th></tr></thead>
        <tbody><tr v-for="b in retro.byFlag.filter((x) => x.withCount + x.withoutCount > 0)" :key="`${b.flag}-${b.horizon}`">
          <td>{{ b.flag }}</td><td>{{ H[b.horizon] }}</td><td class="num">{{ fmtPct(b.withFlagMedianPct, { digits: 0 }) }} ({{ b.withCount }})</td><td class="num">{{ fmtPct(b.withoutFlagMedianPct, { digits: 0 }) }} ({{ b.withoutCount }})</td>
        </tr></tbody></table>
    </section>
    <section class="card">
      <h2>Tokens remontés</h2>
      <div v-if="!retro.rows.length" class="empty">Aucun token gardé pour l’instant.</div>
      <div v-else class="overflow"><table>
        <thead><tr><th>Token</th><th>Remonté le</th><th class="num">Prix alors</th><th class="num">Drapeaux</th><th class="num">J+1</th><th class="num">J+7</th><th class="num">J+30</th><th></th></tr></thead>
        <tbody><tr v-for="r in retro.rows" :key="r.tokenAddress">
          <td><strong>{{ r.tokenSymbol ?? shortAddr(r.tokenAddress) }}</strong> <span class="mono faint small">{{ shortAddr(r.tokenAddress) }}</span></td>
          <td class="small">{{ fmtDate(r.firstKeptAt) }}</td>
          <td class="num">{{ fmtUsd(r.refPriceUsd) }}<span v-if="r.refMcapIsFdv" class="faint small"> · FDV</span></td>
          <td class="num">{{ r.refFlagCount }} <span class="faint small">{{ r.refStructural }}</span></td>
          <td v-for="h in [r.d1, r.d7, r.d30]" :key="h.status + h.price" class="num" :class="h.status === 'unavailable' ? 'down' : (h.pnlPct ?? 0) >= 0 ? 'up' : 'down'">{{ h.status === 'pending' ? '…' : h.status === 'unavailable' ? 'disparu' : fmtPct(h.pnlPct, { digits: 0 }) }}</td>
          <td><span v-if="r.inWatchlist" class="badge ok">surveillé</span></td>
        </tr></tbody></table></div>
    </section>
  </div>
</template>
