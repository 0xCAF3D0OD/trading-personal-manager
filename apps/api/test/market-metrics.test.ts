import { describe, expect, it } from 'vitest';
import { MARKET_DEFAULTS } from '@tpm/shared';
import { checkLiquidityWithdrawal, computeMomentum, constantProductImpactPct, effectiveLossPct, groupBySource, liquidityBand, mcapGapPct, poolTypeOf, priceSpreadPct, sourceMcapIsFdv, volumeBand } from '../src/market/metrics.js';
import { insertToken, testServices } from './helpers.js';

const s = MARKET_DEFAULTS;

describe('État de dérivée', () => {
  it('6 h +16 %, 1 h −10 %, 5 min −2 % : mouvement en extinction', () => {
    const m = computeMomentum({ h24: 40, h6: 16, h1: -10, m5: -2 }, 500, s);
    expect(m.state).toBe('extinction');
    expect(m.hourlyRates.m5).toBeCloseTo(-24, 5);
    expect(m.label).toContain('extinction');
  });
  it('fenêtres courtes qui accélèrent : accélération en cours', () => {
    expect(computeMomentum({ h24: 5, h6: 10, h1: 20, m5: 3 }, 500, s).state).toBe('acceleration');
  });
  it('marché plat : sans tendance ; volume 5 min nul : insuffisant', () => {
    expect(computeMomentum({ h24: 0.3, h6: -0.2, h1: 0.1, m5: 0 }, 500, s).state).toBe('none');
    expect(computeMomentum({ h24: 40, h6: 16, h1: -10, m5: -2 }, 0, s).state).toBe('insufficient');
    expect(computeMomentum({ h24: 40, h6: null, h1: -10, m5: -2 }, 500, s).state).toBe('insufficient');
  });
});

describe('Prix, capitalisation, bandes', () => {
  it('écart de prix et substitution de FDV', () => {
    expect(priceSpreadPct(1.02, 1)).toBeCloseTo(2, 5);
    expect(priceSpreadPct(1, null)).toBeNull();
    expect(sourceMcapIsFdv(null, 100)).toBe(true);
    expect(sourceMcapIsFdv(100, 100.05)).toBe(true);
    expect(sourceMcapIsFdv(90, 100)).toBe(false);
    expect(mcapGapPct(107, 100)).toBeCloseTo(7, 5);
  });
  it('bandes de liquidité et de volume', () => {
    expect(liquidityBand(12, s.liquidityBands).band).toBe('comfortable');
    expect(liquidityBand(6, s.liquidityBands).band).toBe('correct');
    expect(liquidityBand(3, s.liquidityBands).band).toBe('thin');
    expect(liquidityBand(1.5, s.liquidityBands).band).toBe('very_thin');
    expect(liquidityBand(null, s.liquidityBands).band).toBeNull();
    expect(volumeBand(1.2, s.volumeBands).band).toBe('extreme');
    expect(volumeBand(0.05, s.volumeBands).band).toBe('low');
  });
  it('type de pool et formule produit constant', () => {
    expect(poolTypeOf('raydium', s)).toBe('constant_product');
    expect(poolTypeOf('raydium-clmm', s)).toBe('concentrated');
    expect(poolTypeOf('meteora-dlmm', s)).toBe('concentrated');
    expect(poolTypeOf('orca', s)).toBe('concentrated');
    expect(poolTypeOf('inconnu', s)).toBe('unknown');
    expect(constantProductImpactPct(1_000, 100_000)).toBeCloseTo(1.96, 2);
    expect(constantProductImpactPct(10_000, 100_000)).toBeCloseTo(16.67, 2);
    expect(constantProductImpactPct(10, 0)).toBeNull();
  });
});

describe('Retrait de liquidité', () => {
  const cfg = s.liqWithdrawal;
  const pt = (o: Partial<Parameters<typeof checkLiquidityWithdrawal>[0]>) => ({ ts: 0, price: 1, liquidity: 60_000, ratioPct: 6, poolsCount: 1, liquidityTotal: 60_000, ...o });
  it('ratio 6 % → 4,5 % en 24 h avec prix +1 % : alerte', () => {
    const r = checkLiquidityWithdrawal(pt({ ratioPct: 4.5, price: 1.01 }), pt({}), null, cfg);
    expect(r.triggered).toBe(true);
    expect(r.window).toBe('24h');
  });
  it('même baisse avec prix −12 % : pas d’alerte, le marché a réagi', () => {
    expect(checkLiquidityWithdrawal(pt({ ratioPct: 4.5, price: 0.88 }), pt({}), null, cfg).triggered).toBe(false);
  });
  it('liquidité migrée vers un nouveau pool à total constant : information, pas alerte', () => {
    const r = checkLiquidityWithdrawal(pt({ ratioPct: 4.5, liquidity: 45_000, poolsCount: 2, liquidityTotal: 61_000 }), pt({}), null, cfg);
    expect(r.triggered).toBe(false);
    expect(r.migration).toBe(true);
  });
  it('fenêtre 6 h : liquidité du pool −15 % avec prix stable', () => {
    const r = checkLiquidityWithdrawal(pt({ liquidity: 50_000, ratioPct: 5, liquidityTotal: 50_000 }), null, pt({}), cfg);
    expect(r.triggered).toBe(true);
    expect(r.window).toBe('6h');
  });
});

