import { z } from 'zod';

/** Défauts versionnés du module affichage (docs/05, partie A). Incrémenter à chaque changement de valeur. */
export const UI_DEFAULTS_VERSION = 1;

export const UiMode = z.enum(['simple', 'detail']);
export type UiMode = z.infer<typeof UiMode>;

export const UiSettings = z.object({
  /** Mode d'ouverture des fiches : lecture simple ou détail. */
  mode: UiMode,
  /** La courbe de prix sur 30 jours reste visible en lecture simple. */
  showPriceChartInSimple: z.boolean(),
  /** Au-delà de cette part du top 10, la question 3 répond « concentrée ». Réutilise le seuil du drapeau scanner. */
  summaryTop10ConcentratedPct: z.number().min(1).max(100),
  /** Taille d'ordre lue pour la question 2 (« puis-je sortir ? »). Doit exister dans les tailles du slippage. */
  summarySlippageOrderUsd: z.number().positive(),
  /** Le plan du journal est personnel : exclu du dossier (partie B) sauf choix explicite. */
  dossierIncludesPlan: z.boolean(),
});
export type UiSettings = z.infer<typeof UiSettings>;

export const UI_DEFAULTS: UiSettings = {
  mode: 'simple',
  showPriceChartInSimple: true,
  summaryTop10ConcentratedPct: 40,
  summarySlippageOrderUsd: 1000,
  dossierIncludesPlan: false,
};
