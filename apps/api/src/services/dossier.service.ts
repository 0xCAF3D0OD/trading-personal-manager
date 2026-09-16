import type { DossierView, UiSettings } from '@tpm/shared';
import { createHash } from 'node:crypto';
import { nowS } from '../db/client.js';
import { buildDossier, type DossierInputs } from '../dossier/build.js';
import { buildListDossier, buildScannerDossier } from '../dossier/collections.js';
import { AppContext } from './context.js';
import type { CreatorService } from './creator.service.js';
import type { DivergenceService } from './divergence.service.js';
import type { HealthService } from './health.service.js';
import type { HoldersService } from './holders.service.js';
import type { MarketService } from './market.service.js';
import type { PlanService } from './plan.service.js';
import type { ScannerService } from './scanner.service.js';
import type { SettingsService } from './settings.service.js';
import type { SummaryService } from './summary.service.js';
import type { SupplyService } from './supply.service.js';
import type { TokenService } from './token.service.js';
import type { ClaimsService } from './watch/claims.service.js';
import type { NewsService } from './watch/news.service.js';
import type { OnchainWatchService } from './watch/onchain.service.js';
import type { WatchPageService } from './watch/page.service.js';

/** Tâches planifiées, dans l'ordre où elles comptent pour lire un dossier. */
const JOB_LABELS: [string, string][] = [
  ['market-snapshot', 'Relevé de marché (15 min)'], ['holder-snapshot', 'Relevé des détenteurs (quotidien)'], ['market-slippage', 'Relevé de slippage (quotidien)'],
  ['alert-eval', 'Évaluation des alertes (1 min)'], ['watch-pages', 'Veille : pages'], ['watch-news', 'Veille : actualités'], ['watch-onchain', 'Veille : on-chain équipe'],
  ['watch-review', 'Veille : engagements et changements'], ['scan-discover', 'Scanner : découverte'], ['scan-evaluate', 'Scanner : évaluation'], ['portfolio-daily', 'Portefeuille : relevé quotidien'],
];

/** Assemble le dossier (docs/05, B.2) à partir des mêmes services que la fiche : mêmes caches, mêmes limites. */
export class DossierService {
  constructor(
    private readonly ctx: AppContext,
    private readonly s: {
      tokens: TokenService; settings: SettingsService; summary: SummaryService; health: HealthService; market: MarketService; supply: SupplyService;
      holders: HoldersService; creator: CreatorService; watchPages: WatchPageService; claims: ClaimsService; news: NewsService; onchain: OnchainWatchService;
      divergences: DivergenceService; plans: PlanService; scanner: ScannerService;
    },
  ) {}

  /** Dossier de la liste de surveillance (B.8), limité aux ids donnés si le lecteur a filtré. Local uniquement. */
  list(ids?: number[]): { generatedAt: number; count: number; hash: string; markdown: string } {
    const now = nowS();
    const all = this.s.tokens.list();
    const items = ids?.length ? all.filter((t) => ids.includes(t.id)) : all;
    const summaries = this.s.summary.all();
    const markdown = buildListDossier({ items, summaries, tier: this.ctx.sources.tier, generatedAt: now, filterNote: ids?.length && ids.length < all.length ? `sélection de ${items.length} sur ${all.length}` : null });
    return { generatedAt: now, count: items.length, hash: this.hashOf(markdown), markdown };
  }

  /** Dossier des résultats du scanner (B.8), limité aux adresses données si le lecteur a filtré. Local uniquement. */
  scanner(days: number, addresses?: string[]): { generatedAt: number; count: number; hash: string; markdown: string } {
    const now = nowS();
    const all = this.s.scanner.results(days);
    const results = addresses?.length ? all.filter((r) => addresses.includes(r.tokenAddress)) : all;
    const byReason = new Map<string, number>();
    for (const r of this.s.scanner.excluded(days)) for (const e of r.exclusionReasons) byReason.set(e.label, (byReason.get(e.label) ?? 0) + 1);
    const excludedByReason = [...byReason.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    let retro = null;
    try { retro = this.s.scanner.retroView(); } catch { retro = null; }
    const markdown = buildScannerDossier({ overview: this.s.scanner.overview(), results, days, retro, excludedByReason, generatedAt: now, filterNote: addresses?.length && addresses.length < all.length ? `sélection de ${results.length} sur ${all.length}` : null });
    return { generatedAt: now, count: results.length, hash: this.hashOf(markdown), markdown };
  }

  private hashOf(markdown: string): string {
    return createHash('sha256').update(markdown.replace(/Généré le [^\n]*/, '')).digest('hex').slice(0, 16);
  }

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

    const jobs = new Map(this.ctx.jobs.all().map((r) => [r.name, r]));
    const inputs: DossierInputs = {
      token: { symbol: token.symbol, name: token.name, address: token.address, program: token.program, decimals: token.decimals, createdAt: token.created_at, creatorAddress: token.creator_address, addedAt: token.added_at },
      tier: this.ctx.sources.tier,
      jobs: JOB_LABELS.map(([name, label]) => { const r = jobs.get(name); return { name, label, lastRunAt: r?.last_run_at ?? null, status: r?.last_status ?? null, error: r?.last_error ?? null }; }),
      degraded: this.ctx.sources.health.degradedList().map((d) => ({ provider: String(d.provider), reason: d.reason, since: d.since ?? 0 })),
      summary: this.s.summary.get(tokenId),
      health, market, supply,
      holders: this.s.holders.getView(tokenId),
      creator,
      watchSources: this.s.watchPages.sources(tokenId).map((w) => ({ kind: w.kind, label: w.label, enabled: w.enabled })),
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
