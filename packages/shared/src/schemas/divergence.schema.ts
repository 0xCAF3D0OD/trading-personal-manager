import { z } from 'zod';
import { SeriesPoint } from './snapshot.schema.js';

export const DivergenceStatus = z.enum(['triggered', 'ok', 'insufficient_data']);
export type DivergenceStatus = z.infer<typeof DivergenceStatus>;

export const DivergenceSeries = z.object({
  label: z.string(),
  unit: z.string(),
  points: z.array(SeriesPoint),
  changePct: z.number().nullable(),
  changeAbs: z.number().nullable(),
});
export type DivergenceSeries = z.infer<typeof DivergenceSeries>;

export const Divergence = z.object({
  id: z.string(),
  label: z.string(),
  ruleText: z.string(),
  windowDays: z.number(),
  status: DivergenceStatus,
  explanation: z.string(),
  seriesA: DivergenceSeries,
  seriesB: DivergenceSeries,
  computedAt: z.number(),
});
export type Divergence = z.infer<typeof Divergence>;
