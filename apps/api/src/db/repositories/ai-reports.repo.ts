import type { AiReport } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

interface Row { id: number; token_id: number; created_at: number; provider: string; model: string | null; dossier_hash: string; prompt_version: number; content: string; note: string | null }

const toReport = (r: Row): AiReport => ({
  id: r.id, tokenId: r.token_id, createdAt: r.created_at, provider: r.provider as AiReport['provider'], model: r.model,
  dossierHash: r.dossier_hash, promptVersion: r.prompt_version, content: r.content, note: r.note,
});

/** Lecture et insertion seulement : un rapport est figé une fois enregistré. */
export class AiReportsRepo {
  constructor(private readonly db: Db) {}

  list(tokenId: number): AiReport[] {
    return (this.db.prepare('SELECT * FROM ai_reports WHERE token_id = ? ORDER BY created_at DESC, id DESC').all(tokenId) as unknown as Row[]).map(toReport);
  }

  byId(id: number): AiReport | null {
    const r = this.db.prepare('SELECT * FROM ai_reports WHERE id = ?').get(id) as unknown as Row | undefined;
    return r ? toReport(r) : null;
  }

  insert(input: { tokenId: number; provider: string; model: string | null; dossierHash: string; promptVersion: number; content: string; note: string | null }): AiReport {
    const res = this.db
      .prepare('INSERT INTO ai_reports (token_id, created_at, provider, model, dossier_hash, prompt_version, content, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(input.tokenId, nowS(), input.provider, input.model, input.dossierHash, input.promptVersion, input.content, input.note);
    return this.byId(Number(res.lastInsertRowid)) as AiReport;
  }
}
