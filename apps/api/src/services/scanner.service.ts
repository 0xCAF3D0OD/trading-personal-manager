import type { RetroHorizonStats, ScanFlag, ScanMetrics, ScannerOverview, ScannerSettings, ScanResult, ScanRetroView, ScanRun } from '@tpm/shared';
import { BreakerOpenError, type GtPool } from '../datasources/geckoterminal/geckoterminal.source.js';
import type { FactsRow, ScanPoolRow } from '../db/repositories/scanner.repo.js';
import { nowS } from '../db/client.js';
import { ageHours, capOf, median, normalizeGtPool, retroStats, sortKept, stage2, stage3, stage4, tierAfter, type PoolSnap, type TokenFacts, cexVenuesFromTickers } from '../scanner/pipeline.js';
import type { AlertService } from './alert.service.js';
import { AppContext } from './context.js';
import type { SettingsService } from './settings.service.js';

const TTL_RPC = 24 * 3600, TTL_GT = 6 * 3600, TTL_CREATOR = 7 * 86400;
const MAX_STAGE3_PER_RUN = 40;

/**
 * Scanner de nouveaux tokens : découverte, re-vérification par paliers, filtrage en cascade, drapeaux, rétrospective.
 * Conçu pour éliminer, pas pour promouvoir : tri par drapeaux croissants, jamais par performance.
 */
export class ScannerService {
  private tick = 0;

  constructor(private readonly ctx: AppContext, private readonly settings: SettingsService, private readonly alerts: AlertService) {}

  get cfg(): ScannerSettings { return this.settings.get<ScannerSettings>('scanner'); }
  private get gt() { return this.ctx.sources.geckoterminal; }
  private get watchSet(): Set<string> { return new Set(this.ctx.tokens.listActive().map((t) => t.address)); }

  // --- étage 1 --------------------------------------------------------------------

  async discover(): Promise<{ seen: number; inserted: number; ignored: number }> {
    const cfg = this.cfg;
    if (!cfg.enabled) return { seen: 0, inserted: 0, ignored: 0 };
    this.tick++;
    const pools: { p: GtPool; source: string }[] = [];
    for (let page = 1; page <= cfg.discovery.newPoolsPages; page++) {
      const list = await this.gt.newPools(page);
      pools.push(...list.map((p) => ({ p, source: 'new_pools' })));
      if (list.length < 20) break;
    }
    if (cfg.discovery.trendingPages > 0 && this.tick % cfg.discovery.trendingEveryNTicks === 1) {
      for (const d of ['1h', '6h', '24h'] as const) {
        for (let page = 1; page <= cfg.discovery.trendingPages; page++) {
          try { pools.push(...(await this.gt.trendingPools(d, page)).map((p) => ({ p, source: `trending_${d}` }))); }
          catch (err) { this.ctx.log.warn({ err: (err as Error).message }, 'trending_pools indisponible'); }
        }
      }
    }
    let inserted = 0, ignored = 0;
    for (const { p, source } of pools) {
      const s = normalizeGtPool(p, cfg.discovery.quoteTokens);
      if (!s) { ignored++; continue; }
      if (this.ctx.scanner.insertPoolIfNew({ poolAddress: s.poolAddress, dexId: s.dexId, tokenAddress: s.tokenAddress, quoteAddress: s.quoteAddress, symbol: s.symbol, name: s.name, poolCreatedAt: s.poolCreatedAt, source })) inserted++;
    }
    return { seen: pools.length, inserted, ignored };
  }

  // --- étages 2 à 5 ---------------------------------------------------------------

