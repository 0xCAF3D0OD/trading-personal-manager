import type { MarketView, SourceName } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import type { PairInfo } from '../datasources/types.js';
import { nowS } from '../db/client.js';
import { AppContext } from './context.js';
import type { TokenService } from './token.service.js';

export interface MarketData {
  pair: PairInfo | null;
  pairFetchedAt: number;
  jupiterPrice: number | null;
  jupiterFetchedAt: number;
  supply: number | null;
  supplyFetchedAt: number;
  cached: boolean;
}

export class MarketService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  /** Précharge le cache pour toute la watchlist en 2 appels groupés (job + watchlist). */
  async prefetchBatch(addresses: string[]): Promise<void> {
    if (!addresses.length) return;
    const now = nowS();
    const missingPairs = addresses.filter((a) => !this.ctx.cache.peek(`ds:pair:${a}`));
    if (missingPairs.length) {
      try {
        const pairs = await this.ctx.sources.dexscreener.getPairs(missingPairs);
        for (const [mint, pair] of pairs) this.ctx.cache.set(`ds:pair:${mint}`, pair, 'dexscreener', now, TTL.price);
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

  async getData(address: string): Promise<MarketData> {
    await this.prefetchBatch([address]);
    const pair = this.ctx.cache.peekStale<PairInfo | null>(`ds:pair:${address}`);
    const jup = this.ctx.cache.peekStale<number | null>(`jup:price:${address}`);
    let supply: { value: number | null; fetchedAt: number } = { value: null, fetchedAt: 0 };
    try {
      const hit = await this.ctx.cache.getOrFetch(`rpc:supply:${address}`, TTL.supply, async () => ({
        value: (await this.ctx.sources.rpc.getTokenSupply(address)).supply, source: 'rpc',
      }));
      supply = { value: hit.value, fetchedAt: hit.fetchedAt };
    } catch (err) {
      this.ctx.log.warn({ err: (err as Error).message }, 'getTokenSupply échoué');
    }
    return {
      pair: pair?.value ?? null, pairFetchedAt: pair?.fetchedAt ?? 0,
      jupiterPrice: jup?.value ?? null, jupiterFetchedAt: jup?.fetchedAt ?? 0,
      supply: supply.value, supplyFetchedAt: supply.fetchedAt,
      cached: !!pair?.cached,
    };
  }

  async getView(tokenId: number): Promise<{ value: MarketView; cached: boolean }> {
    const token = this.tokens.require(tokenId);
    const d = await this.getData(token.address);
    const primary = d.pair?.priceUsd ?? null;
    const secondary = d.jupiterPrice;
    const spread = primary !== null && secondary !== null && secondary > 0 ? ((primary - secondary) / secondary) * 100 : null;
    const mcapLocal = primary !== null && d.supply !== null ? primary * d.supply : null;
    const mcap = d.pair?.marketCapUsd ?? mcapLocal;
    const vol = d.pair?.volume24hUsd ?? null;
    const usedSource: SourceName = d.pair ? 'dexscreener' : secondary !== null ? 'jupiter' : 'unavailable';
    return {
      cached: d.cached,
      value: {
        price: {
          primary: { value: primary ?? secondary, source: usedSource, fetchedAt: d.pair ? d.pairFetchedAt : d.jupiterFetchedAt },
          secondary: d.pair && secondary !== null ? { value: secondary, source: 'jupiter', fetchedAt: d.jupiterFetchedAt } : null,
          spreadPct: spread,
        },
        priceChange: d.pair?.priceChange ?? { m5: null, h1: null, h6: null, h24: null },
        volume24hUsd: vol,
        liquidityUsd: d.pair?.liquidityUsd ?? null,
        marketCapUsd: mcap,
        marketCapLocalUsd: mcapLocal,
        fdvUsd: d.pair?.fdvUsd ?? null,
        volumeToMcap: vol !== null && mcap !== null && mcap > 0 ? vol / mcap : null,
        pair: d.pair ? { dexId: d.pair.dexId, pairAddress: d.pair.pairAddress, url: d.pair.url, createdAt: d.pair.pairCreatedAt } : null,
        source: usedSource,
        fetchedAt: d.pair ? d.pairFetchedAt : d.jupiterFetchedAt,
      },
    };
  }

  /** Enregistre un snapshot marché pour un token (utilisé par le job 15 min et à l'ajout). */
  async snapshot(tokenId: number): Promise<void> {
    const token = this.tokens.require(tokenId);
    const d = await this.getData(token.address);
    const price = d.pair?.priceUsd ?? d.jupiterPrice;
    const priceSource: SourceName = d.pair?.priceUsd != null ? 'dexscreener' : d.jupiterPrice != null ? 'jupiter' : 'unavailable';
    const mcap = d.pair?.marketCapUsd ?? (price !== null && d.supply !== null ? price * d.supply : null);
    this.ctx.snapshots.insertMarket({
      tokenId, ts: nowS(),
      priceUsd: price, priceSource,
      priceAltUsd: d.pair?.priceUsd != null ? d.jupiterPrice : null,
      priceAltSource: d.pair?.priceUsd != null && d.jupiterPrice != null ? 'jupiter' : null,
      marketCapUsd: mcap, fdvUsd: d.pair?.fdvUsd ?? null,
      volume24hUsd: d.pair?.volume24hUsd ?? null, liquidityUsd: d.pair?.liquidityUsd ?? null,
      supplyCirc: d.supply, supplyTotal: d.supply, supplySource: d.supply !== null ? 'rpc' : 'unavailable',
    });
  }
}
