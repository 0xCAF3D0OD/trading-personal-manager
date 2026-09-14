import { z } from 'zod';
import { SourceName } from './common.schema.js';

export const PortfolioState = z.enum(['staking', 'earn_flex', 'earn_locked']).nullable();
export type PortfolioState = z.infer<typeof PortfolioState>;

export const PortfolioPosition = z.object({
  asset: z.string(),
  krakenCode: z.string(),
  state: PortfolioState,
  /** Un solde staké ou verrouillé ne se vend pas immédiatement. */
  sellable: z.boolean(),
  balance: z.number(),
  /** Prix là où l'actif est détenu (Kraken), dans la monnaie d'affichage. */
  price: z.number().nullable(),
  priceEur: z.number().nullable(),
  priceUsd: z.number().nullable(),
  priceSource: SourceName,
  /** Prix on-chain (DexScreener) quand l'actif est relié à un token surveillé. Jamais moyenné avec le prix Kraken. */
  onchainPriceUsd: z.number().nullable(),
  onchainSource: SourceName.nullable(),
  onchainFetchedAt: z.number().nullable(),
  /** (Kraken − on-chain) / on-chain, en %. */
  spreadPct: z.number().nullable(),
  value: z.number().nullable(),
  valueEur: z.number().nullable(),
  valueUsd: z.number().nullable(),
  sharePct: z.number().nullable(),
  tokenId: z.number().nullable(),
  tokenSymbol: z.string().nullable(),
});
export type PortfolioPosition = z.infer<typeof PortfolioPosition>;

/** Le plan du journal face à ce que le compte contient : des phrases, aucune action. */
export const PlanVsAccount = z.object({
  tokenId: z.number(),
  symbol: z.string(),
  planVersion: z.number(),
  state: z.enum(['ok', 'warn', 'risk', 'info']),
  lines: z.array(z.string()),
});
export type PlanVsAccount = z.infer<typeof PlanVsAccount>;

export const PortfolioView = z.object({
  configured: z.boolean(),
  enabled: z.boolean(),
  missingVariable: z.string().nullable(),
  baseCurrency: z.enum(['EUR', 'USD']),
  fetchedAt: z.number().nullable(),
  cached: z.boolean(),
  total: z.number().nullable(),
  totalEur: z.number().nullable(),
  totalUsd: z.number().nullable(),
  /** Nombre de positions dont le prix est inconnu : la valeur totale est alors une borne basse. */
  unknownCount: z.number(),
  previousDayTotal: z.number().nullable(),
  previousDay: z.string().nullable(),
  changeDayPct: z.number().nullable(),
  positions: z.array(PortfolioPosition),
  planVsAccount: z.array(PlanVsAccount),
  error: z.string().nullable(),
});
export type PortfolioView = z.infer<typeof PortfolioView>;

export const PortfolioHistoryPoint = z.object({
  day: z.string(),
  ts: z.number(),
  total: z.number().nullable(),
  byAsset: z.array(z.object({ asset: z.string(), value: z.number().nullable() })),
});
export type PortfolioHistoryPoint = z.infer<typeof PortfolioHistoryPoint>;
