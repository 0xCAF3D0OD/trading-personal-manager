import type { Alert, AlertEvent, AlertType } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

export interface AlertRow {
  id: number; token_id: number; type: AlertType; threshold: number | null; plan_id: number | null;
  enabled: number; cooldown_s: number; last_fired_at: number | null; created_at: number;
}

interface EventRow {
  id: number; alert_id: number; fired_at: number; observed: number | null; threshold: number | null;
  rule_text: string; payload: string | null; delivered_to: string; acknowledged_at: number | null;
  token_id: number; token_symbol: string | null; type: AlertType;
}

export class AlertsRepo {
  constructor(private readonly db: Db) {}

  list(tokenId?: number): AlertRow[] {
    if (tokenId !== undefined) {
      return this.db.prepare('SELECT * FROM alerts WHERE token_id = ? ORDER BY id DESC').all(tokenId) as unknown as AlertRow[];
    }
    return this.db.prepare('SELECT * FROM alerts ORDER BY id DESC').all() as unknown as AlertRow[];
  }

  listEnabled(): AlertRow[] {
    return this.db
      .prepare(
        `SELECT a.* FROM alerts a JOIN tokens t ON t.id = a.token_id
         WHERE a.enabled = 1 AND t.archived_at IS NULL ORDER BY a.id ASC`,
      )
      .all() as unknown as AlertRow[];
  }

  byId(id: number): AlertRow | undefined {
    return this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as unknown as AlertRow | undefined;
  }

  insert(a: { tokenId: number; type: AlertType; threshold: number | null; planId: number | null; cooldownS?: number }): AlertRow {
    const r = this.db
      .prepare(
        `INSERT INTO alerts (token_id, type, threshold, plan_id, enabled, cooldown_s, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(a.tokenId, a.type, a.threshold, a.planId, a.cooldownS ?? 21600, nowS());
    return this.byId(Number(r.lastInsertRowid)) as AlertRow;
  }

  existsForToken(tokenId: number, type: AlertType): boolean {
    return !!this.db.prepare('SELECT 1 FROM alerts WHERE token_id = ? AND type = ?').get(tokenId, type);
  }

  update(id: number, patch: { enabled?: boolean; cooldownS?: number }): AlertRow | undefined {
    if (patch.enabled !== undefined) this.db.prepare('UPDATE alerts SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id);
    if (patch.cooldownS !== undefined) this.db.prepare('UPDATE alerts SET cooldown_s = ? WHERE id = ?').run(patch.cooldownS, id);
    return this.byId(id);
  }

  disablePlanAlerts(planId: number): void {
    this.db.prepare('UPDATE alerts SET enabled = 0 WHERE plan_id = ?').run(planId);
  }

  delete(id: number): boolean {
    this.db.prepare('DELETE FROM alert_events WHERE alert_id = ?').run(id);
    return Number(this.db.prepare('DELETE FROM alerts WHERE id = ?').run(id).changes) > 0;
  }

  markFired(id: number, at: number): void {
    this.db.prepare('UPDATE alerts SET last_fired_at = ? WHERE id = ?').run(at, id);
  }

  insertEvent(e: {
    alertId: number; firedAt: number; observed: number | null; threshold: number | null;
    ruleText: string; payload: unknown; deliveredTo: unknown;
  }): number {
    const r = this.db
      .prepare(
        `INSERT INTO alert_events (alert_id, fired_at, observed, threshold, rule_text, payload, delivered_to)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(e.alertId, e.firedAt, e.observed, e.threshold, e.ruleText, JSON.stringify(e.payload ?? null), JSON.stringify(e.deliveredTo));
    return Number(r.lastInsertRowid);
  }

  events(limit = 100, tokenId?: number): AlertEvent[] {
    const base = `SELECT e.*, a.token_id, a.type, t.symbol AS token_symbol FROM alert_events e
      JOIN alerts a ON a.id = e.alert_id JOIN tokens t ON t.id = a.token_id`;
    const rows = (
      tokenId !== undefined
        ? this.db.prepare(`${base} WHERE a.token_id = ? ORDER BY e.fired_at DESC LIMIT ?`).all(tokenId, limit)
        : this.db.prepare(`${base} ORDER BY e.fired_at DESC LIMIT ?`).all(limit)
    ) as unknown as EventRow[];
    return rows.map((r) => ({
      id: r.id, alertId: r.alert_id, tokenId: r.token_id, tokenSymbol: r.token_symbol, type: r.type,
      firedAt: r.fired_at, observed: r.observed, threshold: r.threshold, ruleText: r.rule_text,
      payload: safeParse(r.payload), deliveredTo: safeParse(r.delivered_to) ?? [], acknowledgedAt: r.acknowledged_at,
    }));
  }

  acknowledge(eventId: number): boolean {
    return Number(this.db.prepare('UPDATE alert_events SET acknowledged_at = ? WHERE id = ?').run(nowS(), eventId).changes) > 0;
  }
}

function safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
