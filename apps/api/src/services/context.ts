import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { TtlCache } from '../cache/ttl-cache.js';
import { DataSourceRegistry } from '../datasources/registry.js';
import { AlertsRepo } from '../db/repositories/alerts.repo.js';
import { CreatorRepo } from '../db/repositories/creator.repo.js';
import { HealthRepo } from '../db/repositories/health.repo.js';
import { JobsRepo } from '../db/repositories/jobs.repo.js';
import { PlansRepo } from '../db/repositories/plans.repo.js';
import { SnapshotsRepo } from '../db/repositories/snapshots.repo.js';
import { TokensRepo } from '../db/repositories/tokens.repo.js';
import { UsageRepo } from '../db/repositories/usage.repo.js';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

/** Tout ce dont les services ont besoin, construit une fois au démarrage. */
export class AppContext {
  readonly cache: TtlCache;
  readonly sources: DataSourceRegistry;
  readonly tokens: TokensRepo;
  readonly health: HealthRepo;
  readonly snapshots: SnapshotsRepo;
  readonly plans: PlansRepo;
  readonly alerts: AlertsRepo;
  readonly usage: UsageRepo;
  readonly jobs: JobsRepo;
  readonly creator: CreatorRepo;

  constructor(readonly env: Env, readonly db: Db, readonly log: Logger) {
    this.usage = new UsageRepo(db);
    this.cache = new TtlCache(db);
    this.sources = new DataSourceRegistry(env, this.usage);
    this.tokens = new TokensRepo(db);
    this.health = new HealthRepo(db);
    this.snapshots = new SnapshotsRepo(db);
    this.plans = new PlansRepo(db);
    this.alerts = new AlertsRepo(db);
    this.jobs = new JobsRepo(db);
    this.creator = new CreatorRepo(db);
  }
}

export class NotFoundError extends Error {
  code = 'not_found';
}
export class ValidationError extends Error {
  code = 'validation';
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}
export class UpstreamError extends Error {
  code = 'upstream';
}
