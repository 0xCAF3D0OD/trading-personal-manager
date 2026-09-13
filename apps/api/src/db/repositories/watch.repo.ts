import type { ChangeSeverity, DiscoveredEndpoint, Hunk, NumericChange, PageChange, PageSnapshot, WatchSource, WatchSourceMode } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

export interface SourceRow {
  id: number; token_id: number; kind: string; label: string; url: string | null; handle: string | null;
  mode: WatchSourceMode; api_url: string | null; api_headers: string | null; json_pointer: string | null;
  discovered_endpoints: string; render_wait_ms: number | null; enabled: number; check_interval_s: number;
  next_check_at: number; last_checked_at: number | null; last_status: string | null; last_error: string | null;
  etag: string | null; last_modified: string | null; volatile_lines: string; meta: string | null; added_at: number; note: string | null;
}
export interface VolatileEntry { key: string; sample: string; changes: number; lastChangedAt: number; volatile: boolean }
interface SnapshotRow { id: number; source_id: number; fetched_at: number; mode: WatchSourceMode; content_hash: string; text_lines: string; title: string | null; raw_body: Uint8Array | null; raw_size: number | null; final_url: string | null }
interface ChangeRow {
  id: number; source_id: number; from_snapshot_id: number; to_snapshot_id: number; detected_at: number; severity: ChangeSeverity;
  hunks: string; numeric_changes: string; announced: number | null; announced_claim_id: number | null; announce_check_due_at: number | null;
  unannounced_flag: number; alert_sent_at: number | null; unannounced_alert_sent_at: number | null; reviewed_at: number | null; review_note: string | null;
  source_label?: string; source_url?: string | null; token_id?: number;
}

const j = <T>(s: string | null, fb: T): T => { if (!s) return fb; try { return JSON.parse(s) as T; } catch { return fb; } };

export function toSource(r: SourceRow): WatchSource {
  const automated = r.kind !== 'x_account';
  return {
    id: r.id, tokenId: r.token_id, kind: r.kind as WatchSource['kind'], label: r.label, url: r.url, handle: r.handle,
    mode: r.mode, apiUrl: r.api_url, jsonPointer: r.json_pointer, discoveredEndpoints: j<DiscoveredEndpoint[]>(r.discovered_endpoints, []),
    renderWaitMs: r.render_wait_ms, enabled: r.enabled === 1, checkIntervalS: r.check_interval_s, nextCheckAt: r.next_check_at,
    lastCheckedAt: r.last_checked_at, lastStatus: r.last_status, lastError: r.last_error,
    volatileLines: j<VolatileEntry[]>(r.volatile_lines, []).filter((v) => v.volatile).map((v) => ({ key: v.key, sample: v.sample, changes: v.changes })),
    automated, addedAt: r.added_at, note: r.note, meta: j<Record<string, unknown> | null>(r.meta, null),
  };
}
export function toSnapshot(r: SnapshotRow): PageSnapshot {
  return { id: r.id, sourceId: r.source_id, fetchedAt: r.fetched_at, mode: r.mode, contentHash: r.content_hash, title: r.title, finalUrl: r.final_url, lines: j(r.text_lines, []) };
}
export function toChange(r: ChangeRow): PageChange {
  return {
    id: r.id, sourceId: r.source_id, sourceLabel: r.source_label ?? '', sourceUrl: r.source_url ?? null, tokenId: r.token_id ?? 0,
    fromSnapshotId: r.from_snapshot_id, toSnapshotId: r.to_snapshot_id, detectedAt: r.detected_at, severity: r.severity,
    hunks: j<Hunk[]>(r.hunks, []), numericChanges: j<NumericChange[]>(r.numeric_changes, []),
    announced: r.announced === null ? null : r.announced === 1, announcedClaimId: r.announced_claim_id, announceCheckDueAt: r.announce_check_due_at,
    unannouncedFlag: r.unannounced_flag === 1, alertSentAt: r.alert_sent_at, unannouncedAlertSentAt: r.unannounced_alert_sent_at,
    reviewedAt: r.reviewed_at, reviewNote: r.review_note,
  };
}

