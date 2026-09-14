import type { ScanExclusion, ScanFlag, ScanMetrics, ScanResult, ScanRetroRow, ScanRun, ScanStructuralCheck, ScanTier } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

export interface ScanPoolRow {
  pool_address: string; dex_id: string | null; token_address: string; quote_address: string | null; token_symbol: string | null; token_name: string | null;
  pool_created_at: number | null; first_seen_at: number; discovery_source: string; tier: ScanTier; next_check_at: number; last_checked_at: number | null;
  last_liquidity_usd: number | null; last_volume_h24_usd: number | null; last_pct_h24: number | null; consecutive_below: number; missing_count: number;
  retired_at: number | null; retired_reason: string | null;
}
export interface FactsRow {
  token_address: string; program: string | null; mint_authority: string | null; freeze_authority: string | null; transfer_fee_bps: number | null; extensions: string | null;
  supply: number | null; decimals: number | null; rpc_checked_at: number | null; holders_count: number | null; top10_pct: number | null; developer_address: string | null;
  developer_holding_pct: number | null; has_website: number | null; has_socials: number | null; has_description: number | null; gt_is_honeypot: string | null;
  gt_mint_authority: string | null; gt_freeze_authority: string | null; gt_checked_at: number | null; creator_address: string | null; creator_token_count: number | null; creator_checked_at: number | null;
}
interface RunRow { id: number; started_at: number; finished_at: number | null; status: string; settings_id: number; pools_checked: number; passed_stage2: number; passed_stage3: number; kept_count: number; api_calls: number; stage2_reasons: string; error: string | null }
interface ResultRow { id: number; run_id: number; pool_address: string; token_address: string; token_symbol: string | null; token_name: string | null; status: 'kept' | 'excluded'; excluded_stage: number | null; exclusion_reasons: string; structural: string; structural_passed: number | null; structural_total: number | null; flags: string; flag_count: number; unverified_count: number; metrics: string; observed_at: number }
interface RetroRow {
  token_address: string; token_symbol: string | null; first_kept_at: number; first_run_id: number; ref_price_usd: number; ref_mcap_usd: number | null; ref_mcap_is_fdv: number; ref_flag_count: number; ref_structural: string | null; ref_flags: string;
  price_d1: number | null; price_d1_at: number | null; status_d1: string; price_d7: number | null; price_d7_at: number | null; status_d7: string; price_d30: number | null; price_d30_at: number | null; status_d30: string; alerted_at: number | null;
}
const j = <T>(s: string | null, fb: T): T => { if (!s) return fb; try { return JSON.parse(s) as T; } catch { return fb; } };

export function toRun(r: RunRow): ScanRun {
  return { id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, settingsId: r.settings_id, poolsChecked: r.pools_checked, passedStage2: r.passed_stage2, passedStage3: r.passed_stage3, keptCount: r.kept_count, apiCalls: r.api_calls, stage2Reasons: j(r.stage2_reasons, {}), error: r.error };
}
export function toResult(r: ResultRow, watch: Set<string>): ScanResult {
  return {
    id: r.id, runId: r.run_id, poolAddress: r.pool_address, tokenAddress: r.token_address, tokenSymbol: r.token_symbol, tokenName: r.token_name, status: r.status,
    excludedStage: r.excluded_stage, exclusionReasons: j<ScanExclusion[]>(r.exclusion_reasons, []), structural: j<ScanStructuralCheck[]>(r.structural, []),
    structuralPassed: r.structural_passed, structuralTotal: r.structural_total, flags: j<ScanFlag[]>(r.flags, []), flagCount: r.flag_count, unverifiedCount: r.unverified_count,
    metrics: j<ScanMetrics>(r.metrics, {} as ScanMetrics), observedAt: r.observed_at, inWatchlist: watch.has(r.token_address),
  };
}
export function toRetro(r: RetroRow, watch: Set<string>): ScanRetroRow {
  const h = (p: number | null, st: string) => ({ price: p, status: st, pnlPct: p !== null && st === 'filled' && r.ref_price_usd > 0 ? ((p - r.ref_price_usd) / r.ref_price_usd) * 100 : st === 'unavailable' ? -100 : null });
  return {
    tokenAddress: r.token_address, tokenSymbol: r.token_symbol, firstKeptAt: r.first_kept_at, refPriceUsd: r.ref_price_usd, refMcapUsd: r.ref_mcap_usd, refMcapIsFdv: r.ref_mcap_is_fdv === 1,
    refFlagCount: r.ref_flag_count, refStructural: r.ref_structural, refFlags: j<string[]>(r.ref_flags, []),
    d1: h(r.price_d1, r.status_d1), d7: h(r.price_d7, r.status_d7), d30: h(r.price_d30, r.status_d30), inWatchlist: watch.has(r.token_address),
  };
}

