import type { Plan, PlanInput, PlanRevision } from '@tpm/shared';
import { AppContext } from './context.js';
import type { TokenService } from './token.service.js';

export class PlanService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  list(tokenId: number): { plans: Plan[]; revisions: PlanRevision[] } {
    this.tokens.require(tokenId);
    const plans = this.ctx.plans.listForToken(tokenId);
    return { plans, revisions: computeRevisions(plans) };
  }

  /** Crée toujours une nouvelle version, puis remplace les alertes TP / SL / entrée dérivées. */
  create(tokenId: number, input: PlanInput): Plan {
    this.tokens.require(tokenId);
    const previous = this.ctx.plans.current(tokenId);
    const plan = this.ctx.plans.append(tokenId, input);
    if (previous) this.ctx.alerts.disablePlanAlerts(previous.id);
    this.ctx.alerts.insert({ tokenId, type: 'plan_tp', threshold: plan.takeProfitPrice, planId: plan.id, cooldownS: 6 * 3600 });
    this.ctx.alerts.insert({ tokenId, type: 'plan_sl', threshold: plan.stopLossPrice, planId: plan.id, cooldownS: 6 * 3600 });
    this.ctx.alerts.insert({ tokenId, type: 'plan_entry', threshold: plan.entryPrice, planId: plan.id, cooldownS: 24 * 3600 });
    return plan;
  }
}

/** Compare chaque version à la précédente et qualifie le sens de chaque changement. */
export function computeRevisions(plansDesc: Plan[]): PlanRevision[] {
  const asc = [...plansDesc].sort((a, b) => a.version - b.version);
  const out: PlanRevision[] = [];
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1]!, cur = asc[i]!;
    const changes: PlanRevision['changes'] = [];
    const push = (field: string, from: number, to: number, loosenedWhen: 'up' | 'down' | 'none') => {
      if (from === to) return;
      let direction: 'loosened' | 'tightened' | 'neutral' = 'neutral';
      if (loosenedWhen === 'up') direction = to > from ? 'loosened' : 'tightened';
      if (loosenedWhen === 'down') direction = to < from ? 'loosened' : 'tightened';
      changes.push({ field, from, to, direction });
    };
    // Baisser le stop = se donner plus de marge de perte. Monter le TP = repousser la prise de gain.
    push('stopLossPrice', prev.stopLossPrice, cur.stopLossPrice, 'down');
    push('takeProfitPrice', prev.takeProfitPrice, cur.takeProfitPrice, 'up');
    push('entryPrice', prev.entryPrice, cur.entryPrice, 'none');
    push('amountUsd', prev.amountUsd, cur.amountUsd, 'up');
    out.push({ fromVersion: prev.version, toVersion: cur.version, at: cur.createdAt, changes });
  }
  return out.reverse();
}
