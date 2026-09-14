import { z } from 'zod';

export const ScanTier = z.enum(['hot', 'warm', 'cold', 'retired']);
export type ScanTier = z.infer<typeof ScanTier>;

export const ScanExclusion = z.object({ code: z.string(), label: z.string(), observed: z.union([z.number(), z.string()]).nullable(), threshold: z.union([z.number(), z.string()]).nullable() });
export type ScanExclusion = z.infer<typeof ScanExclusion>;

export const ScanStructuralCheck = z.object({ code: z.string(), label: z.string(), passed: z.boolean(), observed: z.union([z.number(), z.string()]).nullable(), threshold: z.union([z.number(), z.string()]).nullable(), source: z.string() });
export type ScanStructuralCheck = z.infer<typeof ScanStructuralCheck>;

export const ScanFlag = z.object({
  code: z.string(),
  label: z.string(),
  raised: z.boolean(),
  verified: z.boolean(),
  observed: z.union([z.number(), z.string()]).nullable(),
  threshold: z.union([z.number(), z.string()]).nullable(),
  detail: z.string(),
  source: z.string(),
});
export type ScanFlag = z.infer<typeof ScanFlag>;

export const ScanMetrics = z.object({
  poolAddress: z.string(),
  dexId: z.string(),
  priceUsd: z.number().nullable(),
  priceSource: z.string(),
  ageHours: z.number().nullable(),
  poolCreatedAt: z.number().nullable(),
  pctH1: z.number().nullable(),
  pctH24: z.number().nullable(),
  capUsd: z.number().nullable(),
  mcapIsFdv: z.boolean(),
  fdvUsd: z.number().nullable(),
  marketCapUsd: z.number().nullable(),
  liquidityUsd: z.number().nullable(),
  volumeH24Usd: z.number().nullable(),
  volumeH1Usd: z.number().nullable(),
  volumeToMcap: z.number().nullable(),
  liquidityToMcapPct: z.number().nullable(),
  txH1: z.object({ buys: z.number(), sells: z.number(), buyers: z.number(), sellers: z.number() }).nullable(),
  txH24: z.object({ buys: z.number(), sells: z.number(), buyers: z.number(), sellers: z.number() }).nullable(),
  otherPools: z.array(z.object({ poolAddress: z.string(), dexId: z.string(), liquidityUsd: z.number().nullable() })),
});
export type ScanMetrics = z.infer<typeof ScanMetrics>;

export const ScanResult = z.object({
  id: z.number(),
  runId: z.number(),
  poolAddress: z.string(),
  tokenAddress: z.string(),
  tokenSymbol: z.string().nullable(),
  tokenName: z.string().nullable(),
  status: z.enum(['kept', 'excluded']),
  excludedStage: z.number().nullable(),
  exclusionReasons: z.array(ScanExclusion),
  structural: z.array(ScanStructuralCheck),
  structuralPassed: z.number().nullable(),
  structuralTotal: z.number().nullable(),
  flags: z.array(ScanFlag),
  flagCount: z.number(),
  unverifiedCount: z.number(),
  metrics: ScanMetrics,
  observedAt: z.number(),
  inWatchlist: z.boolean(),
});
export type ScanResult = z.infer<typeof ScanResult>;

export const ScanRun = z.object({
  id: z.number(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  status: z.string(),
  settingsId: z.number(),
  poolsChecked: z.number(),
  passedStage2: z.number(),
  passedStage3: z.number(),
  keptCount: z.number(),
  apiCalls: z.number(),
  stage2Reasons: z.record(z.number()),
  error: z.string().nullable(),
});
export type ScanRun = z.infer<typeof ScanRun>;

export const ScanRetroRow = z.object({
  tokenAddress: z.string(),
  tokenSymbol: z.string().nullable(),
  firstKeptAt: z.number(),
  refPriceUsd: z.number(),
  refMcapUsd: z.number().nullable(),
  refMcapIsFdv: z.boolean(),
  refFlagCount: z.number(),
  refStructural: z.string().nullable(),
  refFlags: z.array(z.string()),
  d1: z.object({ price: z.number().nullable(), status: z.string(), pnlPct: z.number().nullable() }),
  d7: z.object({ price: z.number().nullable(), status: z.string(), pnlPct: z.number().nullable() }),
  d30: z.object({ price: z.number().nullable(), status: z.string(), pnlPct: z.number().nullable() }),
  inWatchlist: z.boolean(),
});
export type ScanRetroRow = z.infer<typeof ScanRetroRow>;

export const RetroHorizonStats = z.object({
  horizon: z.enum(['d1', 'd7', 'd30']),
  count: z.number(),
  unavailable: z.number(),
  /** unavailable compté à −100 % */
  withLoss: z.object({ medianPct: z.number().nullable(), meanPct: z.number().nullable(), positivePct: z.number().nullable(), belowMinus50Pct: z.number().nullable(), best: z.number().nullable(), worst: z.number().nullable(), value100Each: z.number().nullable() }),
  /** unavailable exclus */
  excluding: z.object({ medianPct: z.number().nullable(), meanPct: z.number().nullable(), positivePct: z.number().nullable(), belowMinus50Pct: z.number().nullable(), best: z.number().nullable(), worst: z.number().nullable(), value100Each: z.number().nullable() }),
  histogram: z.array(z.object({ label: z.string(), count: z.number() })),
});
export type RetroHorizonStats = z.infer<typeof RetroHorizonStats>;

export const ScanRetroView = z.object({
  rows: z.array(ScanRetroRow),
  stats: z.array(RetroHorizonStats),
  byFlagCount: z.array(z.object({ flagCount: z.string(), horizon: z.string(), count: z.number(), medianPct: z.number().nullable() })),
  byFlag: z.array(z.object({ flag: z.string(), horizon: z.string(), withFlagMedianPct: z.number().nullable(), withoutFlagMedianPct: z.number().nullable(), withCount: z.number(), withoutCount: z.number() })),
});
export type ScanRetroView = z.infer<typeof ScanRetroView>;

export const ScannerOverview = z.object({
  lastRun: ScanRun.nullable(),
  pools: z.object({ hot: z.number(), warm: z.number(), cold: z.number(), retired: z.number() }),
  breaker: z.object({ open: z.boolean(), until: z.number().nullable(), consecutive429: z.number() }),
  lane: z.enum(['geckoterminal', 'coingecko_demo']),
  callsLastHour: z.number(),
  heliusAvailable: z.boolean(),
  enabled: z.boolean(),
});
export type ScannerOverview = z.infer<typeof ScannerOverview>;
