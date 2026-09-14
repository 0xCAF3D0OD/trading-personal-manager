import { describe, expect, it } from 'vitest';
import { SCANNER_DEFAULTS } from '@tpm/shared';
import { parsePools, type GtPool } from '../src/datasources/geckoterminal/geckoterminal.source.js';
import { capOf, median, normalizeGtPool, retroStats, sortKept, stage2, stage3, stage4, tierAfter, type PoolSnap, type TokenFacts } from '../src/scanner/pipeline.js';

const S = SCANNER_DEFAULTS;
const SOL = 'So11111111111111111111111111111111111111112';
const now = Math.floor(Date.now() / 1000);

function pool(o: Partial<GtPool> = {}): GtPool {
  return {
    address: 'POOL1', dexId: 'pumpswap', name: 'EMB / SOL', baseToken: 'MINT1', quoteToken: SOL, baseSymbol: 'EMB', baseName: 'Ember',
    poolCreatedAt: now - 30 * 3600, priceUsd: 0.004, fdvUsd: 3_120_000, marketCapUsd: 3_000_000, reserveUsd: 92_000,
    priceChange: { m5: 0.2, h1: 4, h6: 40, h24: 187 }, volume: { m5: 500, h1: 20_000, h6: 100_000, h24: 410_000 },
    transactions: { h1: { buys: 300, sells: 190, buyers: 128, sellers: 61 }, h24: { buys: 4_900, sells: 4_300, buyers: 1_900, sellers: 1_100 } },
    ...o,
  };
}
function snap(o: Partial<GtPool> = {}): PoolSnap { return normalizeGtPool(pool(o), S.discovery.quoteTokens)!; }
function facts(o: Partial<TokenFacts> = {}): TokenFacts {
  return { rpcOk: true, mintAuthority: null, freezeAuthority: null, transferFeeBps: null, gtOk: true, top10Pct: 22, holdersCount: 4_000, developerAddress: 'DEV', developerHoldingPct: 2,
    hasWebsite: true, hasSocials: true, hasDescription: true, gtIsHoneypot: 'false', gtMintAuthority: 'no', gtFreezeAuthority: 'no', creatorTokenCount: 1, ...o };
}

describe('Étage 1 : normalisation', () => {
  it('identifie le token côté non-quote et ignore les pools SOL/USDC', () => {
    expect(snap().tokenAddress).toBe('MINT1');
    expect(normalizeGtPool(pool({ baseToken: SOL, quoteToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }), S.discovery.quoteTokens)).toBeNull();
    expect(normalizeGtPool(pool({ baseToken: 'A', quoteToken: 'B' }), S.discovery.quoteTokens)).toBeNull();
  });
  it('lit une réponse JSON:API GeckoTerminal', () => {
    const r = { data: [{ id: 'solana_P', attributes: { address: 'P', name: 'X / SOL', pool_created_at: '2026-09-12T10:00:00Z', base_token_price_usd: '0.01', fdv_usd: '1000000', market_cap_usd: null, reserve_in_usd: '60000', price_change_percentage: { h1: '3.5', h24: '150' }, volume_usd: { h24: '200000' }, transactions: { h1: { buys: 10, sells: 5, buyers: 8, sellers: 4 } } },
      relationships: { base_token: { data: { id: 'solana_M' } }, quote_token: { data: { id: `solana_${SOL}` } }, dex: { data: { id: 'raydium' } } } }],
      included: [{ id: 'solana_M', attributes: { symbol: 'X', name: 'Xtoken' } }] };
    const p = parsePools(r)[0]!;
    expect(p.baseToken).toBe('M'); expect(p.dexId).toBe('raydium'); expect(p.priceChange.h24).toBe(150); expect(p.marketCapUsd).toBeNull(); expect(p.baseSymbol).toBe('X');
    expect(p.transactions.h1?.buyers).toBe(8);
  });
});