export class ScannerRepo {
  constructor(private readonly db: Db) {}

  // --- pools ---------------------------------------------------------------------
  pool(address: string): ScanPoolRow | undefined { return this.db.prepare('SELECT * FROM scan_pools WHERE pool_address = ?').get(address) as unknown as ScanPoolRow | undefined; }
  insertPoolIfNew(p: { poolAddress: string; dexId: string; tokenAddress: string; quoteAddress: string; symbol: string | null; name: string | null; poolCreatedAt: number | null; source: string }): boolean {
    const r = this.db.prepare(`INSERT OR IGNORE INTO scan_pools (pool_address, dex_id, token_address, quote_address, token_symbol, token_name, pool_created_at, first_seen_at, discovery_source, tier, next_check_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'hot', ?)`).run(p.poolAddress, p.dexId, p.tokenAddress, p.quoteAddress, p.symbol, p.name, p.poolCreatedAt, nowS(), p.source, nowS());
    return Number(r.changes) > 0;
  }
  duePools(limit: number): ScanPoolRow[] {
    return this.db.prepare(`SELECT * FROM scan_pools WHERE tier != 'retired' AND next_check_at <= ? ORDER BY CASE tier WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END, next_check_at ASC LIMIT ?`).all(nowS(), limit) as unknown as ScanPoolRow[];
  }
  updatePool(address: string, patch: Partial<Record<keyof ScanPoolRow, string | number | null>>): void {
    const keys = Object.keys(patch) as (keyof ScanPoolRow)[];
    if (!keys.length) return;
    this.db.prepare(`UPDATE scan_pools SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE pool_address = ?`).run(...keys.map((k) => patch[k] as string | number | null), address);
  }
  poolsOfToken(tokenAddress: string): ScanPoolRow[] { return this.db.prepare('SELECT * FROM scan_pools WHERE token_address = ? ORDER BY last_liquidity_usd DESC').all(tokenAddress) as unknown as ScanPoolRow[]; }
  earliestPoolCreation(tokenAddress: string): number | null {
    return (this.db.prepare('SELECT MIN(pool_created_at) AS m FROM scan_pools WHERE token_address = ?').get(tokenAddress) as { m: number | null }).m;
  }
  tierCounts(): Record<ScanTier, number> {
    const rows = this.db.prepare('SELECT tier, COUNT(*) AS n FROM scan_pools GROUP BY tier').all() as unknown as { tier: ScanTier; n: number }[];
    const out: Record<ScanTier, number> = { hot: 0, warm: 0, cold: 0, retired: 0 };
    for (const r of rows) out[r.tier] = r.n;
    return out;
  }
  retireOld(maxAgeS: number): number {
    return Number(this.db.prepare(`UPDATE scan_pools SET tier = 'retired', retired_at = ?, retired_reason = 'age_max' WHERE tier != 'retired' AND pool_created_at IS NOT NULL AND pool_created_at < ?`).run(nowS(), nowS() - maxAgeS).changes);
  }
  insertCheck(c: { poolAddress: string; ts: number; price: number | null; fdv: number | null; mcap: number | null; reserve: number | null; volH1: number | null; volH24: number | null; pctH1: number | null; pctH24: number | null; h1: { buys: number; sells: number; buyers: number; sellers: number } | null; h24: { buys: number; sells: number; buyers: number; sellers: number } | null }): void {
    this.db.prepare(`INSERT INTO scan_pool_checks (pool_address, ts, price_usd, fdv_usd, market_cap_usd, reserve_usd, volume_h1_usd, volume_h24_usd, pct_h1, pct_h24, buys_h1, sells_h1, buyers_h1, sellers_h1, buys_h24, sells_h24, buyers_h24, sellers_h24)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.poolAddress, c.ts, c.price, c.fdv, c.mcap, c.reserve, c.volH1, c.volH24, c.pctH1, c.pctH24, c.h1?.buys ?? null, c.h1?.sells ?? null, c.h1?.buyers ?? null, c.h1?.sellers ?? null, c.h24?.buys ?? null, c.h24?.sells ?? null, c.h24?.buyers ?? null, c.h24?.sellers ?? null);
  }
  purgeChecks(olderThanS: number): number { return Number(this.db.prepare('DELETE FROM scan_pool_checks WHERE ts < ?').run(nowS() - olderThanS).changes); }

  // --- facts ---------------------------------------------------------------------
  facts(token: string): FactsRow | undefined { return this.db.prepare('SELECT * FROM scan_token_facts WHERE token_address = ?').get(token) as unknown as FactsRow | undefined; }
  upsertFacts(token: string, patch: Partial<Record<keyof FactsRow, string | number | null>>): void {
    this.db.prepare('INSERT OR IGNORE INTO scan_token_facts (token_address) VALUES (?)').run(token);
    const keys = Object.keys(patch) as (keyof FactsRow)[];
    if (!keys.length) return;
    this.db.prepare(`UPDATE scan_token_facts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE token_address = ?`).run(...keys.map((k) => patch[k] as string | number | null), token);
  }

  // --- runs / results -------------------------------------------------------------
  startRun(settingsId: number): number {
    return Number(this.db.prepare(`INSERT INTO scan_runs (started_at, status, settings_id) VALUES (?, 'running', ?)`).run(nowS(), settingsId).lastInsertRowid);
  }
  finishRun(id: number, patch: { status: string; poolsChecked: number; passedStage2: number; passedStage3: number; keptCount: number; apiCalls: number; stage2Reasons: Record<string, number>; error: string | null }): void {
    this.db.prepare('UPDATE scan_runs SET finished_at = ?, status = ?, pools_checked = ?, passed_stage2 = ?, passed_stage3 = ?, kept_count = ?, api_calls = ?, stage2_reasons = ?, error = ? WHERE id = ?')
      .run(nowS(), patch.status, patch.poolsChecked, patch.passedStage2, patch.passedStage3, patch.keptCount, patch.apiCalls, JSON.stringify(patch.stage2Reasons), patch.error, id);
  }
  runs(limit = 50): ScanRun[] { return (this.db.prepare('SELECT * FROM scan_runs ORDER BY id DESC LIMIT ?').all(limit) as unknown as RunRow[]).map(toRun); }
  lastRun(): ScanRun | null { const r = this.db.prepare(`SELECT * FROM scan_runs WHERE status != 'running' ORDER BY id DESC LIMIT 1`).get() as unknown as RunRow | undefined; return r ? toRun(r) : null; }
  insertResult(r: { runId: number; poolAddress: string; tokenAddress: string; symbol: string | null; name: string | null; status: 'kept' | 'excluded'; excludedStage: number | null; exclusionReasons: ScanExclusion[]; structural: ScanStructuralCheck[]; structuralPassed: number | null; structuralTotal: number | null; flags: ScanFlag[]; flagCount: number; unverifiedCount: number; metrics: ScanMetrics }): number {
    return Number(this.db.prepare(`INSERT INTO scan_results (run_id, pool_address, token_address, token_symbol, token_name, status, excluded_stage, exclusion_reasons, structural, structural_passed, structural_total, flags, flag_count, unverified_count, metrics, observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(r.runId, r.poolAddress, r.tokenAddress, r.symbol, r.name, r.status, r.excludedStage, JSON.stringify(r.exclusionReasons), JSON.stringify(r.structural), r.structuralPassed, r.structuralTotal, JSON.stringify(r.flags), r.flagCount, r.unverifiedCount, JSON.stringify(r.metrics), nowS()).lastInsertRowid);
  }
  results(runId: number, status: 'kept' | 'excluded', watch: Set<string>): ScanResult[] {
    return (this.db.prepare('SELECT * FROM scan_results WHERE run_id = ? AND status = ? ORDER BY flag_count ASC, unverified_count ASC, id ASC').all(runId, status) as unknown as ResultRow[]).map((r) => toResult(r, watch));
  }
  /** Derniers résultats gardés toutes exécutions confondues : un par token, le plus récent. */
  latestKeptPerToken(days: number, watch: Set<string>): ScanResult[] {
    const rows = this.db.prepare(`SELECT r.* FROM scan_results r JOIN (SELECT token_address, MAX(id) AS id FROM scan_results WHERE status = 'kept' AND observed_at >= ? GROUP BY token_address) l ON l.id = r.id ORDER BY r.flag_count ASC, r.unverified_count ASC`).all(nowS() - days * 86400) as unknown as ResultRow[];
    return rows.map((r) => toResult(r, watch));
  }
  recentExcluded(days: number, watch: Set<string>, limit = 500): ScanResult[] {
    const rows = this.db.prepare(`SELECT r.* FROM scan_results r JOIN (SELECT token_address, MAX(id) AS id FROM scan_results WHERE status = 'excluded' AND observed_at >= ? GROUP BY token_address) l ON l.id = r.id ORDER BY r.observed_at DESC LIMIT ?`).all(nowS() - days * 86400, limit) as unknown as ResultRow[];
    return rows.map((r) => toResult(r, watch));
  }
  purgeExcluded(olderThanS: number): number { return Number(this.db.prepare(`DELETE FROM scan_results WHERE status = 'excluded' AND observed_at < ?`).run(nowS() - olderThanS).changes); }

  // --- retro ---------------------------------------------------------------------
  retro(token: string): RetroRow | undefined { return this.db.prepare('SELECT * FROM scan_retro WHERE token_address = ?').get(token) as unknown as RetroRow | undefined; }
  insertRetroIfNew(r: { token: string; symbol: string | null; runId: number; price: number; mcap: number | null; mcapIsFdv: boolean; flagCount: number; structural: string | null; flags: string[] }): boolean {
    return Number(this.db.prepare(`INSERT OR IGNORE INTO scan_retro (token_address, token_symbol, first_kept_at, first_run_id, ref_price_usd, ref_mcap_usd, ref_mcap_is_fdv, ref_flag_count, ref_structural, ref_flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(r.token, r.symbol, nowS(), r.runId, r.price, r.mcap, r.mcapIsFdv ? 1 : 0, r.flagCount, r.structural, JSON.stringify(r.flags)).changes) > 0;
  }
  retroDue(): RetroRow[] {
    const now = nowS();
    return this.db.prepare(`SELECT * FROM scan_retro WHERE (status_d1 = 'pending' AND first_kept_at + 86400 - 7200 <= ?) OR (status_d7 = 'pending' AND first_kept_at + 7*86400 - 21600 <= ?) OR (status_d30 = 'pending' AND first_kept_at + 30*86400 - 43200 <= ?)`).all(now, now, now) as unknown as RetroRow[];
  }
  setRetroHorizon(token: string, horizon: 'd1' | 'd7' | 'd30', price: number | null, status: 'filled' | 'unavailable'): void {
    this.db.prepare(`UPDATE scan_retro SET price_${horizon} = ?, price_${horizon}_at = ?, status_${horizon} = ? WHERE token_address = ?`).run(price, nowS(), status, token);
  }
  markAlerted(token: string): void { this.db.prepare('UPDATE scan_retro SET alerted_at = ? WHERE token_address = ?').run(nowS(), token); }
  retroRows(watch: Set<string>): ScanRetroRow[] { return (this.db.prepare('SELECT * FROM scan_retro ORDER BY first_kept_at DESC').all() as unknown as RetroRow[]).map((r) => toRetro(r, watch)); }
}
