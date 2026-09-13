import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';
import type { LpLockInfo } from '../types.js';

/**
 * RugCheck : API publique sans clé. Heuristique tierce, affichée avec sa source,
 * jamais agrégée avec autre chose.
 */
export class RugCheckSource {
  constructor(private readonly deps: HttpDeps, private readonly baseUrl: string) {}

  async getLpLock(mint: string): Promise<LpLockInfo & { totalHolders: number | null; risks: { name: string; level: string; description: string }[] }> {
    const r = await fetchJson<any>(this.deps, 'rugcheck', 'tokens/report', `${this.baseUrl}/tokens/${mint}/report`);
    const markets: any[] = Array.isArray(r?.markets) ? r.markets : [];
    let lockedPct: number | null = null;
    let protocol: string | null = null;
    const details: string[] = [];
    for (const m of markets) {
      const pct = Number(m?.lp?.lpLockedPct);
      if (Number.isFinite(pct)) {
        details.push(`${m.marketType ?? 'pool'} : ${pct.toFixed(1)} % verrouillé`);
        if (lockedPct === null || pct > lockedPct) {
          lockedPct = pct;
          protocol = m.marketType ?? null;
        }
      }
    }
    const lockers = r?.lockers && typeof r.lockers === 'object' ? Object.values(r.lockers) as any[] : [];
    if (lockers.length) {
      const names = [...new Set(lockers.map((l) => String(l?.type ?? l?.programID ?? 'locker')))];
      protocol = names.join(', ');
    }
    const risks = Array.isArray(r?.risks)
      ? r.risks.map((x: any) => ({ name: String(x.name ?? ''), level: String(x.level ?? ''), description: String(x.description ?? '') }))
      : [];
    return {
      locked: lockedPct === null ? null : lockedPct >= 90,
      lockedPct, protocol, source: 'rugcheck',
      detail: details.length ? details.join(' · ') : null,
      totalHolders: Number.isFinite(Number(r?.totalHolders)) ? Number(r.totalHolders) : null,
      risks,
    };
  }
}
