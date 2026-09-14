import type { ScannerSettings } from '@tpm/shared';
import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { AlertService } from './alert.service.js';
import { AppContext, type Logger } from './context.js';
import { CreatorService } from './creator.service.js';
import { DivergenceService } from './divergence.service.js';
import { HealthService } from './health.service.js';
import { HoldersService } from './holders.service.js';
import { MarketService } from './market.service.js';
import { buildNotifierHub } from './notify/index.js';
import { PlanService } from './plan.service.js';
import { SettingsService } from './settings.service.js';
import { SummaryService } from './summary.service.js';
import { DossierService } from './dossier.service.js';
import { ReportService } from './report.service.js';
import { PortfolioService } from './portfolio.service.js';
import { SlippageService } from './slippage.service.js';
import { ScannerService } from './scanner.service.js';
import { SupplyService } from './supply.service.js';
import { SystemService } from './system.service.js';
import { TokenService } from './token.service.js';
import { ClaimsService } from './watch/claims.service.js';
import { NewsService } from './watch/news.service.js';
import { OnchainWatchService } from './watch/onchain.service.js';
import { WatchPageService } from './watch/page.service.js';
import { TimelineService } from './watch/timeline.service.js';

export interface Services {
  ctx: AppContext;
  tokens: TokenService;
  health: HealthService;
  market: MarketService;
  supply: SupplyService;
  holders: HoldersService;
  divergences: DivergenceService;
  plans: PlanService;
  alerts: AlertService;
  creator: CreatorService;
  system: SystemService;
  settings: SettingsService;
  summary: SummaryService;
  dossier: DossierService;
  reports: ReportService;
  portfolio: PortfolioService;
  slippage: SlippageService;
  scanner: ScannerService;
  watchPages: WatchPageService;
  claims: ClaimsService;
  news: NewsService;
  onchain: OnchainWatchService;
  timeline: TimelineService;
}

export const JOB_SCHEDULES = (env: Env): Record<string, string> => ({
  'market-snapshot': env.CRON_MARKET_SNAPSHOT,
  'holder-snapshot': env.CRON_HOLDER_SNAPSHOT,
  'alert-eval': env.CRON_ALERT_EVAL,
  'watch-pages': '*/10 * * * *',
  'watch-news': '5 * * * *',
  'watch-onchain': '*/15 * * * *',
  'watch-review': '30 * * * *',
  'watch-maintenance': '0 4 * * *',
  'market-slippage': '0 7 * * *',
  'scan-discover': '*/5 * * * *',
  'scan-evaluate': '2-59/5 * * * *',
  'scan-retro': '15 * * * *',
  'scan-maintenance': '30 3 * * *',
  'portfolio-daily': '55 23 * * *',
});

export function buildServices(env: Env, db: Db, log: Logger): Services {
  const ctx = new AppContext(env, db, log);
  const tokens = new TokenService(ctx);
  const settings = new SettingsService(ctx);
  const market = new MarketService(ctx, tokens, settings);
  const divergences = new DivergenceService(ctx, tokens);
  const hub = buildNotifierHub(env);
  const alerts = new AlertService(ctx, tokens, market, divergences, hub, settings);
  ctx.sources.scannerRateCfg = () => settings.get<ScannerSettings>('scanner').rateLimit;
  const summary = new SummaryService(ctx, tokens, settings, divergences);
  const health = new HealthService(ctx, tokens);
  const supply = new SupplyService(ctx, tokens);
  const holders = new HoldersService(ctx, tokens, market);
  const plans = new PlanService(ctx, tokens);
  const creator = new CreatorService(ctx, tokens);
  const watchPages = new WatchPageService(ctx, tokens, settings, alerts);
  const claims = new ClaimsService(ctx, tokens, settings, alerts);
  const news = new NewsService(ctx, tokens, settings);
  const onchain = new OnchainWatchService(ctx, tokens, settings, alerts);
  const scanner = new ScannerService(ctx, settings, alerts);
  const dossier = new DossierService(ctx, { tokens, settings, summary, health, market, supply, holders, creator, watchPages, claims, news, onchain, divergences, plans, scanner });
  return {
    ctx, tokens, market, divergences, alerts, settings, summary, dossier,
    reports: new ReportService(ctx, tokens, dossier),
    portfolio: new PortfolioService(ctx, tokens, settings, alerts),
    slippage: new SlippageService(ctx, tokens, market, settings),
    scanner,
    health, supply, holders, plans, creator,
    system: new SystemService(ctx, JOB_SCHEDULES(env)),
    watchPages, claims, news, onchain,
    timeline: new TimelineService(ctx, tokens),
  };
}
