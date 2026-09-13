import type { SourceName, SourceStatus } from '@tpm/shared';
import { nowS } from '../db/client.js';

interface State {
  configured: boolean;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  degradedReason: string | null;
  degradedSince: number | null;
}

/** Sans nouvelle erreur pendant ce délai, un fournisseur n'est plus considéré dégradé (tout peut être servi par le cache entre-temps). */
const DEGRADED_EXPIRY_S = 10 * 60;

/** État de santé de chaque fournisseur externe, en mémoire. Alimente /system/sources et meta.degraded. */
export class SourceHealth {
  private readonly states = new Map<SourceName, State>();

  private active(s: State): boolean {
    return !!s.degradedReason && s.lastErrorAt !== null && nowS() - s.lastErrorAt < DEGRADED_EXPIRY_S;
  }

  configure(name: SourceName, configured: boolean): void {
    this.states.set(name, { configured, lastSuccessAt: null, lastErrorAt: null, degradedReason: null, degradedSince: null });
  }

  ok(name: SourceName): void {
    const s = this.state(name);
    s.lastSuccessAt = nowS();
    s.degradedReason = null;
    s.degradedSince = null;
  }

  fail(name: SourceName, reason: string): void {
    const s = this.state(name);
    s.lastErrorAt = nowS();
    if (!s.degradedReason) s.degradedSince = s.lastErrorAt;
    s.degradedReason = reason;
  }

  isDegraded(name: SourceName): boolean {
    return this.active(this.state(name));
  }

  degradedList(): { provider: SourceName; reason: string; since?: number }[] {
    const out: { provider: SourceName; reason: string; since?: number }[] = [];
    for (const [name, s] of this.states) {
      if (this.active(s)) out.push({ provider: name, reason: s.degradedReason as string, since: s.degradedSince ?? undefined });
    }
    return out;
  }

  snapshot(): SourceStatus[] {
    return [...this.states.entries()].map(([name, s]) => ({
      name,
      configured: s.configured,
      healthy: !this.active(s),
      degradedReason: this.active(s) ? s.degradedReason : null,
      degradedSince: this.active(s) ? s.degradedSince : null,
      lastSuccessAt: s.lastSuccessAt,
      lastErrorAt: s.lastErrorAt,
    }));
  }

  private state(name: SourceName): State {
    let s = this.states.get(name);
    if (!s) {
      s = { configured: true, lastSuccessAt: null, lastErrorAt: null, degradedReason: null, degradedSince: null };
      this.states.set(name, s);
    }
    return s;
  }
}
