import { describe, expect, it } from 'vitest';
import { buildSummary, type SummaryInputs } from '../src/summary/build.js';
import { cexVenuesFromTickers, dexLabel } from '../src/scanner/pipeline.js';

const settings = { summaryTop10ConcentratedPct: 40, summarySlippageOrderUsd: 1000 };
const now = 1_789_000_000;

function base(): SummaryInputs {
  return {
    health: { mintAuthority: null, freezeAuthority: null, extensions: [], checkedAt: now },
    liquidity: { ratioPct: 12.4, band: 'comfortable', totalUsd: 250_000, poolsCount: 3, ts: now, source: 'dexscreener' },
    slippage: { orderUsd: 1000, impactPct: 0.42, ts: now },
    holders: { top10Pct: 23, holderCount: 12_500, truncated: false, ts: now, source: 'helius', fullTierMissing: null },
    team: { creatorKnown: true, walletsCount: 1, actionsAvailable: true, sells: 0, transfersOut: 0, lpRemovals: 0, lastActionTs: null, claimsKept: 2, claimsContradicted: 0, claimsExpired: 0, claimsPending: 0 },
    divergences: { triggered: [], evaluated: 7, insufficient: 2, computedAt: now },
  };
}

describe('Synthèse en cinq questions', () => {
  it('donne cinq réponses dans l’ordre de lecture, jamais vides, sans total', () => {
    const a = buildSummary(base(), settings);
    expect(a.map((x) => x.id)).toEqual(['trap', 'exit', 'holders', 'team', 'market']);
    for (const x of a) { expect(x.answer.length).toBeGreaterThan(10); expect(x.short.length).toBeGreaterThan(0); expect(x.purpose.length).toBeGreaterThan(20); }
    expect(a[1]!.answer).toContain('sur 3 pools');
    expect(a.map((x) => x.state)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(a[0]!.answer).toMatch(/^Non : l’équipe ne peut ni créer/);
    expect(a[1]!.answer).toMatch(/Vendre 1.000 \$ coûterait 0,4 %/); // espace fine insécable de fr-FR
    expect(a[2]!.answer).toContain('23 %');
    expect(a[3]!.answer).toContain('2 engagements tenus sur 2');
  });

  it('sain devient piège possible dès qu’un pouvoir subsiste, en le nommant', () => {
    const i = base();
    i.health = { mintAuthority: null, freezeAuthority: 'Fz111', extensions: ['transferFeeConfig'], checkedAt: now };
    const [t] = buildSummary(i, settings);
    expect(t!.state).toBe('risk');
    expect(t!.short).toBe('piège possible');
    expect(t!.answer).toBe('Oui : l’équipe peut encore geler les comptes et prélever des frais à chaque transfert.');
  });

  it('inconnu, partiel et non estimé sont dits avec leur raison', () => {
    const i = base();
    i.health = null;
    i.slippage = null;
    i.holders = { top10Pct: 61, holderCount: null, truncated: true, ts: now, source: 'rpc', fullTierMissing: 'SOLANA_RPC_URL (URL Helius)' };
    i.divergences = { triggered: [], evaluated: 7, insufficient: 7, computedAt: now };
    const [t, e, h, , m] = buildSummary(i, settings);
    expect(t!.state).toBe('unknown');
    expect(e!.answer).toContain('non estimé : cliquez sur Estimer');
    expect(h!.state).toBe('partial');
    expect(h!.missing).toBe('SOLANA_RPC_URL (URL Helius)');
    expect(m!.short).toBe('trop tôt');
  });

  it('concentration, ventes de l’équipe et contradictions font basculer l’état', () => {
    const i = base();
    i.holders!.top10Pct = 61;
    i.liquidity = { ratioPct: 1.2, band: 'very_thin', totalUsd: 4_000, poolsCount: 1, ts: now, source: 'dexscreener' };
    i.team = { ...i.team, sells: 3, claimsContradicted: 1, claimsKept: 0, claimsExpired: 0 };
    i.divergences = { triggered: ['Prix en hausse, volume en baisse', 'Retrait de liquidité'], evaluated: 7, insufficient: 0, computedAt: now };
    const [, e, h, t, m] = buildSummary(i, settings);
    expect(e!.state).toBe('risk');
    expect(e!.short).toBe('très mince');
    expect(h!.state).toBe('risk');
    expect(h!.answer).toContain('une seule vente peut faire chuter le prix');
    expect(t!.state).toBe('warn');
    expect(t!.answer).toContain('3 ventes');
    expect(t!.answer).toContain('1 contredit');
    expect(m!.state).toBe('risk');
    expect(m!.short).toBe('2 contradictions');
  });

  it('sans créateur ni portefeuille déclaré, la question 4 le dit plutôt que d’inventer', () => {
    const i = base();
    i.team = { ...i.team, creatorKnown: false, walletsCount: 0, claimsKept: 0 };
    const t = buildSummary(i, settings)[3]!;
    expect(t.state).toBe('unknown');
    expect(t.answer).toMatch(/^Créateur non identifiable/);
  });
});

describe('Plateformes d’échange du scanner', () => {
  it('ne garde des marchés CoinGecko que les plateformes centralisées, dédoublonnées et triées par volume', () => {
    const v = cexVenuesFromTickers([
      { name: 'Orca', identifier: 'orca', volumeUsd: 2_000_000, tradeUrl: null },
      { name: 'Kraken', identifier: 'kraken', volumeUsd: 300_000, tradeUrl: 'https://kraken.com/x' },
      { name: 'Binance', identifier: 'binance', volumeUsd: 1_000_000, tradeUrl: null },
      { name: 'Binance', identifier: 'binance', volumeUsd: 500_000, tradeUrl: null },
    ]);
    expect(v.map((x) => x.identifier)).toEqual(['binance', 'kraken']);
    expect(v[0]!.volumeUsd).toBe(1_500_000);
  });
  it('nomme les DEX lisiblement', () => {
    expect(dexLabel('raydium')).toBe('Raydium');
    expect(dexLabel('pumpfun')).toBe('Pump.fun');
    expect(dexLabel('some-new_dex')).toBe('Some New Dex');
  });
});
