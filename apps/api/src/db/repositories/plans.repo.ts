import type { Plan, PlanInput } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

interface PlanRow {
  id: number; token_id: number; version: number; supersedes_plan_id: number | null; created_at: number;
  entry_price: number; take_profit_price: number; stop_loss_price: number; amount_usd: number;
  accepts_total_loss: number; note: string | null;
}

export function toPlan(r: PlanRow, isCurrent: boolean): Plan {
  const risk = r.entry_price - r.stop_loss_price;
  const reward = r.take_profit_price - r.entry_price;
  return {
    id: r.id, tokenId: r.token_id, version: r.version, supersedesPlanId: r.supersedes_plan_id,
    createdAt: r.created_at, entryPrice: r.entry_price, takeProfitPrice: r.take_profit_price,
    stopLossPrice: r.stop_loss_price, amountUsd: r.amount_usd, acceptsTotalLoss: r.accepts_total_loss === 1,
    note: r.note,
    riskRewardRatio: risk > 0 ? Number((reward / risk).toFixed(2)) : 0,
    maxLossUsd: Number(((risk / r.entry_price) * r.amount_usd).toFixed(2)),
    isCurrent,
  };
}

export class PlansRepo {
  constructor(private readonly db: Db) {}

  listForToken(tokenId: number): Plan[] {
    const rows = this.db
      .prepare('SELECT * FROM plans WHERE token_id = ? ORDER BY version DESC')
      .all(tokenId) as unknown as PlanRow[];
    return rows.map((r, i) => toPlan(r, i === 0));
  }

  current(tokenId: number): Plan | null {
    const r = this.db
      .prepare('SELECT * FROM plans WHERE token_id = ? ORDER BY version DESC LIMIT 1')
      .get(tokenId) as unknown as PlanRow | undefined;
    return r ? toPlan(r, true) : null;
  }

  byId(id: number): Plan | null {
    const r = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as unknown as PlanRow | undefined;
    if (!r) return null;
    const cur = this.current(r.token_id);
    return toPlan(r, cur?.id === r.id);
  }

  /** Toujours une nouvelle version : jamais d'UPDATE (le trigger SQL le refuserait de toute façon). */
  append(tokenId: number, input: PlanInput): Plan {
    const prev = this.current(tokenId);
    const version = (prev?.version ?? 0) + 1;
    const r = this.db
      .prepare(
        `INSERT INTO plans (token_id, version, supersedes_plan_id, created_at, entry_price, take_profit_price,
           stop_loss_price, amount_usd, accepts_total_loss, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        tokenId, version, prev?.id ?? null, nowS(), input.entryPrice, input.takeProfitPrice,
        input.stopLossPrice, input.amountUsd, input.note ?? null,
      );
    return this.byId(Number(r.lastInsertRowid)) as Plan;
  }
}
