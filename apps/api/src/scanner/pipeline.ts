import { SCAN_FLAG_LABELS, SCAN_STAGE2_REASONS, SCAN_STRUCTURAL_LABELS, type ScanExclusion, type ScanFlag, type ScannerSettings, type ScanStructuralCheck, type ScanTier } from '@tpm/shared';
import type { GtPool, GtTx } from '../datasources/geckoterminal/geckoterminal.source.js';

/** Fonctions pures du pipeline : chaque étage est testable avec des jeux de données figés. */

export interface PoolSnap {
  poolAddress: string; dexId: string; tokenAddress: string; quoteAddress: string; symbol: string | null; name: string | null;
  poolCreatedAt: number | null; priceUsd: number | null; fdvUsd: number | null; marketCapUsd: number | null; reserveUsd: number | null;
  volumeH1: number | null; volumeH24: number | null; pctH1: number | null; pctH24: number | null; txH1: GtTx | null; txH24: GtTx | null;
}

/** Identifie le token étudié (côté non-quote). Pool quote/quote ou paire exotique : ignoré. */
export function normalizeGtPool(p: GtPool, quoteTokens: string[]): PoolSnap | null {
  const q = new Set(quoteTokens);
  const baseIsQuote = q.has(p.baseToken), quoteIsQuote = q.has(p.quoteToken);
  if (baseIsQuote === quoteIsQuote) return null;
  // Le token étudié est presque toujours la base ; si la base est la quote, les métriques de prix ne portent pas sur le bon côté : on ignore.
  if (baseIsQuote) return null;
  return {
    poolAddress: p.address, dexId: p.dexId, tokenAddress: p.baseToken, quoteAddress: p.quoteToken, symbol: p.baseSymbol, name: p.baseName,
    poolCreatedAt: p.poolCreatedAt, priceUsd: p.priceUsd, fdvUsd: p.fdvUsd, marketCapUsd: p.marketCapUsd, reserveUsd: p.reserveUsd,
    volumeH1: p.volume.h1, volumeH24: p.volume.h24, pctH1: p.priceChange.h1, pctH24: p.priceChange.h24, txH1: p.transactions.h1, txH24: p.transactions.h24,
  };
}

/** Capitalisation retenue : market_cap si présent, sinon FDV avec drapeau explicite. Jamais de substitution silencieuse. */
export function capOf(s: PoolSnap): { cap: number | null; mcapIsFdv: boolean } {
  if (s.marketCapUsd !== null && s.marketCapUsd > 0) return { cap: s.marketCapUsd, mcapIsFdv: false };
  return { cap: s.fdvUsd, mcapIsFdv: true };
}

export function ageHours(poolCreatedAt: number | null, now: number): number | null {
  return poolCreatedAt ? (now - poolCreatedAt) / 3600 : null;
}

const ex = (code: string, observed: number | string | null, threshold: number | string | null): ScanExclusion => ({ code, label: SCAN_STAGE2_REASONS[code] ?? code, observed, threshold });

/** Étage 2 : filtres de performance, dans l'ordre. `hadPerformance` = le +100 % était là (cas proche à conserver). */
export function stage2(s: PoolSnap, ageH: number | null, perf: ScannerSettings['performance']): { passed: boolean; hadPerformance: boolean; reasons: ScanExclusion[] } {
  const reasons: ScanExclusion[] = [];
  if (s.priceUsd === null) reasons.push(ex('no_price', null, null));
  if (ageH !== null && ageH < perf.minAgeHours) reasons.push(ex('age_min', Number(ageH.toFixed(1)), perf.minAgeHours));
  if (ageH !== null && ageH > perf.maxAgeDays * 24) reasons.push(ex('age_max', Number((ageH / 24).toFixed(1)), perf.maxAgeDays));
  const hadPerformance = s.pctH24 !== null && s.pctH24 >= perf.minChangeH24Pct;
  if (!hadPerformance) reasons.push(ex('change_min', s.pctH24, perf.minChangeH24Pct));
  if (s.reserveUsd === null || s.reserveUsd < perf.minLiquidityUsd) reasons.push(ex('liquidity_min', s.reserveUsd, perf.minLiquidityUsd));
  if (s.volumeH24 === null || s.volumeH24 < perf.minVolumeH24Usd) reasons.push(ex('volume_min', s.volumeH24, perf.minVolumeH24Usd));
  const { cap, mcapIsFdv } = capOf(s);
  if (cap === null || cap > perf.maxMarketCapUsd) reasons.push(ex('mcap_max', cap === null ? null : `${Math.round(cap)}${mcapIsFdv ? ' (FDV)' : ''}`, perf.maxMarketCapUsd));
  return { passed: reasons.length === 0, hadPerformance, reasons };
}