  async evaluate(): Promise<string> {
    const cfg = this.cfg;
    if (!cfg.enabled) return 'scanner désactivé';
    const settingsRow = this.ctx.settings.latest('scanner');
    const runId = this.ctx.scanner.startRun(settingsRow?.id ?? 0);
    const callsBefore = this.gt.callsLastHour;
    const reasons: Record<string, number> = {};
    let poolsChecked = 0, passed2 = 0, passed3 = 0, kept = 0;
    const now = nowS();
    const candidates = new Map<string, { snap: PoolSnap; row: ScanPoolRow }>();
    const otherPools = new Map<string, { poolAddress: string; dexId: string; liquidityUsd: number | null }[]>();
    let status = 'ok';
    let error: string | null = null;
    try {
      const due = this.ctx.scanner.duePools(300);
      for (let i = 0; i < due.length; i += 30) {
        const batch = due.slice(i, i + 30);
        const fetched = await this.gt.poolsMulti(batch.map((b) => b.pool_address));
        const byAddr = new Map(fetched.map((p) => [p.address, p]));
        for (const row of batch) {
          poolsChecked++;
          const raw = byAddr.get(row.pool_address);
          if (!raw) { this.onMissing(row, cfg); continue; }
          const snap = normalizeGtPool(raw, cfg.discovery.quoteTokens);
          if (!snap) { this.ctx.scanner.updatePool(row.pool_address, { tier: 'retired', retired_at: now, retired_reason: 'not_supported' }); continue; }
          this.onChecked(row, snap, cfg, now);
          const created = this.ctx.scanner.earliestPoolCreation(snap.tokenAddress) ?? snap.poolCreatedAt;
          const s2 = stage2(snap, ageHours(created, now), cfg.performance);
          if (!s2.passed) {
            for (const r of s2.reasons) reasons[r.code] = (reasons[r.code] ?? 0) + 1;
            if (s2.hadPerformance) this.ctx.scanner.insertResult({ runId, poolAddress: snap.poolAddress, tokenAddress: snap.tokenAddress, symbol: snap.symbol, name: snap.name, status: 'excluded', excludedStage: 2, exclusionReasons: s2.reasons, structural: [], structuralPassed: null, structuralTotal: null, flags: [], flagCount: 0, unverifiedCount: 0, metrics: this.metrics(snap, created, []) });
            continue;
          }
          passed2++;
          const existing = candidates.get(snap.tokenAddress);
          if (!existing || (snap.reserveUsd ?? 0) > (existing.snap.reserveUsd ?? 0)) {
            if (existing) otherPools.set(snap.tokenAddress, [...(otherPools.get(snap.tokenAddress) ?? []), { poolAddress: existing.snap.poolAddress, dexId: existing.snap.dexId, liquidityUsd: existing.snap.reserveUsd }]);
            candidates.set(snap.tokenAddress, { snap, row });
          } else otherPools.set(snap.tokenAddress, [...(otherPools.get(snap.tokenAddress) ?? []), { poolAddress: snap.poolAddress, dexId: snap.dexId, liquidityUsd: snap.reserveUsd }]);
        }
      }
      // Un token = une ligne, sur son pool le plus liquide. Enrichissement borné par exécution.
      let enriched = 0;
      for (const [token, { snap }] of candidates) {
        if (enriched++ >= MAX_STAGE3_PER_RUN) { status = 'partial'; break; }
        const created = this.ctx.scanner.earliestPoolCreation(token) ?? snap.poolCreatedAt;
        const others = otherPools.get(token) ?? [];
        const facts = await this.enrich(token, { rpc: true, gt: false, creator: false });
        const s3 = stage3(snap, facts, cfg.structural);
        if (s3.passed < s3.total) {
          this.ctx.scanner.insertResult({ runId, poolAddress: snap.poolAddress, tokenAddress: token, symbol: snap.symbol, name: snap.name, status: 'excluded', excludedStage: 3, exclusionReasons: s3.checks.filter((c) => !c.passed).map((c) => ({ code: c.code, label: c.label, observed: c.observed, threshold: c.threshold })), structural: s3.checks, structuralPassed: s3.passed, structuralTotal: s3.total, flags: [], flagCount: 0, unverifiedCount: 0, metrics: this.metrics(snap, created, others) });
          continue;
        }
        passed3++;
        const full = await this.enrich(token, { rpc: true, gt: true, creator: true });
        const flags = stage4(snap, full, cfg.flags, cfg.performance.minChangeH24Pct);
        const raised = flags.filter((f) => f.raised).length;
        const unverified = flags.filter((f) => !f.verified).length;
        this.ctx.scanner.insertResult({ runId, poolAddress: snap.poolAddress, tokenAddress: token, symbol: snap.symbol, name: snap.name, status: 'kept', excludedStage: null, exclusionReasons: [], structural: s3.checks, structuralPassed: s3.passed, structuralTotal: s3.total, flags, flagCount: raised, unverifiedCount: unverified, metrics: this.metrics(snap, created, others) });
        kept++;
        const { cap, mcapIsFdv } = capOf(snap);
        if (snap.priceUsd !== null) {
          this.ctx.scanner.insertRetroIfNew({ token, symbol: snap.symbol, runId, price: snap.priceUsd, mcap: cap, mcapIsFdv, flagCount: raised, structural: `${s3.passed}/${s3.total}`, flags: flags.filter((f) => f.raised).map((f) => f.code) });
        }
        await this.maybeAlert(token, snap, s3.passed, s3.total, flags);
      }
    } catch (err) {
      status = err instanceof BreakerOpenError ? 'rate_limited' : 'error';
      error = (err as Error).message;
      this.ctx.log.warn({ err: error }, 'Scanner : exécution interrompue');
    }
    this.ctx.scanner.finishRun(runId, { status, poolsChecked, passedStage2: passed2, passedStage3: passed3, keptCount: kept, apiCalls: Math.max(0, this.gt.callsLastHour - callsBefore), stage2Reasons: reasons, error });
    return `${poolsChecked} pools, ${passed2} après étage 2, ${passed3} après étage 3, ${kept} gardés (${status})`;
  }

