import { dayOf, nowS } from '../db/client.js';
import type { Services } from '../services/index.js';

/** 1 × / jour : détenteurs et concentration. Helius en priorité, Solscan en repli si configuré. */
export async function runHolderSnapshot(s: Services, opts: { onlyMissingToday?: boolean } = {}): Promise<string> {
  const tokens = s.ctx.tokens.listActive();
  if (!tokens.length) return 'aucun token';
  const economy = s.system.solscanEconomyMode();
  const today = dayOf(nowS());
  const oddDay = Math.floor(nowS() / 86400) % 2 === 1;
  let ok = 0, skipped = 0;
  for (const t of tokens) {
    if (opts.onlyMissingToday && s.ctx.snapshots.hasHolderSnapshotForDay(t.id, today)) { skipped++; continue; }
    // Mode économie Solscan (palier C sans Helius) : un jour sur deux.
    if (economy && !s.ctx.sources.helius && oddDay) { skipped++; continue; }
    try {
      const r = await s.holders.snapshot(t.id, { economy });
      if (r.skipped) skipped++; else ok++;
    } catch (err) {
      s.ctx.log.warn({ err: (err as Error).message, token: t.address }, 'Snapshot détenteurs échoué');
    }
  }
  return `${ok} pris, ${skipped} ignorés, ${tokens.length} tokens${economy ? ' (mode économie Solscan)' : ''}`;
}
