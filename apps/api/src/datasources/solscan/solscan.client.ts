import type { HttpDeps } from '../http.js';
import { fetchJson, HttpError } from '../http.js';

export const SOLSCAN_CU_PER_CALL = 100;

export class SolscanClient {
  constructor(private readonly deps: HttpDeps, private readonly baseUrl: string, private readonly apiKey: string) {}

  async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const url = `${this.baseUrl}${path}?${qs.toString()}`;
    try {
      const res = await fetchJson<{ success?: boolean; data?: T; errors?: unknown }>(
        this.deps, 'solscan', path, url,
        { headers: { token: this.apiKey, accept: 'application/json' }, cu: SOLSCAN_CU_PER_CALL },
      );
      if (res && res.success === false) throw new Error(`Solscan ${path} : ${JSON.stringify(res.errors ?? res)}`);
      return (res?.data ?? res) as T;
    } catch (err) {
      if (err instanceof HttpError && err.isQuota) {
        this.deps.health.fail('solscan', 'Quota Solscan épuisé ou limite de débit atteinte');
      }
      throw err;
    }
  }
}
