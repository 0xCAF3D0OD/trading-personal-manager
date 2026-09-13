import type { BurnRate, SupplyView } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import { nowS } from '../db/client.js';
import { AppContext } from './context.js';
import type { TokenService } from './token.service.js';

const WINDOWS: { label: string; seconds: number }[] = [
  { label: '24 h', seconds: 86400 },
  { label: '7 j', seconds: 7 * 86400 },
  { label: '30 j', seconds: 30 * 86400 },
];

export class SupplyService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  async getView(tokenId: number): Promise<{ value: SupplyView; cached: boolean }> {
    const token = this.tokens.require(tokenId);
    const hit = await this.ctx.cache.getOrFetch(`rpc:supply:${token.address}`, TTL.supply, async () => ({
      value: (await this.ctx.sources.rpc.getTokenSupply(token.address)).supply, source: 'rpc',
    }));
    const now = nowS();
    const supplyNow = hit.value;
    const burnRates: BurnRate[] = WINDOWS.map((w) => {
      const then = this.ctx.snapshots.marketAtOrBefore(tokenId, now - w.seconds);
      const supplyThen = then?.supplyCirc ?? null;
      const burned = supplyThen !== null ? supplyThen - supplyNow : null;
      return {
        windowLabel: w.label, windowSeconds: w.seconds, supplyThen, supplyNow, burned,
        burnedPct: burned !== null && supplyThen ? (burned / supplyThen) * 100 : null,
        thenTs: then?.ts ?? null,
      };
    });
    const series = this.ctx.snapshots
      .marketSince(tokenId, now - 90 * 86400)
      .filter((m) => m.supplyCirc !== null)
      .map((m) => ({ ts: m.ts, supply: m.supplyCirc as number }));
    return {
      cached: hit.cached,
      value: { current: { supplyCirc: supplyNow, supplyTotal: supplyNow, source: 'rpc', fetchedAt: hit.fetchedAt }, burnRates, series },
    };
  }
}
