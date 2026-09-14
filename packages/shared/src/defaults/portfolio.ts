import { z } from 'zod';

/** Défauts versionnés du module portefeuille (docs/06, partie F). Incrémenter à chaque changement de valeur. */
export const PORTFOLIO_DEFAULTS_VERSION = 1;

export const PortfolioMapping = z.object({
  /** Code d'actif Kraken normalisé (EMBER, SOL…). */
  asset: z.string().min(1).max(20),
  /** Token de la liste de surveillance auquel il correspond. Déclaré à la main, jamais déduit du seul symbole. */
  tokenId: z.number().int().positive(),
});
export type PortfolioMapping = z.infer<typeof PortfolioMapping>;

export const PortfolioSettings = z.object({
  enabled: z.boolean(),
  baseCurrency: z.enum(['EUR', 'USD']),
  refreshIntervalS: z.number().int().min(60).max(86400),
  discreetByDefault: z.boolean(),
  mappings: z.array(PortfolioMapping),
  /** 0 = pas d'alerte ; sinon alerte si |variation de la valeur totale sur un jour| ≥ X %. */
  dailyChangeAlertPct: z.number().min(0).max(100),
});
export type PortfolioSettings = z.infer<typeof PortfolioSettings>;

export const PORTFOLIO_DEFAULTS: PortfolioSettings = {
  enabled: true,
  baseCurrency: 'EUR',
  refreshIntervalS: 900,
  discreetByDefault: false,
  mappings: [],
  dailyChangeAlertPct: 0,
};