  private onMissing(row: ScanPoolRow, cfg: ScannerSettings): void {
    const missing = row.missing_count + 1;
    if (missing >= cfg.discovery.retireAfterColdChecks) this.ctx.scanner.updatePool(row.pool_address, { missing_count: missing, tier: 'retired', retired_at: nowS(), retired_reason: 'pool_gone', last_checked_at: nowS() });
    else this.ctx.scanner.updatePool(row.pool_address, { missing_count: missing, tier: 'cold', next_check_at: nowS() + cfg.discovery.coldIntervalS, last_checked_at: nowS() });
  }

  private onChecked(row: ScanPoolRow, snap: PoolSnap, cfg: ScannerSettings, now: number): void {
    const tier = tierAfter(snap, cfg.performance, cfg.discovery);
    const below = tier === 'cold' ? row.consecutive_below + 1 : 0;
    const ageMax = snap.poolCreatedAt !== null && now - snap.poolCreatedAt > cfg.performance.maxAgeDays * 86400;
    const retired = ageMax || below >= cfg.discovery.retireAfterColdChecks;
    const interval = tier === 'hot' ? cfg.discovery.hotIntervalS : tier === 'warm' ? cfg.discovery.warmIntervalS : cfg.discovery.coldIntervalS;
    this.ctx.scanner.updatePool(row.pool_address, {
      tier: retired ? 'retired' : tier, next_check_at: now + interval, last_checked_at: now, missing_count: 0,
      last_liquidity_usd: snap.reserveUsd, last_volume_h24_usd: snap.volumeH24, last_pct_h24: snap.pctH24, consecutive_below: below,
      token_symbol: snap.symbol ?? row.token_symbol, token_name: snap.name ?? row.token_name, pool_created_at: snap.poolCreatedAt ?? row.pool_created_at,
      ...(retired ? { retired_at: now, retired_reason: ageMax ? 'age_max' : 'dormant' } : {}),
    });
    if (tier === 'hot') this.ctx.scanner.insertCheck({ poolAddress: snap.poolAddress, ts: now, price: snap.priceUsd, fdv: snap.fdvUsd, mcap: snap.marketCapUsd, reserve: snap.reserveUsd, volH1: snap.volumeH1, volH24: snap.volumeH24, pctH1: snap.pctH1, pctH24: snap.pctH24, h1: snap.txH1, h24: snap.txH24 });
  }

