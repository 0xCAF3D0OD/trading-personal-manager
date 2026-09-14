import { z } from 'zod';
import { SourceName } from './common.schema.js';

/** Les cinq questions de la lecture simple (docs/05, A.2). L'ordre est celui de la fiche. */
export const SummaryQuestionId = z.enum(['trap', 'exit', 'holders', 'team', 'market']);
export type SummaryQuestionId = z.infer<typeof SummaryQuestionId>;

/** Pas de couleur globale ni de total : chaque réponse porte son propre état. */
export const SummaryState = z.enum(['ok', 'warn', 'risk', 'partial', 'unknown']);
export type SummaryState = z.infer<typeof SummaryState>;

export const SummaryAnswer = z.object({
  id: SummaryQuestionId,
  question: z.string(),
  state: SummaryState,
  /** Phrase complète, gabarit fixe en code. */
  answer: z.string(),
  /** Un ou deux mots pour les listes (« sain », « mince », « concentrée »…). */
  short: z.string(),
  source: SourceName,
  fetchedAt: z.number().nullable(),
  /** Ancre de la carte qui justifie la réponse. */
  card: z.string(),
  /** Variable d'environnement manquante quand la réponse est « inconnu » pour cette raison. */
  missing: z.string().nullable(),
});
export type SummaryAnswer = z.infer<typeof SummaryAnswer>;

export const TokenSummary = z.object({
  tokenId: z.number(),
  answers: z.array(SummaryAnswer),
  computedAt: z.number(),
});
export type TokenSummary = z.infer<typeof TokenSummary>;
