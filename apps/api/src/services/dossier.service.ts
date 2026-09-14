import type { DossierView, UiSettings } from '@tpm/shared';
import { createHash } from 'node:crypto';
import { nowS } from '../db/client.js';
import { buildDossier, type DossierInputs } from '../dossier/build.js';
import { AppContext } from './context.js';
import type { CreatorService } from './creator.service.js';
import type { DivergenceService } from './divergence.service.js';
import type { HealthService } from './health.service.js';
import type { HoldersService } from './holders.service.js';
import type { MarketService } from './market.service.js';
import type { PlanService } from './plan.service.js';
import type { SettingsService } from './settings.service.js';
import type { SummaryService } from './summary.service.js';
import type { SupplyService } from './supply.service.js';
import type { TokenService } from './token.service.js';
import type { ClaimsService } from './watch/claims.service.js';
import type { NewsService } from './watch/news.service.js';
import type { OnchainWatchService } from './watch/onchain.service.js';
import type { WatchPageService } from './watch/page.service.js';

/** Assemble le dossier (docs/05, B.2) à partir des mêmes services que la fiche : mêmes caches, mêmes limites. */
export class DossierService {
  constructor(
    private readonly ctx: AppContext,
    private readonly s: {
      tokens: TokenService; settings: SettingsService; summary: SummaryService; health: HealthService; market: MarketService; supply: SupplyService;
      holders: HoldersService; creator: CreatorService; watchPages: WatchPageService; claims: ClaimsService; news: NewsService; onchain: OnchainWatchService;
      divergences: DivergenceService; plans: PlanService;
    },
  ) {}

  async get(tokenId: number, opts: { includePlan?: boolean } = {}): Promise<DossierView> {
    const token = this.s.tokens.require(tokenId);
    const ui = this.s.settings.get<UiSettings>('ui');
    const includesPlan = opts.includePlan ?? ui.dossierIncludesPlan;
    const now = nowS();
    const since30 = now - 30 * 86400;
    const soft = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try { return await fn(); } catch (err) { this.ctx.log.warn({ err: (err as Error).message, tokenId }, `Dossier : ${label} indisponible`); return null; }
    };

    const [health, market, supply, creator] = await Promise.all([
      soft('santé', async () => (await this.s.health.get(tokenId)).value),
      soft('marché', async () => (await this.s.market.getView(tokenId)).value),
      soft('offre', async () => (await this.s.supply.getView(tokenId)).value),
      soft('créateur', async () => (await this.s.creator.get(tokenId)).value),
    ]);

    const inputs: DossierInputs = {
      token: { symbol: token.symbol, name: token.name, address: token.address, program: token.program, decimals: token.decimals, createdAt: token.created_at, creatorAddress: token.creator_address, addedAt: token.added_at },
      tier: this.ctx.sources.tier,
      summary: this.s.summary.get(tokenId),
      health, market, supply,
      holders: this.s.holders.getView(tokenId),
      creator,
      changes: this.s.watchPages.changes(tokenId).filter((c) => c.detectedAt >= since30),
      claims: this.s.claims.list(tokenId),
      news: this.s.news.list(tokenId, ['news', 'listing']).filter((n) => n.publishedAt >= since30),
      actions: this.s.onchain.actions(tokenId, 30),
      divergences: this.s.divergences.compute(tokenId),
      plans: includesPlan ? this.s.plans.list(tokenId).plans : null,
      generatedAt: now,
    };
    const markdown = buildDossier(inputs);
    // L'empreinte ignore la ligne de génération : deux dossiers aux mêmes données ont la même empreinte.
    const hash = createHash('sha256').update(markdown.replace(/Généré le [^\n]*/, '')).digest('hex').slice(0, 16);
    return { tokenId, generatedAt: now, hash, includesPlan, markdown };
  }
}
