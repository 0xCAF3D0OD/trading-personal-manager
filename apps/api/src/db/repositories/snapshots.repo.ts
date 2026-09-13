import type { HolderSnapshot, MarketSnapshot, SourceName, TopHolder } from '@tpm/shared';
import type { Db } from '../client.js';

interface MarketRow {
  id: number; token_id: number; ts: number;
  price_usd: number | null; price_source: string;
  price_alt_usd: number | null; price_alt_source: string | null;
  market_cap_usd: number | null; fdv_usd: number | null; volume_24h_usd: number | null;
  liquidity_usd: number | null; supply_circ: number | null; supply_total: number | null; supply_source: string;
}

interface HolderRow {
  id: number; token_id: number; ts: number; day: string;
  holder_count: number | null; top5_pct: number | null; top10_pct: number | null; top20_pct: number | null;
  top50_pct: number | null; top100_pct: number | null; buckets: string | null; excluded_accounts: string | null;
  top_holders: string | null; source: string; truncated: number; cu_spent: number;
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function toMarket(r: MarketRow): MarketSnapshot {
  return {
    id: r.id, tokenId: r.token_id, ts: r.ts,
    priceUsd: r.price_usd, priceSource: r.price_source as SourceName,
    priceAltUsd: r.price_alt_usd, priceAltSource: (r.price_alt_source as SourceName | null) ?? null,
    marketCapUsd: r.market_cap_usd, fdvUsd: r.fdv_usd, volume24hUsd: r.volume_24h_usd,
    liquidityUsd: r.liquidity_usd, supplyCirc: r.supply_circ, supplyTotal: r.supply_total,
    supplySource: r.supply_source as SourceName,
  };
}

export function toHolder(r: HolderRow): HolderSnapshot {
  return {
    id: r.id, tokenId: r.token_id, ts: r.ts, day: r.day,
    holderCount: r.holder_count, top5Pct: r.top5_pct, top10Pct: r.top10_pct, top20Pct: r.top20_pct,
    top50Pct: r.top50_pct, top100Pct: r.top100_pct,
    buckets: parseJson(r.buckets, null), excludedAccounts: parseJson(r.excluded_accounts, null),
    source: r.source as SourceName, truncated: r.truncated === 1, cuSpent: r.cu_spent,
  };
}

export class SnapshotsRepo {
  constructor(private readonly db: Db) {}

