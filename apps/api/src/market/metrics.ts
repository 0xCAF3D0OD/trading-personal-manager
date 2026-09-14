import { LIQUIDITY_BAND_LABELS, VOLUME_BAND_LABELS, type LiquidityBand, type MarketSettings, type Momentum, type PoolType, type SourceName, type SourcedSeries, type VolumeBand } from '@tpm/shared';

/** Fonctions pures du panneau de métriques : testables sans base ni réseau. */

export interface PctWindows { m5: number | null; h1: number | null; h6: number | null; h24: number | null }

const HOURS: Record<keyof PctWindows, number> = { m5: 1 / 12, h1: 1, h6: 6, h24: 24 };

/**
 * État de dérivée : rythme horaire moyen linéaire par fenêtre.
 * La monotonie se lit sur 6 h → 1 h → 5 min ; la fenêtre 24 h est affichée pour le contexte.
 * Extinction si la séquence décroît à chaque pas (tolérance) et que les deux fenêtres courtes sont négatives ;
 * accélération si elle croît et que les deux fenêtres courtes sont positives. Description, pas prédiction.
 */
export function computeMomentum(pct: PctWindows, volume5mUsd: number | null, s: MarketSettings): Momentum {
  const rate = (k: keyof PctWindows) => (pct[k] === null ? null : pct[k]! / HOURS[k]);
  const hourlyRates = { h24: rate('h24'), h6: rate('h6'), h1: rate('h1'), m5: rate('m5') };
  const seq = [hourlyRates.h6, hourlyRates.h1, hourlyRates.m5];
  const fmt = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %/h`);
  const detail = `24 h ${fmt(hourlyRates.h24)}, 6 h ${fmt(hourlyRates.h6)}, 1 h ${fmt(hourlyRates.h1)}, 5 min ${fmt(hourlyRates.m5)} (extrapolé, très bruité)`;
  if (seq.some((v) => v === null) || hourlyRates.h24 === null) return { state: 'insufficient', hourlyRates, label: `Variations incomplètes : ${detail}` };
  if (volume5mUsd !== null && volume5mUsd < s.momentumMinVolume5mUsd) return { state: 'insufficient', hourlyRates, label: `Pas de marché sur les 5 dernières minutes (volume ${volume5mUsd.toFixed(0)} $) : ${detail}` };
  const t = s.momentumTolerancePts;
  const vals = seq as number[];
  const decreasing = vals.every((v, i) => i === 0 || v <= (vals[i - 1] as number) - t);
  const increasing = vals.every((v, i) => i === 0 || v >= (vals[i - 1] as number) + t);
  if (decreasing && (hourlyRates.m5 as number) < 0 && (hourlyRates.h1 as number) < 0) return { state: 'extinction', hourlyRates, label: `Mouvement en extinction : ${detail}` };
  if (increasing && (hourlyRates.m5 as number) > 0 && (hourlyRates.h1 as number) > 0) return { state: 'acceleration', hourlyRates, label: `Accélération en cours : ${detail}` };
  // Pas d'accélération monotone, mais le sens peut être net : le dire, sinon un débutant lit « sans tendance » pour « stable ».
  const rates = [hourlyRates.h24, hourlyRates.h6, hourlyRates.h1, hourlyRates.m5].filter((v): v is number => v !== null);
  const allDown = rates.length >= 3 && rates.every((v) => v < 0);
  const allUp = rates.length >= 3 && rates.every((v) => v > 0);
  const head = allDown ? 'Baisse régulière, sans accélération' : allUp ? 'Hausse régulière, sans accélération' : 'Sans tendance nette';
  return { state: 'none', hourlyRates, label: `${head} : ${detail}` };
}

export function priceSpreadPct(primary: number | null, secondary: number | null): number | null {
  if (primary === null || secondary === null || secondary <= 0) return null;
  return ((primary - secondary) / secondary) * 100;
}

/** La source substitue la FDV si sa capitalisation est nulle ou égale à sa FDV à 0,1 % près. */
export function sourceMcapIsFdv(mcap: number | null, fdv: number | null): boolean {
  if (mcap === null) return true;
  if (fdv === null || fdv <= 0) return false;
  return Math.abs(mcap - fdv) / fdv < 0.001;
}

export function mcapGapPct(sourceMcap: number | null, localMcap: number | null): number | null {
  if (sourceMcap === null || localMcap === null || localMcap <= 0) return null;
  return ((sourceMcap - localMcap) / localMcap) * 100;
}

export function liquidityBand(ratioPct: number | null, bands: [number, number, number]): { band: LiquidityBand | null; label: string | null } {
  if (ratioPct === null) return { band: null, label: null };
  const band: LiquidityBand = ratioPct >= bands[0] ? 'comfortable' : ratioPct >= bands[1] ? 'correct' : ratioPct >= bands[2] ? 'thin' : 'very_thin';
  return { band, label: LIQUIDITY_BAND_LABELS[band] };
}

export function volumeBand(ratio: number | null, bands: [number, number, number]): { band: VolumeBand | null; label: string | null } {
  if (ratio === null) return { band: null, label: null };
  const band: VolumeBand = ratio >= bands[0] ? 'extreme' : ratio >= bands[1] ? 'very_high' : ratio >= bands[2] ? 'sustained' : 'low';
  return { band, label: VOLUME_BAND_LABELS[band] };
}

export function poolTypeOf(dexId: string, s: MarketSettings): PoolType {
  const d = dexId.toLowerCase();
  if (s.concentratedDexIds.some((x) => d === x || d.startsWith(`${x}-`) || d.includes('clmm') || d.includes('dlmm'))) return 'concentrated';
  if (s.constantProductDexIds.some((x) => d === x)) return 'constant_product';
  return 'unknown';
}

/** Impact d'une vente de X $ dans un pool à produit constant de réserve R $ (moitié de chaque côté) : X / (R/2 + X). */
/** Perte effective d'une vente : ce que l'ordre vaut au prix de référence moins ce que la route rend, frais inclus. Jamais négative. */
export function effectiveLossPct(orderUsd: number, receivedUsd: number | null): number | null {
  if (receivedUsd === null || !(orderUsd > 0) || !Number.isFinite(receivedUsd)) return null;
  return Math.max(0, ((orderUsd - receivedUsd) / orderUsd) * 100);
}

export function constantProductImpactPct(orderUsd: number, reserveUsd: number): number | null {
  if (!(reserveUsd > 0) || !(orderUsd > 0)) return null;
  return (orderUsd / (reserveUsd / 2 + orderUsd)) * 100;
}

/** Découpe une série en groupes contigus de même source : jamais deux origines sur une même courbe. */
export function groupBySource(points: { ts: number; value: number | null; source: SourceName | null }[]): SourcedSeries[] {
  const groups: SourcedSeries[] = [];
  for (const p of points) {
    const src = p.source ?? 'unavailable';
    const last = groups[groups.length - 1];
    if (!last || last.source !== src) groups.push({ source: src, points: [] });
    (groups[groups.length - 1] as SourcedSeries).points.push({ ts: p.ts, value: p.value });
  }
  return groups;
}

export interface LiqPoint { ts: number; price: number | null; liquidity: number | null; ratioPct: number | null; poolsCount: number | null; liquidityTotal: number | null }

/**
 * Alerte retrait de liquidité, sur la série à 15 min.
 * 24 h : ratio liquidité / capi en baisse relative ≥ seuil ET prix ≥ plancher ; ou 6 h : liquidité du pool principal ≥ seuil.
 * Exclusion : si le nombre de pools a augmenté et que la liquidité totale est stable, c'est une migration, pas un retrait.
 */
export function checkLiquidityWithdrawal(now: LiqPoint, at24h: LiqPoint | null, at6h: LiqPoint | null, s: MarketSettings['liqWithdrawal']): { triggered: boolean; migration: boolean; reason: string; window: '24h' | '6h' | null } {
  const rel = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null);
  const migrated = (ref: LiqPoint | null) => !!ref && now.poolsCount !== null && ref.poolsCount !== null && now.poolsCount > ref.poolsCount
    && now.liquidityTotal !== null && ref.liquidityTotal !== null && Math.abs(rel(now.liquidityTotal, ref.liquidityTotal) ?? 100) <= s.migrationTolerancePct;

  if (at24h) {
    const ratioChange = rel(now.ratioPct, at24h.ratioPct);
    const priceChange = rel(now.price, at24h.price);
    if (ratioChange !== null && priceChange !== null && ratioChange <= -s.ratioDropPct24h && priceChange >= s.priceFloorPct) {
      const m = migrated(at24h);
      return { triggered: !m, migration: m, window: '24h', reason: m
        ? `Ratio liquidité / capi ${ratioChange.toFixed(1)} % sur 24 h, mais liquidité totale stable et pools plus nombreux : migration de liquidité, pas un retrait.`
        : `Ratio liquidité / capi ${ratioChange.toFixed(1)} % sur 24 h alors que le prix fait ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)} % : des fournisseurs de liquidité retirent leurs fonds sans que le prix ne réagisse.` };
    }
  }
  if (at6h) {
    const liqChange = rel(now.liquidity, at6h.liquidity);
    const priceChange = rel(now.price, at6h.price);
    if (liqChange !== null && priceChange !== null && liqChange <= -s.liqDropPct6h && priceChange >= s.priceFloorPct) {
      const m = migrated(at6h);
      return { triggered: !m, migration: m, window: '6h', reason: m
        ? `Liquidité du pool principal ${liqChange.toFixed(1)} % sur 6 h, mais liquidité totale stable et pools plus nombreux : migration.`
        : `Liquidité du pool principal ${liqChange.toFixed(1)} % sur 6 h alors que le prix fait ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)} %.` };
    }
  }
  return { triggered: false, migration: false, window: null, reason: 'Pas de retrait de liquidité détecté.' };
}
