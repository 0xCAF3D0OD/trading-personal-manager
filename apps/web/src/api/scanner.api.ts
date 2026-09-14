import type { ScannerOverview, ScanResult, ScanRetroView, ScanRun } from '@tpm/shared';
import { http } from './http.js';

export const scannerApi = {
  overview: () => http.get<ScannerOverview>('/scanner/overview'),
  results: (days = 1) => http.get<ScanResult[]>(`/scanner/results?days=${days}`),
  excluded: (days = 7) => http.get<ScanResult[]>(`/scanner/excluded?days=${days}`),
  runs: () => http.get<ScanRun[]>('/scanner/runs'),
  retro: () => http.get<ScanRetroView>('/scanner/retro'),
  run: () => http.post<{ discover: { seen: number; inserted: number; ignored: number }; evaluate: string }>('/scanner/run'),
};
