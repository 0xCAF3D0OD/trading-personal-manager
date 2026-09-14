import { z } from 'zod';
import { SourceName } from './common.schema.js';

/** Les cinq questions de la lecture simple (docs/05, A.2). L'ordre est celui de la fiche. */
export const SummaryQuestionId = z.enum(['trap', 'exit', 'holders', 'team', 'market']);
export type SummaryQuestionId = z.infer<typeof SummaryQuestionId>;

/** Pas de couleur globale ni de total : chaque réponse porte son propre état. */
export const SummaryState = z.enum(['ok', 'warn', 'risk', 'partial', 'unknown']);
export type SummaryState = z.infer<typeof SummaryState>;

/**
 * À quoi sert chaque question, par rapport à l'argent du lecteur. Personne ne peut dire si un token rapportera :
 * ces cinq questions disent ce qui peut faire perdre, et c'est vérifiable. Texte unique, partagé entre la synthèse et les cartes.
 */
export const SUMMARY_PURPOSE: Record<SummaryQuestionId, string> = {
  trap: 'Si oui, vous pouvez perdre sans que le prix bouge : l’équipe dilue, gèle ou prélève.',
  exit: 'Un gain n’existe que si vous pouvez vendre sans faire chuter le prix. C’est le coût réel de votre sortie.',
  holders: 'Quand quelques portefeuilles tiennent l’essentiel, une seule de leurs ventes efface une hausse.',
  team: 'Une équipe qui vend, retire la liquidité ou ne tient pas ses promesses annonce la suite avant le prix.',
  market: 'Une hausse que le volume, la liquidité et les détenteurs ne confirment pas tient rarement.',
};
export const SUMMARY_DISCLAIMER = 'Personne ne peut dire si ce token vous rapportera. Ces cinq questions disent ce qui peut vous faire perdre, et chacune est vérifiable.';

export const SummaryAnswer = z.object({
  id: SummaryQuestionId,
  question: z.string(),
  /** À quoi sert la question pour l'argent du lecteur (SUMMARY_PURPOSE). */
  purpose: z.string(),
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
