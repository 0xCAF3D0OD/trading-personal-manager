import { describe, expect, it } from 'vitest';
import { insertToken, testServices } from './helpers.js';

function seed(db: ReturnType<typeof testServices>['db'], tokenId: number, days: number, fn: (i: number) => { price: number; mcap: number; supply: number; holders: number; top10: number }) {
  const now = Math.floor(Date.now() / 1000);
  for (let i = days; i >= 0; i--) {
    const ts = now - i * 86400 + 60;
    const v = fn(days - i);
    db.prepare(`INSERT INTO market_snapshots (token_id, ts, price_usd, price_source, market_cap_usd, supply_circ, supply_source) VALUES (?, ?, ?, 'dexscreener', ?, ?, 'rpc')`)
      .run(tokenId, ts, v.price, v.mcap, v.supply);
    db.prepare(`INSERT INTO holder_snapshots (token_id, ts, day, holder_count, top10_pct, source) VALUES (?, ?, date(?, 'unixepoch'), ?, ?, 'helius')`)
      .run(tokenId, ts, ts, v.holders, v.top10);
  }
}

describe('Divergences', () => {
  it('signale un historique insuffisant sans données', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const d = services.divergences.compute(tokenId);
    expect(d).toHaveLength(7);
    // Sans engagement de burn enregistré, la règle « burn annoncé » n'a rien à vérifier : ok, pas insuffisant.
    expect(d.filter((x) => x.id !== 'announced_burn_no_supply_change').every((x) => x.status === 'insufficient_data')).toBe(true);
    expect(d.find((x) => x.id === 'announced_burn_no_supply_change')!.status).toBe('ok');
  });

  it('détecte la distribution : détenteurs en hausse, capitalisation en baisse', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    seed(db, tokenId, 8, (i) => ({ price: 1 - i * 0.02, mcap: 1_000_000 - i * 20_000, supply: 1_000_000, holders: 1000 + i * 20, top10: 40 }));
    const d = services.divergences.compute(tokenId);
    const dist = d.find((x) => x.id === 'distribution')!;
    expect(dist.status).toBe('triggered');
    expect(dist.seriesA.changePct).toBeGreaterThan(5);
    expect(dist.seriesB.changePct).toBeLessThan(0);
    const avg = d.find((x) => x.id === 'avg_position')!;
    expect(avg.status).toBe('triggered');
  });

  it('détecte concentration en baisse pendant une hausse de prix', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    seed(db, tokenId, 8, (i) => ({ price: 1 + i * 0.05, mcap: 1_000_000 + i * 50_000, supply: 1_000_000, holders: 1000, top10: 45 - i * 0.8 }));
    const d = services.divergences.compute(tokenId);
    expect(d.find((x) => x.id === 'concentration_down_price_up')!.status).toBe('triggered');
    expect(d.find((x) => x.id === 'distribution')!.status).toBe('ok');
  });

  it('détecte un burn qui ralentit', () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    // 7 premiers jours : -1000 / jour ; 7 suivants : -200 / jour
    seed(db, tokenId, 15, (i) => {
      const burned = i <= 8 ? i * 1000 : 8000 + (i - 8) * 200;
      return { price: 1, mcap: 1_000_000, supply: 1_000_000 - burned, holders: 1000, top10: 40 };
    });
    const d = services.divergences.compute(tokenId);
    const burn = d.find((x) => x.id === 'burn_slowdown')!;
    expect(burn.status).toBe('triggered');
  });
});
