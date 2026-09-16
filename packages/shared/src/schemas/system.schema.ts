import { z } from 'zod';
import { SourceName } from './common.schema.js';

export const Tier = z.enum(['A', 'B', 'C']);
export type Tier = z.infer<typeof Tier>;

export const SourceStatus = z.object({
  name: SourceName,
  configured: z.boolean(),
  healthy: z.boolean(),
  degradedReason: z.string().nullable(),
  degradedSince: z.number().nullable(),
  lastSuccessAt: z.number().nullable(),
  lastErrorAt: z.number().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

export const DataCapability = z.object({
  key: z.string(),
  label: z.string(),
  activeSource: SourceName,
  available: z.boolean(),
  missingVariable: z.string().nullable(),
});
export type DataCapability = z.infer<typeof DataCapability>;

export const SourcesView = z.object({
  tier: Tier,
  tierLabel: z.string(),
  sources: z.array(SourceStatus),
  capabilities: z.array(DataCapability),
  /** Comment l'API est exposée : l'écran Système le dit, le README aussi. */
  exposure: z.object({ host: z.string(), authEnabled: z.boolean(), corsOrigin: z.string().nullable() }),
});
export type SourcesView = z.infer<typeof SourcesView>;

export const UsageRow = z.object({
  provider: SourceName,
  calls: z.number(),
  cacheHits: z.number(),
  cu: z.number(),
  errors: z.number(),
});
export type UsageRow = z.infer<typeof UsageRow>;

export const UsageView = z.object({
  today: z.array(UsageRow),
  last30Days: z.array(UsageRow),
  solscan: z
    .object({
      remoteUsage: z.unknown().nullable(),
      localCuThisMonth: z.number(),
      monthlyBudget: z.number(),
      budgetUsedPct: z.number(),
      economyMode: z.boolean(),
    })
    .nullable(),
  jobs: z.array(
    z.object({
      name: z.string(),
      schedule: z.string(),
      lastRunAt: z.number().nullable(),
      lastStatus: z.string().nullable(),
      lastError: z.string().nullable(),
    }),
  ),
});
export type UsageView = z.infer<typeof UsageView>;
