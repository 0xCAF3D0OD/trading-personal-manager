import { z } from 'zod';

export const AlertType = z.enum([
  'price_above',
  'price_below',
  'plan_tp',
  'plan_sl',
  'plan_entry',
  'div_distribution',
  'div_avg_position',
  'div_concentration_down_price_up',
  'div_burn_slowdown',
  'mint_authority_changed',
  'freeze_authority_changed',
]);
export type AlertType = z.infer<typeof AlertType>;

export const Alert = z.object({
  id: z.number(),
  tokenId: z.number(),
  type: AlertType,
  threshold: z.number().nullable(),
  planId: z.number().nullable(),
  enabled: z.boolean(),
  cooldownS: z.number(),
  lastFiredAt: z.number().nullable(),
  createdAt: z.number(),
  ruleText: z.string(),
});
export type Alert = z.infer<typeof Alert>;

export const CreateAlertInput = z.object({
  tokenId: z.number().int(),
  type: z.enum(['price_above', 'price_below']),
  threshold: z.number().positive(),
  cooldownS: z.number().int().min(60).max(7 * 86400).optional(),
});
export type CreateAlertInput = z.infer<typeof CreateAlertInput>;

export const UpdateAlertInput = z.object({
  enabled: z.boolean().optional(),
  cooldownS: z.number().int().min(60).max(7 * 86400).optional(),
});
export type UpdateAlertInput = z.infer<typeof UpdateAlertInput>;

export const AlertEvent = z.object({
  id: z.number(),
  alertId: z.number(),
  tokenId: z.number(),
  tokenSymbol: z.string().nullable(),
  type: AlertType,
  firedAt: z.number(),
  observed: z.number().nullable(),
  threshold: z.number().nullable(),
  ruleText: z.string(),
  payload: z.unknown().nullable(),
  deliveredTo: z.array(z.object({ channel: z.string(), ok: z.boolean(), error: z.string().nullable() })),
  acknowledgedAt: z.number().nullable(),
});
export type AlertEvent = z.infer<typeof AlertEvent>;