export interface TokenFacts {
  rpcOk: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  transferFeeBps: number | null;
  gtOk: boolean;
  top10Pct: number | null;
  holdersCount: number | null;
  developerAddress: string | null;
  developerHoldingPct: number | null;
  hasWebsite: boolean;
  hasSocials: boolean;
  hasDescription: boolean;
  gtIsHoneypot: string | null;
  gtMintAuthority: 'yes' | 'no' | null;
  gtFreezeAuthority: 'yes' | 'no' | null;
  creatorTokenCount: number | null;
}

/** Étage 3 : cinq vérifications éliminatoires, toutes évaluées même après un échec (on veut voir 3/5, pas seulement le premier motif). */
export function stage3(s: PoolSnap, f: TokenFacts, st: ScannerSettings['structural']): { checks: ScanStructuralCheck[]; passed: number; total: number } {
  const { cap, mcapIsFdv } = capOf(s);
  const capLabel = mcapIsFdv ? 'FDV' : 'capitalisation';
  const volToMcap = s.volumeH24 !== null && cap ? s.volumeH24 / cap : null;
  const liqToMcap = s.reserveUsd !== null && cap ? (s.reserveUsd / cap) * 100 : null;
  const c = (code: string, passed: boolean, observed: number | string | null, threshold: number | string | null, source: string): ScanStructuralCheck => ({ code, label: SCAN_STRUCTURAL_LABELS[code] ?? code, passed, observed, threshold, source });
  const checks: ScanStructuralCheck[] = [
    c('mint_authority', !st.requireMintRevoked || (f.rpcOk && f.mintAuthority === null), f.rpcOk ? (f.mintAuthority ?? 'révoquée') : 'non vérifié', 'révoquée', 'rpc'),
    c('freeze_authority', !st.requireNoFreeze || (f.rpcOk && f.freezeAuthority === null), f.rpcOk ? (f.freezeAuthority ?? 'absente') : 'non vérifié', 'absente', 'rpc'),
    c('transfer_fee', st.allowTransferFee || !f.rpcOk || !f.transferFeeBps, f.rpcOk ? (f.transferFeeBps ? `${f.transferFeeBps / 100} %` : 'aucun') : 'non vérifié', st.allowTransferFee ? 'autorisé' : 'aucun', 'rpc'),
    c('volume_to_mcap', volToMcap !== null && volToMcap <= st.maxVolumeToMcap, volToMcap === null ? null : Number(volToMcap.toFixed(2)), `≤ ${st.maxVolumeToMcap} (${capLabel})`, 'geckoterminal'),
    c('liquidity_to_mcap', liqToMcap !== null && liqToMcap >= st.minLiquidityToMcapPct, liqToMcap === null ? null : Number(liqToMcap.toFixed(2)), `≥ ${st.minLiquidityToMcapPct} % (${capLabel})`, 'geckoterminal'),
  ];
  return { checks, passed: checks.filter((x) => x.passed).length, total: checks.length };
}