describe('Étage 2 : performance', () => {
  it('token propre : passe', () => {
    const r = stage2(snap(), 30, S.performance);
    expect(r.passed).toBe(true);
    expect(r.hadPerformance).toBe(true);
  });
  it('market_cap null : filtré sur la FDV avec drapeau', () => {
    const s = snap({ marketCapUsd: null, fdvUsd: 60_000_000 });
    expect(capOf(s)).toEqual({ cap: 60_000_000, mcapIsFdv: true });
    const r = stage2(s, 30, S.performance);
    expect(r.passed).toBe(false);
    expect(r.reasons[0]!.code).toBe('mcap_max');
    expect(String(r.reasons[0]!.observed)).toContain('FDV');
  });
  it('trop récent, trop ancien, sans performance, illiquide', () => {
    expect(stage2(snap(), 3, S.performance).reasons.map((x) => x.code)).toContain('age_min');
    expect(stage2(snap(), 40 * 24, S.performance).reasons.map((x) => x.code)).toContain('age_max');
    const r = stage2(snap({ priceChange: { m5: 0, h1: 0, h6: 0, h24: 40 } }), 30, S.performance);
    expect(r.hadPerformance).toBe(false);
    expect(stage2(snap({ reserveUsd: 20_000 }), 30, S.performance).reasons.map((x) => x.code)).toEqual(['liquidity_min']);
  });
});

describe('Étage 3 : structurel', () => {
  it('token propre : 5/5', () => {
    expect(stage3(snap(), facts(), S.structural).passed).toBe(5);
  });
  it('autorité de mint présente : 4/5, tous les tests quand même évalués', () => {
    const r = stage3(snap(), facts({ mintAuthority: 'ADDR' }), S.structural);
    expect(r.passed).toBe(4);
    expect(r.checks).toHaveLength(5);
    expect(r.checks.find((c) => c.code === 'mint_authority')!.passed).toBe(false);
  });
  it('frais de transfert : exclu, puis accepté si autorisé', () => {
    expect(stage3(snap(), facts({ transferFeeBps: 200 }), S.structural).checks.find((c) => c.code === 'transfer_fee')!.passed).toBe(false);
    expect(stage3(snap(), facts({ transferFeeBps: 200 }), { ...S.structural, allowTransferFee: true }).checks.find((c) => c.code === 'transfer_fee')!.passed).toBe(true);
  });
  it('volume / capi 7 : exclu ; 4,9 : gardé ; liquidité 1,5 % : exclu', () => {
    expect(stage3(snap({ volume: { m5: 0, h1: 0, h6: 0, h24: 21_000_000 } }), facts(), S.structural).checks.find((c) => c.code === 'volume_to_mcap')!.passed).toBe(false);
    expect(stage3(snap({ volume: { m5: 0, h1: 0, h6: 0, h24: 14_700_000 } }), facts(), S.structural).checks.find((c) => c.code === 'volume_to_mcap')!.passed).toBe(true);
    expect(stage3(snap({ reserveUsd: 45_000 }), facts(), S.structural).checks.find((c) => c.code === 'liquidity_to_mcap')!.passed).toBe(false);
  });
  it('RPC indisponible : les vérifications d’autorité échouent, pas de faux « révoquée »', () => {
    const r = stage3(snap(), facts({ rpcOk: false }), S.structural);
    expect(r.checks.find((c) => c.code === 'mint_authority')!.passed).toBe(false);
    expect(r.checks.find((c) => c.code === 'mint_authority')!.observed).toBe('non vérifié');
  });
});

