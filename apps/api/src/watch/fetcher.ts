export interface FetchPageOptions { etag?: string | null; lastModified?: string | null; userAgent: string; maxBytes?: number; timeoutMs?: number; accept?: string; headers?: Record<string, string> }
export interface FetchPageResult {
  status: 'ok' | 'not_modified' | 'http_error' | 'too_large' | 'timeout' | 'network_error';
  httpStatus: number | null; body: string | null; contentType: string | null; etag: string | null; lastModified: string | null; finalUrl: string | null; error: string | null;
}

/** Récupération d'une page ou d'un JSON avec en-têtes conditionnels, limite de taille et délai. */
export async function fetchPage(url: string, opts: FetchPageOptions): Promise<FetchPageResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  const headers: Record<string, string> = {
    'user-agent': opts.userAgent,
    accept: opts.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5',
    'accept-language': 'fr,en;q=0.8',
    ...(opts.headers ?? {}),
  };
  if (opts.etag) headers['if-none-match'] = opts.etag;
  if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    const base = { httpStatus: res.status, contentType: res.headers.get('content-type'), etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'), finalUrl: res.url || url };
    if (res.status === 304) return { ...base, status: 'not_modified', body: null, error: null };
    if (!res.ok) return { ...base, status: 'http_error', body: null, error: `HTTP ${res.status}` };
    const max = opts.maxBytes ?? 2 * 1024 * 1024;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > max) return { ...base, status: 'too_large', body: null, error: `${len} octets > ${max}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) return { ...base, status: 'too_large', body: null, error: `${buf.length} octets > ${max}` };
    return { ...base, status: 'ok', body: buf.toString('utf8'), error: null };
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError';
    return { status: aborted ? 'timeout' : 'network_error', httpStatus: null, body: null, contentType: null, etag: null, lastModified: null, finalUrl: null, error: aborted ? 'Délai dépassé' : (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
