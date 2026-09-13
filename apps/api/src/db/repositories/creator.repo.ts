import type { Db } from '../client.js';

export interface CreatorActivityRow {
  id: number; token_id: number; tx_signature: string; ts: number; kind: string; description: string | null;
  amount: number | null; amount_usd: number | null; source: string; raw: string | null;
}

export class CreatorRepo {
  constructor(private readonly db: Db) {}

  upsertMany(tokenId: number, rows: Omit<CreatorActivityRow, 'id' | 'token_id'>[]): number {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO creator_activities (token_id, tx_signature, ts, kind, description, amount, amount_usd, source, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let inserted = 0;
    this.db.exec('BEGIN');
    try {
      for (const r of rows) {
        const res = stmt.run(tokenId, r.tx_signature, r.ts, r.kind, r.description, r.amount, r.amount_usd, r.source, r.raw);
        inserted += Number(res.changes);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return inserted;
  }

  list(tokenId: number, limit = 100): CreatorActivityRow[] {
    return this.db
      .prepare('SELECT * FROM creator_activities WHERE token_id = ? ORDER BY ts DESC LIMIT ?')
      .all(tokenId, limit) as unknown as CreatorActivityRow[];
  }
}
