import type { MarketMetricsView, MarketSettings, PoolInfo, SourceName, SupplyComponents, TokenHistoryView } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import type { PairInfo } from '../datasources/types.js';
import { nowS } from '../db/client.js';
import { checkLiquidityWithdrawal, computeMomentum, groupBySource, liquidityBand, mcapGapPct, poolTypeOf, priceSpreadPct, sourceMcapIsFdv, volumeBand, type LiqPoint } from '../market/metrics.js';
import { AppContext } from './context.js';
import type { SettingsService } from './settings.service.js';
import type { TokenService } from './token.service.js';

interface SupplyCache { minted: number; incinerated: number; addresses: { address: string; balance: number }[] }

export interface MarketData {
  pair: PairInfo | null;
  pairs: PairInfo[];
  pairFetchedAt: number;
  jupiterPrice: number | null;
  jupiterFetchedAt: number;
  supply: number | null;
  supplyComponents: SupplyComponents;
  cached: boolean;
}

export class MarketService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService, private readonly settings: SettingsService) {}

  private get cfg(): MarketSettings { return this.settings.get<MarketSettings>('market'); }

  /** Précharge le cache pour toute la watchlist en 2 appels groupés (job + watchlist). */
  async prefetchBatch(addresses: string[]): Promise<void> {
    if (!addresses.length) return;
    const now = nowS();
    const missingPairs = addresses.filter((a) => !this.ctx.cache.peek(`ds:pairs:${a}`));
    if (missingPairs.length) {
      try {
        const all = await this.ctx.sources.dexscreener.getAllPairs(missingPairs);
        for (const [mint, pairs] of all) {
          this.ctx.cache.set(`ds:pairs:${mint}`, pairs, 'dexscreener', now, TTL.price);
          this.ctx.cache.set(`ds:pair:${mint}`, pairs[0] ?? null, 'dexscreener', now, TTL.price);
        }
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message }, 'DexScreener batch échoué');
      }
    }
    const missingJup = addresses.filter((a) => !this.ctx.cache.peek(`jup:price:${a}`));
    if (missingJup.length) {
      try {
        const prices = await this.ctx.sources.jupiter.getPrices(missingJup);
        for (const [mint, p] of prices) this.ctx.cache.set(`jup:price:${mint}`, p, 'jupiter', now, TTL.price);
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message }, 'Jupiter batch échoué');
      }
    }
  }

  /** Offre émise (getTokenSupply, déjà nette des burns SPL) et soldes des adresses incinérateur (tokens envoyés, pas brûlés). */
  async supplyComponents(address: string, decimals: number): Promise<SupplyComponents> {
    const watch = this.settings.get<{ incineratorAddresses: string[] }>('watch');
    const hit = await this.ctx.cache.getOrFetch<SupplyCache>(`rpc:supplyc:${address}`, TTL.supply, async () => {
      const minted = (await this.ctx.sources.rpc.getTokenSupply(address)).supply;
      const addresses: { address: string; balance: number }[] = [];
      for (const a of watch.incineratorAddresses) {
        try {
          const balance = await this.ctx.sources.rpc.getOwnerTokenBalance(a, address, decimals);
          if (balance > 0) addresses.push({ address: a, balance });
        } catch (err) {
          this.ctx.log.warn({ err: (err as Error).message, address: a }, 'Solde incinérateur indisponible');
        }
      }
      const incinerated = addresses.reduce((n, x) => n + x.balance, 0);
      return { value: { minted, incinerated, addresses }, source: 'rpc' };
    });
    // La clé historique `rpc:supply` reste alimentée pour les consommateurs existants (détenteurs, offre).
    this.ctx.cache.set(`rpc:supply:${address}`, hit.value.minted - hit.value.incinerated, 'rpc', hit.fetchedAt, TTL.supply);
    return { minted: hit.value.minted, incinerated: hit.value.incinerated, net: hit.value.minted - hit.value.incinerated, incineratorAddresses: hit.value.addresses, source: 'rpc', fetchedAt: hit.fetchedAt };
  }

  async getData(address: string, decimals = 0): Promise<MarketData> {
    await this.prefetchBatch([address]);
    const pairs = this.ctx.cache.peekStale<PairInfo[]>(`ds:pairs:${address}`);
    const jup = this.ctx.cache.peekStale<number | null>(`jup:price:${address}`);
    let supplyComponents: SupplyComponents = { minted: null, incinerated: null, net: null, incineratorAddresses: [], source: 'unavailable', fetchedAt: 0 };
    try {
      supplyComponents = await this.supplyComponents(address, decimals);
    } catch (err) {
      this.ctx.log.warn({ err: (err as Error).message }, 'getTokenSupply échoué');
    }
    return {
      pair: pairs?.value?.[0] ?? null, pairs: pairs?.value ?? [], pairFetchedAt: pairs?.fetchedAt ?? 0,
      jupiterPrice: jup?.value ?? null, jupiterFetchedAt: jup?.fetchedAt ?? 0,
      supply: supplyComponents.net, supplyComponents, cached: !!pairs?.cached,
    };
  }

  /** Vue complète du panneau de métriques. Chaque chiffre porte sa source ; rien n'est moyenné. */
  async getView(tokenId: number): Promise<{ value: MarketMetricsView; cached: boolean }> {
    const token = this.tokens.require(tokenId);
    const cfg = this.cfg;
    const d = await this.getData(token.address, token.decimals);
    const primary = d.pair?.priceUsd ?? null;
    const secondary = d.jupiterPrice;
    const price = primary ?? secondary;
    const usedSource: SourceName = d.pair ? 'dexscreener' : secondary !== null ? 'jupiter' : 'unavailable';
    const spread = priceSpreadPct(primary, secondary);

    // Écart persistant : les relevés précédents + celui-ci
    const recent = this.ctx.snapshots.lastMarket(tokenId, cfg.priceSpreadAlertConsecutive - 1);
    let consecutive = spread !== null && Math.abs(spread) > cfg.priceSpreadWarnPct ? 1 : 0;
    if (consecutive) for (const r of recent) { if (r.priceSpreadPct !== null && r.priceSpreadPct !== undefined && Math.abs(r.priceSpreadPct) > cfg.priceSpreadWarnPct) consecutive++; else break; }

    const pctChange = d.pair?.priceChange ?? { m5: null, h1: null, h6: null, h24: null };
    const momentum = computeMomentum(pctChange, d.pair?.volumeM5Usd ?? null, cfg);

    const sc = d.supplyComponents;
    const mcapLocal = price !== null && sc.net !== null ? price * sc.net : null;
    const fdvLocal = price !== null && sc.minted !== null ? price * sc.minted : null;
    const sourceMcap = d.pair?.marketCapUsd ?? null;
    const sourceIsFdv = d.pair ? sourceMcapIsFdv(sourceMcap, d.pair.fdvUsd) : false;
    const gap = mcapGapPct(sourceIsFdv ? null : sourceMcap, mcapLocal);

    const pools: PoolInfo[] = d.pairs.map((p, i) => ({
      address: p.pairAddress, dexId: p.dexId, poolType: poolTypeOf(p.dexId, cfg), liquidityUsd: p.liquidityUsd, volumeH24Usd: p.volume24hUsd,
      priceUsd: p.priceUsd, url: p.url, isMain: i === 0, source: 'dexscreener',
    }));
    const mainLiq = d.pair?.liquidityUsd ?? null;
    const totalLiq = pools.length ? pools.reduce((n, p) => n + (p.liquidityUsd ?? 0), 0) : null;
    const ratioPct = mainLiq !== null && mcapLocal !== null && mcapLocal > 0 ? (mainLiq / mcapLocal) * 100 : null;
    const lb = liquidityBand(ratioPct, cfg.liquidityBands);
    const totalRatioPct = totalLiq !== null && mcapLocal !== null && mcapLocal > 0 ? (totalLiq / mcapLocal) * 100 : null;
    const tlb = liquidityBand(totalRatioPct, cfg.liquidityBands);

    const vol = d.pair?.volume24hUsd ?? null;
    const volToMcap = vol !== null && mcapLocal !== null && mcapLocal > 0 ? vol / mcapLocal : null;
    const vb = volumeBand(volToMcap, cfg.volumeBands);
    const volSource: SourceName = d.pair ? 'dexscreener' : 'unavailable';
    const ratioChange = (sinceS: number): number | null => {
      const then = this.ctx.snapshots.marketAtOrBefore(tokenId, nowS() - sinceS);
      if (!then || then.volumeSource !== volSource || then.volumeToMcap === null || then.volumeToMcap === undefined || then.volumeToMcap === 0 || volToMcap === null) return null;
      return ((volToMcap - then.volumeToMcap) / then.volumeToMcap) * 100;
    };

    return {
      cached: d.cached,
      value: {
        price: {
          primary: { value: price, source: usedSource, fetchedAt: d.pair ? d.pairFetchedAt : d.jupiterFetchedAt },
          secondary: d.pair && secondary !== null ? { value: secondary, source: 'jupiter', fetchedAt: d.jupiterFetchedAt } : null,
          spreadPct: spread, spreadWarn: spread !== null && Math.abs(spread) > cfg.priceSpreadWarnPct, spreadConsecutiveOver: consecutive,
        },
        priceChange: pctChange,
        momentum,
        mcap: { sourceValue: sourceMcap, sourceName: d.pair ? 'dexscreener' : 'unavailable', sourceIsFdv, local: mcapLocal, fdvLocal, fdvSource: d.pair?.fdvUsd ?? null, gapPct: gap, gapWarn: gap !== null && Math.abs(gap) > cfg.mcapGapWarnPct },
        supply: sc,
        liquidity: { mainPoolUsd: mainLiq, totalUsd: totalLiq, poolsCount: pools.length, ratioPct, band: lb.band, bandLabel: lb.label, totalRatioPct, totalBand: tlb.band, totalBandLabel: tlb.label, pools, source: d.pair ? 'dexscreener' : 'unavailable' },
        volume: { h24Usd: vol, source: volSource, toMcap: volToMcap, band: vb.band, bandLabel: vb.label, ratioChange24hPct: ratioChange(86400), ratioChange7dPct: ratioChange(7 * 86400) },
        pair: d.pair ? { dexId: d.pair.dexId, pairAddress: d.pair.pairAddress, url: d.pair.url, createdAt: d.pair.pairCreatedAt } : null,
        source: usedSource,
        fetchedAt: d.pair ? d.pairFetchedAt : d.jupiterFetchedAt,
      },
    };
  }

  /** Relevé à 15 min : toutes les métriques, avec leur source, pour l'historique et les divergences. */
  async snapshot(tokenId: number): Promise<void> {
    const v = (await this.getView(tokenId)).value;
    const price = v.price.primary.value;
    this.ctx.snapshots.insertMarket({
      tokenId, ts: nowS(),
      priceUsd: price, priceSource: v.price.primary.source,
      priceAltUsd: v.price.secondary?.value ?? null, priceAltSource: v.price.secondary ? 'jupiter' : null,
      marketCapUsd: v.mcap.sourceIsFdv ? v.mcap.local : v.mcap.sourceValue ?? v.mcap.local, fdvUsd: v.mcap.fdvSource ?? v.mcap.fdvLocal,
      volume24hUsd: v.volume.h24Usd, liquidityUsd: v.liquidity.mainPoolUsd,
      supplyCirc: v.supply.net, supplyTotal: v.supply.minted, supplySource: v.supply.source,
      pctM5: v.priceChange.m5, pctH1: v.priceChange.h1, pctH6: v.priceChange.h6, pctH24: v.priceChange.h24,
      momentumState: v.momentum.state, priceSpreadPct: v.price.spreadPct,
      mcapSourceName: v.mcap.sourceName, mcapSourceIsFdv: v.mcap.sourceIsFdv, mcapLocalUsd: v.mcap.local, fdvLocalUsd: v.mcap.fdvLocal, mcapGapPct: v.mcap.gapPct,
      volumeSource: v.volume.source, liquiditySource: v.liquidity.source, liquidityToMcapPct: v.liquidity.ratioPct, volumeToMcap: v.volume.toMcap,
      pools: v.liquidity.pools.map((p) => ({ address: p.address, dex: p.dexId, liquidityUsd: p.liquidityUsd, volumeH24Usd: p.volumeH24Usd, priceUsd: p.priceUsd, source: p.source })),
      poolsCount: v.liquidity.poolsCount, liquidityTotalUsd: v.liquidity.totalUsd,
      supplyMinted: v.supply.minted, supplyIncinerated: v.supply.incinerated, supplyNet: v.supply.net, supplyIncineratorAddresses: v.supply.incineratorAddresses,
    });
  }

  /** Historique : séries groupées par source, jamais concaténées. */
  history(tokenId: number, days: number): TokenHistoryView {
    this.tokens.require(tokenId);
    const since = nowS() - days * 86400;
    const market = this.ctx.snapshots.marketSince(tokenId, since);
    const holders = this.ctx.snapshots.holderHistory(tokenId, since);
    return {
      market, holders,
      series: {
        price: groupBySource(market.map((m) => ({ ts: m.ts, value: m.priceUsd, source: m.priceSource }))),
        volume: groupBySource(market.map((m) => ({ ts: m.ts, value: m.volume24hUsd, source: m.volumeSource ?? (m.volume24hUsd !== null ? 'dexscreener' : null) }))),
        liquidity: groupBySource(market.map((m) => ({ ts: m.ts, value: m.liquidityUsd, source: m.liquiditySource ?? (m.liquidityUsd !== null ? 'dexscreener' : null) }))),
        liquidityRatio: groupBySource(market.map((m) => ({ ts: m.ts, value: m.liquidityToMcapPct ?? (m.liquidityUsd !== null && m.marketCapUsd ? (m.liquidityUsd / m.marketCapUsd) * 100 : null), source: m.liquiditySource ?? (m.liquidityUsd !== null ? 'dexscreener' : null) }))),
        supplyNet: groupBySource(market.map((m) => ({ ts: m.ts, value: m.supplyNet ?? m.supplyCirc, source: m.supplySource }))),
      },
    };
  }

  /** Alerte retrait de liquidité : évaluée par le job d'alertes sur la série à 15 min. */
  liquidityWithdrawal(tokenId: number): ReturnType<typeof checkLiquidityWithdrawal> & { now: LiqPoint | null } {
    const cfg = this.cfg.liqWithdrawal;
    const latest = this.ctx.snapshots.latestMarket(tokenId);
    if (!latest) return { triggered: false, migration: false, window: null, reason: 'Aucun relevé.', now: null };
    const toPoint = (m: typeof latest): LiqPoint => ({
      ts: m.ts, price: m.priceUsd, liquidity: m.liquidityUsd,
      ratioPct: m.liquidityToMcapPct ?? (m.liquidityUsd !== null && m.marketCapUsd ? (m.liquidityUsd / m.marketCapUsd) * 100 : null),
      poolsCount: m.poolsCount ?? null, liquidityTotal: m.liquidityTotalUsd ?? null,
    });
    const at24h = this.ctx.snapshots.marketAtOrBefore(tokenId, latest.ts - 86400);
    const at6h = this.ctx.snapshots.marketAtOrBefore(tokenId, latest.ts - 6 * 3600);
    const now = toPoint(latest);
    return { ...checkLiquidityWithdrawal(now, at24h ? toPoint(at24h) : null, at6h ? toPoint(at6h) : null, cfg), now };
  }
}
