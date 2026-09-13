import type { Db } from '../client.js';

export interface HealthRow {
  token_id: number;
  mint_authority: string | null;
  freeze_authority: string | null;
  token2022_extensions: string;
  lp_locked: number | null;
  lp_locked_pct: number | null;
  lp_lock_protocol: string | null;
  lp_lock_source: string;
  checked_at: number;
}

export class HealthRepo {
  constructor(private readonly db: Db) {}

  get(tokenId: number): HealthRow | undefined {
    return this.db.prepare('SELECT * FROM token_health WHERE token_id = ?').get(tokenId) as unknown as HealthRow | undefined;
  }

  upsert(r: HealthRow): void {
    this.db
      .prepare(
        `INSERT INTO token_health (token_id, mint_authority, freeze_authority, token2022_extensions,
           lp_locked, lp_locked_pct, lp_lock_protocol, lp_lock_source, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(token_id) DO UPDATE SET
           mint_authority = excluded.mint_authority,
           freeze_authority = excluded.freeze_authority,
           token2022_extensions = excluded.token2022_extensions,
           lp_locked = excluded.lp_locked,
           lp_locked_pct = excluded.lp_locked_pct,
           lp_lock_protocol = excluded.lp_lock_protocol,
           lp_lock_source = excluded.lp_lock_source,
           checked_at = excluded.checked_at`,
      )
      .run(
        r.token_id, r.mint_authority, r.freeze_authority, r.token2022_extensions,
        r.lp_locked, r.lp_locked_pct, r.lp_lock_protocol, r.lp_lock_source, r.checked_at,
      );
  }
}
