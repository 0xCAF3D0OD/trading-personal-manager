import { z } from 'zod';

export const PlanInput = z
  .object({
    entryPrice: z.number().positive(),
    takeProfitPrice: z.number().positive(),
    stopLossPrice: z.number().positive(),
    amountUsd: z.number().positive(),
    acceptsTotalLoss: z.literal(true, {
      errorMap: () => ({ message: 'Vous devez confirmer que ce montant peut aller à zéro.' }),
    }),
    note: z.string().max(2000).optional().nullable(),
  })
  .refine((p) => p.takeProfitPrice > p.entryPrice, {
    message: 'Le prix de sortie en gain doit être supérieur au prix d’entrée.',
    path: ['takeProfitPrice'],
  })
  .refine((p) => p.stopLossPrice < p.entryPrice, {
    message: 'Le prix de sortie en perte doit être inférieur au prix d’entrée.',
    path: ['stopLossPrice'],
  });
export type PlanInput = z.infer<typeof PlanInput>;

export const Plan = z.object({
  id: z.number(),
  tokenId: z.number(),
  version: z.number(),
  supersedesPlanId: z.number().nullable(),
  createdAt: z.number(),
  entryPrice: z.number(),
  takeProfitPrice: z.number(),
  stopLossPrice: z.number(),
  amountUsd: z.number(),
  acceptsTotalLoss: z.boolean(),
  note: z.string().nullable(),
  /** Champs calculés pour le journal de discipline */
  riskRewardRatio: z.number(),
  maxLossUsd: z.number(),
  isCurrent: z.boolean(),
});
export type Plan = z.infer<typeof Plan>;

/** Différence entre deux versions consécutives, pour montrer les seuils déplacés. */
export const PlanRevision = z.object({
  fromVersion: z.number(),
  toVersion: z.number(),
  at: z.number(),
  changes: z.array(
    z.object({
      field: z.string(),
      from: z.number(),
      to: z.number(),
      /** 'loosened' = seuil déplacé dans le sens qui arrange (stop plus bas, TP plus haut) */
      direction: z.enum(['loosened', 'tightened', 'neutral']),
    }),
  ),
});
export type PlanRevision = z.infer<typeof PlanRevision>;
