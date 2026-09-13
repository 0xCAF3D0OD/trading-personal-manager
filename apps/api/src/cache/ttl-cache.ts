import type { Db } from '../db/client.js';
import { nowS } from '../db/client.js';

export interface CacheHit<T> {
  value: T;
  source: string;
  fetchedAt: number;
  cached: boolean;
}

interface Entry {
  value: unknown;
  source: string;
  fetchedAt: number;
  expiresAt: number;
}

/**
 * Cache mémoire avec TTL, dédoublonnage des requêtes en vol, et persistance
 * en SQLite pour survivre aux redémarrages (donc ne pas rebrûler de quota).
 */
export class TtlCache {
  private readonly mem = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<CacheHit<unknown>>>();

  constructor(private readonly db: Db) {}

  peek<T>(key: string): CacheHit<T> | null {
    const e = this.load(key);
    if (!e) return null;
    return { value: e.value as T, source: e.source, fetchedAt: e.fetchedAt, cached: true };
  }

  /** Renvoie même une entrée expirée (pour l'état dégradé). */
  peekStale<T>(key: string): CacheHit<T> | null {
    const e = this.mem.get(key) ?? this.loadRow(key);
    if (!e) return null;
    return { value: e.value as T, source: e.source, fetchedAt: e.fetchedAt, cached: true };
  }

  async getOrFetch<T>(
    key: string,
    ttlS: number,
    fetcher: () => Promise<{ value: T; source: string }>,
    opts: { staleOnError?: boolean } = { staleOnError: true },
  ): Promise<CacheHit<T>> {
    const fresh = this.peek<T>(key);
    if (fresh) return fresh;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<CacheHit<T>>;

    const p = (async () => {
      try {
        const r = await fetcher();
        const fetchedAt = nowS();
        this.set(key, r.value, r.source, fetchedAt, ttlS);
        return { value: r.value, source: r.source, fetchedAt, cached: false } as CacheHit<unknown>;
      } catch (err) {
        if (opts.staleOnError) {
          const stale = this.peekStale<T>(key);
          if (stale) return { ...stale, stale: true } as CacheHit<unknown>;
        }
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p as Promise<CacheHit<T>>;
  }

  set(key: string, value: unknown, source: string, fetchedAt: number, ttlS: number): void {
    const entry: Entry = { value, source, fetchedAt, expiresAt: fetchedAt + ttlS };
    this.mem.set(key, entry);
    this.db
      .prepare(
        `INSERT INTO cache_entries (key, value, source, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source,
           fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      )
      .run(key, JSON.stringify(value), source, fetchedAt, entry.expiresAt);
  }

  invalidate(key: string): void {
    this.mem.delete(key);
    this.db.prepare('DELETE FROM cache_entries WHERE key = ?').run(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const k of this.mem.keys()) if (k.startsWith(prefix)) this.mem.delete(k);
    this.db.prepare('DELETE FROM cache_entries WHERE key LIKE ?').run(`${prefix}%`);
  }

  purgeExpired(olderThanS = 7 * 86400): number {
    const r = this.db.prepare('DELETE FROM cache_entries WHERE expires_at < ?').run(nowS() - olderThanS);
    return Number(r.changes);
  }

  private load(key: string): Entry | null {
    const now = nowS();
    const m = this.mem.get(key);
    if (m) {
      if (m.expiresAt > now) return m;
      this.mem.delete(key);
    }
    const row = this.loadRow(key);
    if (row && row.expiresAt > now) {
      this.mem.set(key, row);
      return row;
    }
    return null;
  }

  private loadRow(key: string): Entry | null {
    const row = this.db
      .prepare('SELECT value, source, fetched_at, expires_at FROM cache_entries WHERE key = ?')
      .get(key) as { value: string; source: string; fetched_at: number; expires_at: number } | undefined;
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value), source: row.source, fetchedAt: row.fetched_at, expiresAt: row.expires_at };
    } catch {
      return null;
    }
  }
}
