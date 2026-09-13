import type { Services } from '../services/index.js';

/** Toutes les 15 min : prix, volume, offre. Sources gratuites uniquement. */
export async function runMarketSnapshot(s: Services): Promise<string> {
  const tokens = s.ctx.tokens.listActive();
  if (!tokens.length) return 'aucun token';
  await s.market.prefetchBatch(tokens.map((t) => t.address));
  let ok = 0;
  for (const t of tokens) {
    try {
      await s.market.snapshot(t.id);
      ok++;
    } catch (err) {
      s.ctx.log.warn({ err: (err as Error).message, token: t.address }, 'Snapshot marché échoué');
    }
  }
  return `${ok}/${tokens.length} tokens`;
}
