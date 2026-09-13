import type { ApiEnvelope, SourceName } from '@tpm/shared';
import type { SourceHealth } from '../datasources/health.js';
import { nowS } from '../db/client.js';

/** Enveloppe standard : chaque réponse porte sa source, son horodatage et l'état dégradé éventuel. */
export function envelope<T>(health: SourceHealth, data: T, meta: { source?: SourceName; fetchedAt?: number; cached?: boolean } = {}): ApiEnvelope<T> {
  const degraded = health.degradedList();
  return {
    data,
    meta: {
      source: meta.source ?? 'local',
      fetchedAt: meta.fetchedAt ?? nowS(),
      cached: meta.cached ?? false,
      ...(degraded.length ? { degraded } : {}),
    },
  };
}
