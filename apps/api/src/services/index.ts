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
});

export function buildServices(env: Env, db: Db, log: Logger): Services {
  const ctx = new AppContext(env, db, log);
  const tokens = new TokenService(ctx);
  const market = new MarketService(ctx, tokens);
  const divergences = new DivergenceService(ctx, tokens);
  const hub = buildNotifierHub(env);
  const alerts = new AlertService(ctx, tokens, market, divergences, hub);
  const settings = new SettingsService(ctx);
  return {
    ctx, tokens, market, divergences, alerts, settings,
    health: new HealthService(ctx, tokens),
    supply: new SupplyService(ctx, tokens),
    holders: new HoldersService(ctx, tokens, market),
    plans: new PlanService(ctx, tokens),
    creator: new CreatorService(ctx, tokens),
    system: new SystemService(ctx, JOB_SCHEDULES(env)),
    watchPages: new WatchPageService(ctx, tokens, settings, alerts),
    claims: new ClaimsService(ctx, tokens, settings, alerts),
    news: new NewsService(ctx, tokens, settings),
    onchain: new OnchainWatchService(ctx, tokens, settings, alerts),
    timeline: new TimelineService(ctx, tokens),
  };
}
