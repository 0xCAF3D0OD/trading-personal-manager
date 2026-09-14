import { z } from 'zod';

/** Défauts versionnés du module métriques de marché. Incrémenter la version à chaque changement de valeur. */
export const MARKET_DEFAULTS_VERSION = 1;

export const MarketSettings = z.object({
  priceSpreadWarnPct: z.number().min(0.1).max(50),
  priceSpreadAlertConsecutive: z.number().int().min(1).max(20),
  momentumTolerancePts: z.number().min(0).max(10),
  momentumMinVolume5mUsd: z.number().min(0),
  mcapGapWarnPct: z.number().min(0.1).max(100),
  /** Bornes décroissantes en % : [confortable ≥, correcte ≥, mince ≥], en dessous = très mince */
  liquidityBands: z.tuple([z.number(), z.number(), z.number()]),
  slippageOrderSizesUsd: z.array(z.number().positive()).min(1).max(5),
  liqWithdrawal: z.object({
    ratioDropPct24h: z.number().min(1).max(100),
    liqDropPct6h: z.number().min(1).max(100),
    priceFloorPct: z.number().min(-100).max(0),
    migrationTolerancePct: z.number().min(0).max(50),
    cooldownS: z.number().int().min(60),
  }),
  /** Bornes décroissantes : [extrême ≥, très élevée ≥, soutenue ≥], en dessous = faible */
  volumeBands: z.tuple([z.number(), z.number(), z.number()]),
  divergences: z.object({
    liquidity_withdrawal: z.object({ ratioDropPct: z.number(), priceFloorPct: z.number() }),
    unconfirmed_rise: z.object({ volumeDropPct: z.number(), priceRisePct: z.number() }),
    announced_burn_no_supply_change: z.object({ maxSupplyDropPct: z.number() }),
  }),
  /** dexId DexScreener considérés à produit constant (formule x·y = k applicable en repli) */
  constantProductDexIds: z.array(z.string()),
  /** dexId considérés à liquidité concentrée : la formule est fausse, pas approximative */
  concentratedDexIds: z.array(z.string()),
  slippageCacheS: z.number().int().min(30).max(600),
});
export type MarketSettings = z.infer<typeof MarketSettings>;

export const MARKET_DEFAULTS: MarketSettings = {
  priceSpreadWarnPct: 2,
  priceSpreadAlertConsecutive: 3,
  momentumTolerancePts: 0.5,
  momentumMinVolume5mUsd: 50,
  mcapGapWarnPct: 5,
  liquidityBands: [10, 5, 2],
  slippageOrderSizesUsd: [200, 1000, 10000],
  liqWithdrawal: { ratioDropPct24h: 20, liqDropPct6h: 15, priceFloorPct: -2, migrationTolerancePct: 5, cooldownS: 6 * 3600 },
  volumeBands: [1, 0.3, 0.1],
  divergences: {
    liquidity_withdrawal: { ratioDropPct: 20, priceFloorPct: -5 },
    unconfirmed_rise: { volumeDropPct: 30, priceRisePct: 15 },
    announced_burn_no_supply_change: { maxSupplyDropPct: 0.1 },
  },
  constantProductDexIds: ['raydium', 'pumpswap', 'pumpfun', 'meteora', 'fluxbeam', 'orca-legacy'],
  concentratedDexIds: ['raydium-clmm', 'orca', 'meteora-dlmm', 'lifinity', 'whirlpool'],
  slippageCacheS: 60,
};

export const LIQUIDITY_BAND_LABELS = {
  comfortable: 'Liquidité confortable',
  correct: 'Liquidité correcte',
  thin: 'Liquidité mince',
  very_thin: 'Liquidité très mince, prix structurellement fragile',
} as const;
export const VOLUME_BAND_LABELS = {
  extreme: 'Rotation extrême, spéculation pure',
  very_high: 'Activité très élevée',
  sustained: 'Activité soutenue',
  low: 'Activité faible, attention en baisse',
} as const;
