import type { PairInfo } from '../datasources/types.js';

/**
 * Classement des pools d'un token (docs/05, A.2, correction du 16 septembre 2026).
 * DexScreener peut renvoyer un pool au prix aberrant (×4 000) avec une « liquidité » gonflée d'autant : trié par
 * liquidité, il devenait le pool principal, et un relevé entier partait sur un prix faux (EMBER à 80,86 $ le 15/09).
 * Référence : le prix du pool qui a le plus de volume (un pool bidon n'échange presque rien). Un pool dont le prix
 * s'écarte de plus d'un facteur 2 de cette référence est marqué aberrant et rejeté en fin de liste.
 */
export function rankPairs(pairs: PairInfo[]): PairInfo[] {
  const byLiq = (a: PairInfo, b: PairInfo) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
  const priced = pairs.filter((p) => (p.priceUsd ?? 0) > 0);
  if (priced.length < 2) return [...pairs].sort(byLiq).map((p) => ({ ...p, anomalous: false }));
  const byVolume = [...priced].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
  const ref = (byVolume[0]?.volume24hUsd ?? 0) > 0 ? (byVolume[0]!.priceUsd as number) : medianPrice(priced);
  const sane = (p: PairInfo) => {
    const price = p.priceUsd ?? 0;
    return price > 0 && price / ref <= 2 && ref / price <= 2;
  };
  const ok = pairs.filter(sane).sort(byLiq).map((p) => ({ ...p, anomalous: false }));
  const bad = pairs.filter((p) => !sane(p)).sort(byLiq).map((p) => ({ ...p, anomalous: true }));
  return [...ok, ...bad];
}

function medianPrice(pairs: PairInfo[]): number {
  const prices = pairs.map((p) => p.priceUsd as number).sort((a, b) => a - b);
  return prices[Math.floor((prices.length - 1) / 2)] as number;
}
