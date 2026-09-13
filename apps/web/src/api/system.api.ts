import type { SourcesView, UsageView } from '@tpm/shared';
import { http } from './http.js';

export const systemApi = {
  sources: () => http.get<SourcesView>('/system/sources'),
  usage: () => http.get<UsageView>('/system/usage'),
  runJob: (name: 'market-snapshot' | 'holder-snapshot') => http.post<{ ran: string }>(`/system/jobs/${name}/run`),
};
