import type { SourceName, UsageRow } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

export class UsageRepo {
  constructor(private readonly db: Db) {}

  record(r: { provider: SourceName; endpoint: string; cu?: number; status?: number | null; cacheHit?: boolean; durationMs?: number }): void {
    this.db
      .prepare('INSERT INTO api_usage (ts, provider, endpoint, cu, status, cache_hit, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(nowS(), r.provider, r.endpoint, r.cu ?? 0, r.status ?? null, r.cacheHit ? 1 : 0, r.durationMs ?? null);
  }

  summary(sinceTs: number): UsageRow[] {
    return this.db
      .prepare(
        `SELECT provider, COUNT(*) AS calls, SUM(cache_hit) AS cacheHits, SUM(cu) AS cu,
           SUM(CASE WHEN status IS NOT NULL AND status >= 400 THEN 1 ELSE 0 END) AS errors
         FROM api_usage WHERE ts >= ? GROUP BY provider ORDER BY provider`,
      )
      .all(sinceTs) as unknown as UsageRow[];
  }

  solscanCuSince(sinceTs: number): number {
    const r = this.db
      .prepare("SELECT COALESCE(SUM(cu), 0) AS cu FROM api_usage WHERE provider = 'solscan' AND ts >= ?")
      .get(sinceTs) as { cu: number };
    return r.cu;
  }

  purge(olderThanS = 90 * 86400): void {
    this.db.prepare('DELETE FROM api_usage WHERE ts < ?').run(nowS() - olderThanS);
  }
}
