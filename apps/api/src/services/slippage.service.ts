import type { MarketSettings, SlippageEstimate } from '@tpm/shared';
import { nowS } from '../db/client.js';
import { constantProductImpactPct, poolTypeOf } from '../market/metrics.js';
import { AppContext } from './context.js';
import type { MarketService } from './market.service.js';
import type { SettingsService } from './settings.service.js';
import type { TokenService } from './token.service.js';

const JUPITER_NOTE = 'Simulation de route Jupiter à l’instant T : n’intègre ni le MEV, ni le déplacement de prix que votre propre ordre provoque pour les suivants. Mieux qu’une formule, pas la réalité d’exécution.';

/**
 * Slippage estimé pour une sortie, par taille d'ordre.
 * Jupiter Quote en priorité (cache 60 s par couple token / taille) ; formule produit constant en repli
 * uniquement sur un pool à produit constant ; « indisponible » sur un pool concentré.
 */
export class SlippageService {
  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly market: MarketService,
    private readonly settings: SettingsService,
  ) {}

  private get cfg(): MarketSettings { return this.settings.get<MarketSettings>('market'); }

  async estimate(tokenId: number): Promise<{ sizes: SlippageEstimate[]; history: { ts: number; orderUsd: number; impactPct: number | null; method: string }[] }> {
    const token = this.tokens.require(tokenId);
    const cfg = this.cfg;
    const d = await this.market.getData(token.address, token.decimals);
    const price = d.pair?.priceUsd ?? d.jupiterPrice;
    const sizes: SlippageEstimate[] = [];
    for (const orderUsd of cfg.slippageOrderSizesUsd) {
      sizes.push(await this.one(token.address, token.decimals, orderUsd, price, d.pair?.liquidityUsd ?? null, d.pair?.dexId ?? null, cfg));
    }
    return { sizes, history: this.ctx.snapshots.slippageHistory(tokenId, nowS() - 90 * 86400) };
  }

  private async one(mint: string, decimals: number, orderUsd: number, price: number | null, reserveUsd: number | null, dexId: string | null, cfg: MarketSettings): Promise<SlippageEstimate> {
    if (price === null || price <= 0) return { orderUsd, impactPct: null, method: 'unavailable', route: [], note: 'Prix indisponible : impossible de convertir la taille d’ordre en tokens.', fetchedAt: nowS() };
    const tokens = orderUsd / price;
    const amountRaw = BigInt(Math.floor(tokens * 10 ** decimals));
    try {
      const hit = await this.ctx.cache.getOrFetch(`slip:${mint}:${orderUsd}`, cfg.slippageCacheS, async () => ({
        value: await this.ctx.sources.jupiterQuote.sellQuote(mint, amountRaw), source: 'jupiter',
      }), { staleOnError: false });
      const q = hit.value;
      if (q.priceImpactPct !== null) {
        return { orderUsd, impactPct: q.priceImpactPct, method: 'jupiter_quote', route: q.route, note: JUPITER_NOTE, fetchedAt: hit.fetchedAt };
      }
    } catch (err) {
      this.ctx.log.warn({ err: (err as Error).message, mint, orderUsd }, 'Cotation Jupiter indisponible');
    }
    const poolType = dexId ? poolTypeOf(dexId, cfg) : 'unknown';
    if (poolType === 'constant_product' && reserveUsd !== null) {
      return { orderUsd, impactPct: constantProductImpactPct(orderUsd, reserveUsd), method: 'constant_product', route: [dexId as string], note: `Approximation, formule x·y = k sur le pool principal (${dexId}), hors frais. Jupiter n’a pas répondu.`, fetchedAt: nowS() };
    }
    return {
      orderUsd, impactPct: null, method: 'unavailable', route: [],
      note: poolType === 'concentrated'
        ? `Jupiter n’a pas répondu et le pool principal (${dexId}) est à liquidité concentrée : la formule produit constant y serait fausse, pas approximative.`
        : 'Jupiter n’a pas répondu et le type du pool principal est inconnu : aucune estimation honnête possible.',
      fetchedAt: nowS(),
    };
  }

  /** Job quotidien : un point d'historique par token et par taille. */
  async snapshotAll(): Promise<number> {
    let n = 0;
    const ts = nowS();
    for (const t of this.ctx.tokens.listActive()) {
      try {
        const r = await this.estimate(t.id);
        this.ctx.snapshots.insertSlippage(r.sizes.map((s) => ({ tokenId: t.id, ts, orderUsd: s.orderUsd, impactPct: s.impactPct, method: s.method, route: s.route, poolAddress: null })));
        n += r.sizes.length;
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message, token: t.address }, 'Snapshot slippage échoué');
      }
    }
    return n;
  }
}