  private metrics(s: PoolSnap, created: number | null, others: { poolAddress: string; dexId: string; liquidityUsd: number | null }[]): ScanMetrics {
    const { cap, mcapIsFdv } = capOf(s);
    return {
      poolAddress: s.poolAddress, dexId: s.dexId, priceUsd: s.priceUsd, priceSource: 'geckoterminal', ageHours: ageHours(created, nowS()), poolCreatedAt: created,
      pctH1: s.pctH1, pctH24: s.pctH24, capUsd: cap, mcapIsFdv, fdvUsd: s.fdvUsd, marketCapUsd: s.marketCapUsd, liquidityUsd: s.reserveUsd,
      volumeH24Usd: s.volumeH24, volumeH1Usd: s.volumeH1, volumeToMcap: s.volumeH24 !== null && cap ? s.volumeH24 / cap : null, liquidityToMcapPct: s.reserveUsd !== null && cap ? (s.reserveUsd / cap) * 100 : null,
      txH1: s.txH1, txH24: s.txH24, otherPools: others,
    };
  }

  /** Enrichissement borné par TTL : RPC (autorités), GeckoTerminal (info token), Helius (créateur en série). */
  async enrich(token: string, need: { rpc: boolean; gt: boolean; creator: boolean }): Promise<TokenFacts> {
    const now = nowS();
    let f: FactsRow | undefined = this.ctx.scanner.facts(token);
    if (need.rpc && (!f?.rpc_checked_at || now - f.rpc_checked_at > TTL_RPC)) {
      try {
        const m = await this.ctx.sources.rpc.getMintInfo(token);
        this.ctx.scanner.upsertFacts(token, { program: m.program, mint_authority: m.mintAuthority, freeze_authority: m.freezeAuthority, transfer_fee_bps: m.transferFeeBps, extensions: JSON.stringify(m.extensions), supply: m.supply, decimals: m.decimals, rpc_checked_at: now });
      } catch (err) { this.ctx.log.warn({ err: (err as Error).message, token }, 'Scanner : getMintInfo échoué'); }
    }
    if (need.gt && (!f?.gt_checked_at || now - f.gt_checked_at > TTL_GT)) {
      try {
        const i = await this.gt.tokenInfo(token);
        this.ctx.scanner.upsertFacts(token, { holders_count: i.holdersCount, top10_pct: i.top10Pct, developer_address: i.developerAddress, developer_holding_pct: i.developerHoldingPct, has_website: i.websites.length ? 1 : 0, has_socials: i.hasSocials ? 1 : 0, has_description: i.description ? 1 : 0, gt_is_honeypot: i.isHoneypot, gt_mint_authority: i.mintAuthority, gt_freeze_authority: i.freezeAuthority, gt_checked_at: now, coingecko_id: i.coingeckoCoinId });
      } catch (err) { this.ctx.log.warn({ err: (err as Error).message, token }, 'Scanner : token info échoué'); }
    }
    f = this.ctx.scanner.facts(token);
    // Plateformes centralisées : seulement si le token a une fiche CoinGecko. Un symbole seul ne prouve rien.
    const TTL_CEX = 24 * 3600;
    if (need.gt && f?.coingecko_id && (!f.cex_checked_at || now - f.cex_checked_at > TTL_CEX)) {
      try {
        const tickers = await this.gt.coinTickers(f.coingecko_id);
        const venues = cexVenuesFromTickers(tickers);
        this.ctx.scanner.upsertFacts(token, { cex_venues: JSON.stringify(venues), cex_checked_at: now });
      } catch (err) { this.ctx.log.warn({ err: (err as Error).message, token }, 'Scanner : marchés CoinGecko échoués'); }
    }
    if (need.creator && this.ctx.sources.helius && (!f?.creator_checked_at || now - f.creator_checked_at > TTL_CREATOR)) {
      const creator = f?.developer_address ?? null;
      if (creator) {
        try {
          const count = await this.ctx.sources.helius.countFungibleByCreator(creator);
          this.ctx.scanner.upsertFacts(token, { creator_address: creator, creator_token_count: count, creator_checked_at: now });
        } catch (err) { this.ctx.log.warn({ err: (err as Error).message, token }, 'Scanner : comptage créateur échoué'); }
      }
    }
    f = this.ctx.scanner.facts(token);
    return {
      rpcOk: !!f?.rpc_checked_at, mintAuthority: f?.mint_authority ?? null, freezeAuthority: f?.freeze_authority ?? null, transferFeeBps: f?.transfer_fee_bps ?? null,
      gtOk: !!f?.gt_checked_at, top10Pct: f?.top10_pct ?? null, holdersCount: f?.holders_count ?? null, developerAddress: f?.developer_address ?? null, developerHoldingPct: f?.developer_holding_pct ?? null,
      hasWebsite: f?.has_website === 1, hasSocials: f?.has_socials === 1, hasDescription: f?.has_description === 1, gtIsHoneypot: f?.gt_is_honeypot ?? null,
      gtMintAuthority: (f?.gt_mint_authority as 'yes' | 'no' | null) ?? null, gtFreezeAuthority: (f?.gt_freeze_authority as 'yes' | 'no' | null) ?? null,
      creatorTokenCount: f?.creator_token_count ?? null,
    };
  }

