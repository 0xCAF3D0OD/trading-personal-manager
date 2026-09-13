import { describe, expect, it } from 'vitest';
import { insertToken, testServices } from './helpers.js';

describe('Journal de discipline', () => {
  it('crée des versions successives et refuse toute modification', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const v1 = services.plans.create(tokenId, { entryPrice: 1, takeProfitPrice: 2, stopLossPrice: 0.8, amountUsd: 100, acceptsTotalLoss: true, note: 'v1' });
    const v2 = services.plans.create(tokenId, { entryPrice: 1, takeProfitPrice: 2.5, stopLossPrice: 0.6, amountUsd: 100, acceptsTotalLoss: true, note: 'v2' });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.supersedesPlanId).toBe(v1.id);

    expect(() => db.prepare('UPDATE plans SET stop_loss_price = 0.1 WHERE id = ?').run(v1.id)).toThrow(/immuables/);
    expect(() => db.prepare('DELETE FROM plans WHERE id = ?').run(v1.id)).toThrow(/immuables/);
    expect(() => db.prepare(`INSERT INTO plans (token_id, version, created_at, entry_price, take_profit_price, stop_loss_price, amount_usd, accepts_total_loss) VALUES (?, 9, 0, 1, 2, 0.5, 10, 0)`).run(tokenId)).toThrow();

    const { plans, revisions } = services.plans.list(tokenId);
    expect(plans).toHaveLength(2);
    expect(plans[0]!.isCurrent).toBe(true);
    expect(revisions).toHaveLength(1);
    const rev = revisions[0]!;
    expect(rev.changes.find((c) => c.field === 'stopLossPrice')?.direction).toBe('loosened');
    expect(rev.changes.find((c) => c.field === 'takeProfitPrice')?.direction).toBe('loosened');
  });

  it('remplace les alertes TP / SL du plan précédent', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const v1 = services.plans.create(tokenId, { entryPrice: 1, takeProfitPrice: 2, stopLossPrice: 0.8, amountUsd: 100, acceptsTotalLoss: true });
    services.plans.create(tokenId, { entryPrice: 1, takeProfitPrice: 3, stopLossPrice: 0.7, amountUsd: 100, acceptsTotalLoss: true });
    const alerts = services.alerts.list(tokenId);
    const forV1 = alerts.filter((a) => a.planId === v1.id);
    expect(forV1.every((a) => !a.enabled)).toBe(true);
    expect(alerts.filter((a) => a.enabled && a.type === 'plan_sl')).toHaveLength(1);
    expect(alerts.find((a) => a.enabled && a.type === 'plan_sl')?.threshold).toBe(0.7);
  });
});
