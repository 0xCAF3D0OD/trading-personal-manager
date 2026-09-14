import { describe, expect, it } from 'vitest';
import type { Plan } from '@tpm/shared';
import { planVsAccount, valuePositions } from '../src/portfolio/valuation.js';

const tickers = [
  { pair: 'ZEURZUSD', altname: 'EURUSD', base: 'EUR', quote: 'USD', last: 1.10, bid: null, ask: null },
  { pair: 'SOLEUR', altname: 'SOLEUR', base: 'SOL', quote: 'EUR', last: 88, bid: null, ask: null },
  { pair: 'SOLUSD', altname: 'SOLUSD', base: 'SOL', quote: 'USD', last: 96.8, bid: null, ask: null },
  { pair: 'EMBERUSD', altname: 'EMBERUSD', base: 'EMBER', quote: 'USD', last: 0.02, bid: null, ask: null },
];
const balances = [
  { krakenCode: 'ZEUR', asset: 'EUR', state: null, balance: 100 },
  { krakenCode: 'SOL', asset: 'SOL', state: null, balance: 2 },
  { krakenCode: 'SOL.S', asset: 'SOL', state: 'staking' as const, balance: 1 },
  { krakenCode: 'EMBER', asset: 'EMBER', state: null, balance: 10_000 },
  { krakenCode: 'MYSTERY', asset: 'MYSTERY', state: null, balance: 5 },
];

describe('Valorisation du portefeuille', () => {
  it('valorise en euros et en dollars, deux prix jamais moyennés, l’inconnu reste inconnu', () => {
    const v = valuePositions({ balances, tickers, base: 'EUR', mappings: [{ asset: 'EMBER', tokenId: 7 }], onchain: new Map([[7, { tokenId: 7, symbol: 'EMBER', priceUsd: 0.019, source: 'dexscreener', fetchedAt: 1 }]]) });
    const by = Object.fromEntries(v.positions.map((p) => [p.krakenCode, p]));
    expect(by.ZEUR!.value).toBe(100);
    expect(by.ZEUR!.valueUsd).toBeCloseTo(110, 6);
    expect(by.SOL!.value).toBe(176);
    expect(by['SOL.S']!.sellable).toBe(false);
    expect(by['SOL.S']!.value).toBe(88);
    // EMBER coté seulement en dollars : l'euro est dérivé du taux EUR/USD, la source reste Kraken.
    expect(by.EMBER!.priceUsd).toBe(0.02);
    expect(by.EMBER!.priceEur).toBeCloseTo(0.02 / 1.1, 9);
    expect(by.EMBER!.onchainPriceUsd).toBe(0.019);
    expect(by.EMBER!.spreadPct).toBeCloseTo(5.263, 2);
    expect(by.EMBER!.tokenSymbol).toBe('EMBER');
    expect(by.MYSTERY!.value).toBeNull();
    expect(by.MYSTERY!.priceSource).toBe('unavailable');
    expect(v.unknownCount).toBe(1);
    expect(v.totalEur).toBeCloseTo(100 + 176 + 88 + 10_000 * (0.02 / 1.1), 6);
    // Tri par valeur décroissante : EMBER (≈ 182 €) devant SOL (176 €), l'inconnu en dernier.
    expect(v.positions.map((p) => p.krakenCode)).toEqual(['EMBER', 'SOL', 'ZEUR', 'SOL.S', 'MYSTERY']);
    expect(v.positions.find((p) => p.krakenCode === 'MYSTERY')!.sharePct).toBeNull();
  });

  it('ne relie jamais un actif à un token sans correspondance déclarée', () => {
    const v = valuePositions({ balances, tickers, base: 'USD', mappings: [], onchain: new Map() });
    expect(v.positions.every((p) => p.tokenId === null && p.onchainPriceUsd === null)).toBe(true);
    expect(v.positions.find((p) => p.krakenCode === 'ZEUR')!.value).toBeCloseTo(110, 6);
  });
});

describe('Le plan face au compte', () => {
  const plan: Plan = { id: 1, tokenId: 7, version: 2, supersedesPlanId: 1, createdAt: 1, entryPrice: 0.015, takeProfitPrice: 0.03, stopLossPrice: 0.0105, amountUsd: 150, acceptsTotalLoss: true, note: null, riskRewardRatio: 3.3, maxLossUsd: 45, isCurrent: true };
  const pos = valuePositions({ balances: [balances[3]!], tickers, base: 'USD', mappings: [{ asset: 'EMBER', tokenId: 7 }], onchain: new Map() }).positions[0]!;

  it('dit en mots l’écart de montant et la position du prix entre les deux sorties', () => {
    const r = planVsAccount(pos, plan, 'EMBER');
    expect(r.state).toBe('ok');
    expect(r.lines[0]).toMatch(/Le compte détient pour 200 \$ de EMBER ; le plan v2 en prévoyait 150 \$ \(plus de 50 \$\)/);
    expect(r.lines[1]).toContain('au-dessus de la sortie en perte');
    expect(r.lines[2]).toContain('+33,3 %');
  });

  it('bascule en avertissement près de la sortie en perte, et en risque en dessous', () => {
    const near = { ...pos, priceUsd: 0.0112 };
    expect(planVsAccount(near, plan, 'EMBER').state).toBe('warn');
    const under = { ...pos, priceUsd: 0.010 };
    const r = planVsAccount(under, plan, 'EMBER');
    expect(r.state).toBe('risk');
    expect(r.lines.some((l) => l.includes('la règle que vous vous étiez fixée est atteinte'))).toBe(true);
  });
});
