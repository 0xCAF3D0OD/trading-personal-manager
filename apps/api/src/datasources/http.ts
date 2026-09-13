import type { SourceName } from '@tpm/shared';
import type { UsageRepo } from '../db/repositories/usage.repo.js';
import type { SourceHealth } from './health.js';

export class HttpError extends Error {
  constructor(
    public readonly provider: SourceName,
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
  }
  get isQuota(): boolean {
    return this.status === 429 || this.status === 402;
  }
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface HttpDeps {
  usage: UsageRepo;
  health: SourceHealth;
  timeoutMs?: number;
}

/**
 * fetch JSON avec timeout, enregistrement de la consommation et mise à jour
 * de l'état de santé du fournisseur. Toutes les sources passent par ici.
 */
export async function fetchJson<T>(
  deps: HttpDeps,
  provider: SourceName,
  endpointLabel: string,
  url: string,
  init: RequestInit & { cu?: number } = {},
): Promise<T> {
  // Les sources gratuites limitent par IP : on retente 2 fois avec attente sur 429.
  // Jamais pour Solscan : un 429 y signale un quota, pas un pic de charge.
  const maxAttempts = provider === 'solscan' ? 1 : 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchOnce<T>(deps, provider, endpointLabel, url, init);
    } catch (err) {
      const retryable = err instanceof HttpError && (err.status === 429 || err.status >= 500);
      if (!retryable || attempt >= maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
}

async function fetchOnce<T>(
  deps: HttpDeps,
  provider: SourceName,
  endpointLabel: string,
  url: string,
  init: RequestInit & { cu?: number },
): Promise<T> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? 15_000);
  let status: number | null = null;
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    status = res.status;
    const text = await res.text();
    if (!res.ok) {
      const err = new HttpError(provider, res.status, `${provider} ${endpointLabel} → HTTP ${res.status}`, text.slice(0, 500));
      deps.health.fail(
        provider,
        err.isQuota ? 'Quota ou limite de débit atteint (HTTP ' + res.status + ')'
          : err.isAuth ? 'Authentification refusée (HTTP ' + res.status + ')'
          : `HTTP ${res.status}`,
      );
      throw err;
    }
    deps.health.ok(provider);
    return (text.length ? JSON.parse(text) : null) as T;
  } catch (err) {
    if (!(err instanceof HttpError)) {
      const reason = (err as Error).name === 'AbortError' ? 'Délai dépassé' : `Erreur réseau : ${(err as Error).message}`;
      deps.health.fail(provider, reason);
      status = status ?? 0;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    deps.usage.record({ provider, endpoint: endpointLabel, cu: init.cu ?? 0, status, durationMs: Date.now() - started });
  }
}