describe('Étage 4 : drapeaux', () => {
  it('token propre : zéro drapeau levé, tout vérifié', () => {
    const f = stage4(snap(), facts(), S.flags, S.performance.minChangeH24Pct);
    expect(f.filter((x) => x.raised)).toHaveLength(0);
    expect(f.every((x) => x.verified)).toBe(true);
  });
  it('asymétrie 200 acheteurs / 20 vendeurs et prix +1 % : drapeau ; même ratio avec prix +40 % : pas de drapeau', () => {
    const a = stage4(snap({ transactions: { h1: { buys: 300, sells: 30, buyers: 200, sellers: 20 }, h24: null }, priceChange: { m5: 0, h1: 1, h6: 0, h24: 187 } }), facts(), S.flags, 100);
    expect(a.find((x) => x.code === 'buyer_seller_asymmetry')!.raised).toBe(true);
    const b = stage4(snap({ transactions: { h1: { buys: 300, sells: 30, buyers: 200, sellers: 20 }, h24: null }, priceChange: { m5: 0, h1: 40, h6: 0, h24: 187 } }), facts(), S.flags, 100);
    expect(b.find((x) => x.code === 'buyer_seller_asymmetry')!.raised).toBe(false);
  });
  it('décélération : h24 +300 % et h1 −2 % : drapeau ; h1 +8 % : pas de drapeau', () => {
    const a = stage4(snap({ priceChange: { m5: 0, h1: -2, h6: 0, h24: 300 } }), facts(), S.flags, 100);
    expect(a.find((x) => x.code === 'deceleration')!.raised).toBe(true);
    const b = stage4(snap({ priceChange: { m5: 0, h1: 8, h6: 0, h24: 300 } }), facts(), S.flags, 100);
    expect(b.find((x) => x.code === 'deceleration')!.raised).toBe(false);
  });
  it('sans Helius : créateur non vérifié, ni levé ni absent', () => {
    const f = stage4(snap(), facts({ creatorTokenCount: null }), S.flags, 100).find((x) => x.code === 'serial_creator')!;
    expect(f.verified).toBe(false);
    expect(f.raised).toBe(false);
  });
  it('bots, métadonnées absentes, part du développeur, honeypot, désaccord de sources', () => {
    const f = stage4(snap({ transactions: { h1: { buys: 800, sells: 10, buyers: 100, sellers: 5 }, h24: null } }),
      facts({ hasWebsite: false, hasSocials: false, hasDescription: false, developerHoldingPct: 14, gtIsHoneypot: 'true', gtMintAuthority: 'yes' }), S.flags, 100);
    const raised = f.filter((x) => x.raised).map((x) => x.code);
    expect(raised).toEqual(expect.arrayContaining(['bot_activity', 'no_metadata', 'developer_holding', 'honeypot_suspected', 'source_mismatch']));
  });
});

describe('Étage 5 : tri, paliers, rétrospective', () => {
  it('trie par drapeaux croissants quelle que soit la performance', () => {
    const r = sortKept([{ id: 'c', flagCount: 2, unverifiedCount: 0, liquidityUsd: 900_000 }, { id: 'a', flagCount: 0, unverifiedCount: 1, liquidityUsd: 10_000 }, { id: 'b', flagCount: 1, unverifiedCount: 0, liquidityUsd: 500_000 }, { id: 'a2', flagCount: 0, unverifiedCount: 0, liquidityUsd: 5_000 }]);
    expect(r.map((x) => x.id)).toEqual(['a2', 'a', 'b', 'c']);
  });
  it('paliers : chaud, tiède, froid', () => {
    expect(tierAfter(snap(), S.performance, S.discovery)).toBe('hot');
    expect(tierAfter(snap({ reserveUsd: 4_000, volume: { m5: 0, h1: 0, h6: 0, h24: 8_000 } }), S.performance, S.discovery)).toBe('warm');
    expect(tierAfter(snap({ reserveUsd: 1_000, volume: { m5: 0, h1: 0, h6: 0, h24: 1_000 } }), S.performance, S.discovery)).toBe('cold');
    expect(tierAfter(null, S.performance, S.discovery)).toBe('cold');
  });
  it('rétrospective : médiane dans les deux modes, un token indisponible compté à −100 %', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
    const st = retroStats([{ pnlPct: 400, status: 'filled' }, { pnlPct: -60, status: 'filled' }, { pnlPct: -80, status: 'filled' }, { pnlPct: 10, status: 'filled' }, { pnlPct: null, status: 'unavailable' }]);
    expect(st.count).toBe(5);
    expect(st.excluding.medianPct).toBe(-25);
    expect(st.withLoss.medianPct).toBe(-60);
    expect(st.withLoss.meanPct).toBeCloseTo(34, 5);
    expect(st.histogram.find((h) => h.label === '< −90 %')!.count).toBe(1);
    expect(st.withLoss.value100Each).toBeCloseTo(670, 5);
  });
});
