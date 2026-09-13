import type { Db } from '../client.js';

export interface JobRunRow { name: string; last_run_at: number | null; last_status: string | null; last_error: string | null }

export class JobsRepo {
  constructor(private readonly db: Db) {}

  record(name: string, status: 'ok' | 'error' | 'skipped', error: string | null, at: number): void {
    this.db
      .prepare(
        `INSERT INTO job_runs (name, last_run_at, last_status, last_error) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET last_run_at = excluded.last_run_at, last_status = excluded.last_status, last_error = excluded.last_error`,
      )
      .run(name, at, status, error);
  }

  all(): JobRunRow[] {
    return this.db.prepare('SELECT * FROM job_runs').all() as unknown as JobRunRow[];
  }
}
