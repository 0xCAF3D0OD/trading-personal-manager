import { z } from 'zod';
import { SourceName } from './common.schema.js';
import { HolderSnapshot, MarketSnapshot, SeriesPoint } from './snapshot.schema.js';

export const MomentumState = z.enum(['extinction', 'acceleration', 'none', 'insufficient']);
export type MomentumState = z.infer<typeof MomentumState>;

export const LiquidityBand = z.enum(['comfortable', 'correct', 'thin', 'very_thin']);
export type LiquidityBand = z.infer<typeof LiquidityBand>;
export const VolumeBand = z.enum(['extreme', 'very_high', 'sustained', 'low']);
export type VolumeBand = z.infer<typeof VolumeBand>;
export const PoolType = z.enum(['constant_product', 'concentrated', 'unknown']);
export type PoolType = z.infer<typeof PoolType>;

export const PoolInfo = z.object({
  address: z.string(),
  dexId: z.string(),
  poolType: PoolType,
  liquidityUsd: z.number().nullable(),
  volumeH24Usd: z.number().nullable(),
  priceUsd: z.number().nullable(),
  url: z.string().nullable(),
  isMain: z.boolean(),
  source: SourceName,
});
export type PoolInfo = z.infer<typeof PoolInfo>;

export const Momentum = z.object({
  state: MomentumState,
  /** Rythme horaire moyen linéaire par fenêtre, en % par heure */
  hourlyRates: z.object({ h24: z.number().nullable(), h6: z.number().nullable(), h1: z.number().nullable(), m5: z.number().nullable() }),
  label: z.string(),
});
export type Momentum = z.infer<typeof Momentum>;

export const SupplyComponents = z.object({
  minted: z.number().nullable(),
  incinerated: z.number().nullable(),
  net: z.number().nullable(),
  incineratorAddresses: z.array(z.object({ address: z.string(), balance: z.number() })),
  source: SourceName,
  fetchedAt: z.number(),
});
export type SupplyComponents = z.infer<typeof SupplyComponents>;

export const SlippageEstimate = z.object({
  orderUsd: z.number(),
  impactPct: z.number().nullable(),
  method: z.enum(['jupiter_quote', 'constant_product', 'unavailable']),
  route: z.array(z.string()),
  note: z.string(),
  fetchedAt: z.number(),
});
export type SlippageEstimate = z.infer<typeof SlippageEstimate>;

export const MarketMetricsView = z.object({
  price: z.object({
    primary: z.object({ value: z.number().nullable(), source: SourceName, fetchedAt: z.number() }),
    secondary: z.object({ value: z.number().nullable(), source: SourceName, fetchedAt: z.number() }).nullable(),
    spreadPct: z.number().nullable(),
    spreadWarn: z.boolean(),
    spreadConsecutiveOver: z.number(),
  }),
  priceChange: z.object({ m5: z.number().nullable(), h1: z.number().nullable(), h6: z.number().nullable(), h24: z.number().nullable() }),
  momentum: Momentum,
  mcap: z.object({
    sourceValue: z.number().nullable(),
    sourceName: SourceName,
    sourceIsFdv: z.boolean(),
    local: z.number().nullable(),
    fdvLocal: z.number().nullable(),
    fdvSource: z.number().nullable(),
    gapPct: z.number().nullable(),
    gapWarn: z.boolean(),
  }),
  supply: SupplyComponents,
  liquidity: z.object({
    mainPoolUsd: z.number().nullable(),
    totalUsd: z.number().nullable(),
    poolsCount: z.number(),
    ratioPct: z.number().nullable(),
    band: LiquidityBand.nullable(),
    bandLabel: z.string().nullable(),
    pools: z.array(PoolInfo),
    source: SourceName,
  }),
  volume: z.object({
    h24Usd: z.number().nullable(),
    source: SourceName,
    toMcap: z.number().nullable(),
    band: VolumeBand.nullable(),
    bandLabel: z.string().nullable(),
    ratioChange24hPct: z.number().nullable(),
    ratioChange7dPct: z.number().nullable(),
  }),
  pair: z.object({ dexId: z.string(), pairAddress: z.string(), url: z.string().nullable(), createdAt: z.number().nullable() }).nullable(),
  source: SourceName,
  fetchedAt: z.number(),
});
export type MarketMetricsView = z.infer<typeof MarketMetricsView>;

/** Une série par source : jamais deux origines sur une même courbe. */
export const SourcedSeries = z.object({ source: SourceName, points: z.array(SeriesPoint) });
export type SourcedSeries = z.infer<typeof SourcedSeries>;

export const TokenHistoryView = z.object({
  market: z.array(MarketSnapshot),
  holders: z.array(HolderSnapshot),
  series: z.object({
    price: z.array(SourcedSeries),
    volume: z.array(SourcedSeries),
    liquidity: z.array(SourcedSeries),
    liquidityRatio: z.array(SourcedSeries),
    supplyNet: z.array(SourcedSeries),
  }),
});
export type TokenHistoryView = z.infer<typeof TokenHistoryView>;
