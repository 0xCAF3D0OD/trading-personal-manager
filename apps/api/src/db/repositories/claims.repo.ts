import type { Claim, ClaimStatus } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

interface ClaimRow {
  id: number; token_id: number; source_id: number | null; origin: string; published_at: number; captured_at: number; url: string | null; author: string | null;
  text: string; type: string; subtype: string | null; status: ClaimStatus; due_at: number | null; extracted_numbers: string; verification_kind: string | null;
  verification_ref: string | null; verification_note: string | null; resolved_at: number | null; resolved_by: string | null; linked_change_id: number | null;
}
export function toClaim(r: ClaimRow): Claim {
  return {
    id: r.id, tokenId: r.token_id, sourceId: r.source_id, origin: r.origin as Claim['origin'], publishedAt: r.published_at, capturedAt: r.captured_at,
    url: r.url, author: r.author, text: r.text, type: r.type as Claim['type'], subtype: r.subtype, status: r.status, dueAt: r.due_at,
    extractedNumbers: (() => { try { return JSON.parse(r.extracted_numbers); } catch { return []; } })(),
    verificationKind: r.verification_kind as Claim['verificationKind'], verificationRef: r.verification_ref, verificationNote: r.verification_note,
    resolvedAt: r.resolved_at, resolvedBy: r.resolved_by as Claim['resolvedBy'], linkedChangeId: r.linked_change_id,
  };
}

export class ClaimsRepo {
  constructor(private readonly db: Db) {}

  list(tokenId: number, opts: { status?: ClaimStatus; limit?: number } = {}): Claim[] {
    const rows = (opts.status
      ? this.db.prepare('SELECT * FROM claims WHERE token_id = ? AND status = ? ORDER BY published_at DESC LIMIT ?').all(tokenId, opts.status, opts.limit ?? 500)
      : this.db.prepare('SELECT * FROM claims WHERE token_id = ? ORDER BY published_at DESC LIMIT ?').all(tokenId, opts.limit ?? 500)) as unknown as ClaimRow[];
    return rows.map(toClaim);
  }
  byId(id: number): Claim | null {
    const r = this.db.prepare('SELECT * FROM claims WHERE id = ?').get(id) as unknown as ClaimRow | undefined;
    return r ? toClaim(r) : null;
  }
  around(tokenId: number, fromTs: number, toTs: number): Claim[] {
    return (this.db.prepare('SELECT * FROM claims WHERE token_id = ? AND published_at BETWEEN ? AND ? ORDER BY published_at DESC').all(tokenId, fromTs, toTs) as unknown as ClaimRow[]).map(toClaim);
  }
  pendingForReview(): Claim[] {
    return (this.db.prepare(`SELECT c.* FROM claims c JOIN tokens t ON t.id = c.token_id WHERE c.status = 'pending' AND t.archived_at IS NULL`).all() as unknown as ClaimRow[]).map(toClaim);
  }
  insert(c: {
    tokenId: number; sourceId: number | null; origin: string; publishedAt: number; url: string | null; author: string | null; text: string; type: string;
    subtype: string | null; dueAt: number | null; extractedNumbers: unknown; verificationKind: string | null; verificationRef: string | null; linkedChangeId?: number | null; status?: ClaimStatus; verificationNote?: string | null;
  }): Claim {
    const r = this.db.prepare(`INSERT INTO claims (token_id, source_id, origin, published_at, captured_at, url, author, text, type, subtype, status, due_at, extracted_numbers, verification_kind, verification_ref, verification_note, linked_change_id, resolved_at, resolved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.tokenId, c.sourceId, c.origin, c.publishedAt, nowS(), c.url, c.author, c.text, c.type, c.subtype, c.status ?? 'pending', c.dueAt,
        JSON.stringify(c.extractedNumbers ?? []), c.verificationKind, c.verificationRef, c.verificationNote ?? null, c.linkedChangeId ?? null,
        c.status && c.status !== 'pending' ? nowS() : null, c.status && c.status !== 'pending' ? 'auto' : null);
    return this.byId(Number(r.lastInsertRowid)) as Claim;
  }
  existsByUrl(tokenId: number, url: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM claims WHERE token_id = ? AND url = ?').get(tokenId, url);
  }
  resolve(id: number, status: ClaimStatus, by: 'manual' | 'auto', note: string | null): Claim {
    this.db.prepare('UPDATE claims SET status = ?, resolved_at = ?, resolved_by = ?, verification_note = COALESCE(?, verification_note) WHERE id = ?').run(status, nowS(), by, note, id);
    return this.byId(id) as Claim;
  }
  countPending(tokenId: number): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM claims WHERE token_id = ? AND status = 'pending'`).get(tokenId) as { n: number }).n;
  }
}
