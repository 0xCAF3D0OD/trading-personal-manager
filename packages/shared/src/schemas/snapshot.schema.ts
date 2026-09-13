import { z } from 'zod';
import { SourceName } from './common.schema.js';

export const MarketSnapshot = z.object({
  id: z.number(),
  tokenId: z.number(),
  ts: z.number(),
  priceUsd: z.number().nullable(),
  priceSource: SourceName,
  priceAltUsd: z.number().nullable(),
  priceAltSource: SourceName.nullable(),
  marketCapUsd: z.number().nullable(),
  fdvUsd: z.number().nullable(),
  volume24hUsd: z.number().nullable(),
  liquidityUsd: z.number().nullable(),
  supplyCirc: z.number().nullable(),
  supplyTotal: z.number().nullable(),
  supplySource: SourceName,
});
export type MarketSnapshot = z.infer<typeof MarketSnapshot>;

export const ValueBucket = z.object({
  label: z.string(),
  minUsd: z.number(),
  maxUsd: z.number().nullable(),
  count: z.number(),
});
export type ValueBucket = z.infer<typeof ValueBucket>;

export const ExcludedAccount = z.object({
  owner: z.string(),
  amount: z.number(),
  pct: z.number(),
  reason: z.string(),
});
export type ExcludedAccount = z.infer<typeof ExcludedAccount>;

export const HolderSnapshot = z.object({
  id: z.number(),
  tokenId: z.number(),
  ts: z.number(),
  day: z.string(),
  holderCount: z.number().nullable(),
  top5Pct: z.number().nullable(),
  top10Pct: z.number().nullable(),
  top20Pct: z.number().nullable(),
  top50Pct: z.number().nullable(),
  top100Pct: z.number().nullable(),
  buckets: z.array(ValueBucket).nullable(),
  excludedAccounts: z.array(ExcludedAccount).nullable(),
  source: SourceName,
  truncated: z.boolean(),
  cuSpent: z.number(),
});
export type HolderSnapshot = z.infer<typeof HolderSnapshot>;

export const TopHolder = z.object({
  rank: z.number(),
  owner: z.string(),
  amount: z.number(),
  pct: z.number(),
  valueUsd: z.number().nullable(),
});
export type TopHolder = z.infer<typeof TopHolder>;

export const HoldersView = z.object({
  latest: HolderSnapshot.nullable(),
  topHolders: z.array(TopHolder),
  history: z.array(HolderSnapshot),
  capabilities: z.object({
    top50And100: z.boolean(),
    holderCount: z.boolean(),
    missingVariable: z.string().nullable(),
  }),
});
export type HoldersView = z.infer<typeof HoldersView>;

export const BurnRate = z.object({
  windowLabel: z.string(),
  windowSeconds: z.number(),
  supplyThen: z.number().nullable(),
  supplyNow: z.number().nullable(),
  burned: z.number().nullable(),
  burnedPct: z.number().nullable(),
  thenTs: z.number().nullable(),
});
export type BurnRate = z.infer<typeof BurnRate>;

export const SupplyView = z.object({
  current: z.object({
    supplyCirc: z.number().nullable(),
    supplyTotal: z.number().nullable(),
    source: SourceName,
    fetchedAt: z.number(),
  }),
  burnRates: z.array(BurnRate),
  series: z.array(z.object({ ts: z.number(), supply: z.number() })),
});
export type SupplyView = z.infer<typeof SupplyView>;

export const MarketView = z.object({
  price: z.object({
    primary: z.object({ value: z.number().nullable(), source: SourceName, fetchedAt: z.number() }),
    secondary: z.object({ value: z.number().nullable(), source: SourceName, fetchedAt: z.number() }).nullable(),
    spreadPct: z.number().nullable(),
  }),
  priceChange: z.object({
    m5: z.number().nullable(),
    h1: z.number().nullable(),
    h6: z.number().nullable(),
    h24: z.number().nullable(),
  }),
  volume24hUsd: z.number().nullable(),
  liquidityUsd: z.number().nullable(),
  marketCapUsd: z.number().nullable(),
  marketCapLocalUsd: z.number().nullable(),
  fdvUsd: z.number().nullable(),
  volumeToMcap: z.number().nullable(),
  pair: z
    .object({
      dexId: z.string(),
      pairAddress: z.string(),
      url: z.string().nullable(),
      createdAt: z.number().nullable(),
    })
    .nullable(),
  source: SourceName,
  fetchedAt: z.number(),
});
export type MarketView = z.infer<typeof MarketView>;

export const SeriesPoint = z.object({ ts: z.number(), value: z.number().nullable() });
export type SeriesPoint = z.infer<typeof SeriesPoint>;

export const TokenHistory = z.object({
  market: z.array(MarketSnapshot),
  holders: z.array(HolderSnapshot),
});
export type TokenHistory = z.infer<typeof TokenHistory>;
