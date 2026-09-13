import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import type { Db } from './db/client.js';
import { Scheduler } from './jobs/scheduler.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { alertsRoutes } from './routes/alerts.routes.js';
import { plansRoutes } from './routes/plans.routes.js';
import { systemRoutes } from './routes/system.routes.js';
import { tokenDetailRoutes } from './routes/token-detail.routes.js';
import { tokensRoutes } from './routes/tokens.routes.js';
import { buildServices, type Services } from './services/index.js';

export interface BuiltApp {
  app: FastifyInstance;
  services: Services;
  scheduler: Scheduler | null;
}

export async function buildApp(env: Env, db: Db, opts: { logger?: boolean | object } = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger: opts.logger ?? {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } } : {}),
    },
  });

  const services = buildServices(env, db, app.log);
  const scheduler = env.JOBS_ENABLED ? new Scheduler(services) : null;

  await app.register(cors, { origin: env.CORS_ORIGIN ? [env.CORS_ORIGIN] : false });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    errorResponseBuilder: (_req, ctx) => ({
      error: `Trop de requêtes : limite ${ctx.max} par ${ctx.after}. Le polling frontend ne doit jamais dépasser cette cadence.`,
      code: 'rate_limited',
    }),
  });
  registerErrorHandler(app);

  /** Config de route pour tout ce qui peut déclencher un appel externe coûteux. */
  const expensive = { config: { rateLimit: { max: env.RATE_LIMIT_EXPENSIVE_MAX, timeWindow: '1 minute' } } };

  await app.register(async (api) => {
    tokensRoutes(api, services, expensive);
    tokenDetailRoutes(api, services, expensive);
    plansRoutes(api, services);
    alertsRoutes(api, services, expensive);
    systemRoutes(api, services, scheduler, expensive);
  }, { prefix: '/api' });

  app.addHook('onClose', async () => scheduler?.stop());
  return { app, services, scheduler };
}
