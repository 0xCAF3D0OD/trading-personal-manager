import cron from 'node-cron';
import { nowS } from '../db/client.js';
import type { Services } from '../services/index.js';
import { runAlertEvaluation } from './evaluate-alerts.job.js';
import { runHolderSnapshot } from './snapshot-holders.job.js';
import { runMarketSnapshot } from './snapshot-market.job.js';
import { runMarketSlippage, runScanDiscover, runScanEvaluate, runScanMaintenance, runScanRetro, runWatchMaintenance, runWatchNews, runWatchOnchain, runWatchPages, runWatchReview } from './watch.jobs.js';
import { JOB_SCHEDULES } from '../services/index.js';

type JobFn = (s: Services) => Promise<string>;

export class Scheduler {
  private readonly tasks: cron.ScheduledTask[] = [];
  private readonly running = new Set<string>();

  constructor(private readonly s: Services) {}

  /** Exécute un job avec verrou anti-chevauchement et journalisation en base. */
  async run(name: string, fn: JobFn): Promise<void> {
    if (this.running.has(name)) {
      this.s.ctx.log.warn({ job: name }, 'Job déjà en cours, exécution ignorée');
      return;
    }
    this.running.add(name);
    const started = Date.now();
    try {
      const summary = await fn(this.s);
      this.s.ctx.jobs.record(name, 'ok', null, nowS());
      this.s.ctx.log.info({ job: name, ms: Date.now() - started, summary }, 'Job terminé');
    } catch (err) {
      this.s.ctx.jobs.record(name, 'error', (err as Error).message, nowS());
      this.s.ctx.log.error({ job: name, err: (err as Error).message }, 'Job en erreur');
    } finally {
      this.running.delete(name);
    }
  }

  start(): void {
    const env = this.s.ctx.env;
    const schedule = (name: string, expr: string, fn: JobFn) => {
      if (!cron.validate(expr)) throw new Error(`Expression cron invalide pour ${name} : ${expr}`);
      this.tasks.push(cron.schedule(expr, () => void this.run(name, fn)));
      this.s.ctx.log.info({ job: name, cron: expr }, 'Job planifié');
    };
    schedule('market-snapshot', env.CRON_MARKET_SNAPSHOT, runMarketSnapshot);
    schedule('holder-snapshot', env.CRON_HOLDER_SNAPSHOT, (s) => runHolderSnapshot(s));
    schedule('alert-eval', env.CRON_ALERT_EVAL, runAlertEvaluation);
    const wj = JOB_SCHEDULES(env);
    schedule('watch-pages', wj['watch-pages']!, runWatchPages);
    schedule('watch-news', wj['watch-news']!, runWatchNews);
    schedule('watch-onchain', wj['watch-onchain']!, runWatchOnchain);
    schedule('watch-review', wj['watch-review']!, runWatchReview);
    schedule('watch-maintenance', wj['watch-maintenance']!, runWatchMaintenance);
    schedule('market-slippage', wj['market-slippage']!, runMarketSlippage);
    schedule('scan-discover', wj['scan-discover']!, runScanDiscover);
    schedule('scan-evaluate', wj['scan-evaluate']!, runScanEvaluate);
    schedule('scan-retro', wj['scan-retro']!, runScanRetro);
    schedule('scan-maintenance', wj['scan-maintenance']!, runScanMaintenance);
    // Entretien hebdomadaire du cache et des logs d'usage
    this.tasks.push(cron.schedule('0 4 * * 1', () => {
      this.s.ctx.cache.purgeExpired();
      this.s.ctx.usage.purge();
    }));

    // Au démarrage : rattrapage sans attendre le prochain tick.
    setTimeout(() => {
      void this.run('market-snapshot', runMarketSnapshot).then(() =>
        this.run('holder-snapshot', (s) => runHolderSnapshot(s, { onlyMissingToday: true })),
      );
    }, 3_000);
  }

  stop(): void {
    for (const t of this.tasks) t.stop();
  }
}