/** Étage 4 : drapeaux signalés, non éliminatoires. `verified = false` quand la donnée manque : ni levé, ni absent. */
export function stage4(s: PoolSnap, f: TokenFacts, fl: ScannerSettings['flags'], minChangeH24Pct: number): ScanFlag[] {
  const flag = (code: string, raised: boolean, verified: boolean, observed: number | string | null, threshold: number | string | null, detail: string, source: string): ScanFlag =>
    ({ code, label: SCAN_FLAG_LABELS[code] ?? code, raised: verified && raised, verified, observed, threshold, detail, source });
  const out: ScanFlag[] = [];

  out.push(f.top10Pct === null
    ? flag('concentration', false, false, null, fl.top10MaxPct, 'Répartition des détenteurs indisponible.', 'geckoterminal')
    : flag('concentration', f.top10Pct > fl.top10MaxPct, true, Number(f.top10Pct.toFixed(1)), fl.top10MaxPct, `Top 10 : ${f.top10Pct.toFixed(1)} % (seuil ${fl.top10MaxPct} %).`, 'geckoterminal'));

  if (s.txH1 && s.pctH1 !== null) {
    const ratio = s.txH1.buyers / Math.max(s.txH1.sellers, 1);
    const stagnant = Math.abs(s.pctH1) < fl.stagnantH1AbsPct;
    out.push(flag('buyer_seller_asymmetry', ratio >= fl.buyerSellerRatioMin && stagnant, true, Number(ratio.toFixed(1)), `≥ ${fl.buyerSellerRatioMin} avec prix ± ${fl.stagnantH1AbsPct} %`,
      `${s.txH1.buyers} acheteurs pour ${s.txH1.sellers} vendeurs sur 1 h, prix ${s.pctH1 >= 0 ? '+' : ''}${s.pctH1.toFixed(1)} %${ratio >= fl.buyerSellerRatioMin && stagnant ? ' : beaucoup entrent, peu sortent, le prix ne suit pas. Profil de distribution.' : '.'}`, 'geckoterminal'));
  } else out.push(flag('buyer_seller_asymmetry', false, false, null, null, 'Transactions 1 h indisponibles.', 'geckoterminal'));

  if (s.txH1 || s.txH24) {
    const r1 = s.txH1 ? s.txH1.buys / Math.max(s.txH1.buyers, 1) : 0;
    const r24 = s.txH24 ? s.txH24.buys / Math.max(s.txH24.buyers, 1) : 0;
    const r = Math.max(r1, r24);
    out.push(flag('bot_activity', r >= fl.buysPerBuyerMin, true, Number(r.toFixed(1)), fl.buysPerBuyerMin, `${r.toFixed(1)} achats par acheteur${r >= fl.buysPerBuyerMin ? ' : activité automatisée probable.' : '.'}`, 'geckoterminal'));
  } else out.push(flag('bot_activity', false, false, null, fl.buysPerBuyerMin, 'Transactions indisponibles.', 'geckoterminal'));

  out.push(f.creatorTokenCount === null
    ? flag('serial_creator', false, false, null, fl.creatorMaxTokens, 'Non vérifié : Helius absent ou créateur inconnu.', 'helius')
    : flag('serial_creator', f.creatorTokenCount > fl.creatorMaxTokens, true, f.creatorTokenCount, fl.creatorMaxTokens, `Ce wallet a déployé ${f.creatorTokenCount} token(s).`, 'helius'));

  if (s.pctH24 !== null && s.pctH1 !== null && s.pctH24 >= minChangeH24Pct) {
    const hourly = (Math.pow(1 + s.pctH24 / 100, 1 / 24) - 1) * 100;
    const raised = s.pctH1 < fl.decelerationFraction * hourly;
    out.push(flag('deceleration', raised, true, Number(s.pctH1.toFixed(2)), `≥ ${(fl.decelerationFraction * hourly).toFixed(2)} % (${fl.decelerationFraction * 100} % du rythme horaire ${hourly.toFixed(2)} %)`,
      `Rythme horaire moyen sur 24 h : +${hourly.toFixed(2)} % ; dernière heure : ${s.pctH1 >= 0 ? '+' : ''}${s.pctH1.toFixed(2)} %${raised ? '. Le mouvement ne se poursuit pas.' : '.'}`, 'geckoterminal'));
  } else out.push(flag('deceleration', false, s.pctH24 !== null && s.pctH1 !== null, s.pctH1, null, 'Sans +100 % sur 24 h, la décélération n’est pas évaluée.', 'geckoterminal'));

  out.push(!f.gtOk
    ? flag('no_metadata', false, false, null, null, 'Info token indisponible.', 'geckoterminal')
    : flag('no_metadata', !f.hasWebsite && !f.hasSocials && !f.hasDescription, true, [f.hasWebsite ? 'site' : null, f.hasSocials ? 'réseaux' : null, f.hasDescription ? 'description' : null].filter(Boolean).join(', ') || 'rien', 'au moins un', !f.hasWebsite && !f.hasSocials && !f.hasDescription ? 'Aucune métadonnée publique : ni site, ni réseau social, ni description.' : 'Métadonnées présentes.', 'geckoterminal'));

  out.push(f.developerHoldingPct === null
    ? flag('developer_holding', false, false, null, fl.developerHoldingMaxPct, 'Part du développeur indisponible.', 'geckoterminal')
    : flag('developer_holding', f.developerHoldingPct > fl.developerHoldingMaxPct, true, Number(f.developerHoldingPct.toFixed(1)), fl.developerHoldingMaxPct, `Le développeur détient ${f.developerHoldingPct.toFixed(1)} % de l’offre.`, 'geckoterminal'));

  out.push(f.gtIsHoneypot === null
    ? flag('honeypot_suspected', false, false, null, null, 'Heuristique indisponible.', 'geckoterminal')
    : flag('honeypot_suspected', f.gtIsHoneypot === 'true', true, f.gtIsHoneypot, 'false', f.gtIsHoneypot === 'true' ? 'GeckoTerminal signale un honeypot possible. Heuristique tierce, à recouper avec les autorités ci-dessus.' : 'Pas de signal honeypot.', 'geckoterminal'));

  if (f.rpcOk && f.gtOk && (f.gtMintAuthority !== null || f.gtFreezeAuthority !== null)) {
    const mintMismatch = f.gtMintAuthority !== null && (f.gtMintAuthority === 'yes') !== (f.mintAuthority !== null);
    const freezeMismatch = f.gtFreezeAuthority !== null && (f.gtFreezeAuthority === 'yes') !== (f.freezeAuthority !== null);
    out.push(flag('source_mismatch', mintMismatch || freezeMismatch, true, mintMismatch ? 'mint' : freezeMismatch ? 'freeze' : 'aucun', 'accord', mintMismatch || freezeMismatch
      ? `GeckoTerminal et le RPC ne sont pas d’accord sur l’autorité de ${mintMismatch ? 'mint' : 'freeze'}. Le RPC fait foi.` : 'Les deux sources concordent.', 'rpc'));
  } else out.push(flag('source_mismatch', false, false, null, null, 'Comparaison impossible.', 'rpc'));

  return out;
}

