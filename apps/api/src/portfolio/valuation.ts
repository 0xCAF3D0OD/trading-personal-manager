import type { Plan, PlanVsAccount, PortfolioPosition, SourceName } from '@tpm/shared';
import { FIAT, type KrakenBalance, type KrakenTicker } from '../datasources/kraken/kraken.source.js';

/**
 * Valorisation (docs/06, C.2) : fonctions pures. Deux prix jamais moyennés : Kraken (là où l'actif est détenu)
 * et on-chain (DexScreener) pour les tokens surveillés. Ce qui n'a pas de prix est dit « inconnu », pas estimé.
 */
export interface OnchainPrice { tokenId: number; symbol: string | null; priceUsd: number | null; source: SourceName; fetchedAt: number | null }
export interface ValuationInputs {
  balances: KrakenBalance[];
  tickers: KrakenTicker[];
  base: 'EUR' | 'USD';
  mappings: { asset: string; tokenId: number }[];
  onchain: Map<number, OnchainPrice>;
}

function last(tickers: KrakenTicker[], base: string, quote: string): number | null {
  return tickers.find((t) => t.base === base && t.quote === quote)?.last ?? null;
}

export function valuePositions(i: ValuationInputs): { positions: PortfolioPosition[]; totalEur: number | null; totalUsd: number | null; unknownCount: number } {
  // Taux EUR/USD : Kraken cote la paire EUR/USD (dollars par euro).
  const usdPerEur = last(i.tickers, 'EUR', 'USD');
  const eurToUsd = (v: number | null) => (v === null || usdPerEur === null ? null : v * usdPerEur);
  const usdToEur = (v: number | null) => (v === null || usdPerEur === null ? null : v / usdPerEur);
  const mapByAsset = new Map(i.mappings.map((m) => [m.asset.toUpperCase(), m.tokenId]));

  const positions: PortfolioPosition[] = [];
  for (const b of i.balances) {
    let priceEur: number | null = null;
    let priceUsd: number | null = null;
    let priceSource: SourceName = 'unavailable';
    if (b.asset === 'EUR') { priceEur = 1; priceUsd = eurToUsd(1); priceSource = 'kraken'; }
    else if (b.asset === 'USD') { priceUsd = 1; priceEur = usdToEur(1); priceSource = 'kraken'; }
    else if (FIAT.has(b.asset)) {
      // Autre monnaie : EUR/<fiat> si Kraken la cote (unités de <fiat> par euro).
      const perEur = last(i.tickers, 'EUR', b.asset);
      priceEur = perEur ? 1 / perEur : null; priceUsd = eurToUsd(priceEur); priceSource = priceEur !== null ? 'kraken' : 'unavailable';
    } else {
      priceEur = last(i.tickers, b.asset, 'EUR');
      priceUsd = last(i.tickers, b.asset, 'USD');
      if (priceEur === null && priceUsd !== null) priceEur = usdToEur(priceUsd);
      if (priceUsd === null && priceEur !== null) priceUsd = eurToUsd(priceEur);
      priceSource = priceEur !== null || priceUsd !== null ? 'kraken' : 'unavailable';
    }
    const tokenId = mapByAsset.get(b.asset.toUpperCase()) ?? null;
    const oc = tokenId !== null ? i.onchain.get(tokenId) ?? null : null;
    const onchainPriceUsd = oc?.priceUsd ?? null;
    const spreadPct = onchainPriceUsd && priceUsd !== null ? ((priceUsd - onchainPriceUsd) / onchainPriceUsd) * 100 : null;
    const valueEur = priceEur === null ? null : b.balance * priceEur;
    const valueUsd = priceUsd === null ? null : b.balance * priceUsd;
    positions.push({
      asset: b.asset, krakenCode: b.krakenCode, state: b.state, sellable: b.state === null, balance: b.balance,
      price: i.base === 'EUR' ? priceEur : priceUsd, priceEur, priceUsd, priceSource,
      onchainPriceUsd, onchainSource: oc ? oc.source : null, onchainFetchedAt: oc?.fetchedAt ?? null, spreadPct,
      value: i.base === 'EUR' ? valueEur : valueUsd, valueEur, valueUsd, sharePct: null,
      tokenId, tokenSymbol: oc?.symbol ?? null,
    });
  }
  const known = positions.filter((p) => p.value !== null);
  const totalEur = known.length ? known.reduce((n, p) => n + (p.valueEur ?? 0), 0) : null;
  const totalUsd = known.length ? known.reduce((n, p) => n + (p.valueUsd ?? 0), 0) : null;
  const total = i.base === 'EUR' ? totalEur : totalUsd;
  for (const p of positions) p.sharePct = total && p.value !== null ? (p.value / total) * 100 : null;
  positions.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.asset.localeCompare(b.asset));
  return { positions, totalEur, totalUsd, unknownCount: positions.length - known.length };
}

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pct = (v: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)} %`;
const money = (v: number, cur: 'EUR' | 'USD') => `${fr.format(v)} ${cur === 'EUR' ? '€' : '$'}`;

/**
 * Le plan face au compte (docs/06, C.4) : des phrases, jamais une action.
 * Le plan est en dollars (prix et montant engagé) ; on compare en dollars, avec le prix Kraken en dollars.
 */
export function planVsAccount(position: PortfolioPosition, plan: Plan, symbol: string): PlanVsAccount {
  const lines: string[] = [];
  let state: PlanVsAccount['state'] = 'info';
  if (position.valueUsd !== null) {
    const diff = position.valueUsd - plan.amountUsd;
    lines.push(`Le compte détient pour ${money(position.valueUsd, 'USD')} de ${symbol}${position.state ? ' (dont une part non vendable immédiatement)' : ''} ; le plan v${plan.version} en prévoyait ${money(plan.amountUsd, 'USD')}${Math.abs(diff) >= 1 ? ` (${diff > 0 ? 'plus' : 'moins'} de ${money(Math.abs(diff), 'USD')})` : ''}.`);
  } else lines.push(`Valeur en dollars inconnue : Kraken ne cote pas ${symbol} contre l’euro ou le dollar.`);
  const p = position.priceUsd;
  if (p !== null) {
    const toSl = ((p - plan.stopLossPrice) / p) * 100;
    const toTp = ((plan.takeProfitPrice - p) / p) * 100;
    if (p <= plan.stopLossPrice) { state = 'risk'; lines.push(`Le prix Kraken (${p.toPrecision(4)} $) est sous la sortie en perte du plan (${plan.stopLossPrice} $) : la règle que vous vous étiez fixée est atteinte.`); }
    else if (toSl <= 10) { state = 'warn'; lines.push(`Le prix Kraken (${p.toPrecision(4)} $) est à ${pct(toSl)} de la sortie en perte (${plan.stopLossPrice} $).`); }
    else if (p >= plan.takeProfitPrice) { state = 'ok'; lines.push(`Le prix Kraken (${p.toPrecision(4)} $) dépasse la sortie en gain du plan (${plan.takeProfitPrice} $).`); }
    else { state = 'ok'; lines.push(`Le prix Kraken (${p.toPrecision(4)} $) est à ${pct(toSl)} au-dessus de la sortie en perte et à ${pct(toTp)} sous la sortie en gain.`); }
    const vsEntry = ((p - plan.entryPrice) / plan.entryPrice) * 100;
    lines.push(`Par rapport au prix d’entrée du plan (${plan.entryPrice} $) : ${vsEntry >= 0 ? '+' : ''}${pct(vsEntry)}.`);
  }
  if (position.spreadPct !== null && Math.abs(position.spreadPct) >= 2) lines.push(`Écart entre Kraken et la chaîne : ${position.spreadPct >= 0 ? '+' : ''}${pct(position.spreadPct)}. Les deux prix sont affichés, jamais moyennés.`);
  return { tokenId: plan.tokenId, symbol, planVersion: plan.version, state, lines };
}
