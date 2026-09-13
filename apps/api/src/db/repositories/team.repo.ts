import type { OnchainAction, SupplyEvent, TeamWallet } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

interface WalletRow { id: number; token_id: number; address: string; label: string; source: string; added_at: number; note: string | null }
interface ActionRow { id: number; token_id: number; wallet_address: string; tx_signature: string; ts: number; kind: string; amount: number | null; amount_usd: number | null; counterparty: string | null; counterparty_label: string | null; source: string; wallet_label?: string | null }
interface SupplyRow { id: number; token_id: number; ts_from: number; ts_to: number; supply_before: number; supply_after: number; delta: number; delta_pct: number; kind: string }

export class TeamRepo {
  constructor(private readonly db: Db) {}

  wallets(tokenId: number): TeamWallet[] {
    return (this.db.prepare('SELECT * FROM team_wallets WHERE token_id = ? ORDER BY id').all(tokenId) as unknown as WalletRow[]).map((r) => ({
      id: r.id, tokenId: r.token_id, address: r.address, label: r.label as TeamWallet['label'], source: r.source as TeamWallet['source'], addedAt: r.added_at, note: r.note,
    }));
  }
  ensureWallet(tokenId: number, address: string, label: string, source: 'auto' | 'manual', note: string | null): boolean {
    const r = this.db.prepare('INSERT OR IGNORE INTO team_wallets (token_id, address, label, source, added_at, note) VALUES (?, ?, ?, ?, ?, ?)').run(tokenId, address, label, source, nowS(), note);
    return Number(r.changes) > 0;
  }
  /** Seuls les wallets ajoutés à la main se retirent ; le créateur détecté automatiquement reste. */
  deleteWallet(tokenId: number, id: number): boolean {
    return Number(this.db.prepare('DELETE FROM team_wallets WHERE id = ? AND token_id = ? AND source = ?').run(id, tokenId, 'manual').changes) > 0;
  }

  insertActions(rows: Omit<ActionRow, 'id' | 'wallet_label'>[] & { raw?: string | null }[]): number {
    const stmt = this.db.prepare(`INSERT OR IGNORE INTO onchain_actions (token_id, wallet_address, tx_signature, ts, kind, amount, amount_usd, counterparty, counterparty_label, source, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let n = 0;
    this.db.exec('BEGIN');
    try {
      for (const r of rows) n += Number(stmt.run(r.token_id, r.wallet_address, r.tx_signature, r.ts, r.kind, r.amount, r.amount_usd, r.counterparty, r.counterparty_label, r.source, r.raw ?? null).changes);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return n;
  }
  actions(tokenId: number, sinceTs = 0, limit = 300): OnchainAction[] {
    return (this.db.prepare(`SELECT a.*, w.label AS wallet_label FROM onchain_actions a LEFT JOIN team_wallets w ON w.token_id = a.token_id AND w.address = a.wallet_address
      WHERE a.token_id = ? AND a.ts >= ? ORDER BY a.ts DESC LIMIT ?`).all(tokenId, sinceTs, limit) as unknown as ActionRow[]).map((r) => ({
      id: r.id, tokenId: r.token_id, walletAddress: r.wallet_address, walletLabel: r.wallet_label ?? null, txSignature: r.tx_signature, ts: r.ts,
      kind: r.kind as OnchainAction['kind'], amount: r.amount, amountUsd: r.amount_usd, counterparty: r.counterparty, counterpartyLabel: r.counterparty_label, source: r.source,
    }));
  }
  actionsMatching(tokenId: number, kinds: string[], fromTs: number, toTs: number): OnchainAction[] {
    return this.actions(tokenId, fromTs, 1000).filter((a) => a.ts <= toTs && kinds.includes(a.kind));
  }

  insertSupplyEvent(e: Omit<SupplyRow, 'id'>): void {
    this.db.prepare('INSERT INTO supply_events (token_id, ts_from, ts_to, supply_before, supply_after, delta, delta_pct, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.token_id, e.ts_from, e.ts_to, e.supply_before, e.supply_after, e.delta, e.delta_pct, e.kind);
  }
  supplyWatermark(tokenId: number): number | null {
    return (this.db.prepare('SELECT MAX(ts_to) AS m FROM supply_events WHERE token_id = ?').get(tokenId) as { m: number | null }).m;
  }
  supplyEvents(tokenId: number, fromTs = 0, toTs = 2_000_000_000): SupplyEvent[] {
    return (this.db.prepare('SELECT * FROM supply_events WHERE token_id = ? AND ts_to BETWEEN ? AND ? ORDER BY ts_to DESC').all(tokenId, fromTs, toTs) as unknown as SupplyRow[]).map((r) => ({
      id: r.id, tokenId: r.token_id, tsFrom: r.ts_from, tsTo: r.ts_to, supplyBefore: r.supply_before, supplyAfter: r.supply_after, delta: r.delta, deltaPct: r.delta_pct, kind: r.kind as SupplyEvent['kind'],
    }));
  }

  label(address: string): string | null {
    return (this.db.prepare('SELECT label FROM address_labels WHERE address = ?').get(address) as { label: string } | undefined)?.label ?? null;
  }
  labels(addresses: string[]): Map<string, string> {
    const out = new Map<string, string>();
    for (let i = 0; i < addresses.length; i += 200) {
      const chunk = addresses.slice(i, i + 200);
      const rows = this.db.prepare(`SELECT address, label FROM address_labels WHERE address IN (${chunk.map(() => '?').join(',')})`).all(...chunk) as unknown as { address: string; label: string }[];
      for (const r of rows) out.set(r.address, r.label);
    }
    return out;
  }
  upsertLabel(address: string, label: string, source: string): void {
    this.db.prepare('INSERT INTO address_labels (address, label, source, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(address) DO UPDATE SET label = excluded.label, source = excluded.source, updated_at = excluded.updated_at')
      .run(address, label, source, nowS());
  }
  labelCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM address_labels').get() as { n: number }).n;
  }
}
