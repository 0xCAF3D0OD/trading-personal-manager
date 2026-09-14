import { z } from 'zod';

export const SCANNER_DEFAULTS_VERSION = 1;

export const ScannerSettings = z.object({
  enabled: z.boolean(),
  performance: z.object({
    minChangeH24Pct: z.number(),
    minAgeHours: z.number().min(0),
    maxAgeDays: z.number().min(1),
    minLiquidityUsd: z.number().min(0),
    minVolumeH24Usd: z.number().min(0),
    maxMarketCapUsd: z.number().min(0),
  }),
  structural: z.object({
    requireMintRevoked: z.boolean(),
    requireNoFreeze: z.boolean(),
    allowTransferFee: z.boolean(),
    maxVolumeToMcap: z.number().min(0),
    minLiquidityToMcapPct: z.number().min(0),
  }),
  flags: z.object({
    top10MaxPct: z.number(),
    buyerSellerRatioMin: z.number(),
    stagnantH1AbsPct: z.number(),
    buysPerBuyerMin: z.number(),
    creatorMaxTokens: z.number().int(),
    decelerationFraction: z.number().min(0).max(1),
    developerHoldingMaxPct: z.number(),
  }),
  discovery: z.object({
    newPoolsPages: z.number().int().min(1).max(10),
    trendingPages: z.number().int().min(0).max(10),
    trendingEveryNTicks: z.number().int().min(1),
    quoteTokens: z.array(z.string()),
    /** Fraction des seuils de liquidité / volume en dessous de laquelle un pool passe en tiède puis froid */
    hotFraction: z.number().min(0).max(1),
    warmFraction: z.number().min(0).max(1),
    hotIntervalS: z.number().int().min(60),
    warmIntervalS: z.number().int().min(60),
    coldIntervalS: z.number().int().min(60),
    retireAfterColdChecks: z.number().int().min(1),
    nearMissRetentionDays: z.number().int().min(1),
  }),
  rateLimit: z.object({
    callsPerMinute: z.number().int().min(1).max(30),
    maxBackoffMs: z.number().int().min(1000),
    breakerAfterConsecutive429: z.number().int().min(1),
    breakerPauseS: z.number().int().min(30),
  }),
});
export type ScannerSettings = z.infer<typeof ScannerSettings>;

export const SCANNER_DEFAULTS: ScannerSettings = {
  enabled: true,
  performance: { minChangeH24Pct: 100, minAgeHours: 6, maxAgeDays: 30, minLiquidityUsd: 50_000, minVolumeH24Usd: 100_000, maxMarketCapUsd: 50_000_000 },
  structural: { requireMintRevoked: true, requireNoFreeze: true, allowTransferFee: false, maxVolumeToMcap: 5, minLiquidityToMcapPct: 2 },
  flags: { top10MaxPct: 35, buyerSellerRatioMin: 3, stagnantH1AbsPct: 5, buysPerBuyerMin: 4, creatorMaxTokens: 3, decelerationFraction: 0.25, developerHoldingMaxPct: 10 },
  discovery: {
    newPoolsPages: 5, trendingPages: 2, trendingEveryNTicks: 3,
    quoteTokens: ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdRE1MEB4'],
    hotFraction: 0.2, warmFraction: 0.05, hotIntervalS: 15 * 60, warmIntervalS: 2 * 3600, coldIntervalS: 24 * 3600, retireAfterColdChecks: 3, nearMissRetentionDays: 7,
  },
  rateLimit: { callsPerMinute: 8, maxBackoffMs: 120_000, breakerAfterConsecutive429: 3, breakerPauseS: 300 },
};

export const SCAN_STAGE2_REASONS: Record<string, string> = {
  age_min: 'Pool trop récent',
  age_max: 'Pool trop ancien',
  change_min: 'Variation 24 h insuffisante',
  liquidity_min: 'Liquidité insuffisante',
  volume_min: 'Volume 24 h insuffisant',
  mcap_max: 'Capitalisation trop élevée',
  no_price: 'Prix absent',
};
export const SCAN_STRUCTURAL_LABELS: Record<string, string> = {
  mint_authority: 'Autorité de mint révoquée',
  freeze_authority: 'Aucune autorité de freeze',
  transfer_fee: 'Pas de frais de transfert',
  volume_to_mcap: 'Volume / capitalisation ≤ seuil',
  liquidity_to_mcap: 'Liquidité / capitalisation ≥ seuil',
};
export const SCAN_FLAG_LABELS: Record<string, string> = {
  concentration: 'Concentration du top 10',
  buyer_seller_asymmetry: 'Asymétrie acheteurs / vendeurs',
  bot_activity: 'Activité automatisée',
  serial_creator: 'Créateur en série',
  deceleration: 'Décélération',
  no_metadata: 'Absence de métadonnées',
  developer_holding: 'Détention du développeur',
  honeypot_suspected: 'Honeypot suspecté (heuristique)',
  source_mismatch: 'Désaccord entre sources',
};