/** Palier de fraîcheur après relevé, selon la proximité des seuils de liquidité et de volume. */
export function tierAfter(s: PoolSnap | null, perf: ScannerSettings['performance'], d: ScannerSettings['discovery']): Exclude<ScanTier, 'retired'> {
  if (!s) return 'cold';
  const liq = (s.reserveUsd ?? 0) / Math.max(perf.minLiquidityUsd, 1);
  const vol = (s.volumeH24 ?? 0) / Math.max(perf.minVolumeH24Usd, 1);
  if (liq >= d.hotFraction && vol >= d.hotFraction) return 'hot';
  if (liq >= d.warmFraction || vol >= d.warmFraction) return 'warm';
  return 'cold';
}

/** Tri : drapeaux levés croissants, puis non vérifiés croissants, puis liquidité décroissante. Jamais par performance. */
export function sortKept<T extends { flagCount: number; unverifiedCount: number; liquidityUsd: number | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.flagCount - b.flagCount || a.unverifiedCount - b.unverifiedCount || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '< −90 %', min: -Infinity, max: -90 }, { label: '−90 à −50 %', min: -90, max: -50 }, { label: '−50 à 0 %', min: -50, max: 0 },
  { label: '0 à +100 %', min: 0, max: 100 }, { label: '+100 à +500 %', min: 100, max: 500 }, { label: '> +500 %', min: 500, max: null },
];

export function retroStats(rows: { pnlPct: number | null; status: string }[]) {
  const filled = rows.filter((r) => r.status === 'filled' && r.pnlPct !== null).map((r) => r.pnlPct as number);
  const unavailable = rows.filter((r) => r.status === 'unavailable').length;
  const compute = (vals: number[]) => ({
    medianPct: median(vals), meanPct: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    positivePct: vals.length ? (vals.filter((v) => v > 0).length / vals.length) * 100 : null,
    belowMinus50Pct: vals.length ? (vals.filter((v) => v <= -50).length / vals.length) * 100 : null,
    best: vals.length ? Math.max(...vals) : null, worst: vals.length ? Math.min(...vals) : null,
    value100Each: vals.length ? vals.reduce((a, v) => a + 100 * (1 + v / 100), 0) : null,
  });
  const withLossVals = [...filled, ...Array.from({ length: unavailable }, () => -100)];
  const histogram = BUCKETS.map((b) => ({ label: b.label, count: withLossVals.filter((v) => v >= b.min && (b.max === null || v < b.max)).length }));
  return { count: filled.length + unavailable, unavailable, withLoss: compute(withLossVals), excluding: compute(filled), histogram };
}