describe('Intégrité des courbes', () => {
  it('groupe les points par source contiguë, jamais un tableau unique', () => {
    const g = groupBySource([
      { ts: 1, value: 1, source: 'dexscreener' }, { ts: 2, value: 2, source: 'dexscreener' },
      { ts: 3, value: 3, source: 'jupiter' }, { ts: 4, value: 4, source: 'dexscreener' },
    ]);
    expect(g.map((x) => [x.source, x.points.length])).toEqual([['dexscreener', 2], ['jupiter', 1], ['dexscreener', 1]]);
  });
});

describe('Nouvelles divergences', () => {
  function seed(db: ReturnType<typeof testServices>['db'], tokenId: number, days: number, fn: (i: number) => { price: number; liq: number; mcap: number; vol: number; volSrc: string; supply: number }) {
    const now = Math.floor(Date.now() / 1000);
    for (let i = days; i >= 0; i--) {
      const ts = now - i * 86400 + 60;
      const v = fn(days - i);
      db.prepare(`INSERT INTO market_snapshots (token_id, ts, price_usd, price_source, market_cap_usd, liquidity_usd, volume_24h_usd, volume_source, liquidity_to_mcap_pct, supply_circ, supply_net, supply_source)
        VALUES (?, ?, ?, 'dexscreener', ?, ?, ?, ?, ?, ?, ?, 'rpc')`)
        .run(tokenId, ts, v.price, v.mcap, v.liq, v.vol, v.volSrc, (v.liq / v.mcap) * 100, v.supply, v.supply);
    }
  }
  it('retrait de liquidité : ratio −25 % avec prix stable → déclenchée', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    seed(db, tokenId, 8, (i) => ({ price: 1, liq: 60_000 - i * 2_000, mcap: 1_000_000, vol: 100_000, volSrc: 'dexscreener', supply: 1_000_000 }));
    const d = services.divergences.compute(tokenId);
    expect(d.find((x) => x.id === 'liquidity_withdrawal')!.status).toBe('triggered');
  });
  it('hausse non confirmée : volume −40 % et prix +30 % → déclenchée ; changement de source → insuffisant', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    seed(db, tokenId, 8, (i) => ({ price: 1 + i * 0.04, liq: 60_000, mcap: 1_000_000, vol: 100_000 - i * 5_500, volSrc: 'dexscreener', supply: 1_000_000 }));
    expect(services.divergences.compute(tokenId).find((x) => x.id === 'unconfirmed_rise')!.status).toBe('triggered');
    const t2 = insertToken(db, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    seed(db, t2, 8, (i) => ({ price: 1 + i * 0.04, liq: 60_000, mcap: 1_000_000, vol: 100_000 - i * 5_500, volSrc: i < 4 ? 'jupiter' : 'dexscreener', supply: 1_000_000 }));
    // Les points « jupiter » sont ignorés : seule la source dominante est comparée, sur 4 jours seulement.
    const r = services.divergences.compute(t2).find((x) => x.id === 'unconfirmed_rise')!;
    expect(r.seriesA.points.filter((p) => p.value !== null).length).toBeLessThan(9);
  });
  it('burn annoncé sans baisse d’offre → déclenchée ; avec baisse → ok', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const now = Math.floor(Date.now() / 1000);
    seed(db, tokenId, 8, () => ({ price: 1, liq: 60_000, mcap: 1_000_000, vol: 100_000, volSrc: 'dexscreener', supply: 1_000_000 }));
    services.claims.create(tokenId, { text: 'Burn of 5% of supply this week', publishedAt: now - 5 * 86400, type: 'tokenomics', subtype: 'burn', origin: 'manual' });
    expect(services.divergences.compute(tokenId).find((x) => x.id === 'announced_burn_no_supply_change')!.status).toBe('triggered');
    const t2 = insertToken(db, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    seed(db, t2, 8, (i) => ({ price: 1, liq: 60_000, mcap: 1_000_000, vol: 100_000, volSrc: 'dexscreener', supply: 1_000_000 - i * 8_000 }));
    services.claims.create(t2, { text: 'Burn of 5% of supply this week', publishedAt: now - 5 * 86400, type: 'tokenomics', subtype: 'burn', origin: 'manual' });
    expect(services.divergences.compute(t2).find((x) => x.id === 'announced_burn_no_supply_change')!.status).toBe('ok');
  });
  it('les alertes structurelles incluent écart de prix et retrait de liquidité', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    services.alerts.ensureDivergenceAlerts(tokenId);
    const types = services.alerts.list(tokenId).map((a) => a.type);
    expect(types).toContain('liq_withdrawal');
    expect(types).toContain('price_spread');
    expect(types).toContain('div_liquidity_withdrawal');
    expect(types.length).toBe(9);
  });
});

describe('Perte effective et libellé de dérivée', () => {
  it('lit la perte dans ce que la route rend, jamais négative', () => {
    expect(effectiveLossPct(1000, 997.21)).toBeCloseTo(0.279, 3);
    expect(effectiveLossPct(1000, 1002)).toBe(0);
    expect(effectiveLossPct(1000, null)).toBeNull();
  });
  it('dit « baisse régulière » quand toutes les fenêtres baissent sans accélération', () => {
    const s = MARKET_DEFAULTS;
    // Toutes les fenêtres baissent, sans monotonie 6 h → 1 h → 5 min : ni extinction ni accélération, mais le sens est net.
    expect(computeMomentum({ h24: -10, h6: -1, h1: -0.5, m5: -0.02 }, 500, s).label).toMatch(/^Baisse régulière/);
    expect(computeMomentum({ h24: 0.3, h6: -0.2, h1: 0.1, m5: 0 }, 500, s).label).toMatch(/^Sans tendance nette/);
  });
});
