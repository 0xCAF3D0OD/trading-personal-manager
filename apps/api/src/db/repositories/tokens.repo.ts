import type { Token, TokenProgram } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

export interface TokenRow {
  id: number;
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number;
  program: TokenProgram;
  created_at: number | null;
  created_at_source: string | null;
  creator_address: string | null;
  creator_source: string | null;
  sort_order: number;
  added_at: number;
  archived_at: number | null;
}

export function toToken(r: TokenRow): Token {
  return {
    id: r.id,
    address: r.address,
    symbol: r.symbol,
    name: r.name,
    decimals: r.decimals,
    program: r.program,
    createdAt: r.created_at,
    creatorAddress: r.creator_address,
    sortOrder: r.sort_order,
    addedAt: r.added_at,
  };
}

export class TokensRepo {
  constructor(private readonly db: Db) {}

  listActive(): TokenRow[] {
    return this.db
      .prepare('SELECT * FROM tokens WHERE archived_at IS NULL ORDER BY sort_order ASC, id ASC')
      .all() as unknown as TokenRow[];
  }

  byId(id: number): TokenRow | undefined {
    return this.db.prepare('SELECT * FROM tokens WHERE id = ?').get(id) as unknown as TokenRow | undefined;
  }

  byAddress(address: string): TokenRow | undefined {
    return this.db.prepare('SELECT * FROM tokens WHERE address = ?').get(address) as unknown as TokenRow | undefined;
  }

  insert(t: {
    address: string;
    symbol: string | null;
    name: string | null;
    decimals: number;
    program: TokenProgram;
    createdAt: number | null;
    createdAtSource: string | null;
    creatorAddress: string | null;
    creatorSource: string | null;
  }): TokenRow {
    const maxOrder = (this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM tokens').get() as { m: number }).m;
    const r = this.db
      .prepare(
        `INSERT INTO tokens (address, symbol, name, decimals, program, created_at, created_at_source,
           creator_address, creator_source, sort_order, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.address, t.symbol, t.name, t.decimals, t.program, t.createdAt, t.createdAtSource,
        t.creatorAddress, t.creatorSource, maxOrder + 1, nowS(),
      );
    return this.byId(Number(r.lastInsertRowid)) as TokenRow;
  }

  unarchive(id: number): void {
    this.db.prepare('UPDATE tokens SET archived_at = NULL WHERE id = ?').run(id);
  }

  archive(id: number): boolean {
    const r = this.db.prepare('UPDATE tokens SET archived_at = ? WHERE id = ? AND archived_at IS NULL').run(nowS(), id);
    return Number(r.changes) > 0;
  }

  updateMeta(id: number, patch: Partial<Pick<TokenRow, 'symbol' | 'name' | 'created_at' | 'created_at_source' | 'creator_address' | 'creator_source'>>): void {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    this.db.prepare(`UPDATE tokens SET ${sets} WHERE id = ?`).run(...keys.map((k) => patch[k] as string | number | null), id);
  }

  reorder(ids: number[]): void {
    const stmt = this.db.prepare('UPDATE tokens SET sort_order = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      ids.forEach((id, i) => stmt.run(i + 1, id));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
