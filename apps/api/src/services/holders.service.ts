import type { ExcludedAccount, HoldersView, SourceName, TopHolder, ValueBucket } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import type { HoldersResult, RawHolder } from '../datasources/types.js';
import { dayOf, nowS } from '../db/client.js';
import { AppContext, ValidationError } from './context.js';
import type { MarketService } from './market.service.js';
import type { TokenService } from './token.service.js';

const BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '< 10 $', min: 0, max: 10 },
  { label: '10 – 100 $', min: 10, max: 100 },
  { label: '100 – 1 k$', min: 100, max: 1_000 },
  { label: '1 k – 10 k$', min: 1_000, max: 10_000 },
  { label: '10 k – 100 k$', min: 10_000, max: 100_000 },
  { label: '> 100 k$', min: 100_000, max: null },
];

export class HoldersService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService, private readonly market: MarketService) {}

  getView(tokenId: number): HoldersView {
    this.tokens.require(tokenId);
    const latest = this.ctx.snapshots.latestHolder(tokenId);
    const full = this.ctx.sources.canFullHolders;
    return {
      latest: latest ? stripTop(latest) : null,
      topHolders: latest?.topHolders ?? [],
      history: this.ctx.snapshots.holderHistory(tokenId, nowS() - 180 * 86400),
      capabilities: {
        top50And100: full, holderCount: full,
        missingVariable: full ? null : 'SOLANA_RPC_URL (URL Helius)',
      },
    };
  }

  /**
   * Capture un snapshot détenteurs. Refusé si le dernier date de moins de TTL.holders,
   * sauf `force` (route de rafraîchissement, elle-même rate-limitée).
   */
  async snapshot(tokenId: number, opts: { force?: boolean; economy?: boolean } = {}): Promise<{ skipped: boolean; reason?: string }> {
    const token = this.tokens.require(tokenId);
    const latest = this.ctx.snapshots.latestHolder(tokenId);
    const now = nowS();
    if (!opts.force && latest && now - latest.ts < TTL.holders) {
      return { skipped: true, reason: `Dernier snapshot il y a ${Math.round((now - latest.ts) / 60)} min (TTL ${TTL.holders / 3600} h).` };
    }
    if (opts.force && latest && now - latest.ts < 15 * 60) {
      throw new ValidationError('Un snapshot détenteurs a déjà été pris il y a moins de 15 minutes.');
    }

    const mint = (await this.tokens.getMintInfo(token.address)).value;
    const supply = (await this.ctx.sources.rpc.getTokenSupply(token.address)).supply;
    const marketData = await this.market.getData(token.address);
    const price = marketData.pair?.priceUsd ?? marketData.jupiterPrice;

    const result = await this.fetchHolders(token.address, mint.decimals, opts.economy ?? false);

    // Classification des propriétaires du haut du classement : pools, vaults et burn exclus.
    const head = result.holders.slice(0, 150);
    const kinds = await this.ctx.sources.rpc.classifyOwners(head.map((h) => h.owner));
    const excluded: ExcludedAccount[] = [];
    const wallets: RawHolder[] = [];
    for (const h of result.holders) {
      const kind = kinds.get(h.owner) ?? 'wallet';
      if (kind === 'wallet') wallets.push(h);
      else excluded.push({ owner: h.owner, amount: h.amount, pct: supply > 0 ? (h.amount / supply) * 100 : 0, reason: kind === 'burn' ? 'Adresse de burn' : 'Compte détenu par un programme (pool, vault, escrow, bonding curve)' });
    }

    const pctTop = (n: number): number | null => {
      if (result.source === 'rpc' && n > 20) return null;
      if (wallets.length < Math.min(n, 5) && !result.truncated) return supply > 0 ? (sum(wallets.slice(0, n)) / supply) * 100 : null;
      if (wallets.length < n && result.source !== 'helius') return null;
      return supply > 0 ? (sum(wallets.slice(0, n)) / supply) * 100 : null;
    };

    let buckets: ValueBucket[] | null = null;
    if (result.source === 'helius' && !result.truncated && price !== null) {
      buckets = BUCKETS.map((b) => ({ label: b.label, minUsd: b.min, maxUsd: b.max, count: 0 }));
      for (const w of wallets) {
        const v = w.amount * price;
        const idx = BUCKETS.findIndex((b) => v >= b.min && (b.max === null || v < b.max));
        if (idx >= 0) (buckets[idx] as ValueBucket).count++;
      }
    }

    let holderCount = result.totalHolders;
    if (result.source === 'helius' && !result.truncated) holderCount = wallets.length;
    if (holderCount === null) {
      const rc = this.ctx.cache.peekStale<{ totalHolders: number | null }>(`rugcheck:${token.address}`);
      if (rc?.value?.totalHolders) holderCount = rc.value.totalHolders;
    }

    const topHolders: TopHolder[] = wallets.slice(0, 20).map((w, i) => ({
      rank: i + 1, owner: w.owner, amount: w.amount,
      pct: supply > 0 ? (w.amount / supply) * 100 : 0,
      valueUsd: price !== null ? w.amount * price : null,
    }));

    this.ctx.snapshots.upsertHolder({
      tokenId, ts: now, day: dayOf(now), holderCount,
      top5Pct: pctTop(5), top10Pct: pctTop(10), top20Pct: pctTop(20), top50Pct: pctTop(50), top100Pct: pctTop(100),
      buckets, excludedAccounts: excluded.slice(0, 20), source: result.source,
      truncated: result.truncated, cuSpent: result.cuSpent, topHolders,
    });
    return { skipped: false };
  }

  private async fetchHolders(address: string, decimals: number, economy: boolean): Promise<HoldersResult> {
    const s = this.ctx.sources;
    if (s.helius) {
      try {
        return await s.helius.getAllHolders(address, decimals);
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message }, 'Helius getTokenAccounts échoué, repli');
      }
    }
    if (s.solscan && !economy && !s.health.isDegraded('solscan')) {
      try {
        const r = await s.solscan.getTopHolders(address, decimals, 100);
        if (r.totalHolders === null) {
          try {
            r.totalHolders = await s.solscan.getHolderCount(address);
            r.cuSpent += 100;
          } catch { /* on garde null */ }
        }
        return r;
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message }, 'Solscan holders échoué, repli RPC');
      }
    }
    const top20 = await s.rpc.getLargestAccounts(address, decimals);
    const byOwner = new Map<string, RawHolder>();
    for (const h of top20) {
      const prev = byOwner.get(h.owner);
      if (prev) prev.amount += h.amount; else byOwner.set(h.owner, { ...h });
    }
    const holders = [...byOwner.values()].sort((a, b) => b.amount - a.amount);
    return { holders, totalHolders: null, truncated: true, source: 'rpc' as SourceName, cuSpent: 0 };
  }
}

function sum(list: RawHolder[]): number {
  return list.reduce((n, h) => n + h.amount, 0);
}
function stripTop<T extends { topHolders: unknown }>(s: T): Omit<T, 'topHolders'> {
  const { topHolders: _drop, ...rest } = s;
  return rest;
}
