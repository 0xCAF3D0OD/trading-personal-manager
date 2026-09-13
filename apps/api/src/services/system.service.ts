import type { UsageView } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import { nowS } from '../db/client.js';
import { AppContext } from './context.js';

export class SystemService {
  constructor(private readonly ctx: AppContext, private readonly schedules: Record<string, string>) {}

  /** Mode économie : au-delà de 80 % du budget mensuel Solscan, les snapshots détenteurs Solscan passent à 1 jour sur 2. */
  solscanEconomyMode(): boolean {
    if (!this.ctx.sources.solscan) return false;
    const used = this.ctx.usage.solscanCuSince(startOfMonth());
    return used / this.ctx.env.SOLSCAN_MONTHLY_CU_BUDGET >= 0.8;
  }

  async usage(): Promise<UsageView> {
    const now = nowS();
    const startOfDay = now - (now % 86400);
    let solscan: UsageView['solscan'] = null;
    if (this.ctx.sources.solscan) {
      let remote: unknown = null;
      try {
        const hit = await this.ctx.cache.getOrFetch('solscan:usage', TTL.solscanUsage, async () => ({
          value: await this.ctx.sources.solscan!.getUsage(), source: 'solscan',
        }));
        remote = hit.value;
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message }, 'Solscan /monitor/usage indisponible');
      }
      const local = this.ctx.usage.solscanCuSince(startOfMonth());
      solscan = {
        remoteUsage: remote, localCuThisMonth: local, monthlyBudget: this.ctx.env.SOLSCAN_MONTHLY_CU_BUDGET,
        budgetUsedPct: (local / this.ctx.env.SOLSCAN_MONTHLY_CU_BUDGET) * 100, economyMode: this.solscanEconomyMode(),
      };
    }
    const runs = new Map(this.ctx.jobs.all().map((r) => [r.name, r]));
    return {
      today: this.ctx.usage.summary(startOfDay),
      last30Days: this.ctx.usage.summary(now - 30 * 86400),
      solscan,
      jobs: Object.entries(this.schedules).map(([name, schedule]) => {
        const r = runs.get(name);
        return { name, schedule, lastRunAt: r?.last_run_at ?? null, lastStatus: r?.last_status ?? null, lastError: r?.last_error ?? null };
      }),
    };
  }
}

function startOfMonth(): number {
  const d = new Date();
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}
