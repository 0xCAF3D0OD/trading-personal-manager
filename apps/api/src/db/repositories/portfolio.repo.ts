import type { PortfolioHistoryPoint } from '@tpm/shared';
import type { Db } from '../client.js';

export interface PortfolioRow {
  ts: number; day: string; asset: string; kraken_code: string; state: string | null; balance: number;
  price_eur: number | null; price_usd: number | null; price_source: string; onchain_price_usd: number | null;
  value_eur: number | null; value_usd: number | null; token_id: number | null;
}

/** Un relevé par jour et par solde : le dernier de la journée remplace le précédent. */
export class PortfolioRepo {
  constructor(private readonly db: Db) {}

  replaceDay(day: string, rows: Omit<PortfolioRow, 'day'>[]): void {
    const del = this.db.prepare('DELETE FROM portfolio_snapshots WHERE day = ?');
    const ins = this.db.prepare(`INSERT INTO portfolio_snapshots (ts, day, asset, kraken_code, state, balance, price_eur, price_usd, price_source, onchain_price_usd, value_eur, value_usd, token_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this.db.exec('BEGIN');
    try {
      del.run(day);
      for (const r of rows) ins.run(r.ts, day, r.asset, r.kraken_code, r.state, r.balance, r.price_eur, r.price_usd, r.price_source, r.onchain_price_usd, r.value_eur, r.value_usd, r.token_id);
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }

  days(): string[] {
    return (this.db.prepare('SELECT DISTINCT day FROM portfolio_snapshots ORDER BY day ASC').all() as unknown as { day: string }[]).map((r) => r.day);
  }

  /** Total d'un jour dans la monnaie demandée (null si aucun relevé ce jour-là). */
  totalOf(day: string, currency: 'EUR' | 'USD'): number | null {
    const col = currency === 'EUR' ? 'value_eur' : 'value_usd';
    const r = this.db.prepare(`SELECT COUNT(*) AS n, SUM(${col}) AS total FROM portfolio_snapshots WHERE day = ?`).get(day) as unknown as { n: number; total: number | null };
    return r.n ? r.total : null;
  }

  /** Dernier jour strictement antérieur à `day` ayant un relevé. */
  previousDay(day: string): string | null {
    const r = this.db.prepare('SELECT day FROM portfolio_snapshots WHERE day < ? ORDER BY day DESC LIMIT 1').get(day) as unknown as { day: string } | undefined;
    return r?.day ?? null;
  }

  history(sinceDay: string, currency: 'EUR' | 'USD'): PortfolioHistoryPoint[] {
    const col = currency === 'EUR' ? 'value_eur' : 'value_usd';
    const rows = this.db.prepare(`SELECT day, MAX(ts) AS ts, asset, SUM(${col}) AS value FROM portfolio_snapshots WHERE day >= ? GROUP BY day, asset ORDER BY day ASC`).all(sinceDay) as unknown as { day: string; ts: number; asset: string; value: number | null }[];
    const byDay = new Map<string, PortfolioHistoryPoint>();
    for (const r of rows) {
      const p = byDay.get(r.day) ?? { day: r.day, ts: r.ts, total: 0, byAsset: [] };
      p.ts = Math.max(p.ts, r.ts);
      p.byAsset.push({ asset: r.asset, value: r.value });
      if (r.value !== null && p.total !== null) p.total += r.value;
      byDay.set(r.day, p);
    }
    return [...byDay.values()];
  }
}