  /** Alerte volontairement rare : 5/5, zéro drapeau levé, tout vérifié (donc Helius présent), une seule fois par token. */
  private async maybeAlert(token: string, snap: PoolSnap, passed: number, total: number, flags: ScanFlag[]): Promise<void> {
    if (passed < total || flags.some((f) => f.raised) || flags.some((f) => !f.verified)) return;
    const r = this.ctx.scanner.retro(token);
    if (!r || r.alerted_at) return;
    const { cap, mcapIsFdv } = capOf(snap);
    const fmt = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v));
    const res = await this.alerts.fireEvent({
      tokenId: this.watchTokenIdOr0(token), type: 'scanner_clean_candidate', priority: 'default', dedupeKey: `scan:${token}`, cooldownS: 0,
      ruleText: `Scanner : ${snap.symbol ?? token.slice(0, 6)} passe 5/5 filtres structurels avec zéro drapeau. +${snap.pctH24?.toFixed(0)} % / 24 h, cap ${fmt(cap)} $${mcapIsFdv ? ' (FDV, non vérifiée)' : ''}, liquidité ${fmt(snap.reserveUsd)} $, volume ${fmt(snap.volumeH24)} $. Zéro drapeau ne veut pas dire sûr : le scanner n’a rien trouvé, il n’a pas tout vu.`,
      payload: { token, pool: snap.poolAddress },
    });
    if (res.fired) this.ctx.scanner.markAlerted(token);
  }

  /** Les alertes sont rattachées à un token de la watchlist ; le scanner utilise un token technique « scanner » créé à la volée. */
  private watchTokenIdOr0(token: string): number {
    const existing = this.ctx.tokens.byAddress(token);
    if (existing) return existing.id;
    const holder = this.ctx.tokens.byAddress('ScannerAlerts1111111111111111111111111111111');
    if (holder) return holder.id;
    const row = this.ctx.tokens.insert({ address: 'ScannerAlerts1111111111111111111111111111111', symbol: 'SCANNER', name: 'Alertes du scanner', decimals: 0, program: 'spl-token', createdAt: null, createdAtSource: null, creatorAddress: null, creatorSource: null });
    this.ctx.tokens.archive(row.id);
    return row.id;
  }

  // --- rétrospective --------------------------------------------------------------

  async retro(): Promise<number> {
    const due = this.ctx.scanner.retroDue();
    if (!due.length) return 0;
    const prices = new Map<string, { price: number | null; reserve: number | null }>();
    const tokens = [...new Set(due.map((r) => r.token_address))];
    try {
      for (const t of await this.gt.tokensMulti(tokens)) prices.set(t.address, { price: t.priceUsd, reserve: t.totalReserveUsd });
    } catch (err) { this.ctx.log.warn({ err: (err as Error).message }, 'Scanner : rétrospective indisponible'); return 0; }
    const now = nowS();
    let filled = 0;
    for (const r of due) {
      const p = prices.get(r.token_address);
      const alive = !!p && p.price !== null && p.price > 0 && (p.reserve === null || p.reserve > 0);
      const set = (h: 'd1' | 'd7' | 'd30') => { this.ctx.scanner.setRetroHorizon(r.token_address, h, alive ? p!.price : null, alive ? 'filled' : 'unavailable'); filled++; };
      if (r.status_d1 === 'pending' && now >= r.first_kept_at + 86400 - 7200) set('d1');
      if (r.status_d7 === 'pending' && now >= r.first_kept_at + 7 * 86400 - 21600) set('d7');
      if (r.status_d30 === 'pending' && now >= r.first_kept_at + 30 * 86400 - 43200) set('d30');
    }
    return filled;
  }

  retroView(): ScanRetroView {
    const rows = this.ctx.scanner.retroRows(this.watchSet);
    const horizons = ['d1', 'd7', 'd30'] as const;
    const stats: RetroHorizonStats[] = horizons.map((h) => ({ horizon: h, ...retroStats(rows.map((r) => r[h])) }));
    const byFlagCount: ScanRetroView['byFlagCount'] = [];
    for (const h of horizons) for (const bucket of ['0', '1', '2', '3+']) {
      const sel = rows.filter((r) => (bucket === '3+' ? r.refFlagCount >= 3 : r.refFlagCount === Number(bucket)) && r[h].status !== 'pending');
      byFlagCount.push({ flagCount: bucket, horizon: h, count: sel.length, medianPct: median(sel.map((r) => r[h].pnlPct ?? -100)) });
    }
    const allFlags = [...new Set(rows.flatMap((r) => r.refFlags))];
    const byFlag: ScanRetroView['byFlag'] = [];
    for (const h of horizons) for (const flag of allFlags) {
      const done = rows.filter((r) => r[h].status !== 'pending');
      const w = done.filter((r) => r.refFlags.includes(flag)), wo = done.filter((r) => !r.refFlags.includes(flag));
      byFlag.push({ flag, horizon: h, withCount: w.length, withoutCount: wo.length, withFlagMedianPct: median(w.map((r) => r[h].pnlPct ?? -100)), withoutFlagMedianPct: median(wo.map((r) => r[h].pnlPct ?? -100)) });
    }
    return { rows, stats, byFlagCount, byFlag };
  }

  // --- lecture et entretien -------------------------------------------------------

  overview(): ScannerOverview {
    return { lastRun: this.ctx.scanner.lastRun(), pools: this.ctx.scanner.tierCounts(), breaker: this.gt.breaker, lane: this.gt.lane, callsLastHour: this.gt.callsLastHour, heliusAvailable: !!this.ctx.sources.helius, enabled: this.cfg.enabled };
  }
  results(days = 1): ScanResult[] { return sortKept(this.ctx.scanner.latestKeptPerToken(days, this.watchSet).map((r) => ({ ...r, liquidityUsd: r.metrics.liquidityUsd }))); }
  excluded(days = 7): ScanResult[] { return this.ctx.scanner.recentExcluded(days, this.watchSet); }
  runs(): ScanRun[] { return this.ctx.scanner.runs(); }
  maintenance(): string {
    const cfg = this.cfg;
    const retired = this.ctx.scanner.retireOld(cfg.performance.maxAgeDays * 86400);
    const checks = this.ctx.scanner.purgeChecks(7 * 86400);
    const excluded = this.ctx.scanner.purgeExcluded(cfg.discovery.nearMissRetentionDays * 86400);
    return `${retired} pools retirés, ${checks} relevés purgés, ${excluded} exclusions purgées`;
  }
}
