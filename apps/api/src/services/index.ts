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
import { SupplyService } from './supply.service.js';
import { SystemService } from './system.service.js';
import { TokenService } from './token.service.js';

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
}

export function buildServices(env: Env, db: Db, log: Logger): Services {
  const ctx = new AppContext(env, db, log);
  const tokens = new TokenService(ctx);
  const market = new MarketService(ctx, tokens);
  const divergences = new DivergenceService(ctx, tokens);
  const hub = buildNotifierHub(env);
  return {
    ctx, tokens, market, divergences,
    health: new HealthService(ctx, tokens),
    supply: new SupplyService(ctx, tokens),
    holders: new HoldersService(ctx, tokens, market),
    plans: new PlanService(ctx, tokens),
    alerts: new AlertService(ctx, tokens, market, divergences, hub),
    creator: new CreatorService(ctx, tokens),
    system: new SystemService(ctx, {
      'market-snapshot': env.CRON_MARKET_SNAPSHOT,
      'holder-snapshot': env.CRON_HOLDER_SNAPSHOT,
      'alert-eval': env.CRON_ALERT_EVAL,
    }),
  };
}
