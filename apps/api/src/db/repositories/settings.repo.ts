import type { Db } from '../client.js';
import { nowS } from '../client.js';

export interface SettingsRow { id: number; module: string; created_at: number; settings: string; defaults_version: number; is_default: number; note: string | null }

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  latest(module: string): SettingsRow | undefined {
    return this.db.prepare('SELECT * FROM app_settings WHERE module = ? ORDER BY id DESC LIMIT 1').get(module) as unknown as SettingsRow | undefined;
  }

  insert(module: string, settings: unknown, defaultsVersion: number, isDefault: boolean, note: string | null): SettingsRow {
    const r = this.db
      .prepare('INSERT INTO app_settings (module, created_at, settings, defaults_version, is_default, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(module, nowS(), JSON.stringify(settings), defaultsVersion, isDefault ? 1 : 0, note);
    return this.db.prepare('SELECT * FROM app_settings WHERE id = ?').get(Number(r.lastInsertRowid)) as unknown as SettingsRow;
  }

  history(module: string, limit = 20): SettingsRow[] {
    return this.db.prepare('SELECT * FROM app_settings WHERE module = ? ORDER BY id DESC LIMIT ?').all(module, limit) as unknown as SettingsRow[];
  }
}
