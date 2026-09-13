/** TTL en secondes, par type de donnée. Une seule source de vérité. */
export const TTL = {
  tokenMeta: 24 * 3600,
  health: 24 * 3600,
  supply: 15 * 60,
  price: 60,
  holders: 6 * 3600,
  creatorActivity: 3600,
  lpLock: 24 * 3600,
  markets: 24 * 3600,
  solscanUsage: 10 * 60,
  /** Résolution créateur / date de création : ne bouge jamais */
  immutable: 365 * 86400,
} as const;