export class WatchRepo {
  constructor(private readonly db: Db) {}

  // --- sources ---------------------------------------------------------------
  sources(tokenId: number): SourceRow[] {
    return this.db.prepare('SELECT * FROM watch_sources WHERE token_id = ? ORDER BY id ASC').all(tokenId) as unknown as SourceRow[];
  }
  source(id: number): SourceRow | undefined {
    return this.db.prepare('SELECT * FROM watch_sources WHERE id = ?').get(id) as unknown as SourceRow | undefined;
  }
  dueSources(kinds: string[], limit = 50): SourceRow[] {
    const ph = kinds.map(() => '?').join(',');
    return this.db
      .prepare(`SELECT s.* FROM watch_sources s JOIN tokens t ON t.id = s.token_id
        WHERE s.enabled = 1 AND t.archived_at IS NULL AND s.kind IN (${ph}) AND s.next_check_at <= ? ORDER BY s.next_check_at ASC LIMIT ?`)
      .all(...kinds, nowS(), limit) as unknown as SourceRow[];
  }
  insertSource(s: { tokenId: number; kind: string; label: string; url: string | null; handle: string | null; checkIntervalS: number; note: string | null; mode?: WatchSourceMode }): SourceRow {
    const r = this.db
      .prepare(`INSERT INTO watch_sources (token_id, kind, label, url, handle, mode, enabled, check_interval_s, next_check_at, added_at, note)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .run(s.tokenId, s.kind, s.label, s.url, s.handle, s.mode ?? 'html', s.checkIntervalS, nowS(), nowS(), s.note);
    return this.source(Number(r.lastInsertRowid)) as SourceRow;
  }
  updateSource(id: number, patch: Partial<Record<keyof SourceRow, string | number | null>>): void {
    const keys = Object.keys(patch) as (keyof SourceRow)[];
    if (!keys.length) return;
    this.db.prepare(`UPDATE watch_sources SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k] as string | number | null), id);
  }
  deleteSource(id: number): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE claims SET source_id = NULL WHERE source_id = ?').run(id);
      this.db.prepare('DELETE FROM page_changes WHERE source_id = ?').run(id);
      this.db.prepare('DELETE FROM page_snapshots WHERE source_id = ?').run(id);
      this.db.prepare('DELETE FROM page_checks WHERE source_id = ?').run(id);
      this.db.prepare('DELETE FROM watch_sources WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  // --- checks / snapshots ----------------------------------------------------
  insertCheck(c: { sourceId: number; httpStatus: number | null; contentHash: string | null; changed: boolean; status: string; snapshotId: number | null }): void {
    this.db.prepare('INSERT INTO page_checks (source_id, checked_at, http_status, content_hash, changed, status, snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c.sourceId, nowS(), c.httpStatus, c.contentHash, c.changed ? 1 : 0, c.status, c.snapshotId);
  }
  checks(sourceId: number, limit = 50): { checked_at: number; http_status: number | null; changed: number; status: string; snapshot_id: number | null }[] {
    return this.db.prepare('SELECT checked_at, http_status, changed, status, snapshot_id FROM page_checks WHERE source_id = ? ORDER BY checked_at DESC LIMIT ?').all(sourceId, limit) as never;
  }
  insertSnapshot(s: { sourceId: number; mode: WatchSourceMode; contentHash: string; lines: unknown; title: string | null; rawBody: Buffer | null; rawSize: number | null; finalUrl: string | null }): number {
    const r = this.db.prepare(`INSERT INTO page_snapshots (source_id, fetched_at, mode, content_hash, text_lines, title, raw_body, raw_size, final_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.sourceId, nowS(), s.mode, s.contentHash, JSON.stringify(s.lines), s.title, s.rawBody, s.rawSize, s.finalUrl);
    return Number(r.lastInsertRowid);
  }
  latestSnapshot(sourceId: number): PageSnapshot | null {
    const r = this.db.prepare('SELECT id, source_id, fetched_at, mode, content_hash, text_lines, title, final_url FROM page_snapshots WHERE source_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1').get(sourceId) as unknown as SnapshotRow | undefined;
    return r ? toSnapshot(r) : null;
  }
  snapshot(id: number): PageSnapshot | null {
    const r = this.db.prepare('SELECT id, source_id, fetched_at, mode, content_hash, text_lines, title, final_url FROM page_snapshots WHERE id = ?').get(id) as unknown as SnapshotRow | undefined;
    return r ? toSnapshot(r) : null;
  }
  snapshots(sourceId: number, limit = 100): PageSnapshot[] {
    return (this.db.prepare('SELECT id, source_id, fetched_at, mode, content_hash, text_lines, title, final_url FROM page_snapshots WHERE source_id = ? ORDER BY fetched_at DESC LIMIT ?').all(sourceId, limit) as unknown as SnapshotRow[]).map(toSnapshot);
  }
  purgeRawBodies(olderThanS: number): number {
    return Number(this.db.prepare('UPDATE page_snapshots SET raw_body = NULL WHERE fetched_at < ? AND raw_body IS NOT NULL').run(nowS() - olderThanS).changes);
  }
  purgeChecks(olderThanS: number): number {
    return Number(this.db.prepare('DELETE FROM page_checks WHERE checked_at < ? AND changed = 0').run(nowS() - olderThanS).changes);
  }

  // --- changes ----------------------------------------------------------------
  insertChange(c: { sourceId: number; fromSnapshotId: number; toSnapshotId: number; severity: ChangeSeverity; hunks: Hunk[]; numericChanges: NumericChange[]; announced: boolean | null; announcedClaimId: number | null; announceCheckDueAt: number | null }): number {
    const r = this.db.prepare(`INSERT INTO page_changes (source_id, from_snapshot_id, to_snapshot_id, detected_at, severity, hunks, numeric_changes, announced, announced_claim_id, announce_check_due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.sourceId, c.fromSnapshotId, c.toSnapshotId, nowS(), c.severity, JSON.stringify(c.hunks), JSON.stringify(c.numericChanges), c.announced === null ? null : c.announced ? 1 : 0, c.announcedClaimId, c.announceCheckDueAt);
    return Number(r.lastInsertRowid);
  }
  private readonly changeSelect = `SELECT c.*, s.label AS source_label, s.url AS source_url, s.token_id FROM page_changes c JOIN watch_sources s ON s.id = c.source_id`;
  changes(tokenId: number, limit = 200): PageChange[] {
    return (this.db.prepare(`${this.changeSelect} WHERE s.token_id = ? ORDER BY c.detected_at DESC LIMIT ?`).all(tokenId, limit) as unknown as ChangeRow[]).map(toChange);
  }
  change(id: number): PageChange | null {
    const r = this.db.prepare(`${this.changeSelect} WHERE c.id = ?`).get(id) as unknown as ChangeRow | undefined;
    return r ? toChange(r) : null;
  }
  changesAwaitingAssociation(): PageChange[] {
    return (this.db.prepare(`${this.changeSelect} WHERE c.announced = 0 AND c.unannounced_flag = 0 AND c.announce_check_due_at <= ?`).all(nowS()) as unknown as ChangeRow[]).map(toChange);
  }
  updateChange(id: number, patch: Partial<Record<'announced' | 'announced_claim_id' | 'unannounced_flag' | 'alert_sent_at' | 'unannounced_alert_sent_at' | 'reviewed_at' | 'review_note', number | string | null>>): void {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    this.db.prepare(`UPDATE page_changes SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k] as string | number | null), id);
  }
  countUnreviewed(tokenId: number): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM page_changes c JOIN watch_sources s ON s.id = c.source_id WHERE s.token_id = ? AND c.reviewed_at IS NULL AND c.severity != 'minor'`).get(tokenId) as { n: number }).n;
  }
}
