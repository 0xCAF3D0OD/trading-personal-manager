import type { ApiEnvelope, ApiError, DegradedInfo } from '@tpm/shared';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export class ApiHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

type DegradedListener = (d: DegradedInfo[]) => void;
const listeners = new Set<DegradedListener>();
export function onDegraded(fn: DegradedListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return { data: undefined as T, meta: { source: 'local', fetchedAt: Date.now() / 1000, cached: false } };
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
  if (!res.ok) {
    const e = (json ?? {}) as Partial<ApiError>;
    throw new ApiHttpError(res.status, e.code ?? 'http', e.error ?? `HTTP ${res.status}`, e.details);
  }
  const env = json as ApiEnvelope<T>;
  if (env?.meta?.degraded?.length) for (const l of listeners) l(env.meta.degraded);
  else for (const l of listeners) l([]);
  return env;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
