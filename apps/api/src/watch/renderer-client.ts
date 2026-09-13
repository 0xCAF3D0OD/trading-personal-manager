import type { DiscoveredEndpoint } from '@tpm/shared';

export interface RenderResult { html: string; finalUrl: string; jsonResponses: DiscoveredEndpoint[] }

/** Client du service `renderer` (Playwright), conteneur séparé. Absent = découverte et mode headless indisponibles. */
export class RendererClient {
  constructor(private readonly baseUrl: string | undefined, private readonly timeoutMs = 45_000) {}

  get available(): boolean { return !!this.baseUrl; }

  async render(url: string, waitMs: number, keywords: string[]): Promise<RenderResult> {
    if (!this.baseUrl) throw new Error('Service de rendu non configuré (RENDERER_URL)');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/render`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ url, waitMs }),
      });
      if (!res.ok) throw new Error(`renderer HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { html: string; finalUrl?: string; jsonResponses?: Omit<DiscoveredEndpoint, 'score'>[] };
      const scored = (data.jsonResponses ?? []).map((r) => ({ ...r, score: scoreEndpoint(r, keywords) })).sort((a, b) => b.score - a.score);
      return { html: data.html, finalUrl: data.finalUrl ?? url, jsonResponses: scored };
    } finally {
      clearTimeout(t);
    }
  }
}

/** Les réponses qui contiennent des pourcentages ou des mots-clés tokenomics passent en tête. */
export function scoreEndpoint(r: { url: string; preview: string; topKeys: string[]; size: number }, keywords: string[]): number {
  const text = `${r.url} ${r.topKeys.join(' ')} ${r.preview}`.toLowerCase();
  let score = 0;
  for (const k of keywords) if (text.includes(k.toLowerCase())) score += 2;
  if (/\d+(\.\d+)?\s*%/.test(r.preview)) score += 3;
  if (/(tokenomic|stats|config|settings|info|metadata)/.test(r.url.toLowerCase())) score += 2;
  if (/(analytics|telemetry|sentry|gtag|segment|hotjar|intercom)/.test(r.url.toLowerCase())) score -= 5;
  if (r.size > 500_000) score -= 2;
  return score;
}