  insertMarket(s: Omit<MarketSnapshot, 'id'>): number {
    const r = this.db
      .prepare(
        `INSERT INTO market_snapshots (token_id, ts, price_usd, price_source, price_alt_usd, price_alt_source,
           market_cap_usd, fdv_usd, volume_24h_usd, liquidity_usd, supply_circ, supply_total, supply_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.tokenId, s.ts, s.priceUsd, s.priceSource, s.priceAltUsd, s.priceAltSource,
        s.marketCapUsd, s.fdvUsd, s.volume24hUsd, s.liquidityUsd, s.supplyCirc, s.supplyTotal, s.supplySource,
      );
    return Number(r.lastInsertRowid);
  }

  latestMarket(tokenId: number): MarketSnapshot | null {
    const r = this.db
      .prepare('SELECT * FROM market_snapshots WHERE token_id = ? ORDER BY ts DESC LIMIT 1')
      .get(tokenId) as unknown as MarketRow | undefined;
    return r ? toMarket(r) : null;
  }

  /** Snapshot marché le plus proche (antérieur ou égal) d'un instant donné. */
  marketAtOrBefore(tokenId: number, ts: number): MarketSnapshot | null {
    const r = this.db
      .prepare('SELECT * FROM market_snapshots WHERE token_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1')
      .get(tokenId, ts) as unknown as MarketRow | undefined;
    return r ? toMarket(r) : null;
  }

  marketSince(tokenId: number, sinceTs: number): MarketSnapshot[] {
    return (
      this.db
        .prepare('SELECT * FROM market_snapshots WHERE token_id = ? AND ts >= ? ORDER BY ts ASC')
        .all(tokenId, sinceTs) as unknown as MarketRow[]
    ).map(toMarket);
  }

  /** Dernier snapshot marché de chaque jour (pour croiser avec les snapshots détenteurs). */
  marketDaily(tokenId: number, sinceTs: number): (MarketSnapshot & { day: string })[] {
    const rows = this.db
      .prepare(
        `SELECT m.*, date(m.ts, 'unixepoch') AS day FROM market_snapshots m
         JOIN (SELECT MAX(ts) AS ts FROM market_snapshots WHERE token_id = ? AND ts >= ? GROUP BY date(ts, 'unixepoch')) d
           ON d.ts = m.ts
         WHERE m.token_id = ? ORDER BY m.ts ASC`,
      )
      .all(tokenId, sinceTs, tokenId) as unknown as (MarketRow & { day: string })[];
    return rows.map((r) => ({ ...toMarket(r), day: r.day }));
  }

  upsertHolder(s: Omit<HolderSnapshot, 'id'> & { topHolders: TopHolder[] }): number {
    const r = this.db
      .prepare(
        `INSERT INTO holder_snapshots (token_id, ts, day, holder_count, top5_pct, top10_pct, top20_pct, top50_pct,
           top100_pct, buckets, excluded_accounts, top_holders, source, truncated, cu_spent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(token_id, day) DO UPDATE SET
           ts = excluded.ts, holder_count = excluded.holder_count, top5_pct = excluded.top5_pct,
           top10_pct = excluded.top10_pct, top20_pct = excluded.top20_pct, top50_pct = excluded.top50_pct,
           top100_pct = excluded.top100_pct, buckets = excluded.buckets, excluded_accounts = excluded.excluded_accounts,
           top_holders = excluded.top_holders, source = excluded.source, truncated = excluded.truncated,
           cu_spent = holder_snapshots.cu_spent + excluded.cu_spent`,
      )
      .run(
        s.tokenId, s.ts, s.day, s.holderCount, s.top5Pct, s.top10Pct, s.top20Pct, s.top50Pct, s.top100Pct,
        s.buckets ? JSON.stringify(s.buckets) : null,
        s.excludedAccounts ? JSON.stringify(s.excludedAccounts) : null,
        JSON.stringify(s.topHolders), s.source, s.truncated ? 1 : 0, s.cuSpent,
      );
    return Number(r.lastInsertRowid);
  }

  latestHolder(tokenId: number): (HolderSnapshot & { topHolders: TopHolder[] }) | null {
    const r = this.db
      .prepare('SELECT * FROM holder_snapshots WHERE token_id = ? ORDER BY ts DESC LIMIT 1')
      .get(tokenId) as unknown as HolderRow | undefined;
    if (!r) return null;
    return { ...toHolder(r), topHolders: parseJson<TopHolder[]>(r.top_holders, []) };
  }

  holderHistory(tokenId: number, sinceTs: number): HolderSnapshot[] {
    return (
      this.db
        .prepare('SELECT * FROM holder_snapshots WHERE token_id = ? AND ts >= ? ORDER BY ts ASC')
        .all(tokenId, sinceTs) as unknown as HolderRow[]
    ).map(toHolder);
  }

  hasHolderSnapshotForDay(tokenId: number, day: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM holder_snapshots WHERE token_id = ? AND day = ?').get(tokenId, day);
  }

  latestMarketForAll(): Map<number, MarketSnapshot> {
    const rows = this.db
      .prepare(
        `SELECT m.* FROM market_snapshots m
         JOIN (SELECT token_id, MAX(ts) AS ts FROM market_snapshots GROUP BY token_id) l
           ON l.token_id = m.token_id AND l.ts = m.ts`,
      )
      .all() as unknown as MarketRow[];
    return new Map(rows.map((r) => [r.token_id, toMarket(r)]));
  }

  latestHolderTsForAll(): Map<number, number> {
    const rows = this.db
      .prepare('SELECT token_id, MAX(ts) AS ts FROM holder_snapshots GROUP BY token_id')
      .all() as unknown as { token_id: number; ts: number }[];
    return new Map(rows.map((r) => [r.token_id, r.ts]));
  }
}
