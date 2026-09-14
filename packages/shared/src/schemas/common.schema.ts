import { z } from 'zod';

export const SourceName = z.enum([
  'rpc',
  'helius',
  'dexscreener',
  'jupiter',
  'rugcheck',
  'solscan',
  'geckoterminal',
  'coingecko',
  'kraken',
  'local',
  'unavailable',
]);
export type SourceName = z.infer<typeof SourceName>;

export const DegradedInfo = z.object({
  provider: SourceName,
  reason: z.string(),
  since: z.number().optional(),
});
export type DegradedInfo = z.infer<typeof DegradedInfo>;

export const ResponseMeta = z.object({
  source: SourceName,
  fetchedAt: z.number(),
  cached: z.boolean(),
  degraded: z.array(DegradedInfo).optional(),
});
export type ResponseMeta = z.infer<typeof ResponseMeta>;

export interface ApiEnvelope<T> {
  data: T;
  meta: ResponseMeta;
}

export const ApiError = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/** Une valeur numérique toujours accompagnée de sa source et de son horodatage. */
export const SourcedNumber = z.object({
  value: z.number().nullable(),
  source: SourceName,
  fetchedAt: z.number(),
});
export type SourcedNumber = z.infer<typeof SourcedNumber>;

export const Status = z.enum(['ok', 'warning', 'risk', 'unknown']);
export type Status = z.infer<typeof Status>;
