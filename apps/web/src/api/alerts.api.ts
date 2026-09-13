import type { Alert, AlertEvent, CreateAlertInput, UpdateAlertInput } from '@tpm/shared';
import { http } from './http.js';

export const alertsApi = {
  list: (tokenId?: number) => http.get<Alert[]>(`/alerts${tokenId ? `?tokenId=${tokenId}` : ''}`),
  create: (input: CreateAlertInput) => http.post<Alert>('/alerts', input),
  update: (id: number, patch: UpdateAlertInput) => http.patch<Alert>(`/alerts/${id}`, patch),
  remove: (id: number) => http.delete<void>(`/alerts/${id}`),
  events: (tokenId?: number, limit = 100) => http.get<AlertEvent[]>(`/alerts/events?limit=${limit}${tokenId ? `&tokenId=${tokenId}` : ''}`),
  ack: (eventId: number) => http.post<{ acknowledged: boolean }>(`/alerts/events/${eventId}/ack`),
  test: () => http.post<{ channel: string; ok: boolean; error: string | null }[]>('/alerts/test'),
  evaluate: () => http.post<{ evaluated: number; fired: number }>('/alerts/evaluate'),
};
