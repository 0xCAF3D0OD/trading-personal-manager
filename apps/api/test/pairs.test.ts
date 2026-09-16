import { describe, expect, it } from 'vitest';
import type { PairInfo } from '../src/datasources/types.js';
import { rankPairs } from '../src/market/pairs.js';

const pair = (o: Partial<PairInfo>): PairInfo => ({
  dexId: 'raydium', pairAddress: 'P', url: null, priceUsd: 0.02, priceChange: { m5: null, h1: null, h6: null, h24: null },
  volume24hUsd: 1000, volumeM5Usd: null, liquidityUsd: 100_000, fdvUsd: null, marketCapUsd: null, pairCreatedAt: null, baseSymbol: 'EMBER', baseName: null, anomalous: false, ...o,
});

describe('Classement des pools', () => {
  it('rejette en queue un pool au prix aberrant même si sa « liquidité » est la plus grosse (cas EMBER du 15/09)', () => {
    const ranked = rankPairs([
      pair({ pairAddress: 'bidon', priceUsd: 80.86, liquidityUsd: 27_121_214, volume24hUsd: 120 }),
      pair({ pairAddress: 'main', priceUsd: 0.0202, liquidityUsd: 657_705, volume24hUsd: 2_800_000 }),
      pair({ pairAddress: 'p2', priceUsd: 0.0199, liquidityUsd: 180_000, volume24hUsd: 300_000 }),
    ]);
    expect(ranked.map((p) => p.pairAddress)).toEqual(['main', 'p2', 'bidon']);
    expect(ranked[0]!.anomalous).toBe(false);
    expect(ranked[2]!.anomalous).toBe(true);
  });

  it('garde l’ordre par liquidité quand tous les prix concordent, et tolère un seul pool', () => {
    const ranked = rankPairs([pair({ pairAddress: 'a', liquidityUsd: 10 }), pair({ pairAddress: 'b', liquidityUsd: 50, priceUsd: 0.021 })]);
    expect(ranked.map((p) => p.pairAddress)).toEqual(['b', 'a']);
    expect(ranked.every((p) => !p.anomalous)).toBe(true);
    expect(rankPairs([pair({ pairAddress: 'seul', priceUsd: 80 })]).map((p) => p.anomalous)).toEqual([false]);
  });

  it('sans volume nulle part, la médiane des prix sert de référence', () => {
    const ranked = rankPairs([
      pair({ pairAddress: 'x', priceUsd: 5, liquidityUsd: 9_000_000, volume24hUsd: null }),
      pair({ pairAddress: 'y', priceUsd: 0.02, liquidityUsd: 100, volume24hUsd: null }),
      pair({ pairAddress: 'z', priceUsd: 0.021, liquidityUsd: 90, volume24hUsd: null }),
    ]);
    expect(ranked[0]!.pairAddress).toBe('y');
    expect(ranked.find((p) => p.pairAddress === 'x')!.anomalous).toBe(true);
  });
});
